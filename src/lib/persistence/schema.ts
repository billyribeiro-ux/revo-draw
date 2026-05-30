/**
 * Drizzle schema for the LIBRARY INDEX database (SQLite).
 *
 * This DB stores ONLY metadata/index rows — never document bodies. Document bodies live as
 * `.lfdoc` JSON files on disk (see document-file.ts). Keeping them separate means the index can
 * be rebuilt from the files, and the files are portable without the DB.
 *
 * Drizzle has no first-party `tauri-plugin-sql` driver, so we use Drizzle purely for the typed
 * schema + query *building*, and execute the generated SQL through tauri-plugin-sql at runtime
 * (see library-db.ts). The migration SQL is kept byte-identical with the Rust migration in
 * src-tauri/src/lib.rs and the generated file under ./migrations/.
 */
import { sql } from 'drizzle-orm';
import { index, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const documents = sqliteTable(
	'documents',
	{
		/** uuid v7, matches LayoutDocument.id. */
		id: text('id').primaryKey().notNull(),
		name: text('name').notNull(),
		/** Absolute path to the .lfdoc file on disk, or null if unsaved/autosaved only. */
		filePath: text('file_path'),
		/** Base64 PNG thumbnail (small) or a path to one. */
		thumbnail: text('thumbnail'),
		/** JSON-encoded string[] of tags. */
		tags: text('tags').notNull().default('[]'),
		createdAt: text('created_at').notNull(),
		updatedAt: text('updated_at').notNull(),
		lastOpenedAt: text('last_opened_at')
	},
	(table) => [
		index('idx_documents_updated_at').on(table.updatedAt),
		index('idx_documents_last_opened_at').on(table.lastOpenedAt)
	]
);

export type DocumentRow = typeof documents.$inferSelect;
export type NewDocumentRow = typeof documents.$inferInsert;

/** Helper re-export so callers can build raw default expressions if needed. */
export const sqlNow = sql`CURRENT_TIMESTAMP`;
