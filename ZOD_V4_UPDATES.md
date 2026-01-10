# Zod v4 Type Mapping Updates

This document outlines the corrections made to align with Zod v4 APIs.

## Summary of Changes

Zod v4 introduced significant breaking changes where many string format validators moved from method-based APIs (e.g., `z.string().uuid()`) to top-level helper functions (e.g., `z.uuid()`). This package has been updated to use the correct Zod v4 APIs.

## Type Mapping Changes

### UUID
**Before (Zod v3):** `z.string().uuid()`  
**After (Zod v4):** `z.uuid()`

**Benefits:**
- Stricter validation (RFC 9562/4122 compliant)
- Proper variant bit enforcement
- Use `z.guid()` for permissive UUID-like patterns

### IP Addresses
**Before (Zod v3):** `z.string().ip()`  
**After (Zod v4):** `z.union([z.ipv4(), z.ipv6()])`

**Benefits:**
- Separate validators for IPv4 and IPv6
- More precise validation
- Better error messages
- PostgreSQL `inet` accepts both, so we use a union

**Note:** For single protocol validation, use `z.ipv4()` or `z.ipv6()` directly.

### CIDR Notation
**Before (Zod v3):** `z.string().cidr()`  
**After (Zod v4):** `z.union([z.cidrv4(), z.cidrv6()])`

**Benefits:**
- Separate validators for IPv4 and IPv6 CIDR blocks
- Proper CIDR notation validation
- PostgreSQL `cidr` accepts both versions

### MAC Addresses
**Before (Zod v3):** `z.string().regex(/^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/)`  
**After (Zod v4):** `z.mac()`

**Benefits:**
- Native MAC address validation
- Configurable delimiter support: `z.mac({ delimiter: "-" })`
- Default accepts both `:` and `-` delimiters
- Validates proper 48-bit MAC addresses

**Note:** `macaddr8` (64-bit) still uses regex as it's not standard.

### Email
**Before (Zod v3):** `z.string().email()`  
**After (Zod v4):** `z.email()`

**Benefits:**
- Top-level helper is now the preferred API
- Configurable email pattern validation
- Built-in regex options: `z.regexes.email`, `z.regexes.html5Email`, etc.

### URL
**Before (Zod v3):** `z.string().url()`  
**After (Zod v4):** `z.url()`

**Benefits:**
- WHATWG URL standard compliant
- Optional hostname/protocol constraints
- Use `z.httpUrl()` for HTTP/HTTPS only

### Time (ISO 8601)
**Before:** `z.string().regex(/^\d{2}:\d{2}:\d{2}(\.\d+)?$/)`  
**After (Zod v4):** `z.iso.time()`

**Benefits:**
- Proper ISO 8601 time format validation
- Supports fractional seconds
- Precision control: `z.iso.time({ precision: 3 })` for milliseconds
- Format: `HH:MM[:SS[.sss]]`

**Examples:**
```typescript
z.iso.time().parse("03:15");            // ✅
z.iso.time().parse("03:15:00");         // ✅
z.iso.time().parse("03:15:00.999");     // ✅
z.iso.time({ precision: 0 }).parse("03:15:00"); // ✅ (requires seconds)
```

### Interval (ISO 8601 Duration)
**Before:** `z.string()` with comment  
**After (Zod v4):** `z.iso.duration()`

**Benefits:**
- Proper ISO 8601 duration format validation
- Validates durations like `P1Y2M3DT4H5M6S`
- Validates PostgreSQL interval output when formatted as ISO 8601

**Examples:**
```typescript
z.iso.duration().parse("P1Y");           // ✅ 1 year
z.iso.duration().parse("PT30M");         // ✅ 30 minutes
z.iso.duration().parse("P3DT4H5M6S");    // ✅ 3 days, 4:05:06
```

### Datetime (ISO 8601)
Not directly used in our mappings since PostgreSQL timestamp types are converted to JavaScript `Date` objects, but available as:

**Zod v4:** `z.iso.datetime()`

**Options:**
```typescript
z.iso.datetime();                        // Requires 'Z' timezone
z.iso.datetime({ offset: true });        // Allows timezone offsets
z.iso.datetime({ local: true });         // Allows local (no timezone)
z.iso.datetime({ precision: 3 });        // Millisecond precision
```

### Date (ISO 8601)
Not used since we convert to `Date` objects, but available as:

**Zod v4:** `z.iso.date()`

**Format:** `YYYY-MM-DD`

## Implementation Details

### PostgreSQL Type Mappings

Here's the complete mapping table with Zod v4 APIs:

| PostgreSQL Type | Zod v4 Schema |
|----------------|---------------|
| `uuid` | `z.uuid()` |
| `inet` | `z.union([z.ipv4(), z.ipv6()])` |
| `cidr` | `z.union([z.cidrv4(), z.cidrv6()])` |
| `macaddr` | `z.mac()` |
| `macaddr8` | `z.string().regex(/^([0-9A-Fa-f]{2}[:-]){7}([0-9A-Fa-f]{2})$/)` |
| `time` | `z.iso.time()` |
| `timetz` | `z.string().regex(...)` (no direct v4 equivalent) |
| `interval` | `z.iso.duration()` |
| `timestamp` | `z.date()` |
| `date` | `z.date()` |

### Notes on Generated Schemas

When you generate schemas with this package:

1. **UUIDs are now RFC-compliant**: The stricter `z.uuid()` validates proper UUID format including variant bits
2. **IP addresses are type-safe**: Union type allows both IPv4 and IPv6 with proper validation
3. **Times use ISO format**: `z.iso.time()` provides standardized time string validation
4. **Intervals use ISO duration**: `z.iso.duration()` for proper duration string validation
5. **Better error messages**: Zod v4's specialized validators provide more informative validation errors

### Migration from Generated v3 Schemas

If you have existing schemas generated with older versions that used Zod v3 style:

```typescript
// Old (Zod v3 style)
const schema = z.object({
  id: z.string().uuid(),
  ip: z.string().ip(),
  email: z.string().email(),
});

// New (Zod v4 style)
const schema = z.object({
  id: z.uuid(),
  ip: z.union([z.ipv4(), z.ipv6()]),
  email: z.email(),
});
```

Simply regenerate your schemas with the latest version of `pg-to-zod` to get the v4 APIs.

## References

- [Zod v4 Changelog](https://zod.dev/v4/changelog)
- [Zod v4 String Formats](https://zod.dev/api#string-formats)
- [Zod v4 Migration Guide](https://zod.dev/v4/changelog)
- [RFC 9562 (UUID)](https://www.rfc-editor.org/rfc/rfc9562.html)
- [ISO 8601 (Date/Time)](https://en.wikipedia.org/wiki/ISO_8601)

### z.record() API
**Before (Zod v3):** `z.record(z.unknown())`  
**After (Zod v4):** `z.record(z.string(), z.unknown())`

**Benefits:**
- Explicit key schema specification
- First parameter is the key type (must be `string | number | symbol`)
- Second parameter is the value type
- Used for PostgreSQL JSON/JSONB types

## Version Info

- **pg-to-zod version**: 1.0.0
- **Zod version**: 4.3.5
- **Last updated**: 2026-01-10
