# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

pg2zod is a TypeScript package that introspects PostgreSQL databases and generates strict Zod v4 validation schemas.

## Development Commands

### Build
```bash
# Compile TypeScript to JavaScript
pnpm build
# or
npm run build

# Watch mode for development
pnpm dev
# or
npm run dev
```

### Testing
```bash
# Run tests (requires building first)
pnpm build && pnpm test
# or
npm run build && npm test

# Test with example schema
createdb pg_to_zod_test
psql -d pg_to_zod_test -f example-schema.sql
pnpm build
node dist/cli.js --database pg_to_zod_test -o test-output.ts
```

### CLI Usage
```bash
# After building, test CLI locally
node dist/cli.js --database mydb --output schema.ts

# With npx (installed package)
npx pg2zod --database mydb -o schema.ts

# Full example with all options
node dist/cli.js \
  --url postgresql://user:pass@localhost:5432/mydb \
  --schemas public,auth \
  --composite-types \
  --camel-case \
  -o schema.ts
```

## Architecture

### Core Data Flow
1. **Introspection** (`introspect.ts`) → Connects to PostgreSQL and queries `information_schema` + `pg_catalog` to extract complete metadata (tables, columns, enums, domains, composite types, ranges, constraints)
2. **Type Mapping** (`type-mapper.ts`) → Converts PostgreSQL types to Zod schema strings with validation constraints
3. **Generation** (`generator.ts`) → Produces three schemas per table: Read (actual structure), Insert (smart optionals for auto-generated/default fields), Update (all optional, PKs excluded)
4. **Formatting** (`generator.ts`) → Assembles final output with imports, exports, organized sections, and warnings

### Key Files
- `src/types.ts` - Core TypeScript interfaces and type definitions for the entire system
- `src/introspect.ts` - Database introspection using parallel queries for metadata extraction
- `src/type-mapper.ts` - PostgreSQL → Zod type mapping with constraint application logic
- `src/generator.ts` - Schema generation for enums, domains, ranges, composite types, and tables (Read/Insert/Update)
- `src/index.ts` - Public API exports (generateZodSchemas, generateZodSchemasString, introspectDatabase)
- `src/cli.ts` - Command-line interface with argument parsing and connection handling

### Schema Generation Approach

**Three schemas per table:**
1. **Read Schema** (`PublicUsersSchema`) - Reflects actual database structure as-is
2. **Insert Schema** (`PublicUsersInsertSchema`) - Only auto-generated fields (SERIAL/identity) and fields with DEFAULT values are marked optional
3. **Update Schema** (`PublicUsersUpdateSchema`) - All fields optional (for partial updates), primary key fields excluded, validation preserved

**Naming Convention:**
- Schema prefix: PascalCase schema name (e.g., `Public`, `Auth`)
- Entity name: PascalCase table/type name (e.g., `Users`, `CommentThreads`)
- Composite types: Add `Composite` suffix (e.g., `PublicAddressCompositeSchema`) to avoid naming conflicts with tables
- Generated names: `{SchemaPrefix}{EntityName}Schema` and `{SchemaPrefix}{EntityName}` for types

### Type System

**Custom Type Resolution Order:**
1. Check if column uses a domain → Reference domain schema
2. Check if it's an array → Wrap base type in `z.array()` (nested for multi-dimensional)
3. Check for enum → Reference enum schema
4. Check for composite type → Reference composite schema
5. Check for range type → Reference range schema
6. Map built-in PostgreSQL type → Corresponding Zod validator
7. Apply custom type mappings (if provided in options)
8. Fall back to `z.unknown()` with warning (or fail in strict mode)

**Constraint Translation:**
- CHECK constraints parsed via regex to extract comparisons (>, <, >=, <=), BETWEEN, IN/ANY(ARRAY), regex patterns, length functions
- String length: `varchar(50)` → `.max(50)`, `char(5)` → `.length(5)`
- Numeric precision/scale: Preserved in comments
- Format validation: UUID → `z.uuid()`, inet → `z.union([z.ipv4(), z.ipv6()])`, macaddr → `z.mac()`
- Enum extraction from CHECK: `value = ANY (ARRAY['a', 'b'])` → `z.enum(['a', 'b'])`

## Important Implementation Notes

### ESM Module System
- This project uses ESM exclusively (not CommonJS)
- All imports must include `.js` extensions (TypeScript convention for ESM)
- Example: `import { foo } from './bar.js'` even though source file is `bar.ts`
- Never use `require()` or `module.exports`

### Database Connection
- Uses `pg.Pool` for connection pooling with automatic cleanup (`pool.end()` in finally block)
- Connection configuration supports both URL-based and individual parameters
- SSL configuration can be boolean or object with `rejectUnauthorized` option
- Environment variables (PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD) automatically used by pg library

### Introspection Strategy
- All metadata types (tables, enums, composites, ranges, domains) fetched in parallel via `Promise.all()`
- Complex SQL queries join `information_schema` and `pg_catalog` views
- Array dimensions detected through `information_schema.element_types`
- CHECK constraints include full clause text for later parsing

### Schema Generation Logic
- Composite types skipped by default (flag `--composite-types` to include) to avoid naming conflicts
- Input schemas (Insert/Update) generated by default (flag `--no-input-schemas` to skip)
- Insert schema logic: Fields optional only if SERIAL/identity OR has DEFAULT value; nullable fields without defaults stay required
- Update schema logic: All non-PK fields optional, maintain validation constraints
- Comments included by default unless `--no-comments` specified

### Type Mapping Challenges
- Multi-dimensional arrays: Recursively nest `z.array()` based on `arrayDimensions`
- Composite types as column types: Reference generated composite schema with `Composite` suffix
- Range types: Represented as `z.tuple([lower.nullable(), upper.nullable()])` since bounds can be infinite
- Domain types: Base type + inherited constraints from domain definition
- Arrays of custom types: Strip underscore prefix from `udtName` (e.g., `_text` → `text`)

### CLI Parsing
- Built-in Node.js argument parsing (no external dependencies like commander/yargs)
- Connection URL parsed manually or individual params used
- Environment variables provide defaults if present
- Output defaults to `schema.ts` if not specified

## Common Modification Patterns

### Adding a New PostgreSQL Type
1. Add case in `mapBaseTypeToZod()` in `type-mapper.ts`
2. Map to appropriate Zod validator (e.g., `z.string().regex(...)` for custom format)
3. Add tests using example-schema.sql
4. Update README.md type mapping table

### Adding a New Zod Constraint Type
1. Identify PostgreSQL source (CHECK constraint, column property, etc.)
2. Add parsing logic in `applyCheckConstraints()` or column mapper
3. Generate appropriate Zod chain (e.g., `.min(n).max(m)`)
4. Handle edge cases (nullability, array wrapping)

### Adding a New CLI Option
1. Add option parsing in `cli.ts` (check for `--flag` in `process.argv`)
2. Add to `SchemaGenerationOptions` interface in `types.ts`
3. Pass through introspection/generation pipeline
4. Update help text in CLI
5. Document in README.md

### Modifying Schema Output Format
1. Update section builders in `generator.ts`: `generateEnumSchema()`, `generateTableSchema()`, etc.
2. Modify `formatOutput()` to change overall structure
3. Ensure proper escaping for generated code
4. Test with complex schema that includes all type variations

## Testing Strategy

### Manual Testing Workflow
1. Modify source code in `src/`
2. Run `pnpm build` to compile
3. Create test database: `createdb test_db`
4. Load example schema: `psql -d test_db -f example-schema.sql`
5. Generate schemas: `node dist/cli.js --database test_db -o output.ts`
6. Inspect `output.ts` to verify correctness
7. Import and test validation in a TypeScript file

### Example Schema Coverage
`example-schema.sql` includes comprehensive test cases:
- All PostgreSQL built-in types (numeric, text, date/time, boolean, JSON, UUID, etc.)
- Custom types (enums, domains, composite types, range types)
- Arrays (single and multi-dimensional)
- CHECK constraints (comparisons, BETWEEN, IN/ANY, regex, length)
- Tables with realistic relationships and constraints
- Edge cases (nullable, defaults, auto-increment, unique)

### Validation Approach
The generated Zod schemas should be tested by:
1. Validating actual database query results (should pass for valid data)
2. Testing with invalid data (should throw ZodError)
3. Checking TypeScript type inference (`z.infer<>` produces correct types)
4. Verifying Insert schemas allow omitting auto-generated/default fields
5. Verifying Update schemas allow partial updates

## Code Style and Conventions

- **Strict TypeScript**: All code uses strict mode with no implicit any
- **Async/await**: Prefer async/await over promises/callbacks
- **PascalCase**: For exported schema names and TypeScript types
- **camelCase**: For variables, functions, and parameters (optional for generated field names via `--camel-case`)
- **JSDoc comments**: All exported functions and interfaces documented
- **Error handling**: Try/catch with resource cleanup in finally blocks
- **Functional style**: Pure functions where possible, especially in type-mapper.ts

## Zod v4 Specific Features

This package targets **Zod v4** (currently v4.3.5), which includes:
- `z.iso.time()` for time types
- `z.iso.duration()` for interval types
- `z.ipv4()`, `z.ipv6()` for IP addresses
- `z.cidrv4()`, `z.cidrv6()` for CIDR notation
- `z.mac()` for MAC addresses
- `z.uuid()` for UUID validation

When adding new Zod validators, ensure they are compatible with Zod v4 API.
