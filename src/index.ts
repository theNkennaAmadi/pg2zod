import {introspectDatabase} from './introspect.js';
import {formatOutput, generateSchemas} from './generator.js';
import type {DatabaseConfig, GenerationResult, SchemaGenerationOptions,} from './types.js';

export type {
    DatabaseConfig,
    SchemaGenerationOptions,
    GenerationResult,
    DatabaseMetadata,
    TableMetadata,
    ColumnMetadata,
    EnumMetadata,
    CompositeTypeMetadata,
    RangeTypeMetadata,
    DomainMetadata,
    CheckConstraintMetadata,
    GeneratedSchema,
} from './types.js';

export {introspectDatabase} from './introspect.js';
export {generateSchemas, formatOutput} from './generator.js';
export {mapColumnToZod, toPascalCase, toCamelCase} from './type-mapper.js';

/**
 * Main function: introspect database and generate Zod schemas
 */
export async function generateZodSchemas(
    config: DatabaseConfig,
    options: SchemaGenerationOptions = {}
): Promise<GenerationResult> {
    const metadata = await introspectDatabase(config, options);
    return generateSchemas(metadata, options);
}

/**
 * Convenience function: generate schemas and return formatted output string
 */
export async function generateZodSchemasString(
    config: DatabaseConfig,
    options: SchemaGenerationOptions = {}
): Promise<string> {
    const metadata = await introspectDatabase(config, options);
    const result = generateSchemas(metadata, options);
    return formatOutput(result, metadata);
}

/**
 * Default export
 */
export default {
    generateZodSchemas,
    generateZodSchemasString,
    introspectDatabase,
    generateSchemas,
    formatOutput,
};
