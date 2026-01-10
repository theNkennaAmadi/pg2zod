import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts', 'src/cli.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  outDir: 'dist',
  splitting: false,
  sourcemap: true,
  fixedExtension: false, // Use .js for ESM (not .mjs) when type: module
});
