import type {
  ColumnMetadata,
  DatabaseMetadata,
  SchemaGenerationOptions,
  CheckConstraintMetadata,
} from './types.js';

/**
 * Map PostgreSQL column to Zod schema string with strict validation
 */
export function mapColumnToZod(
  column: ColumnMetadata,
  metadata: DatabaseMetadata,
  options: SchemaGenerationOptions,
  warnings: string[]
): string {
  // Handle domains first
  if (column.domainName) {
    const domain = metadata.domains.find((d) => d.domainName === column.domainName);
    if (domain) {
      const schemaPrefix = toPascalCase(domain.schemaName);
      const domainName = toPascalCase(domain.domainName);
      let schema = `${schemaPrefix}${domainName}Schema`;
      return column.isNullable ? `${schema}.nullable()` : schema;
    }
  }

  // Handle arrays
  if (column.isArray) {
    const baseType = mapBaseTypeToZod(column, metadata, options, warnings);
    let arraySchema = `z.array(${baseType})`;
    
    // Multi-dimensional arrays
    if (column.arrayDimensions > 1) {
      for (let i = 1; i < column.arrayDimensions; i++) {
        arraySchema = `z.array(${arraySchema})`;
      }
    }
    
    return column.isNullable ? `${arraySchema}.nullable()` : arraySchema;
  }

  // Handle base types
  const baseSchema = mapBaseTypeToZod(column, metadata, options, warnings);
  return column.isNullable ? `${baseSchema}.nullable()` : baseSchema;
}

/**
 * Map base PostgreSQL type to Zod
 */
function mapBaseTypeToZod(
  column: ColumnMetadata,
  metadata: DatabaseMetadata,
  options: SchemaGenerationOptions,
  warnings: string[]
): string {
  let udtName = column.udtName;
  const dataType = column.dataType.toLowerCase();

  // PostgreSQL array types have underscore prefix (e.g., _text for text[], _int4 for integer[])
  // Strip the underscore to get the actual base type name
  if (column.isArray && udtName.startsWith('_')) {
    udtName = udtName.substring(1);
  }

  // Custom type mappings
  if (options.customTypeMappings?.[udtName]) {
    return options.customTypeMappings[udtName];
  }

  // Check if it's an enum
  const enumType = metadata.enums.find((e) => e.enumName === udtName);
  if (enumType) {
    const schemaPrefix = toPascalCase(enumType.schemaName);
    const enumName = toPascalCase(enumType.enumName);
    return `${schemaPrefix}${enumName}Schema`;
  }

  // Check if it's a composite type
  const compositeType = metadata.compositeTypes.find((t) => t.typeName === udtName);
  if (compositeType) {
    const schemaPrefix = toPascalCase(compositeType.schemaName);
    const typeName = toPascalCase(compositeType.typeName);
    // Add 'Composite' suffix to match generator
    return `${schemaPrefix}${typeName}CompositeSchema`;
  }

  // Check if it's a range type
  const rangeType = metadata.rangeTypes.find((r) => r.rangeName === udtName);
  if (rangeType) {
    const schemaPrefix = toPascalCase(rangeType.schemaName);
    const rangeName = toPascalCase(rangeType.rangeName);
    return `${schemaPrefix}${rangeName}Schema`;
  }

  // Map by data type or by udtName for arrays
  // For arrays, dataType will be 'ARRAY' so we need to check the udtName
  const typeToCheck = dataType === 'array' ? udtName : dataType;
  
  switch (typeToCheck) {
    // Numeric types
    case 'smallint':
    case 'integer':
    case 'int':
    case 'int2':
    case 'int4':
      return 'z.number().int()';
    
    case 'bigint':
    case 'int8':
      return 'z.bigint()';
    
    case 'decimal':
    case 'numeric':
      if (column.numericPrecision !== null && column.numericScale !== null) {
        return `z.number() /* precision: ${column.numericPrecision}, scale: ${column.numericScale} */`;
      }
      return 'z.number()';
    
    case 'real':
    case 'float4':
      return 'z.number()';
    
    case 'double precision':
    case 'float8':
      return 'z.number()';
    
    case 'money':
      return 'z.string().regex(/^\\$?[0-9,]+(\\.\\d{2})?$/)';

    // Text types
    case 'character varying':
    case 'varchar':
      if (column.characterMaximumLength) {
        return `z.string().max(${column.characterMaximumLength})`;
      }
      return 'z.string()';
    
    case 'character':
    case 'char':
      if (column.characterMaximumLength) {
        return `z.string().length(${column.characterMaximumLength})`;
      }
      return 'z.string()';
    
    case 'text':
      return 'z.string()';
    
    case 'citext':
      return 'z.string()';

    // Boolean
    case 'boolean':
    case 'bool':
      return 'z.boolean()';

    // Date/Time types
    case 'timestamp':
    case 'timestamp without time zone':
      return 'z.date()';
    
    case 'timestamp with time zone':
    case 'timestamptz':
      return 'z.date()';
    
    case 'date':
      return 'z.date()';
    
    case 'time':
    case 'time without time zone':
      return 'z.iso.time()';
    
    case 'time with time zone':
    case 'timetz':
      // PostgreSQL time with timezone, no direct Zod v4 equivalent
      return 'z.string().regex(/^\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?[+-]\\d{2}:\\d{2}$/)';
    
    case 'interval':
      return 'z.iso.duration()';

    // UUID
    case 'uuid':
      return 'z.uuid()';

    // JSON types
    case 'json':
      return 'z.record(z.string(), z.unknown())';
    
    case 'jsonb':
      return 'z.record(z.string(), z.unknown())';

    // Network types
    case 'inet':
      // In Zod v4, use z.ipv4() or z.ipv6() but inet accepts both, so we use a union
      return 'z.union([z.ipv4(), z.ipv6()])';
    
    case 'cidr':
      // PostgreSQL cidr accepts both IPv4 and IPv6 CIDR notation
      return 'z.union([z.cidrv4(), z.cidrv6()])';
    
    case 'macaddr':
      return 'z.mac()';
    
    case 'macaddr8':
      // macaddr8 is 64-bit (8 bytes), standard z.mac() is 48-bit, use regex
      return 'z.string().regex(/^([0-9A-Fa-f]{2}[:-]){7}([0-9A-Fa-f]{2})$/)';

    // Bit string types
    case 'bit':
      if (column.characterMaximumLength) {
        return `z.string().regex(/^[01]{${column.characterMaximumLength}}$/)`;
      }
      return 'z.string().regex(/^[01]+$/)';
    
    case 'bit varying':
    case 'varbit':
      if (column.characterMaximumLength) {
        return `z.string().regex(/^[01]{0,${column.characterMaximumLength}}$/)`;
      }
      return 'z.string().regex(/^[01]*$/)';

    // Geometric types
    case 'point':
      return 'z.tuple([z.number(), z.number()])';
    
    case 'line':
      return 'z.object({ a: z.number(), b: z.number(), c: z.number() })';
    
    case 'lseg':
      return 'z.tuple([z.tuple([z.number(), z.number()]), z.tuple([z.number(), z.number()])])';
    
    case 'box':
      return 'z.tuple([z.tuple([z.number(), z.number()]), z.tuple([z.number(), z.number()])])';
    
    case 'path':
      return 'z.array(z.tuple([z.number(), z.number()]))';
    
    case 'polygon':
      return 'z.array(z.tuple([z.number(), z.number()]))';
    
    case 'circle':
      return 'z.object({ center: z.tuple([z.number(), z.number()]), radius: z.number() })';

    // Text search types
    case 'tsvector':
      return 'z.string() /* tsvector */';
    
    case 'tsquery':
      return 'z.string() /* tsquery */';

    // XML
    case 'xml':
      return 'z.string() /* XML */';

    // Binary data
    case 'bytea':
      return 'z.instanceof(Buffer)';

    // Other types
    case 'oid':
      return 'z.number().int().positive()';
    
    case 'regproc':
    case 'regprocedure':
    case 'regoper':
    case 'regoperator':
    case 'regclass':
    case 'regtype':
    case 'regrole':
    case 'regnamespace':
    case 'regconfig':
    case 'regdictionary':
      return 'z.string() /* PostgreSQL OID reference */';

    // pg_lsn
    case 'pg_lsn':
      return 'z.string().regex(/^[0-9A-F]+\\/[0-9A-F]+$/)';

    // User-defined base types or unknown
    default:
      const warning = `Unknown type: ${dataType} (udt: ${udtName}) in column ${column.columnName}`;
      warnings.push(warning);
      
      if (options.strictMode) {
        throw new Error(warning);
      }
      
      return 'z.unknown() /* unmapped type */';
  }
}

/**
 * Apply check constraints as Zod refinements
 */
export function applyCheckConstraints(
  columnName: string,
  baseSchema: string,
  constraints: CheckConstraintMetadata[]
): string {
  let schema = baseSchema;

  for (const constraint of constraints) {
    // Try to parse simple check constraints
    const checkClause = constraint.checkClause.toLowerCase();

    // >= pattern
    const geMatch = checkClause.match(new RegExp(`${columnName}\\s*>=\\s*([\\d.]+)`));
    if (geMatch) {
      const value = geMatch[1];
      if (schema.includes('z.number()')) {
        schema = schema.replace('z.number()', `z.number().min(${value})`);
      } else if (schema.includes('z.bigint()')) {
        schema = schema.replace('z.bigint()', `z.bigint().min(${value}n)`);
      }
      continue;
    }

    // > pattern
    const gtMatch = checkClause.match(new RegExp(`${columnName}\\s*>\\s*([\\d.]+)`));
    if (gtMatch) {
      const value = parseFloat(gtMatch[1]);
      if (schema.includes('z.number()')) {
        schema = schema.replace('z.number()', `z.number().min(${value + Number.EPSILON})`);
      }
      continue;
    }

    // <= pattern
    const leMatch = checkClause.match(new RegExp(`${columnName}\\s*<=\\s*([\\d.]+)`));
    if (leMatch) {
      const value = leMatch[1];
      if (schema.includes('z.number()')) {
        schema = schema.replace('z.number()', `z.number().max(${value})`);
      } else if (schema.includes('z.bigint()')) {
        schema = schema.replace('z.bigint()', `z.bigint().max(${value}n)`);
      }
      continue;
    }

    // < pattern
    const ltMatch = checkClause.match(new RegExp(`${columnName}\\s*<\\s*([\\d.]+)`));
    if (ltMatch) {
      const value = parseFloat(ltMatch[1]);
      if (schema.includes('z.number()')) {
        schema = schema.replace('z.number()', `z.number().max(${value - Number.EPSILON})`);
      }
      continue;
    }

    // BETWEEN pattern
    const betweenMatch = checkClause.match(
      new RegExp(`${columnName}\\s*between\\s*([\\d.]+)\\s*and\\s*([\\d.]+)`)
    );
    if (betweenMatch) {
      const [, min, max] = betweenMatch;
      if (schema.includes('z.number()')) {
        schema = schema.replace('z.number()', `z.number().min(${min}).max(${max})`);
      }
      continue;
    }

    // IN pattern (standard SQL)
    const inMatch = checkClause.match(
      new RegExp(`${columnName}\\s*in\\s*\\(([^)]+)\\)`)
    );
    if (inMatch) {
      const values = inMatch[1].split(',').map((v: string) => v.trim().replace(/'/g, ''));
      if (schema.includes('z.string()')) {
        const enumValues = values.map((v: string) => `'${v}'`).join(', ');
        schema = `z.enum([${enumValues}])`;
      }
      continue;
    }

    // PostgreSQL ANY (ARRAY[...]) pattern
    const anyArrayMatch = checkClause.match(
      new RegExp(`\\(?${columnName}\\s*=\\s*any\\s*\\(array\\[([^\\]]+)\\]`)
    );
    if (anyArrayMatch) {
      // Extract values from ARRAY['val1'::text, 'val2'::text]
      const valuesStr = anyArrayMatch[1];
      const values = valuesStr
        .split(',')
        .map((v: string) => {
          const match = v.trim().match(/'([^']+)'/);
          return match ? match[1] : null;
        })
        .filter((v: string | null): v is string => v !== null);
      
      if (values.length > 0 && schema.includes('z.string()')) {
        const enumValues = values.map((v: string) => `'${v}'`).join(', ');
        schema = `z.enum([${enumValues}])`;
        continue;
      }
    }

    // REGEX/~ pattern
    const regexMatch = checkClause.match(
      new RegExp(`${columnName}\\s*~\\s*'([^']+)'`)
    );
    if (regexMatch) {
      const pattern = regexMatch[1];
      if (schema.includes('z.string()')) {
        schema = schema.replace('z.string()', `z.string().regex(/${pattern}/)`);
      }
      continue;
    }

    // LENGTH pattern
    const lengthMatch = checkClause.match(
      new RegExp(`length\\(${columnName}\\)\\s*([><=]+)\\s*([\\d]+)`)
    );
    if (lengthMatch) {
      const [, operator, value] = lengthMatch;
      if (schema.includes('z.string()')) {
        if (operator === '>=' || operator === '>') {
          schema = schema.replace('z.string()', `z.string().min(${value})`);
        } else if (operator === '<=' || operator === '<') {
          schema = schema.replace('z.string()', `z.string().max(${value})`);
        }
      }
      continue;
    }

    // If we can't parse it, add as a comment
    schema += ` /* CHECK: ${constraint.checkClause} */`;
  }

  return schema;
}

/**
 * Convert snake_case to PascalCase
 */
export function toPascalCase(str: string): string {
  return str
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');
}

/**
 * Convert snake_case to camelCase
 */
export function toCamelCase(str: string): string {
  const pascal = toPascalCase(str);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}
