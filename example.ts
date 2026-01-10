/**
 * Example usage of pg-to-zod
 * 
 * This demonstrates how to use the library programmatically.
 * Make sure you have a PostgreSQL database running and update the config below.
 */

import { generateZodSchemasString } from './dist/index.js';

async function example() {
  try {
    // Database configuration
    const config = {
      host: 'localhost',
      port: 5432,
      database: 'postgres', // Change to your database name
      user: 'postgres',     // Change to your username
      password: 'password', // Change to your password
    };

    // Generation options
    const options = {
      schemas: ['public'],
      generateInputSchemas: true,
      includeComments: true,
      strictMode: false,
      useCamelCase: false,
    };

    console.log('🔍 Introspecting database...');
    
    const schemas = await generateZodSchemasString(config, options);
    
    console.log('✅ Generated schemas:\n');
    console.log(schemas);
    
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

example();
