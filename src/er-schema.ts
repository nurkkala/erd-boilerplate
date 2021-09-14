import { plainToClass, Type } from "class-transformer";
import { InflectionTable, lowerFirst } from "./helpers";
import { readFileSync } from "fs";

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

function joinOptionsAsHash(options: string[]) {
  let allOptions = options.join(", ");
  if (allOptions) {
    allOptions = `{ ${allOptions} }`;
  }
  return allOptions;
}

// An attribute of an entity.
export class Attribute {
  name: string = "";
  type: AttributeType | null = null;
  description: string = "";
  unique: boolean = false;
  isDbColumn: boolean = true;
  isGqlField: boolean = true;
  forGqlCreate: boolean = true;
  forGqlUpdate: boolean = true;
  nullable: boolean = false; // Default for both TypeORM and TypeGraphQL

  // Can this attribute be implemented with a @FieldColumn decorator?
  private canBeFieldColumn(): boolean {
    if (this.type) {
      return Object.values(ScalarType).includes(this.type as ScalarType);
    } else {
      return false;
    }
  }

  private getGraphQLType(): string | null {
    switch (this.type) {
      case ScalarType.String:
      case ScalarType.Text:
      case ScalarType.Boolean:
        // Decorator will infer type from TypeScript declaration
        return null;
      case ScalarType.Integer:
        return "() => Int";
      case ScalarType.Float:
        return "() => Float";
      case ScalarType.Date:
      case ScalarType.Time:
      case ScalarType.DateTime:
        return "Date";
      case SpecialType.Created:
      case SpecialType.Updated:
      case SpecialType.Json:
        // Special cases
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
    const gqlType = this.getGraphQLType();
    if (gqlType) {
      options.unshift(gqlType);
    }

    const fieldColumnArgs = [`"${this.description}"`];
    if (options.length) {
      fieldColumnArgs.push(joinOptionsAsHash(options));
    }

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
    return `@Field(${joinOptionsAsHash(options)})`;
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
        return "@CreateDateColumn()";
      case SpecialType.Updated:
        return "@UpdateDataColumn()";
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

    return `@Column(${joinOptionsAsHash(options)})`;
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
export class Entity {
  name = "";
  pk = "";
  description = "";
  @Type(() => Attribute)
  attributes: Attribute[] = [];
}

// An ERD relationship.
export class Relationship {
  name: string = "";
  type: RelationshipType | null = null;
  to: string = "";
  nullable: boolean = true; // Default for TypeORM
  description: string = "";

  private createGraphQLDecorator() {
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
        return "@OneToMany";
      case RelationshipType.ManyToOne:
        return "@ManyToOne";
      case RelationshipType.ManyToMany:
      case RelationshipType.ManyToManyOwner:
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
      options.push("@JoinTable()");
    }

    options.push(this.createTypeScriptDeclaration() + ";");

    return options.join(JOIN_SINGLE_SPACE);
  }
}

// The ERD itself.
export class ERSchema {
  @Type(() => Entity)
  entity: Entity = {} as Entity;

  @Type(() => Relationship)
  relationships: Relationship[] = [];

  inflections: InflectionTable = {} as InflectionTable;

  declareFields() {
    const objectFields: string[] = [];
    const createFields: string[] = [];
    const updateFields: string[] = [];

    // Primary key
    objectFields.push(
      [
        "@Field(() => Int, { description: 'Primary key' })",
        "@PrimaryGeneratedColumn({ comment: 'Primary key' })",
        `${this.entity.pk}: number;`,
      ].join(JOIN_SINGLE_SPACE)
    );
    updateFields.push(
      [
        "@Field(() => Int, { description: 'Primary key' })",
        `${this.entity.pk}: number;`,
      ].join(JOIN_SINGLE_SPACE)
    );

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

    return {
      objectFields: objectFields.join(JOIN_DOUBLE_SPACE),
      inputFields: createFields.join(JOIN_DOUBLE_SPACE),
      updateFields: updateFields.join(JOIN_DOUBLE_SPACE),
    };
  }
}

export function loadSchema(path: string) {
  const plainObject = JSON.parse(readFileSync(path, "utf-8"));
  const schema = plainToClass(ERSchema, plainObject);
  schema.inflections = new InflectionTable(schema.entity.name);
  return schema;
}
