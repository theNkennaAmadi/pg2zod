---
"pg2zod": minor
---

Add support for generating Zod schemas from database views and functions/procedures

**New Features:**
- Database views: Generate read-only Zod schemas from views (--views flag)
- Functions/Procedures: Generate parameter and return type schemas (--routines flag)
- Security-aware filtering: By default only SECURITY DEFINER functions are included
- Include SECURITY INVOKER functions with --security-invoker flag

**New CLI Options:**
- `--views`: Include database views in schema generation
- `--routines`: Include functions and procedures
- `--security-invoker`: Include SECURITY INVOKER routines (default: DEFINER only)

**API Changes:**
- Added `includeViews` option to SchemaGenerationOptions
- Added `includeRoutines` option to SchemaGenerationOptions
- Added `includeSecurityInvoker` option to SchemaGenerationOptions
- Added `ViewMetadata`, `RoutineMetadata`, and `RoutineParameterMetadata` types
- GenerationResult now includes `views` and `routines` arrays
