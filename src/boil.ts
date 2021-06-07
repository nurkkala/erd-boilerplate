import { readFileSync } from "fs";
import { parse } from "path";
import "reflect-metadata";

import Handlebars from "handlebars";
import figlet from "figlet";
import { ERSchema, loadSchema } from "./er-schema";
import pluralize from "pluralize";
import { Command } from "commander";
import { sync } from "walkdir/walkdir";

type TemplateFunctionMap = Map<string, HandlebarsTemplateDelegate>;

const program = new Command();

program
  .usage("[options] schemaFileName")
  .option("-e --entity", "generate entity")
  .option("-m --module", "generate module")
  .option("-r --resolver", "generate resolver")
  .option("-s --service", "generate service")
  .option("-a --all", "generate all")
  .option("-v --verbose", "be verbose");

program.parse();

const templateMap: TemplateFunctionMap = new Map();
const options = program.opts();
if (options.verbose) {
  console.log("OPTIONS", options);
}

if (program.args.length === 1) {
  main(program.args[0]);
} else {
  program.help();
}

function registerHelpers() {
  Handlebars.registerHelper("lower", (str: string) => str.toLowerCase());
  Handlebars.registerHelper("plural", (str: string) => pluralize(str));
}

function banner(text: string) {
  console.log(figlet.textSync(text));
}

function loadTemplates() {
  for (const path of sync("templates")) {
    if (path.endsWith(".hbs")) {
      const pathInfo = parse(path);
      const key = pathInfo.name.replace(/\..*/, "");
      const template = readFileSync(path, "utf-8");
      const templateFunction = Handlebars.compile(template, {
        noEscape: true,
      });
      templateMap.set(key, templateFunction);
    }
  }

  if (options.verbose) {
    banner("templates");
    templateMap.forEach((value, key) => console.log(key));
  }
}

function renderTemplate(templateKey: string, context: object) {
  const templateFunction = templateMap.get(templateKey);
  if (templateFunction) {
    return templateFunction(context);
  } else {
    throw Error(`No template for key '${templateKey}'`);
  }
}

function generateEntity(schema: ERSchema) {
  return renderTemplate("entity", {
    entity: schema.entity,
    ...schema.declareFields(),
  });
}

function main(schemaName: string) {
  registerHelpers();
  loadTemplates();

  const schema = loadSchema(schemaName);

  if (options.verbose) {
    banner(schema.inflections.entityLower);
    console.log(JSON.stringify(schema, null, 2));
    banner("inflections");
    console.log(JSON.stringify(schema.inflections, null, 2));
  }

  if (options.entity || options.all) {
    banner("entity");
    console.log(generateEntity(schema));
  }

  if (options.module || options.all) {
    banner("module");
    console.log(
      renderTemplate("module", { entityName: schema.inflections.entityUpper })
    );
  }

  if (options.resolver || options.all) {
    banner("resolver");
    console.log(
      renderTemplate("resolver", {
        entityName: schema.inflections.entityUpper,
        entityNamePlural: schema.inflections.entityUpperPlural,
      })
    );
  }

  if (options.service || options.all) {
    banner("service");
    console.log(
      renderTemplate("service", {
        entityName: schema.inflections.entityUpper,
        entityNamePlural: schema.inflections.entityUpperPlural,
      })
    );
  }

  banner("table");
  console.log(renderTemplate("table", schema.inflections));

  banner("create-update");
  console.log(renderTemplate("create-update", schema.inflections));

  banner("graphql");
  console.log(renderTemplate("crud", schema.inflections));
}
