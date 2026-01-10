---
"pg-to-zod": major
---

Initial release of pg-to-zod - a comprehensive PostgreSQL to Zod v4 schema generator.

**Features:**
- Complete PostgreSQL database introspection
- Comprehensive type coverage (50+ PostgreSQL types)
- Strict Zod v4 schema generation
- CHECK constraint parsing and automatic enum generation
- CLI interface with comprehensive options
- Programmatic API for integration
- Support for enums, domains, composite types, and range types
- Multi-dimensional array support
- Smart Insert/Update schema generation (default behavior)
- Schema-prefixed naming to avoid collisions
- Dual CJS/ESM module support
- Composite types optional (use `--composite-types` flag)

**Type Mappings:**
- All PostgreSQL built-in types with proper Zod v4 validators
- Custom types: enums, domains, composite types, range types
- Network types with proper validation (inet, cidr, macaddr)
- Geometric types support
- Arrays including multi-dimensional

**Schema Generation:**
- Three schemas per table: Read, Insert, Update
- Read schema reflects actual database structure
- Insert schema with intelligent optional field detection
- Update schema with `.partial()` for flexible updates
- Schema-prefixed naming (e.g., `PublicUsersSchema`)
