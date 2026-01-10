import { introspectDatabase } from './introspect.js';
import { generateSchemas, formatOutput } from './generator.js';
import type {
  DatabaseConfig,
  SchemaGenerationOptions,
  GenerationResult,
} from './types.js';

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

export { introspectDatabase } from './introspect.js';
export { generateSchemas, formatOutput } from './generator.js';
export { mapColumnToZod, toPascalCase, toCamelCase } from './type-mapper.js';

/**
 * Main function: introspect database and generate Zod schemas
 */
export async function generateZodSchemas(
  config: DatabaseConfig,
  options: SchemaGenerationOptions = {}
): Promise<GenerationResult> {
  const metadata = await introspectDatabase(config, options);
  const result = generateSchemas(metadata, options);
  return result;
}

/**
 * Convenience function: generate schemas and return formatted output string
 */
export async function generateZodSchemasString(
  config: DatabaseConfig,
  options: SchemaGenerationOptions = {}
): Promise<string> {
  const result = await generateZodSchemas(config, options);
  return formatOutput(result);
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
