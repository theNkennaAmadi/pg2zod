# Changelog

All notable changes to this project will be documented in this file.

## [1.0.0] - 2026-01-10

### Initial Release

**Features:**
- Complete PostgreSQL database introspection
- Comprehensive type coverage (50+ PostgreSQL types)
- Strict Zod v4 schema generation
- Check constraint translation to Zod refinements
- CLI interface with comprehensive options
- Programmatic API for integration
- Support for enums, domains, composite types, and range types
- Multi-dimensional array support
- Input schema generation for INSERT/UPDATE operations
- camelCase field name conversion
- Environment variable support

**Type Mappings (Zod v4):**
- Basic types: smallint, integer, bigint, numeric, real, double precision
- Text types: varchar, char, text, citext with length constraints
- Boolean
- Date/time: date, timestamp, time (using `z.iso.time()`), interval (using `z.iso.duration()`)
- UUID: `z.uuid()`
- JSON/JSONB
- Network types: inet (`z.union([z.ipv4(), z.ipv6()])`), cidr (`z.union([z.cidrv4(), z.cidrv6()])`), macaddr (`z.mac()`)
- Geometric types: point, box, circle, polygon, etc.
- Arrays including multi-dimensional
- Bit strings
- Full-text search: tsvector, tsquery
- Binary data: bytea
- Custom types: enums, domains, composite types, range types

**Constraint Support:**
- NOT NULL awareness
- Length constraints (varchar, char)
- Numeric precision/scale
- Check constraints: numeric comparisons, BETWEEN, IN, REGEX, length
- Default value handling
- Auto-generated fields (SERIAL)

**Documentation:**
- Comprehensive README
- Getting Started guide
- Project summary
- Example schema SQL
- Example usage code
- CLI help documentation

### Changed (Zod v4 Updates)

Updated type mappings to use correct Zod v4 APIs following the Zod 4 migration:

**String Format Validators → Top-Level Helpers:**
- `z.string().uuid()` → `z.uuid()` (stricter RFC 9562/4122 compliant)
- `z.string().ip()` → `z.union([z.ipv4(), z.ipv6()])` (separate validators for IPv4/IPv6)
- `z.string().email()` → `z.email()` (top-level helper)
- `z.string().url()` → `z.url()` (top-level helper)

**ISO Date/Time Validators:**
- Time types now use `z.iso.time()` instead of regex
- Interval types now use `z.iso.duration()` for ISO 8601 duration strings
- Date types continue to use `z.date()` for JavaScript Date objects

**Network Types:**
- `inet` → `z.union([z.ipv4(), z.ipv6()])` (supports both IPv4 and IPv6)
- `cidr` → `z.union([z.cidrv4(), z.cidrv6()])` (supports both CIDR notations)
- `macaddr` → `z.mac()` (supports configurable delimiters)
- `macaddr8` → continues to use regex (64-bit MAC addresses)

**Benefits:**
- More accurate type validation using native Zod v4 validators
- Better error messages from specialized validators
- Stricter UUID validation (RFC compliant)
- Proper ISO 8601 time and duration parsing
- Improved IP address validation with separate IPv4/IPv6 types
