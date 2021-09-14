#!/usr/bin/env node

import "reflect-metadata";

import { readFileSync } from "fs";
import { parse } from "path";
import Handlebars from "handlebars";
import figlet from "figlet";
import { ERSchema, loadSchema } from "./er-schema";
import pluralize from "pluralize";
import { Command } from "commander";
import { sync } from "walkdir/walkdir";
import { join } from "path";
import Debug from "debug";

const debug = Debug("boil");

// Map a string to its corresponding Handlebars template.
type TemplateFunctionMap = Map<string, HandlebarsTemplateDelegate>;

// Create a figlet-based banner.
class Banner {
  private readonly visible: boolean;

  constructor(visible = true) {
    this.visible = visible;
  }

  show(text: string) {
    if (this.visible) {
      console.log(figlet.textSync(text));
    }
  }
}

// Encapsulate the templating engine and its templates.
class TemplateEngine {
  private readonly templateMap: TemplateFunctionMap;

  constructor(
    private readonly verbose: boolean,
    private readonly banner: Banner
  ) {
    this.templateMap = new Map();
    this.registerHelpers();
    this.loadTemplates();
  }

  private registerHelpers() {
    Handlebars.registerHelper("lower", (str: string) => str.toLowerCase());
    Handlebars.registerHelper("plural", (str: string) => pluralize(str));
  }

  private loadTemplates() {
    const templateDir = join(__dirname, "templates");
    for (const path of sync(templateDir)) {
      if (path.endsWith(".hbs")) {
        const pathInfo = parse(path);
        const key = pathInfo.name.replace(/\..*/, "");
        const template = readFileSync(path, "utf-8");
        const templateFunction = Handlebars.compile(template, {
          noEscape: true,
        });
        this.templateMap.set(key, templateFunction);
      }
    }

    if (this.verbose) {
      this.banner.show("templates");
      this.templateMap.forEach((value, key) => console.log(key));
    }
  }

  render(templateKey: string, context: any) {
    const templateFunction = this.templateMap.get(templateKey);
    if (templateFunction) {
      return templateFunction(context);
    } else {
      throw Error(`No template for key '${templateKey}'`);
    }
  }
}

// The main class to generate boilerplate output.
class Boiler {
  private readonly schema: ERSchema;

  constructor(
    schemaName: string,
    private readonly engine: TemplateEngine,
    private readonly banner: Banner
  ) {
    this.schema = loadSchema(schemaName);
  }

  boil(options: { [key: string]: string }) {
    const jumpTable: [string, Function][] = [
      ["verbose", this.showDetails],
      ["entity", this.generateEntity],
      ["module", this.generateModule],
      ["service", this.generateService],
      ["resolver", this.generateResolver],
      ["graphql", this.generateGraphQL],
      ["table", this.generateTable],
      ["createUpdate", this.generateCreateUpdate],
    ];
    for (let [opt, func] of jumpTable) {
      if (options[opt] || options.all) {
        func.call(this);
      }
    }
  }

  generateEntity() {
    this.banner.show("entity");
    console.log(
      this.engine.render("entity", {
        entity: this.schema.entity,
        ...this.schema.declareFields(),
      })
    );
  }

  showDetails() {
    this.banner.show(this.schema.inflections.entityLower);
    console.log(JSON.stringify(this.schema, null, 2));
    this.banner.show("inflections");
    console.log(JSON.stringify(this.schema.inflections, null, 2));
  }

  generateModule() {
    this.banner.show("module");
    console.log(
      this.engine.render("module", {
        entityName: this.schema.inflections.entityUpper,
      })
    );
  }

  generateResolver() {
    this.banner.show("resolver");
    console.log(
      this.engine.render("resolver", {
        entityName: this.schema.inflections.entityUpper,
        entityNamePlural: this.schema.inflections.entityUpperPlural,
      })
    );
  }

  generateService() {
    this.banner.show("service");
    console.log(
      this.engine.render("service", {
        entityName: this.schema.inflections.entityUpper,
        entityNamePlural: this.schema.inflections.entityUpperPlural,
      })
    );
  }

  generateTable() {
    this.banner.show("table");
    console.log(this.engine.render("table", this.schema.inflections));
  }

  generateCreateUpdate() {
    this.banner.show("create-update");
    console.log(this.engine.render("create-update", this.schema.inflections));
  }

  generateGraphQL() {
    this.banner.show("graphql");
    console.log(this.engine.render("crud", this.schema.inflections));
  }
}

const program = new Command();

program
  .arguments("<schema-file>")
  .option("-e --entity", "generate entity")
  .option("-m --module", "generate module")
  .option("-r --resolver", "generate resolver")
  .option("-s --service", "generate service")
  .option("-t --table", "generate Vue table")
  .option("-c --create-update", "generate Vue create-update")
  .option("-a --all", "generate all")
  .option("-v --verbose", "be verbose")
  .description("generate boilerplate from an ERD file")
  .action((schemaFile: string, options) => {
    debug("schemaFile %O, options %O", schemaFile, options);
    const banner = new Banner();
    const engine = new TemplateEngine(program.opts().verbose, banner);
    const boiler = new Boiler(schemaFile, engine, banner);
    boiler.boil(options);
  });

program.parse();
