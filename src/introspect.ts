import pg from 'pg';
import type {
  DatabaseConfig,
  DatabaseMetadata,
  TableMetadata,
  EnumMetadata,
  CompositeTypeMetadata,
  RangeTypeMetadata,
  DomainMetadata,
  SchemaGenerationOptions,
} from './types.js';

const { Pool } = pg;

/**
 * Introspect a PostgreSQL database and return complete metadata
 */
export async function introspectDatabase(
  config: DatabaseConfig,
  options: SchemaGenerationOptions = {}
): Promise<DatabaseMetadata> {
  const pool = new Pool(config);

  try {
    const schemas = options.schemas ?? ['public'];

    const [tables, enums, compositeTypes, rangeTypes, domains] = await Promise.all([
      introspectTables(pool, schemas, options),
      introspectEnums(pool, schemas),
      introspectCompositeTypes(pool, schemas),
      introspectRangeTypes(pool, schemas),
      introspectDomains(pool, schemas),
    ]);

    return {
      tables,
      enums,
      compositeTypes,
      rangeTypes,
      domains,
    };
  } finally {
    await pool.end();
  }
}

/**
 * Introspect tables and their columns
 */
async function introspectTables(
  pool: pg.Pool,
  schemas: string[],
  options: SchemaGenerationOptions
): Promise<TableMetadata[]> {
  const schemaFilter = schemas.map((_, i) => `$${i + 1}`).join(', ');

  // Get all columns
  const columnsQuery = `
    SELECT 
      c.table_schema,
      c.table_name,
      c.column_name,
      c.data_type,
      c.is_nullable,
      c.column_default,
      c.character_maximum_length,
      c.numeric_precision,
      c.numeric_scale,
      c.datetime_precision,
      c.udt_name,
      c.domain_name,
      COALESCE(
        (SELECT array_ndims(ARRAY[]::text[]) FROM information_schema.element_types e 
         WHERE e.object_schema = c.table_schema 
         AND e.object_name = c.table_name 
         AND e.object_type = 'TABLE'
         AND e.collection_type_identifier = c.dtd_identifier
        ), 0
      ) as array_dimensions
    FROM information_schema.columns c
    WHERE c.table_schema IN (${schemaFilter})
    ORDER BY c.table_schema, c.table_name, c.ordinal_position
  `;

  const columnsResult = await pool.query(columnsQuery, schemas);

  // Get check constraints
  const constraintsQuery = `
    SELECT 
      tc.table_schema,
      tc.table_name,
      tc.constraint_name,
      cc.check_clause,
      ccu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.check_constraints cc 
      ON tc.constraint_name = cc.constraint_name 
      AND tc.constraint_schema = cc.constraint_schema
    LEFT JOIN information_schema.constraint_column_usage ccu
      ON tc.constraint_name = ccu.constraint_name
      AND tc.constraint_schema = ccu.constraint_schema
    WHERE tc.constraint_type = 'CHECK'
      AND tc.table_schema IN (${schemaFilter})
  `;

  const constraintsResult = await pool.query(constraintsQuery, schemas);

  // Get primary keys
  const primaryKeysQuery = `
    SELECT 
      tc.table_schema,
      tc.table_name,
      kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    WHERE tc.constraint_type = 'PRIMARY KEY'
      AND tc.table_schema IN (${schemaFilter})
    ORDER BY kcu.ordinal_position
  `;

  const primaryKeysResult = await pool.query(primaryKeysQuery, schemas);

  // Get unique constraints
  const uniqueConstraintsQuery = `
    SELECT 
      tc.table_schema,
      tc.table_name,
      tc.constraint_name,
      array_agg(kcu.column_name ORDER BY kcu.ordinal_position) as columns
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    WHERE tc.constraint_type = 'UNIQUE'
      AND tc.table_schema IN (${schemaFilter})
    GROUP BY tc.table_schema, tc.table_name, tc.constraint_name
  `;

  const uniqueConstraintsResult = await pool.query(uniqueConstraintsQuery, schemas);

  // Group by table
  const tableMap = new Map<string, TableMetadata>();

  for (const row of columnsResult.rows) {
    const tableKey = `${row.table_schema}.${row.table_name}`;

    if (!tableMap.has(tableKey)) {
      tableMap.set(tableKey, {
        tableName: row.table_name,
        schemaName: row.table_schema,
        columns: [],
        checkConstraints: [],
        primaryKeys: [],
        uniqueConstraints: [],
      });
    }

    const table = tableMap.get(tableKey)!;
    const isArray = row.data_type === 'ARRAY';

    table.columns.push({
      columnName: row.column_name,
      dataType: row.data_type,
      isNullable: row.is_nullable === 'YES',
      columnDefault: row.column_default,
      characterMaximumLength: row.character_maximum_length,
      numericPrecision: row.numeric_precision,
      numericScale: row.numeric_scale,
      datetimePrecision: row.datetime_precision,
      udtName: row.udt_name,
      domainName: row.domain_name,
      arrayDimensions: row.array_dimensions || 0,
      isArray,
    });
  }

  // Add check constraints
  for (const row of constraintsResult.rows) {
    const tableKey = `${row.table_schema}.${row.table_name}`;
    const table = tableMap.get(tableKey);
    if (table) {
      table.checkConstraints.push({
        constraintName: row.constraint_name,
        checkClause: row.check_clause,
        columnName: row.column_name,
      });
    }
  }

  // Add primary keys
  for (const row of primaryKeysResult.rows) {
    const tableKey = `${row.table_schema}.${row.table_name}`;
    const table = tableMap.get(tableKey);
    if (table) {
      table.primaryKeys.push(row.column_name);
    }
  }

  // Add unique constraints
  for (const row of uniqueConstraintsResult.rows) {
    const tableKey = `${row.table_schema}.${row.table_name}`;
    const table = tableMap.get(tableKey);
    if (table) {
      table.uniqueConstraints.push({
        constraintName: row.constraint_name,
        columns: row.columns,
      });
    }
  }

  // Filter tables based on options
  let tables = Array.from(tableMap.values());

  if (options.tables) {
    tables = tables.filter((t) => options.tables!.includes(t.tableName));
  }

  if (options.excludeTables) {
    tables = tables.filter((t) => !options.excludeTables!.includes(t.tableName));
  }

  return tables;
}

/**
 * Introspect enum types
 */
async function introspectEnums(
  pool: pg.Pool,
  schemas: string[]
): Promise<EnumMetadata[]> {
  const schemaFilter = schemas.map((_, i) => `$${i + 1}`).join(', ');

  const query = `
    SELECT 
      t.typname as enum_name,
      n.nspname as schema_name,
      array_agg(e.enumlabel ORDER BY e.enumsortorder) as enum_values
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    JOIN pg_namespace n ON t.typnamespace = n.oid
    WHERE n.nspname IN (${schemaFilter})
    GROUP BY t.typname, n.nspname
    ORDER BY t.typname
  `;

  const result = await pool.query(query, schemas);

  return result.rows.map((row) => {
    // Handle PostgreSQL array format: {value1,value2,value3}
    let enumValues: string[];
    
    if (Array.isArray(row.enum_values)) {
      enumValues = row.enum_values;
    } else if (typeof row.enum_values === 'string') {
      // Parse PostgreSQL array format
      if (row.enum_values.startsWith('{') && row.enum_values.endsWith('}')) {
        enumValues = row.enum_values
          .slice(1, -1) // Remove { and }
          .split(',')
          .map((v: string) => v.trim());
      } else {
        enumValues = [row.enum_values];
      }
    } else {
      enumValues = [row.enum_values];
    }
    
    return {
      enumName: row.enum_name,
      enumValues,
      schemaName: row.schema_name,
    };
  });
}

/**
 * Introspect composite types
 */
async function introspectCompositeTypes(
  pool: pg.Pool,
  schemas: string[]
): Promise<CompositeTypeMetadata[]> {
  const schemaFilter = schemas.map((_, i) => `$${i + 1}`).join(', ');

  const query = `
    SELECT 
      t.typname as type_name,
      n.nspname as schema_name,
      a.attname as attribute_name,
      a.attnum as attribute_number,
      format_type(a.atttypid, a.atttypmod) as data_type
    FROM pg_type t
    JOIN pg_namespace n ON t.typnamespace = n.oid
    JOIN pg_class c ON t.typrelid = c.oid
    JOIN pg_attribute a ON c.oid = a.attrelid
    WHERE t.typtype = 'c'
      AND n.nspname IN (${schemaFilter})
      AND a.attnum > 0
      AND NOT a.attisdropped
    ORDER BY t.typname, a.attnum
  `;

  const result = await pool.query(query, schemas);

  const typeMap = new Map<string, CompositeTypeMetadata>();

  for (const row of result.rows) {
    const typeKey = `${row.schema_name}.${row.type_name}`;

    if (!typeMap.has(typeKey)) {
      typeMap.set(typeKey, {
        typeName: row.type_name,
        schemaName: row.schema_name,
        attributes: [],
      });
    }

    const type = typeMap.get(typeKey)!;
    type.attributes.push({
      attributeName: row.attribute_name,
      dataType: row.data_type,
      attributeNumber: row.attribute_number,
    });
  }

  return Array.from(typeMap.values());
}

/**
 * Introspect range types
 */
async function introspectRangeTypes(
  pool: pg.Pool,
  schemas: string[]
): Promise<RangeTypeMetadata[]> {
  const schemaFilter = schemas.map((_, i) => `$${i + 1}`).join(', ');

  const query = `
    SELECT 
      t.typname as range_name,
      n.nspname as schema_name,
      format_type(r.rngsubtype, NULL) as subtype
    FROM pg_type t
    JOIN pg_namespace n ON t.typnamespace = n.oid
    JOIN pg_range r ON t.oid = r.rngtypid
    WHERE n.nspname IN (${schemaFilter})
    ORDER BY t.typname
  `;

  const result = await pool.query(query, schemas);

  return result.rows.map((row) => ({
    rangeName: row.range_name,
    subtype: row.subtype,
    schemaName: row.schema_name,
  }));
}

/**
 * Introspect domain types
 */
async function introspectDomains(
  pool: pg.Pool,
  schemas: string[]
): Promise<DomainMetadata[]> {
  const schemaFilter = schemas.map((_, i) => `$${i + 1}`).join(', ');

  // Get domain information
  const domainsQuery = `
    SELECT 
      t.typname as domain_name,
      n.nspname as schema_name,
      format_type(t.typbasetype, t.typtypmod) as data_type,
      t.typnotnull as is_not_null,
      t.typdefault as domain_default,
      information_schema._pg_char_max_length(t.typbasetype, t.typtypmod) as character_maximum_length,
      information_schema._pg_numeric_precision(t.typbasetype, t.typtypmod) as numeric_precision,
      information_schema._pg_numeric_scale(t.typbasetype, t.typtypmod) as numeric_scale
    FROM pg_type t
    JOIN pg_namespace n ON t.typnamespace = n.oid
    WHERE t.typtype = 'd'
      AND n.nspname IN (${schemaFilter})
    ORDER BY t.typname
  `;

  const domainsResult = await pool.query(domainsQuery, schemas);

  // Get domain constraints
  const constraintsQuery = `
    SELECT 
      t.typname as domain_name,
      n.nspname as schema_name,
      c.conname as constraint_name,
      pg_get_constraintdef(c.oid) as check_clause
    FROM pg_constraint c
    JOIN pg_type t ON c.contypid = t.oid
    JOIN pg_namespace n ON t.typnamespace = n.oid
    WHERE c.contype = 'c'
      AND n.nspname IN (${schemaFilter})
  `;

  const constraintsResult = await pool.query(constraintsQuery, schemas);

  const domains: DomainMetadata[] = domainsResult.rows.map((row) => ({
    domainName: row.domain_name,
    dataType: row.data_type,
    schemaName: row.schema_name,
    characterMaximumLength: row.character_maximum_length,
    numericPrecision: row.numeric_precision,
    numericScale: row.numeric_scale,
    isNullable: !row.is_not_null,
    domainDefault: row.domain_default,
    checkConstraints: [],
  }));

  // Add check constraints to domains
  for (const row of constraintsResult.rows) {
    const domain = domains.find(
      (d) => d.domainName === row.domain_name && d.schemaName === row.schema_name
    );
    if (domain) {
      domain.checkConstraints.push({
        constraintName: row.constraint_name,
        checkClause: row.check_clause,
        columnName: null,
      });
    }
  }

  return domains;
}
