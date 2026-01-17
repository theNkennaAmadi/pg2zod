/**
 * Database connection configuration
 */
export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean | { rejectUnauthorized: boolean };
}

/**
 * Column metadata from introspection
 */
export interface ColumnMetadata {
  columnName: string;
  dataType: string;
  isNullable: boolean;
  columnDefault: string | null;
  characterMaximumLength: number | null;
  numericPrecision: number | null;
  numericScale: number | null;
  datetimePrecision: number | null;
  udtName: string;
  domainName: string | null;
  arrayDimensions: number;
  isArray: boolean;
}

/**
 * Check constraint metadata
 */
export interface CheckConstraintMetadata {
  constraintName: string;
  checkClause: string;
  columnName: string | null;
}

/**
 * Enum type metadata
 */
export interface EnumMetadata {
  enumName: string;
  enumValues: string[];
  schemaName: string;
}

/**
 * Composite type metadata
 */
export interface CompositeTypeMetadata {
  typeName: string;
  schemaName: string;
  attributes: Array<{
    attributeName: string;
    dataType: string;
    attributeNumber: number;
  }>;
}

/**
 * Range type metadata
 */
export interface RangeTypeMetadata {
  rangeName: string;
  subtype: string;
  schemaName: string;
}

/**
 * Domain type metadata
 */
export interface DomainMetadata {
  domainName: string;
  dataType: string;
  schemaName: string;
  characterMaximumLength: number | null;
  numericPrecision: number | null;
  numericScale: number | null;
  isNullable: boolean;
  domainDefault: string | null;
  checkConstraints: CheckConstraintMetadata[];
}

/**
 * Foreign key relationship metadata
 */
export interface RelationshipMetadata {
  foreignKeyName: string;
  columns: string[];
  isOneToOne: boolean;
  referencedRelation: string;
  referencedColumns: string[];
}

/**
 * Table metadata
 */
export interface TableMetadata {
  tableName: string;
  schemaName: string;
  columns: ColumnMetadata[];
  checkConstraints: CheckConstraintMetadata[];
  primaryKeys: string[];
  uniqueConstraints: Array<{
    constraintName: string;
    columns: string[];
  }>;
  relationships: RelationshipMetadata[];
}

/**
 * View metadata
 */
export interface ViewMetadata {
  viewName: string;
  schemaName: string;
  columns: ColumnMetadata[];
  viewDefinition: string | null;
}

/**
 * Routine (function/procedure) parameter metadata
 */
export interface RoutineParameterMetadata {
  parameterName: string;
  dataType: string;
  parameterMode: 'IN' | 'OUT' | 'INOUT' | 'VARIADIC';
  ordinalPosition: number;
  udtName: string;
  isNullable: boolean;
}

/**
 * Routine (function/procedure) metadata
 */
export interface RoutineMetadata {
  routineName: string;
  schemaName: string;
  routineType: 'FUNCTION' | 'PROCEDURE';
  securityType: 'DEFINER' | 'INVOKER';
  parameters: RoutineParameterMetadata[];
  returnType: string | null;
  returnUdtName: string | null;
  returnsSet: boolean;
}

/**
 * Complete database schema metadata
 */
export interface DatabaseMetadata {
  tables: TableMetadata[];
  views: ViewMetadata[];
  routines: RoutineMetadata[];
  enums: EnumMetadata[];
  compositeTypes: CompositeTypeMetadata[];
  rangeTypes: RangeTypeMetadata[];
  domains: DomainMetadata[];
}

/**
 * Schema generation options
 */
export interface SchemaGenerationOptions {
  /** Include only specific schemas (default: ['public']) */
  schemas?: string[];
  
  /** Include only specific tables (default: all) */
  tables?: string[];
  
  /** Exclude specific tables */
  excludeTables?: string[];
  
  /** Exclude internal/system tables (default: true) */
  excludeInternalTables?: boolean;
  
  /** Generate input schemas (for create/update operations) (default: true) */
  generateInputSchemas?: boolean;
  
  /** Include composite types in generation (default: true) */
  includeCompositeTypes?: boolean;
  
  /** Include database views in generation (default: true) */
  includeViews?: boolean;
  
  /** Include database functions/procedures in generation (default: true) */
  includeRoutines?: boolean;
  
  /** Include security invoker routines (default: false, only security definer) */
  includeSecurityInvoker?: boolean;
  
  /** Use branded types for IDs and specific fields */
  useBrandedTypes?: boolean;
  
  /** Strict mode: fail on unmapped types instead of using z.unknown() */
  strictMode?: boolean;
  
  /** Include comments in generated code */
  includeComments?: boolean;
  
  /** Use camelCase for field names (default: keep original) */
  useCamelCase?: boolean;
  
  /** Custom type mappings */
  customTypeMappings?: Record<string, string>;
}

/**
 * Generated schema result
 */
export interface GeneratedSchema {
  tableName: string;
  schemaName: string;
  readSchema: string;
  inputSchema?: string;
  typeDefinitions: string;
}

/**
 * Complete generation result
 */
export interface GenerationResult {
  schemas: GeneratedSchema[];
  views: Array<{ name: string; code: string }>;
  routines: Array<{ name: string; code: string }>;
  enums: Array<{ name: string; code: string }>;
  compositeTypes: Array<{ name: string; code: string }>;
  domains: Array<{ name: string; code: string }>;
  ranges: Array<{ name: string; code: string }>;
  warnings: string[];
}

/**
 * Type mapping function signature
 */
export type TypeMapper = (
  column: ColumnMetadata,
  metadata: DatabaseMetadata
) => string;
