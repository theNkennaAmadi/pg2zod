# pg2zod

> **Introspect PostgreSQL databases and generate strict, comprehensive Zod v4 schemas**

A modern TypeScript package that automatically generates high-quality, strict Zod schemas from your PostgreSQL database schema. Supports all PostgreSQL types including advanced features like enums, composite types, domains, ranges, arrays, and geometric types.

## Features

✨ **Comprehensive Type Coverage**
- All built-in PostgreSQL types (numeric, text, date/time, boolean, JSON, UUID, etc.)
- Custom types: enums, domains, composite types, range types
- Database views (read-only schemas)
- Functions and procedures (with parameter and return type schemas)
- Arrays (including multi-dimensional)
- Geometric types (point, box, circle, polygon, etc.)
- Network types (inet, cidr, macaddr)
- Full-text search types (tsvector, tsquery)
- Bit strings, XML, and more

🔒 **Strict & Safe**
- Length constraints (`varchar(n)` → `.max(n)`)
- Precision/scale validation for numeric types
- Format validations (UUID, IP, MAC addresses, etc.)
- CHECK constraint parsing (comparisons, BETWEEN, IN, ANY/ARRAY, regex)
- Automatic enum generation from CHECK constraints
- NOT NULL awareness

🎯 **Smart Code Generation**
- Read schemas (reflect actual DB structure)
- Insert schemas (intelligent optional field detection based on defaults/auto-generation)
- Update schemas (all fields optional but maintain validation)
- TypeScript type inference support with `z.infer<>`
- Schema-prefixed naming to avoid collisions (e.g., `PublicUsersSchema`)
- Optional camelCase conversion
- CHECK constraint parsing and implementation
- Comprehensive comments

🚀 **Modern Stack**
- ESM-first
- TypeScript with strict mode
- Zod v4 (latest beta)
- CLI + Programmatic API

## Installation

```bash
npm install pg2zod
# or
pnpm add pg2zod
# or
yarn add pg2zod
```

## Quick Start

### CLI Usage

```bash
# Generate schemas from a local database (includes input schemas by default)
pg2zod --database mydb --output src/db/schema.ts

# Use a connection URL
pg2zod --url postgresql://user:pass@localhost:5432/mydb -o schema.ts

# Skip input schemas if you only need read schemas
pg2zod --database mydb --no-input-schemas --output schema.ts

# Include composite types (skipped by default)
pg2zod --database mydb --composite-types --output schema.ts

# Include database views
pg2zod --database mydb --views --output schema.ts

# Include functions/procedures (SECURITY DEFINER only by default)
pg2zod --database mydb --routines --output schema.ts

# Include all functions including SECURITY INVOKER
pg2zod --database mydb --routines --security-invoker --output schema.ts

# Use camelCase for field names
pg2zod --database mydb --camel-case -o schema.ts

# Include specific tables only
pg2zod --database mydb --tables users,posts,comments -o schema.ts

# Multiple schemas
pg2zod --database mydb --schemas public,auth,api -o schema.ts
```

### Programmatic API

```typescript
import { generateZodSchemasString } from 'pg2zod';

const schemas = await generateZodSchemasString(
  {
    host: 'localhost',
    port: 5432,
    database: 'mydb',
    user: 'postgres',
    password: 'password',
  },
  {
    schemas: ['public'],
    generateInputSchemas: true,
    includeComments: true,
    strictMode: false,
  }
);

console.log(schemas);
```

## Type Mapping

### Built-in Types

| PostgreSQL Type | Zod Schema |
|----------------|------------|
| `smallint`, `integer` | `z.number().int()` |
| `bigint` | `z.bigint()` |
| `numeric(p,s)`, `decimal` | `z.number()` with precision/scale comment |
| `real`, `double precision` | `z.number()` |
| `varchar(n)` | `z.string().max(n)` |
| `char(n)` | `z.string().length(n)` |
| `text` | `z.string()` |
| `boolean` | `z.boolean()` |
| `date`, `timestamp` | `z.date()` |
| `time` | `z.iso.time()` |
| `interval` | `z.iso.duration()` |
| `uuid` | `z.uuid()` |
| `json`, `jsonb` | `z.record(z.string(), z.unknown())` |
| `inet` | `z.union([z.ipv4(), z.ipv6()])` |
| `cidr` | `z.union([z.cidrv4(), z.cidrv6()])` |
| `macaddr` | `z.mac()` |
| `point` | `z.tuple([z.number(), z.number()])` |
| `circle` | `z.object({ center: ..., radius: ... })` |
| `polygon` | `z.array(z.tuple([z.number(), z.number()]))` |
| Arrays | `z.array(...)` (nested for multi-dimensional) |

### Custom Types

**Enums:**
```sql
CREATE TYPE status AS ENUM ('pending', 'active', 'inactive');
```
→
```typescript
export const StatusSchema = z.enum(['pending', 'active', 'inactive']);
export type Status = z.infer<typeof StatusSchema>;
```

**Domains:**
```sql
CREATE DOMAIN email AS TEXT CHECK (VALUE ~ '^[^@]+@[^@]+$');
```
→
```typescript
export const EmailSchema = z.string().regex(/^[^@]+@[^@]+$/);
export type Email = z.infer<typeof EmailSchema>;
```

**Composite Types:**
```sql
CREATE TYPE address AS (street TEXT, city TEXT, zip VARCHAR(10));
```
→
```typescript
export const AddressSchema = z.object({
  street: z.string(),
  city: z.string(),
  zip: z.string().max(10),
});
export type Address = z.infer<typeof AddressSchema>;
```

**Range Types:**
```sql
-- int4range, daterange, tstzrange, etc.
```
→
```typescript
export const Int4rangeSchema = z.tuple([z.number().int().nullable(), z.number().int().nullable()]);
export type Int4range = z.infer<typeof Int4rangeSchema>;
```

**Views:**
```sql
CREATE VIEW user_stats AS
SELECT 
  u.id,
  u.username,
  COUNT(o.id) as order_count
FROM users u
LEFT JOIN orders o ON u.id = o.user_id
GROUP BY u.id, u.username;
```
→
```typescript
/** View: public.user_stats (read-only) */
export const PublicUserStatsSchema = z.object({
  id: z.number().int(),
  username: z.string(),
  order_count: z.number().int(),
});
export type PublicUserStats = z.infer<typeof PublicUserStatsSchema>;
```

**Functions/Procedures:**
```sql
CREATE FUNCTION get_user_by_id(user_id INTEGER)
RETURNS TABLE(id INTEGER, username VARCHAR, email VARCHAR) AS $$
BEGIN
  RETURN QUERY SELECT u.id, u.username, u.email FROM users u WHERE u.id = user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```
→
```typescript
/** FUNCTION: public.get_user_by_id */
export const PublicGetUserByIdParamsSchema = z.object({
  /** integer (IN) */
  user_id: z.number().int(),
});
export type PublicGetUserByIdParams = z.infer<typeof PublicGetUserByIdParamsSchema>;

/** Returns: record */
export const PublicGetUserByIdReturnSchema = z.array(z.object({
  id: z.number().int(),
  username: z.string(),
  email: z.string(),
}));
export type PublicGetUserByIdReturn = z.infer<typeof PublicGetUserByIdReturnSchema>;
```

### Check Constraints

CHECK constraints are automatically parsed and translated to Zod validations:

```sql
CREATE TABLE products (
  price NUMERIC CHECK (price > 0),
  quantity INTEGER CHECK (quantity >= 0 AND quantity <= 1000),
  code VARCHAR(20) CHECK (code ~ '^[A-Z]{3}-\d{4}$'),
  status TEXT CHECK (status = ANY (ARRAY['draft', 'published', 'archived']))
);
```
→
```typescript
export const PublicProductsSchema = z.object({
  price: z.number().min(0.00000000000001),
  quantity: z.number().int().min(0).max(1000),
  code: z.string().regex(/^[A-Z]{3}-\d{4}$/),
  status: z.enum(['draft', 'published', 'archived']),
});
```

**Supported CHECK constraint patterns:**
- Numeric comparisons: `>, <, >=, <=`
- BETWEEN: `value BETWEEN min AND max`
- IN/ANY(ARRAY): `value = ANY (ARRAY['a', 'b'])` → `z.enum(['a', 'b'])`
- Regex: `value ~ 'pattern'` → `z.string().regex(/pattern/)`
- Length: `length(value) >= n` → `z.string().min(n)`

## CLI Options

### Connection Options
```
--url <url>              PostgreSQL connection URL
--host <host>           Database host (default: localhost)
--port <port>           Database port (default: 5432)
--database <database>   Database name (default: postgres)
--user <user>           Database user (default: postgres)
--password <password>   Database password
--ssl                   Use SSL connection
```

### Generation Options
```
--schemas <schemas>         Comma-separated list of schemas (default: public)
--tables <tables>           Include only these tables
--exclude-tables <tables>   Exclude these tables
--no-input-schemas          Skip input schemas (generated by default)
--composite-types           Include composite types (skipped by default)
--views                     Include database views (skipped by default)
--routines                  Include functions/procedures (skipped by default)
--security-invoker          Include SECURITY INVOKER routines (default: DEFINER only)
--branded-types             Use branded types for IDs (future)
--strict                    Fail on unmapped types
--no-comments               Don't include comments
--camel-case                Convert field names to camelCase
```

### Output Options
```
--output <file>         Output file path (default: schema.ts)
-o <file>              Short form of --output
```

## Programmatic API

### Main Functions

```typescript
import {
  generateZodSchemas,
  generateZodSchemasString,
  introspectDatabase,
  generateSchemas,
  formatOutput,
} from 'pg2zod';

// Complete flow: introspect + generate + format
const result = await generateZodSchemas(config, options);

// Get formatted string output
const schemaString = await generateZodSchemasString(config, options);

// Step-by-step
const metadata = await introspectDatabase(config, options);
const result = generateSchemas(metadata, options);
const output = formatOutput(result);
```

### Types

```typescript
interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean | { rejectUnauthorized: boolean };
}

interface SchemaGenerationOptions {
  schemas?: string[];              // Default: ['public']
  tables?: string[];               // Include only these
  excludeTables?: string[];        // Exclude these
  generateInputSchemas?: boolean;  // Generate Insert/Update schemas (default: true)
  includeCompositeTypes?: boolean; // Include composite types (default: false)
  includeViews?: boolean;          // Include database views (default: false)
  includeRoutines?: boolean;       // Include functions/procedures (default: false)
  includeSecurityInvoker?: boolean; // Include SECURITY INVOKER routines (default: false)
  useBrandedTypes?: boolean;       // Use branded types (future)
  strictMode?: boolean;            // Fail on unknown types
  includeComments?: boolean;       // Include comments (default: true)
  useCamelCase?: boolean;          // Convert to camelCase
  customTypeMappings?: Record<string, string>; // Custom mappings
}
```

## Examples

### Example Database

```sql
-- Create enum
CREATE TYPE user_role AS ENUM ('admin', 'user', 'guest');

-- Create domain
CREATE DOMAIN email AS VARCHAR(255) 
  CHECK (VALUE ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$');

-- Create table
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  email email NOT NULL,
  role user_role DEFAULT 'user',
  age INTEGER CHECK (age >= 18 AND age <= 120),
  tags TEXT[],
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Generated Output

```typescript
// Generated by pg2zod
// Do not edit manually

import { z } from 'zod';

// ============================================
// Enums
// ============================================

/** PostgreSQL enum: user_role */
export const PublicUserRoleSchema = z.enum(['admin', 'user', 'guest']);
export type PublicUserRole = z.infer<typeof PublicUserRoleSchema>;

// ============================================
// Domains
// ============================================

/** PostgreSQL domain: email (base: character varying) */
export const PublicEmailSchema = z.string().max(255).regex(/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/);
export type PublicEmail = z.infer<typeof PublicEmailSchema>;

// ============================================
// Tables
// ============================================

/** Table: public.users - Read schema */
export const PublicUsersSchema = z.object({
  id: z.number().int(),
  username: z.string().max(50),
  email: PublicEmailSchema,
  role: PublicUserRoleSchema,
  age: z.number().int().min(18).max(120).nullable(),
  tags: z.array(z.string()).nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  created_at: z.date(),
});
export type PublicUsers = z.infer<typeof PublicUsersSchema>;

/** Insert schema for users - only auto-generated fields and fields with defaults are optional */
export const PublicUsersInsertSchema = z.object({
  id: z.number().int().optional(), // auto-generated: SERIAL/identity
  username: z.string().max(50), // required: no default
  email: PublicEmailSchema, // required: no default
  role: PublicUserRoleSchema.optional(), // optional: has DEFAULT 'user'
  age: z.number().int().min(18).max(120).nullable(), // nullable but no default, so required
  tags: z.array(z.string()).nullable(), // nullable but no default, so required
  metadata: z.record(z.string(), z.unknown()).nullable(), // nullable but no default, so required
  created_at: z.date().optional(), // optional: has DEFAULT NOW()
});
export type PublicUsersInsert = z.infer<typeof PublicUsersInsertSchema>;

/** Update schema for users - all fields optional, primary keys excluded, validation preserved */
export const PublicUsersUpdateSchema = z.object({
  username: z.string().max(50).optional(),
  email: PublicEmailSchema.optional(),
  role: PublicUserRoleSchema.optional(),
  age: z.number().int().min(18).max(120).optional().nullable(),
  tags: z.array(z.string()).optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional().nullable(),
  created_at: z.date().optional(),
});
export type PublicUsersUpdate = z.infer<typeof PublicUsersUpdateSchema>;
```

## Environment Variables

Set these to avoid passing credentials via CLI:

```bash
export PGHOST=localhost
export PGPORT=5432
export PGDATABASE=mydb
export PGUSER=postgres
export PGPASSWORD=password
```

## Contributing

Contributions welcome! Please open an issue or PR.

## License

MIT

## Credits

Built with:
- [pg](https://github.com/brianc/node-postgres) - PostgreSQL client
- [zod](https://github.com/colinhacks/zod) - TypeScript-first schema validation
