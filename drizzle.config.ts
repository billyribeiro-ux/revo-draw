import { defineConfig } from 'drizzle-kit';

/**
 * drizzle-kit config for the library index DB. The runtime applies migrations via
 * tauri-plugin-sql (see src-tauri/src/lib.rs); drizzle-kit is used during development to
 * generate/verify SQL from src/lib/persistence/schema.ts. Migrations are forward-only and
 * immutable under src/lib/persistence/migrations.
 */
export default defineConfig({
	dialect: 'sqlite',
	schema: './src/lib/persistence/schema.ts',
	out: './src/lib/persistence/migrations'
});
