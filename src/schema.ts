import { plainToClass, Type } from "class-transformer";
import { InflectionTable, lowerFirst } from "./helpers";
import { readFileSync } from "fs";
import * as _ from "lodash";

import Debug from "debug";
const debug = Debug("boil");

/**
 * We enumerate scalar types separately in order to be able to use `FieldColumn`
 * where appropriate.
 */
enum ScalarType {
  String = "string",
  Text = "text",
  Boolean = "boolean",
  Integer = "integer",
  Float = "float",
  Date = "date",
  Time = "time",
  DateTime = "datetime",
}

enum SpecialType {
  Created = "created",
  Updated = "updated",
  Json = "json",
}

type AttributeType = ScalarType | SpecialType;

enum RelationshipType {
  OneToMany = "oneToMany",
  ManyToOne = "manyToOne",
  ManyToMany = "manyToMany",
  ManyToManyOwner = "manyToManyOwner",
}

export enum OpType {
  OBJECT,
  CREATE,
  UPDATE,
}

const JOIN_SINGLE_SPACE = "\n  ";
const JOIN_DOUBLE_SPACE = "\n\n  ";

/**
 * Join together `options` as values in a JavaScript object.
 * @param options
 */
function joinOptionsAsObject(options: string[]) {
  let allOptions = options.join(", ");
  if (allOptions) {
    allOptions = `{ ${allOptions} }`;
  }
  return allOptions;
}

enum ImportType {
  TypeOrm = "typeOrm",
  GraphQl = "graphQl",
  Entities = "entities",
  Decorators = "decorators",
}

/**
 * Container class for tracking global imports of various flavors.
 * Globals are justified here because imports are added from a bunch
 * of different places in the following code, and this seems cleaner
 * than passing an argument around everywhere. Plus, the global
 * yuckiness is confined to just this one class.
 *
 * An alternative would be to implement dependency injection on
 * this class, perhaps using `typedi`, which is from the same
 * developer as `class-transformer`.
 */
class GlobalImports {
  private allTypes: { [key: string]: Set<string> } = {};

  constructor() {
    for (const importType of Object.values(ImportType)) {
      debug("IMPORT TYPE %O", importType);
      this.allTypes[importType] = new Set<string>();
    }
  }

  add(importType: ImportType, value: string) {
    debug("add(%O, '%s')", importType, value);
    this.allTypes[importType].add(value);
  }

  forTemplate() {
    const result: { [key: string]: string } = {};
    for (const importType of Object.values(ImportType)) {
      result[importType] = Array.from(this.allTypes[importType]).join(", ");
    }
    return result;
  }
}
const globalImports = new GlobalImports();
debug("GLOBAL IMPORTS %O", globalImports);

/**
 * An attribute in an entity.
 */
class Attribute {
  private name: string = "";
  private type: AttributeType | null = null;
  private description: string = "";
  private unique: boolean = false;
  private isDbColumn: boolean = true;
  private isGqlField: boolean = true;
  private forGqlCreate: boolean = true;
  private forGqlUpdate: boolean = true;
  private nullable: boolean = false; // Default for both TypeORM and TypeGraphQL

  /**
   * Can this attribute be implemented with a @FieldColumn decorator, or must
   * it be separate @Field and @Column?
   */
  private canBeFieldColumn(): boolean {
    if (this.type) {
      return Object.values(ScalarType).includes(this.type as ScalarType);
    } else {
      return false;
    }
  }

  /**
   * Return the GraphQL type for this attribute.
   * @private
   */
  private getGraphQLType(): string | null {
    switch (this.type) {
      case ScalarType.String:
      case ScalarType.Text:
      case ScalarType.Boolean:
      case ScalarType.Date:
      case ScalarType.Time:
      case ScalarType.DateTime:
        // Decorator will infer type from TypeScript declaration
        return null;
      case ScalarType.Integer:
        globalImports.add(ImportType.GraphQl, "Int");
        return "() => Int";
      case ScalarType.Float:
        globalImports.add(ImportType.GraphQl, "Float");
        return "() => Float";
      case SpecialType.Created:
      case SpecialType.Updated:
      case SpecialType.Json:
        // Special cases that will be handed elsewhere (e.g., `Created` will end
        // up decorated as a `@CreateDateColumn`.
        return null;
      default:
        throw Error(`Bogus type '${this.type}'`);
    }
  }

  private createFieldColumnDecorator(opType: OpType) {
    const options = [];
    if (opType === OpType.UPDATE || this.nullable) {
      options.push("nullable: true");
    }
    if (this.unique) {
      options.push("unique: true");
    }

    const fieldColumnArgs = [`"${this.description}"`];
    const gqlType = this.getGraphQLType();
    if (gqlType) {
      fieldColumnArgs.push(gqlType);
    }
    if (options.length) {
      fieldColumnArgs.push(joinOptionsAsObject(options));
    }
    globalImports.add(ImportType.Decorators, "FieldColumn");
    return `@FieldColumn(${fieldColumnArgs.join(", ")})`;
  }

  private createFieldDecorator(opType: OpType) {
    const options = [`description: "${this.description}"`];
    if (opType === OpType.UPDATE || this.nullable) {
      options.push("nullable: true");
    }
    const gqlType = this.getGraphQLType();
    if (gqlType) {
      options.unshift(gqlType);
    }
    globalImports.add(ImportType.GraphQl, "Field");
    return `@Field(${joinOptionsAsObject(options)})`;
  }

  private createColumnDecorator(opType: OpType) {
    if (!this.isDbColumn || opType !== OpType.OBJECT) {
      return "";
    }

    const options = [`comment: "${this.description}"`];
    if (this.nullable) {
      options.push("nullable: true");
    }
    if (this.unique) {
      options.push("unique: true");
    }

    switch (this.type) {
      case SpecialType.Created:
        globalImports.add(ImportType.TypeOrm, "CreateDateColumn");
        return "@CreateDateColumn()";
      case SpecialType.Updated:
        globalImports.add(ImportType.TypeOrm, "UpdateDateColumn");
        return "@UpdateDateColumn()";
      case ScalarType.Text:
        options.push('type: "text"');
        break;
      case ScalarType.Date:
      case ScalarType.Time:
      case ScalarType.DateTime:
        options.push('type: "Date"');
        break;
      case ScalarType.String:
      case ScalarType.Boolean:
      case SpecialType.Json:
        // TypeORM infers correct type from the declaration.
        break;
      default:
        throw Error(`Bogus type '${this.type}'`);
    }

    globalImports.add(ImportType.TypeOrm, "Column");
    return `@Column(${joinOptionsAsObject(options)})`;
  }

  private createTypeScriptDeclaration(opType: OpType) {
    const optional = opType === OpType.UPDATE ? "?" : "";

    let tsType = "";
    switch (this.type) {
      case SpecialType.Created:
      case SpecialType.Updated:
      case ScalarType.Date:
      case ScalarType.Time:
      case ScalarType.DateTime:
        tsType = "Date";
        break;
      case SpecialType.Json:
        tsType = "Object";
        break;
      case ScalarType.Text:
      case ScalarType.String:
        tsType = "string";
        break;
      case ScalarType.Integer:
      case ScalarType.Float:
        tsType = "number";
        break;
      case ScalarType.Boolean:
        tsType = "boolean";
        break;
      default:
        throw Error(`Bogus type '${this.type}'`);
    }

    return `${this.name}${optional}: ${tsType};`;
  }

  // Return all the decorators for this attribute.
  public decorators(opType: OpType) {
    if (
      (opType === OpType.CREATE && !this.forGqlCreate) ||
      (opType === OpType.UPDATE && !this.forGqlUpdate)
    ) {
      return "";
    }

    const rtn = [];
    if (this.canBeFieldColumn() && this.isGqlField) {
      rtn.push(this.createFieldColumnDecorator(opType));
    } else {
      if (this.isGqlField) {
        rtn.push(this.createFieldDecorator(opType));
      }
      if (opType === OpType.OBJECT) {
        rtn.push(this.createColumnDecorator(opType));
      }
    }
    rtn.push(this.createTypeScriptDeclaration(opType));

    return rtn.join(JOIN_SINGLE_SPACE);
  }
}

// An ERD entity.
class Entity {
  name = "";
  description = "";
  private pk = "";
  @Type(() => Attribute) attributes: Attribute[] = [];

  public primaryKey(opType: OpType) {
    globalImports.add(ImportType.TypeOrm, "Entity");
    globalImports.add(ImportType.GraphQl, "ObjectType");
    globalImports.add(ImportType.GraphQl, "InputType");
    globalImports.add(ImportType.GraphQl, "Field");
    globalImports.add(ImportType.GraphQl, "Int");
    const lines = ["@Field(() => Int, { description: 'Primary key' })"];

    switch (opType) {
      case OpType.OBJECT:
        globalImports.add(ImportType.TypeOrm, "PrimaryGeneratedColumn");
        lines.push("@PrimaryGeneratedColumn({ comment: 'Primary key' })");
        break;
      case OpType.CREATE:
        throw Error("Create operation has no primary key");
      case OpType.UPDATE:
        // NOP
        break;
    }

    lines.push(`${this.pk}: number;`);
    return lines.join(JOIN_SINGLE_SPACE);
  }
}

// An ERD relationship.
class Relationship {
  private name: string = "";
  private type: RelationshipType | null = null;
  private to: string = "";
  private nullable: boolean = true; // Default for TypeORM
  description: string = "";

  private createGraphQLDecorator() {
    globalImports.add(ImportType.GraphQl, "Field");
    globalImports.add(ImportType.Entities, this.to);
    switch (this.type) {
      case RelationshipType.ManyToOne:
        return `@Field(() => ${this.to})`;
      case RelationshipType.OneToMany:
      case RelationshipType.ManyToMany:
      case RelationshipType.ManyToManyOwner:
        return `@Field(() => [${this.to}])`;
    }
  }

  private createTypeOrmDecorator() {
    switch (this.type) {
      case RelationshipType.OneToMany:
        globalImports.add(ImportType.TypeOrm, "OneToMany");
        return "@OneToMany";
      case RelationshipType.ManyToOne:
        globalImports.add(ImportType.TypeOrm, "ManyToOne");
        return "@ManyToOne";
      case RelationshipType.ManyToMany:
      case RelationshipType.ManyToManyOwner:
        globalImports.add(ImportType.TypeOrm, "ManyToMany");
        return "@ManyToMany";
    }
  }

  private createInverseRelationDecorator(inflections: InflectionTable) {
    const toLower = lowerFirst(this.to);

    switch (this.type) {
      case RelationshipType.OneToMany:
        return `${toLower} => ${toLower}.${inflections.entityLower}`;
      case RelationshipType.ManyToOne:
      case RelationshipType.ManyToMany:
      case RelationshipType.ManyToManyOwner:
        return `${toLower} => ${toLower}.${inflections.entityLowerPlural}`;
    }
  }

  private createTypeScriptDeclaration() {
    switch (this.type) {
      case RelationshipType.OneToMany:
      case RelationshipType.ManyToMany:
      case RelationshipType.ManyToManyOwner:
        return `${this.name}: ${this.to}[]`;
      case RelationshipType.ManyToOne:
        return `${this.name}: ${this.to}`;
    }
  }

  // Assemble all decorators for this relationship.
  public decorators(inflections: InflectionTable) {
    const name = this.createTypeOrmDecorator();

    const allArgs = [
      `() => ${this.to}`,
      this.createInverseRelationDecorator(inflections),
    ];
    if (!this.nullable) {
      // Only if not the default.
      allArgs.push("{ nullable: false }");
    }

    const options = [
      this.createGraphQLDecorator(),
      `${name}(${allArgs.join(", ")})`,
    ];

    if (this.type === RelationshipType.ManyToManyOwner) {
      globalImports.add(ImportType.TypeOrm, "JoinTable");
      options.push("@JoinTable()");
    }

    options.push(this.createTypeScriptDeclaration() + ";");

    return options.join(JOIN_SINGLE_SPACE);
  }
}

// The ERD itself.
export class Schema {
  inflections: InflectionTable = {} as InflectionTable;
  @Type(() => Entity) entity: Entity = {} as Entity;
  @Type(() => Relationship) relationships: Relationship[] = [];

  postTransform() {
    this.inflections = new InflectionTable(this.entity.name);
  }

  declareFields() {
    const objectFields: string[] = [];
    const createFields: string[] = [];
    const updateFields: string[] = [];

    // Primary key
    objectFields.push(this.entity.primaryKey(OpType.OBJECT));
    updateFields.push(this.entity.primaryKey(OpType.UPDATE));

    // Other attributes
    for (const attr of this.entity.attributes) {
      objectFields.push(attr.decorators(OpType.OBJECT));
      createFields.push(attr.decorators(OpType.CREATE));
      updateFields.push(attr.decorators(OpType.UPDATE));
    }

    // Relationships
    for (const rel of this.relationships) {
      objectFields.push(rel.decorators(this.inflections));
    }

    const context = {
      globalImports: globalImports.forTemplate(),
      entity: this.entity,
      objectFields: objectFields.join(JOIN_DOUBLE_SPACE),
      inputFields: createFields.join(JOIN_DOUBLE_SPACE),
      updateFields: updateFields.join(JOIN_DOUBLE_SPACE),
    };
    debug("Context %O", context);
    return context;
  }
}

/**
 * Load the ER schema file for a particular entity.
 * @param path
 */
export function loadSchema(path: string) {
  const plainObject = JSON.parse(readFileSync(path, "utf-8"));
  const schema = plainToClass(Schema, plainObject);
  schema.postTransform();
  debug(schema);
  return schema;
}
