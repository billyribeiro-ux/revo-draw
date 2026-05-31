/**
 * The library INDEX database: SQLite via tauri-plugin-sql.
 *
 * Stores only metadata rows (id, name, file path, thumbnail, tags, timestamps). Document bodies
 * are never stored here — they are `.lfdoc` files on disk. The schema + row types are defined
 * with Drizzle in schema.ts; here we execute parameterized SQL through the plugin (Drizzle has no
 * first-party tauri-plugin-sql driver). Migrations are applied by the Rust side at startup
 * (src-tauri/src/lib.rs), so this module assumes the `documents` table exists.
 *
 * sqlx (the plugin's backend) uses `$1, $2, …` positional placeholders for SQLite.
 */
import Database from '@tauri-apps/plugin-sql';
import { isTauri } from '@tauri-apps/api/core';
import type { DocumentRow } from './schema.ts';

const DB_URL = 'sqlite:layoutforge-index.db';

let dbPromise: Promise<Database> | null = null;

function db(): Promise<Database> {
	if (!isTauri()) throw new Error('Library database requires the LayoutForge desktop app.');
	if (!dbPromise) dbPromise = Database.load(DB_URL);
	return dbPromise;
}

/** A library entry with tags decoded from their stored JSON form. */
export interface LibraryEntry {
	id: string;
	name: string;
	filePath: string | null;
	thumbnail: string | null;
	tags: string[];
	createdAt: string;
	updatedAt: string;
	lastOpenedAt: string | null;
}

function decode(row: DocumentRow): LibraryEntry {
	let tags: string[] = [];
	try {
		const parsed: unknown = JSON.parse(row.tags);
		if (Array.isArray(parsed)) tags = parsed.filter((t): t is string => typeof t === 'string');
	} catch {
		tags = [];
	}
	return {
		id: row.id,
		name: row.name,
		filePath: row.filePath ?? null,
		thumbnail: row.thumbnail ?? null,
		tags,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
		lastOpenedAt: row.lastOpenedAt ?? null
	};
}

export interface UpsertEntry {
	id: string;
	name: string;
	filePath: string | null;
	thumbnail?: string | null;
	tags?: string[];
	createdAt: string;
	updatedAt: string;
	lastOpenedAt?: string | null;
}

/** Insert or update a library row (keyed by id). */
export async function upsertEntry(entry: UpsertEntry): Promise<void> {
	if (!isTauri()) return;
	const conn = await db();
	await conn.execute(
		`INSERT INTO documents (id, name, file_path, thumbnail, tags, created_at, updated_at, last_opened_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		 ON CONFLICT(id) DO UPDATE SET
		   name = excluded.name,
		   file_path = excluded.file_path,
		   thumbnail = excluded.thumbnail,
		   tags = excluded.tags,
		   updated_at = excluded.updated_at,
		   last_opened_at = excluded.last_opened_at`,
		[
			entry.id,
			entry.name,
			entry.filePath,
			entry.thumbnail ?? null,
			JSON.stringify(entry.tags ?? []),
			entry.createdAt,
			entry.updatedAt,
			entry.lastOpenedAt ?? null
		]
	);
}

/** Stamp a document as opened now. */
export async function markOpened(id: string, isoNow: string): Promise<void> {
	if (!isTauri()) return;
	const conn = await db();
	await conn.execute('UPDATE documents SET last_opened_at = $1 WHERE id = $2', [isoNow, id]);
}

/** All library entries, most-recently-updated first. */
export async function listEntries(limit = 200): Promise<LibraryEntry[]> {
	if (!isTauri()) return [];
	const conn = await db();
	const rows = await conn.select<DocumentRow[]>(
		'SELECT * FROM documents ORDER BY updated_at DESC LIMIT $1',
		[limit]
	);
	return rows.map(decode);
}

/** Recently-opened entries, most-recent first (nulls last). */
export async function listRecent(limit = 12): Promise<LibraryEntry[]> {
	if (!isTauri()) return [];
	const conn = await db();
	const rows = await conn.select<DocumentRow[]>(
		`SELECT * FROM documents
		 ORDER BY (last_opened_at IS NULL), last_opened_at DESC, updated_at DESC
		 LIMIT $1`,
		[limit]
	);
	return rows.map(decode);
}

export async function getEntry(id: string): Promise<LibraryEntry | null> {
	if (!isTauri()) return null;
	const conn = await db();
	const rows = await conn.select<DocumentRow[]>('SELECT * FROM documents WHERE id = $1', [id]);
	const first = rows[0];
	return first ? decode(first) : null;
}

export async function removeEntry(id: string): Promise<void> {
	if (!isTauri()) return;
	const conn = await db();
	await conn.execute('DELETE FROM documents WHERE id = $1', [id]);
}

/** Update just the tags for an entry. */
export async function setTags(id: string, tags: string[], isoNow: string): Promise<void> {
	if (!isTauri()) return;
	const conn = await db();
	await conn.execute('UPDATE documents SET tags = $1, updated_at = $2 WHERE id = $3', [
		JSON.stringify(tags),
		isoNow,
		id
	]);
}
