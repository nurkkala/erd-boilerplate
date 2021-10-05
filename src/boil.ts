#!/usr/bin/env node

import "reflect-metadata"; // Required by class-transformer.

import { readFileSync } from "fs";
import { parse } from "path";
import Handlebars from "handlebars";
import figlet from "figlet";
import { Schema, loadSchema } from "./schema";
import pluralize from "pluralize";
import { Command } from "commander";
import { sync } from "walkdir/walkdir";
import { join } from "path";
import * as _ from "lodash";

import Debug from "debug";
const debug = Debug("boil");

// Map a string to its corresponding Handlebars template.
type TemplateFunctionMap = Map<string, HandlebarsTemplateDelegate>;

// Create a figlet-based banner.
class Banner {
  private visible = false;

  setVisibility(visible: boolean) {
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

  constructor() {
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

    debug("templates %O", this.templateMap.keys());
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

type Options = { [key: string]: boolean };
type JumpTableEntry = [
  string, // Name of entry
  () => void, // Function itself
  boolean // Whether this is a generator function or not
];

// The main class to generate boilerplate output.
class Boiler {
  private readonly schema: Schema;

  private jumpTable: JumpTableEntry[] = [
    ["verbose", this.showDetails, false],
    ["entity", this.generateEntity, true],
    ["module", this.generateModule, true],
    ["service", this.generateService, true],
    ["resolver", this.generateResolver, true],
    ["graphql", this.generateGraphQL, true],
    ["table", this.generateTable, true],
    ["createUpdate", this.generateCreateUpdate, true],
  ];

  constructor(
    schemaName: string,
    private readonly engine: TemplateEngine,
    private readonly banner: Banner
  ) {
    this.schema = loadSchema(schemaName);
  }

  countGenerateOptions(options: Options) {
    return _.filter(
      this.jumpTable,
      ([name, _func, gen]) => gen && options.hasOwnProperty(name)
    ).length;
  }

  boil(options: Options, banner: Banner) {
    if (Object.keys(options).length === 0 && !options.all) {
      console.error("No 'generate' option(s) supplied");
      process.exit(1);
    }
    banner.setVisibility(
      options.verbose ||
        options.banner ||
        this.countGenerateOptions(options) > 1
    );
    for (let [opt, func] of this.jumpTable) {
      if (options[opt] || options.all) {
        func.call(this);
      }
    }
  }

  private showDetails() {
    this.banner.show(this.schema.entity.inflections.initLowerSg);
    console.log(JSON.stringify(this.schema, null, 2));
  }

  private generateEntity() {
    this.banner.show("entity");
    const context = {
      ...this.schema.declareFields(),
    };
    debug("CONTEXT %O", context);
    console.log(this.engine.render("entity", context));
  }

  private generateModule() {
    this.banner.show("module");
    console.log(
      this.engine.render("module", {
        entityName: this.schema.entity.inflections.initUpperSg,
      })
    );
  }

  private generateResolver() {
    this.banner.show("resolver");
    console.log(
      this.engine.render("resolver", {
        inflections: this.schema.entity.inflections,
      })
    );
  }

  private generateService() {
    this.banner.show("service");
    const context = {
      entity: this.schema.entity.inflections,
      retrievers: _.map(this.schema.relationships, (rel) =>
        rel.createRetriever()
      ),
    };
    debug("CONTEXT %O", context);
    console.log(this.engine.render("service", context));
  }

  private generateTable() {
    this.banner.show("table");
    console.log(this.engine.render("table", this.schema.entity.inflections));
  }

  private generateCreateUpdate() {
    this.banner.show("create-update");
    console.log(
      this.engine.render("create-update", this.schema.entity.inflections)
    );
  }

  private generateGraphQL() {
    this.banner.show("graphql");
    console.log(this.engine.render("crud", this.schema.entity.inflections));
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
  .option("-b --banner", "show banner before each section")
  .option("-v --verbose", "be verbose")
  .description("generate boilerplate from an ERD file")
  .action((schemaFile: string, options: Options) => {
    debug("schemaFile %O, options %O", schemaFile, options);
    const banner = new Banner();
    const engine = new TemplateEngine();
    const boiler = new Boiler(schemaFile, engine, banner);
    boiler.boil(options, banner);
  });

program.parse();
