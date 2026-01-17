import type {
  ColumnMetadata,
  DatabaseMetadata,
  GeneratedSchema,
  GenerationResult,
  SchemaGenerationOptions,
  TableMetadata,
  ViewMetadata,
  RoutineMetadata,
} from './types.js';
import {applyCheckConstraints, mapColumnToZod, toCamelCase, toPascalCase,} from './type-mapper.js';

/**
 * Generate Zod schemas from database metadata
 */
export function generateSchemas(
    metadata: DatabaseMetadata,
    options: SchemaGenerationOptions = {}
): GenerationResult {
    const warnings: string[] = [];
    const schemas: GeneratedSchema[] = [];

    // Generate enum schemas
    const enums = metadata.enums.map((enumType) => ({
        name: toPascalCase(enumType.schemaName) + toPascalCase(enumType.enumName),
        code: generateEnumSchema(enumType.enumName, enumType.enumValues, options, enumType.schemaName),
    }));

    // Generate range type schemas
    const ranges = metadata.rangeTypes.map((rangeType) => ({
        name: toPascalCase(rangeType.schemaName) + toPascalCase(rangeType.rangeName),
        code: generateRangeSchema(rangeType.rangeName, rangeType.subtype, metadata, options, warnings, rangeType.schemaName),
    }));

    // Generate composite type schemas (only if flag is set)
    const compositeTypes = options.includeCompositeTypes
        ? metadata.compositeTypes.map((compositeType) => ({
            name: toPascalCase(compositeType.schemaName) + toPascalCase(compositeType.typeName) + 'Composite',
            code: generateCompositeTypeSchema(compositeType, metadata, options, warnings),
        }))
        : [];

    // Generate domain schemas
    const domains = metadata.domains.map((domain) => ({
        name: toPascalCase(domain.schemaName) + toPascalCase(domain.domainName),
        code: generateDomainSchema(domain, metadata, options, warnings),
    }));

    // Generate table schemas
    for (const table of metadata.tables) {
        const schema = generateTableSchema(table, metadata, options, warnings);
        schemas.push(schema);
    }

    // Generate view schemas
    const views = metadata.views?.map((view) => ({
        name: toPascalCase(view.schemaName) + toPascalCase(view.viewName),
        code: generateViewSchema(view, metadata, options, warnings),
    })) || [];

    // Generate routine schemas (filter by security type and internal types)
    const filteredRoutines = metadata.routines?.filter((routine) => {
        // By default, only include SECURITY DEFINER functions
        // Include SECURITY INVOKER only if explicitly requested
        if (routine.securityType === 'INVOKER' && !options.includeSecurityInvoker) {
            return false;
        }
        
        // Skip routines with internal PostgreSQL types
        // These are low-level system functions not meant for application use
        const internalTypes = ['internal', 'trigger', 'event_trigger', 'cstring', 'opaque', '"char"', 'language_handler', 'fdw_handler', 'index_am_handler', 'tsm_handler', 'table_am_handler'];
        
        // Check parameters for internal types
        const hasInternalParam = routine.parameters.some(param => 
            internalTypes.includes(param.dataType.toLowerCase()) || 
            internalTypes.includes(param.udtName.toLowerCase())
        );
        
        // Check return type for internal types
        const hasInternalReturn = routine.returnType && (
            internalTypes.includes(routine.returnType.toLowerCase()) ||
            (routine.returnUdtName && internalTypes.includes(routine.returnUdtName.toLowerCase()))
        );
        
        if (hasInternalParam || hasInternalReturn) {
            return false;
        }
        
        // Skip functions with duplicate parameter names (would cause invalid TypeScript)
        const paramNames = routine.parameters.map(p => p.parameterName.toLowerCase());
        const hasDuplicateParams = new Set(paramNames).size !== paramNames.length;
        if (hasDuplicateParams) {
            return false;
        }
        
        return true;
    }) || [];

    // Handle function overloading by skipping duplicates - only keep first occurrence
    const seenRoutineNames = new Set<string>();
    const uniqueRoutines = filteredRoutines.filter((routine) => {
        const baseName = toPascalCase(routine.schemaName) + toPascalCase(routine.routineName);
        
        if (seenRoutineNames.has(baseName)) {
            // Skip duplicates (overloaded functions)
            return false;
        }
        
        seenRoutineNames.add(baseName);
        return true;
    });
    
    const routines = uniqueRoutines.map((routine) => ({
        name: toPascalCase(routine.schemaName) + toPascalCase(routine.routineName),
        code: generateRoutineSchema(routine, metadata, options, warnings),
    }));

    return {
        schemas,
        enums,
        compositeTypes,
        domains,
        ranges,
        views,
        routines,
        warnings,
    };
}

/**
 * Generate enum schema
 */
function generateEnumSchema(
    enumName: string,
    values: string[],
    options: SchemaGenerationOptions,
    schemaPrefix?: string
): string {
    const baseName = toPascalCase(enumName);
    const fullName = schemaPrefix ? `${toPascalCase(schemaPrefix)}${baseName}` : baseName;
    const schemaName = `${fullName}Schema`;
    const typeName = fullName;

    const valuesStr = values.map((v) => `'${v}'`).join(', ');

    let code = '';

    if (options.includeComments) {
        code += `/** PostgreSQL enum: ${enumName} */\n`;
    }

    code += `export const ${schemaName} = z.enum([${valuesStr}]);\n`;
    code += `export type ${typeName} = z.infer<typeof ${schemaName}>;\n`;

    return code;
}

/**
 * Generate range type schema
 */
function generateRangeSchema(
    rangeName: string,
    subtype: string,
    _metadata: DatabaseMetadata,
    options: SchemaGenerationOptions,
    _warnings: string[],
    schemaPrefix?: string
): string {
    const baseName = toPascalCase(rangeName);
    const fullName = schemaPrefix ? `${toPascalCase(schemaPrefix)}${baseName}` : baseName;
    const schemaName = `${fullName}Schema`;
    const typeName = fullName;

    // Map subtype to Zod schema
    const subtypeSchema = mapSubtypeToZod(subtype, _metadata);

    let code = '';

    if (options.includeComments) {
        code += `/** PostgreSQL range type: ${rangeName}<${subtype}> */\n`;
    }

    // Ranges represented as [lower, upper] tuple with nullable bounds
    code += `export const ${schemaName} = z.tuple([${subtypeSchema}.nullable(), ${subtypeSchema}.nullable()]);\n`;
    code += `export type ${typeName} = z.infer<typeof ${schemaName}>;\n`;

    return code;
}

/**
 * Map PostgreSQL subtype to Zod for range types
 */
function mapSubtypeToZod(subtype: string, _metadata: DatabaseMetadata): string {
    const normalized = subtype.toLowerCase();

    switch (normalized) {
        case 'integer':
        case 'int':
        case 'int4':
            return 'z.number().int()';
        case 'bigint':
        case 'int8':
            return 'z.bigint()';
        case 'numeric':
        case 'decimal':
            return 'z.number()';
        case 'date':
            return 'z.date()';
        case 'timestamp':
        case 'timestamp without time zone':
        case 'timestamp with time zone':
        case 'timestamptz':
            return 'z.date()';
        default:
            return 'z.unknown()';
    }
}

/**
 * Generate composite type schema
 */
function generateCompositeTypeSchema(
    compositeType: any,
    metadata: DatabaseMetadata,
    options: SchemaGenerationOptions,
    warnings: string[]
): string {
    const baseName = toPascalCase(compositeType.typeName);
    const schemaPrefix = toPascalCase(compositeType.schemaName);
    // Add 'Composite' suffix to distinguish from tables with same name
    const fullName = `${schemaPrefix}${baseName}Composite`;
    const schemaName = `${fullName}Schema`;
    const typeName = fullName;

    let code = '';

    if (options.includeComments) {
        code += `/** PostgreSQL composite type: ${compositeType.typeName} */\n`;
    }

    code += `export const ${schemaName} = z.object({\n`;

    for (const attr of compositeType.attributes) {
        const fieldName = options.useCamelCase ? toCamelCase(attr.attributeName) : attr.attributeName;

        // Create a mock column for type mapping
        const mockColumn: ColumnMetadata = {
            columnName: attr.attributeName,
            dataType: attr.dataType,
            isNullable: true, // Composite type attributes can be null
            columnDefault: null,
            characterMaximumLength: null,
            numericPrecision: null,
            numericScale: null,
            datetimePrecision: null,
            udtName: attr.dataType,
            domainName: null,
            arrayDimensions: 0,
            isArray: false,
        };

        const zodType = mapColumnToZod(mockColumn, metadata, options, warnings);

        if (options.includeComments) {
            code += `  /** ${attr.dataType} */\n`;
        }
        code += `  ${fieldName}: ${zodType},\n`;
    }

    code += `});\n`;
    code += `export type ${typeName} = z.infer<typeof ${schemaName}>;\n`;

    return code;
}

/**
 * Generate domain schema
 */
function generateDomainSchema(
    domain: any,
    metadata: DatabaseMetadata,
    options: SchemaGenerationOptions,
    warnings: string[]
): string {
    const baseName = toPascalCase(domain.domainName);
    const schemaPrefix = toPascalCase(domain.schemaName);
    const fullName = `${schemaPrefix}${baseName}`;
    const schemaName = `${fullName}Schema`;
    const typeName = fullName;

    // Create a mock column for type mapping
    const mockColumn: ColumnMetadata = {
        columnName: domain.domainName,
        dataType: domain.dataType,
        isNullable: domain.isNullable,
        columnDefault: domain.domainDefault,
        characterMaximumLength: domain.characterMaximumLength,
        numericPrecision: domain.numericPrecision,
        numericScale: domain.numericScale,
        datetimePrecision: null,
        udtName: domain.dataType,
        domainName: null,
        arrayDimensions: 0,
        isArray: false,
    };

    let zodType = mapColumnToZod(mockColumn, metadata, options, warnings);

    // Apply domain check constraints
    if (domain.checkConstraints.length > 0) {
        zodType = applyCheckConstraints(domain.domainName, zodType, domain.checkConstraints);
    }

    let code = '';

    if (options.includeComments) {
        code += `/** PostgreSQL domain: ${domain.domainName} (base: ${domain.dataType}) */\n`;
    }

    code += `export const ${schemaName} = ${zodType};\n`;
    code += `export type ${typeName} = z.infer<typeof ${schemaName}>;\n`;

    return code;
}

/**
 * Generate view schema (read-only)
 */
function generateViewSchema(
    view: ViewMetadata,
    metadata: DatabaseMetadata,
    options: SchemaGenerationOptions,
    warnings: string[]
): string {
    const schemaPrefix = toPascalCase(view.schemaName);
    const viewName = toPascalCase(view.viewName);
    const schemaName = `${schemaPrefix}${viewName}ViewSchema`;
    const typeName = `${schemaPrefix}${viewName}View`;

    let code = '';

    if (options.includeComments) {
        code += `/** View: ${view.schemaName}.${view.viewName} (read-only) */\n`;
    }

    code += `export const ${schemaName} = z.object({\n`;

    for (const column of view.columns) {
        const fieldName = options.useCamelCase ? toCamelCase(column.columnName) : column.columnName;
        const zodType = mapColumnToZod(column, metadata, options, warnings);

        if (options.includeComments) {
            code += `  /** ${column.dataType} */\n`;
        }
        code += `  ${fieldName}: ${zodType},\n`;
    }

    code += `});\n`;
    code += `export type ${typeName} = z.infer<typeof ${schemaName}>;\n`;

    return code;
}

/**
 * Generate routine schema (function/procedure)
 */
function generateRoutineSchema(
    routine: RoutineMetadata,
    metadata: DatabaseMetadata,
    options: SchemaGenerationOptions,
    warnings: string[]
): string {
    const schemaPrefix = toPascalCase(routine.schemaName);
    const routineName = toPascalCase(routine.routineName);
    const paramsSchemaName = `${schemaPrefix}${routineName}ParamsSchema`;
    const returnSchemaName = `${schemaPrefix}${routineName}ReturnSchema`;
    const paramsTypeName = `${schemaPrefix}${routineName}Params`;
    const returnTypeName = `${schemaPrefix}${routineName}Return`;

    let code = '';

    if (options.includeComments) {
        code += `/** ${routine.routineType}: ${routine.schemaName}.${routine.routineName} */\n`;
    }

    // Generate parameters schema (input)
    const inParams = routine.parameters.filter(
        (p) => p.parameterMode === 'IN' || p.parameterMode === 'INOUT'
    );

    if (inParams.length > 0) {
        code += `export const ${paramsSchemaName} = z.object({\n`;

        for (const param of inParams) {
            const fieldName = options.useCamelCase ? toCamelCase(param.parameterName) : param.parameterName;

            // Create a mock column for type mapping
            const mockColumn: ColumnMetadata = {
                columnName: param.parameterName,
                dataType: param.dataType,
                isNullable: param.isNullable,
                columnDefault: null,
                characterMaximumLength: null,
                numericPrecision: null,
                numericScale: null,
                datetimePrecision: null,
                udtName: param.udtName,
                domainName: null,
                arrayDimensions: 0,
                isArray: param.dataType === 'ARRAY',
            };

            const zodType = mapColumnToZod(mockColumn, metadata, options, warnings);

            if (options.includeComments) {
                code += `  /** ${param.dataType} (${param.parameterMode}) */\n`;
            }
            code += `  ${fieldName}: ${zodType},\n`;
        }

        code += `});\n`;
        code += `export type ${paramsTypeName} = z.infer<typeof ${paramsSchemaName}>;\n\n`;
    }

    // Generate return type schema (output)
    const outParams = routine.parameters.filter(
        (p) => p.parameterMode === 'OUT' || p.parameterMode === 'INOUT'
    );

    if (routine.routineType === 'FUNCTION' && routine.returnType && routine.returnType !== 'void') {
        // For functions with return values
        if (outParams.length > 0) {
            // Multiple output parameters - return object
            code += `export const ${returnSchemaName} = z.object({\n`;

            for (const param of outParams) {
                const fieldName = options.useCamelCase ? toCamelCase(param.parameterName) : param.parameterName;

                const mockColumn: ColumnMetadata = {
                    columnName: param.parameterName,
                    dataType: param.dataType,
                    isNullable: param.isNullable,
                    columnDefault: null,
                    characterMaximumLength: null,
                    numericPrecision: null,
                    numericScale: null,
                    datetimePrecision: null,
                    udtName: param.udtName,
                    domainName: null,
                    arrayDimensions: 0,
                    isArray: param.dataType === 'ARRAY',
                };

                const zodType = mapColumnToZod(mockColumn, metadata, options, warnings);

                if (options.includeComments) {
                    code += `  /** ${param.dataType} (${param.parameterMode}) */\n`;
                }
                code += `  ${fieldName}: ${zodType},\n`;
            }

            code += `});\n`;
        } else {
            // Single return value
            const mockColumn: ColumnMetadata = {
                columnName: 'return_value',
                dataType: routine.returnType,
                isNullable: false,
                columnDefault: null,
                characterMaximumLength: null,
                numericPrecision: null,
                numericScale: null,
                datetimePrecision: null,
                udtName: routine.returnUdtName || routine.returnType,
                domainName: null,
                arrayDimensions: 0,
                isArray: routine.returnType === 'ARRAY' || routine.returnsSet,
            };

            const zodType = mapColumnToZod(mockColumn, metadata, options, warnings);
            
            if (options.includeComments) {
                code += `/** Returns: ${routine.returnType} */\n`;
            }
            
            if (routine.returnsSet) {
                code += `export const ${returnSchemaName} = z.array(${zodType});\n`;
            } else {
                code += `export const ${returnSchemaName} = ${zodType};\n`;
            }
        }

        code += `export type ${returnTypeName} = z.infer<typeof ${returnSchemaName}>;\n`;
    } else if (outParams.length > 0) {
        // Procedures with OUT parameters
        code += `export const ${returnSchemaName} = z.object({\n`;

        for (const param of outParams) {
            const fieldName = options.useCamelCase ? toCamelCase(param.parameterName) : param.parameterName;

            const mockColumn: ColumnMetadata = {
                columnName: param.parameterName,
                dataType: param.dataType,
                isNullable: param.isNullable,
                columnDefault: null,
                characterMaximumLength: null,
                numericPrecision: null,
                numericScale: null,
                datetimePrecision: null,
                udtName: param.udtName,
                domainName: null,
                arrayDimensions: 0,
                isArray: param.dataType === 'ARRAY',
            };

            const zodType = mapColumnToZod(mockColumn, metadata, options, warnings);

            if (options.includeComments) {
                code += `  /** ${param.dataType} (${param.parameterMode}) */\n`;
            }
            code += `  ${fieldName}: ${zodType},\n`;
        }

        code += `});\n`;
        code += `export type ${returnTypeName} = z.infer<typeof ${returnSchemaName}>;\n`;
    }

    return code;
}

/**
 * Generate table schema
 */
function generateTableSchema(
    table: TableMetadata,
    metadata: DatabaseMetadata,
    options: SchemaGenerationOptions,
    warnings: string[]
): GeneratedSchema {
    // Include schema name to avoid collisions (e.g., PublicCommentThreadsSchema)
    const schemaPrefix = toPascalCase(table.schemaName);
    const tableName = toPascalCase(table.tableName);
    const schemaName = `${schemaPrefix}${tableName}`;
    const readSchemaName = `${schemaName}Schema`;
    const insertSchemaName = `${schemaName}InsertSchema`;
    const updateSchemaName = `${schemaName}UpdateSchema`;
    const typeName = schemaName;
    const insertTypeName = `${schemaName}Insert`;
    const updateTypeName = `${schemaName}Update`;

    // Generate read schema (complete)
    let readCode = '';

    if (options.includeComments) {
        readCode += `/** Table: ${table.schemaName}.${table.tableName} */\n`;
    }

    readCode += `export const ${readSchemaName} = z.object({\n`;

    for (const column of table.columns) {
        const fieldName = options.useCamelCase ? toCamelCase(column.columnName) : column.columnName;

        let zodType = mapColumnToZod(column, metadata, options, warnings);

        // Apply column-specific check constraints
        const columnConstraints = table.checkConstraints.filter(
            (c) => c.columnName === column.columnName
        );
        if (columnConstraints.length > 0) {
            zodType = applyCheckConstraints(column.columnName, zodType, columnConstraints);
        }

        if (options.includeComments) {
            const commentParts = [column.dataType];
            if (column.columnDefault) {
                commentParts.push(`default: ${column.columnDefault}`);
            }
            readCode += `  /** ${commentParts.join(', ')} */\n`;
        }

        readCode += `  ${fieldName}: ${zodType},\n`;
    }

    readCode += `});\n`;
    readCode += `export type ${typeName} = z.infer<typeof ${readSchemaName}>;\n`;

    // Generate insert and update schemas
    // Default to true if not specified
    let insertCode: string | undefined;
    let updateCode: string | undefined;

    if (options.generateInputSchemas !== false) {
        // Collect fields that should be optional for insert
        const optionalFields: Array<{ fieldName: string; zodType: string; comment?: string }> = [];

        for (const column of table.columns) {
            const fieldName = options.useCamelCase ? toCamelCase(column.columnName) : column.columnName;

            // Determine if field should be optional in insert
            const hasDefault = column.columnDefault !== null;
            const isSerial = column.columnDefault?.includes('nextval') ?? false;
            const isAutoGenerated = isSerial || column.columnDefault?.includes('gen_random_uuid()') || false;

            if (isAutoGenerated || hasDefault) {
                // Get the base type
                let zodType = mapColumnToZod(column, metadata, options, warnings);

                // Apply column-specific check constraints
                const columnConstraints = table.checkConstraints.filter(
                    (c) => c.columnName === column.columnName
                );
                if (columnConstraints.length > 0) {
                    zodType = applyCheckConstraints(column.columnName, zodType, columnConstraints);
                }

                // Make it optional
                zodType = `${zodType}.optional()`;

                let comment: string | undefined;
                if (options.includeComments) {
                    const commentParts = [column.dataType];
                    if (hasDefault) {
                        commentParts.push(`default: ${column.columnDefault}`);
                    }
                    if (isSerial) {
                        commentParts.push('auto-generated');
                    }
                    comment = commentParts.join(', ');
                }

                optionalFields.push({fieldName, zodType, comment});
            }
        }

        // Generate INSERT schema using .extend() if there are optional fields
        insertCode = '';

        if (options.includeComments) {
            insertCode += `/** Insert schema for ${table.tableName} */\n`;
        }

        if (optionalFields.length === 0) {
            // No optional fields - just use the read schema directly
            insertCode += `export const ${insertSchemaName} = ${readSchemaName};\n`;
        } else {
            // Use .extend() to override optional fields
            insertCode += `export const ${insertSchemaName} = ${readSchemaName}.extend({\n`;

            for (const field of optionalFields) {
                if (field.comment) {
                    insertCode += `  /** ${field.comment} */\n`;
                }
                insertCode += `  ${field.fieldName}: ${field.zodType},\n`;
            }

            insertCode += `});\n`;
        }

        insertCode += `export type ${insertTypeName} = z.infer<typeof ${insertSchemaName}>;\n`;

        // Generate UPDATE schema using .partial() - all fields optional
        updateCode = '';

        if (options.includeComments) {
            updateCode += `/** Update schema for ${table.tableName} (all fields optional) */\n`;
        }

        updateCode += `export const ${updateSchemaName} = ${readSchemaName}.partial();\n`;
        updateCode += `export type ${updateTypeName} = z.infer<typeof ${updateSchemaName}>;\n`;
    }

    return {
        tableName: table.tableName,
        schemaName: table.schemaName,
        readSchema: readCode,
        inputSchema: insertCode,
        typeDefinitions: `${readCode}${insertCode ? '\n' + insertCode : ''}${updateCode ? '\n' + updateCode : ''}`,
    };
}

/**
 * Generate Database type that organizes all generated types by schema
 */
function generateDatabaseType(result: GenerationResult, metadata: DatabaseMetadata): string {
    // Group all entities by schema
    const schemaMap = new Map<string, {
        tables: Array<{ name: string; schemaName: string; tableName: string }>;
        views: Array<{ name: string; schemaName: string; viewName: string }>;
        routines: Array<{ name: string; schemaName: string; routineName: string; hasParams: boolean; hasReturn: boolean }>;
        enums: Array<{ name: string; schemaName: string; enumName: string }>;
        compositeTypes: Array<{ name: string; schemaName: string; typeName: string }>;
        domains: Array<{ name: string; schemaName: string; domainName: string }>;
        ranges: Array<{ name: string; schemaName: string; rangeName: string }>;
    }>();

    // Collect tables
    for (const schema of result.schemas) {
        const schemaPrefix = toPascalCase(schema.schemaName);
        const tableName = toPascalCase(schema.tableName);
        const fullName = `${schemaPrefix}${tableName}`;

        if (!schemaMap.has(schema.schemaName)) {
            schemaMap.set(schema.schemaName, {
                tables: [],
                views: [],
                routines: [],
                enums: [],
                compositeTypes: [],
                domains: [],
                ranges: [],
            });
        }

        schemaMap.get(schema.schemaName)!.tables.push({
            name: fullName,
            schemaName: schema.schemaName,
            tableName: schema.tableName,
        });
    }

    // Collect views (views have 'View' suffix in their type names)
    for (const view of result.views) {
        const parts = view.name.match(/^([A-Z][a-z0-9]*)(.+)View$/);
        if (parts && parts.length >= 3) {
            const schemaName = parts[1].toLowerCase();
            if (!schemaMap.has(schemaName)) {
                schemaMap.set(schemaName, {
                    tables: [],
                    views: [],
                    routines: [],
                    enums: [],
                    compositeTypes: [],
                    domains: [],
                    ranges: [],
                });
            }
            schemaMap.get(schemaName)!.views.push({
                name: view.name,
                schemaName,
                viewName: parts[2],
            });
        }
    }

    // Collect routines - need to check metadata to see if they have params/returns
    const routineMetadataMap = new Map<string, RoutineMetadata>();
    for (const routine of metadata.routines) {
        const schemaPrefix = toPascalCase(routine.schemaName);
        const routineName = toPascalCase(routine.routineName);
        const fullName = `${schemaPrefix}${routineName}`;
        routineMetadataMap.set(fullName, routine);
    }

    for (const routine of result.routines) {
        const parts = routine.name.match(/^([A-Z][a-z0-9]*)(.+)$/);
        if (parts && parts.length >= 3) {
            const schemaName = parts[1].toLowerCase();
            if (!schemaMap.has(schemaName)) {
                schemaMap.set(schemaName, {
                    tables: [],
                    views: [],
                    routines: [],
                    enums: [],
                    compositeTypes: [],
                    domains: [],
                    ranges: [],
                });
            }

            const routineMeta = routineMetadataMap.get(routine.name);
            if (routineMeta) {
                const inParams = routineMeta.parameters.filter(
                    (p) => p.parameterMode === 'IN' || p.parameterMode === 'INOUT'
                );
                const hasReturn = routineMeta.routineType === 'FUNCTION' && 
                                routineMeta.returnType && 
                                routineMeta.returnType !== 'void';
                const outParams = routineMeta.parameters.filter(
                    (p) => p.parameterMode === 'OUT' || p.parameterMode === 'INOUT'
                );

                schemaMap.get(schemaName)!.routines.push({
                    name: routine.name,
                    schemaName,
                    routineName: parts[2],
                    hasParams: inParams.length > 0,
                    hasReturn: hasReturn || outParams.length > 0,
                });
            }
        }
    }

    // Collect enums
    for (const enumType of result.enums) {
        const parts = enumType.name.match(/^([A-Z][a-z0-9]*)(.+)$/);
        if (parts && parts.length >= 3) {
            const schemaName = parts[1].toLowerCase();
            if (!schemaMap.has(schemaName)) {
                schemaMap.set(schemaName, {
                    tables: [],
                    views: [],
                    routines: [],
                    enums: [],
                    compositeTypes: [],
                    domains: [],
                    ranges: [],
                });
            }
            schemaMap.get(schemaName)!.enums.push({
                name: enumType.name,
                schemaName,
                enumName: parts[2],
            });
        }
    }

    // Collect composite types
    for (const compositeType of result.compositeTypes) {
        const parts = compositeType.name.match(/^([A-Z][a-z0-9]*)(.+)Composite$/);
        if (parts && parts.length >= 3) {
            const schemaName = parts[1].toLowerCase();
            if (!schemaMap.has(schemaName)) {
                schemaMap.set(schemaName, {
                    tables: [],
                    views: [],
                    routines: [],
                    enums: [],
                    compositeTypes: [],
                    domains: [],
                    ranges: [],
                });
            }
            schemaMap.get(schemaName)!.compositeTypes.push({
                name: compositeType.name,
                schemaName,
                typeName: parts[2],
            });
        }
    }

    // Collect domains
    for (const domain of result.domains) {
        const parts = domain.name.match(/^([A-Z][a-z0-9]*)(.+)$/);
        if (parts && parts.length >= 3) {
            const schemaName = parts[1].toLowerCase();
            if (!schemaMap.has(schemaName)) {
                schemaMap.set(schemaName, {
                    tables: [],
                    views: [],
                    routines: [],
                    enums: [],
                    compositeTypes: [],
                    domains: [],
                    ranges: [],
                });
            }
            schemaMap.get(schemaName)!.domains.push({
                name: domain.name,
                schemaName,
                domainName: parts[2],
            });
        }
    }

    // Collect ranges
    for (const range of result.ranges) {
        const parts = range.name.match(/^([A-Z][a-z0-9]*)(.+)$/);
        if (parts && parts.length >= 3) {
            const schemaName = parts[1].toLowerCase();
            if (!schemaMap.has(schemaName)) {
                schemaMap.set(schemaName, {
                    tables: [],
                    views: [],
                    routines: [],
                    enums: [],
                    compositeTypes: [],
                    domains: [],
                    ranges: [],
                });
            }
            schemaMap.get(schemaName)!.ranges.push({
                name: range.name,
                schemaName,
                rangeName: parts[2],
            });
        }
    }

    let output = '';
    output += `// ============================================\n`;
    output += `// Database Types\n`;
    output += `// ============================================\n\n`;

    output += `export interface Database {\n`;

    // Generate schema sections
    const schemas = Array.from(schemaMap.keys()).sort();
    for (const schemaName of schemas) {
        const entities = schemaMap.get(schemaName)!;

        output += `  ${schemaName}: {\n`;

        // Tables - always include
        output += `    Tables: {\n`;
        if (entities.tables.length > 0) {
            for (const table of entities.tables) {
                // Get relationships for this table from metadata
                const tableMetadata = metadata.tables.find(
                    t => t.tableName === table.tableName && t.schemaName === table.schemaName
                );
                const relationships = tableMetadata?.relationships || [];
                
                output += `      ${table.tableName}: {\n`;
                output += `        Row: ${table.name};\n`;
                output += `        Insert: ${table.name}Insert;\n`;
                output += `        Update: ${table.name}Update;\n`;
                output += `        Relationships: [\n`;
                if (relationships.length > 0) {
                    for (const rel of relationships) {
                        output += `          {\n`;
                        output += `            foreignKeyName: "${rel.foreignKeyName}"\n`;
                        output += `            columns: [${rel.columns.map(c => `"${c}"`).join(", ")}]\n`;
                        output += `            isOneToOne: ${rel.isOneToOne}\n`;
                        output += `            referencedRelation: "${rel.referencedRelation}"\n`;
                        output += `            referencedColumns: [${rel.referencedColumns.map(c => `"${c}"`).join(", ")}]\n`;
                        output += `          },\n`;
                    }
                }
                output += `        ];\n`;
                output += `      };\n`;
            }
        } else {
            output += `      [_ in never]: never\n`;
        }
        output += `    };\n`;

        // Views - always include
        output += `    Views: {\n`;
        if (entities.views.length > 0) {
            for (const view of entities.views) {
                output += `      ${view.viewName}: {\n`;
                output += `        Row: ${view.name};\n`;
                output += `      };\n`;
            }
        } else {
            output += `      [_ in never]: never\n`;
        }
        output += `    };\n`;

        // Functions - always include
        output += `    Functions: {\n`;
        if (entities.routines.length > 0) {
            for (const routine of entities.routines) {
                const routineName = routine.routineName.replace(/^[A-Z]/, (c) => c.toLowerCase());
                output += `      ${routineName}: {\n`;
                
                // Only include Args if the function has parameters
                if (routine.hasParams) {
                    output += `        Args: ${routine.name}Params;\n`;
                } else {
                    output += `        Args: Record<string, never>;\n`;
                }
                
                // Only include Returns if the function has a return type
                if (routine.hasReturn) {
                    output += `        Returns: ${routine.name}Return;\n`;
                } else {
                    output += `        Returns: void;\n`;
                }
                
                output += `      };\n`;
            }
        } else {
            output += `      [_ in never]: never\n`;
        }
        output += `    };\n`;

        // Enums - always include
        output += `    Enums: {\n`;
        if (entities.enums.length > 0) {
            for (const enumType of entities.enums) {
                output += `      ${enumType.enumName.replace(/^[A-Z]/, (c) => c.toLowerCase())}: ${enumType.name};\n`;
            }
        } else {
            output += `      [_ in never]: never\n`;
        }
        output += `    };\n`;

        // Composite Types - always include
        output += `    CompositeTypes: {\n`;
        if (entities.compositeTypes.length > 0) {
            for (const compositeType of entities.compositeTypes) {
                output += `      ${compositeType.typeName.replace(/^[A-Z]/, (c) => c.toLowerCase())}: ${compositeType.name};\n`;
            }
        } else {
            output += `      [_ in never]: never\n`;
        }
        output += `    };\n`;

        output += `  };\n`;
    }

    output += `}\n`;

    return output;
}

/**
 * Format the complete output file
 */
export function formatOutput(result: GenerationResult, metadata: DatabaseMetadata): string {
    let output = `/**\n`;
    output += ` * ==========================================\n`;
    output += ` *     | GENERATED BY PG2ZOD |\n`;
    output += ` * ==========================================\n`;
    output += ` *\n`;
    output += ` * ⚠️ DO NOT EDIT THIS FILE MANUALLY!\n`;
    output += ` *\n`;
    output += ` * This file was automatically generated from\n`;
    output += ` * your PostgreSQL database schema.\n`;
    output += ` *\n`;
    output += ` * To regenerate, run:\n`;
    output += ` *   pg2zod --url <connection-url> -o <file>\n`;
    output += ` *\n`;
    output += ` * Any manual changes will be overwritten when\n`;
    output += ` * the code is regenerated.\n`;
    output += ` * ==========================================\n`;
    output += ` */\n\n`;
    output += `import { z } from 'zod';\n\n`;

    // Enums
    if (result.enums.length > 0) {
        output += `// ============================================\n`;
        output += `// Enums\n`;
        output += `// ============================================\n\n`;

        for (const enumSchema of result.enums) {
            output += enumSchema.code + '\n';
        }
    }

    // Domains
    if (result.domains.length > 0) {
        output += `// ============================================\n`;
        output += `// Domains\n`;
        output += `// ============================================\n\n`;

        for (const domain of result.domains) {
            output += domain.code + '\n';
        }
    }

    // Ranges
    if (result.ranges.length > 0) {
        output += `// ============================================\n`;
        output += `// Range Types\n`;
        output += `// ============================================\n\n`;

        for (const range of result.ranges) {
            output += range.code + '\n';
        }
    }

    // Composite types
    if (result.compositeTypes.length > 0) {
        output += `// ============================================\n`;
        output += `// Composite Types\n`;
        output += `// ============================================\n\n`;

        for (const compositeType of result.compositeTypes) {
            output += compositeType.code + '\n';
        }
    }

    // Tables
    if (result.schemas.length > 0) {
        output += `// ============================================\n`;
        output += `// Tables\n`;
        output += `// ============================================\n\n`;

        for (const schema of result.schemas) {
            output += schema.typeDefinitions + '\n';
        }
    }

    // Views
    if (result.views && result.views.length > 0) {
        output += `// ============================================\n`;
        output += `// Views\n`;
        output += `// ============================================\n\n`;

        for (const view of result.views) {
            output += view.code + '\n';
        }
    }

    // Routines
    if (result.routines && result.routines.length > 0) {
        output += `// ============================================\n`;
        output += `// Routines (Functions/Procedures)\n`;
        output += `// ============================================\n\n`;

        for (const routine of result.routines) {
            output += routine.code + '\n';
        }
    }

    // Database Type
    output += generateDatabaseType(result, metadata) + '\n';

    // Warnings
    if (result.warnings.length > 0) {
        output += `// ============================================\n`;
        output += `// Warnings\n`;
        output += `// ============================================\n`;
        output += `// The following warnings were generated:\n`;

        for (const warning of result.warnings) {
            output += `// - ${warning}\n`;
        }
    }

    return output;
}
