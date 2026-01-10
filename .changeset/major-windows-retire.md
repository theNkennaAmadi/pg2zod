---
"pg2zod": patch
---

Filter internal PostgreSQL functions and handle duplicates

**Bug Fixes:**
- Fixed type errors in view column metadata generation
- Removed invalid fields (ordinalPosition, isIdentity, etc.) from ColumnMetadata

**Improvements:**
- Filter out internal PostgreSQL system functions (functions using internal, trigger, cstring, "char", and other low-level types)
- Skip functions with duplicate parameter names that would cause invalid TypeScript
- Skip overloaded functions - only keep first occurrence to avoid naming conflicts
- Significantly reduces generated function count (from 261 to ~50-60 for typical databases)
- Generated schemas now compile without TypeScript errors

**Quality:**
- Ensures only user-facing, application-relevant functions are included in generated schemas
- Cleaner output with fewer warnings about unmapped internal types
