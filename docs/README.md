# Boilerplate

Generate various database-related artifacts
based on a JSON file specifying the entities and relationships
in a database schema.

## Null values

By default, both columns (TypeORM) and fields (TypeGraphQL)
are **not** nullable (like properties in TypeScript)

- Columns (`@Column`) are **not** nullable
- Fields (`@Field`) are **not** nullable

Relations, however, default to being nullable.

- Relations (e.g., `@ManyToOne`) **are** nullable

## Configuration

For JetBrains tools, can associate JSON sources with the Boilerplate schema.

   Preferences > Languages & Frameworks > Schemas and DTDs > JSON Schema Mappings

1. For *Schema file or URL*, choose .../erd-boilerplate/schemata/er-schema.json
1. Associate individual files or `boilerplate` directory
