import type {
  ColumnMetadata,
  DatabaseMetadata,
  GeneratedSchema,
  GenerationResult,
  SchemaGenerationOptions,
  TableMetadata,
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

    return {
        schemas,
        enums,
        compositeTypes,
        domains,
        ranges,
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
 * Format the complete output file
 */
export function formatOutput(result: GenerationResult): string {
    let output = `/**\n`;
    output += ` * ==========================================\n`;
    output += ` *     | GENERATED BY PG-TO-ZOD (TBP) |\n`;
    output += ` * ==========================================\n`;
    output += ` *\n`;
    output += ` * ⚠️ DO NOT EDIT THIS FILE MANUALLY!\n`;
    output += ` *\n`;
    output += ` * This file was automatically generated from\n`;
    output += ` * your PostgreSQL database schema.\n`;
    output += ` *\n`;
    output += ` * To regenerate, run:\n`;
    output += ` *   pg-to-zod --url <connection-url> -o <file>\n`;
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
