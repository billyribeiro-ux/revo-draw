/**
 * Document file persistence: save / open / save-as / import / export, plus autosave.
 *
 * Document bodies are versioned JSON. Native format is `.lfdoc`. We use native file pickers
 * (plugin-dialog) and the filesystem (plugin-fs). The library index (library-db.ts) is updated
 * whenever a document is saved or opened so the Recent/Library view stays current.
 *
 * Autosave writes the active document to the app-data directory on a debounced timer so a crash
 * or quit never loses work; on launch the app offers to restore it.
 */
import { open, save } from '@tauri-apps/plugin-dialog';
import {
	BaseDirectory,
	exists,
	mkdir,
	readTextFile,
	remove,
	rename,
	writeFile,
	writeTextFile
} from '@tauri-apps/plugin-fs';
import { basename } from '@tauri-apps/api/path';
import { SCHEMA_VERSION, type LayoutDocument } from '../elements/types.js';
import { migrateDocument } from './migrate.js';
import { markOpened, upsertEntry } from './library-db.js';

const LFDOC_FILTER = { name: 'LayoutForge Document', extensions: ['lfdoc'] };
const JSON_FILTER = { name: 'JSON', extensions: ['json'] };
const MD_FILTER = { name: 'Markdown', extensions: ['md'] };
const SVG_FILTER = { name: 'SVG', extensions: ['svg'] };
const PNG_FILTER = { name: 'PNG', extensions: ['png'] };

const AUTOSAVE_DIR = 'autosave';
const AUTOSAVE_FILE = 'autosave/current.lfdoc';
const AUTOSAVE_TMP = 'autosave/current.lfdoc.tmp';

export type ExportFormat = 'lfdoc' | 'json' | 'md' | 'svg' | 'png';

/** Validate that an arbitrary parsed object is a LayoutDocument we can load. */
export function isLayoutDocument(value: unknown): value is LayoutDocument {
	if (typeof value !== 'object' || value === null) return false;
	const v = value as Record<string, unknown>;
	return (
		v.schemaVersion === SCHEMA_VERSION &&
		typeof v.id === 'string' &&
		typeof v.name === 'string' &&
		typeof v.elements === 'object' &&
		v.elements !== null &&
		Array.isArray(v.rootOrder) &&
		typeof v.canvas === 'object' &&
		v.canvas !== null
	);
}

function serialize(doc: LayoutDocument): string {
	// Stable key order via JSON.stringify on a plain snapshot. Pretty-printed for diff-ability.
	return JSON.stringify(doc, null, 2);
}

export interface SaveResult {
	path: string;
	name: string;
}

/** Save the document to its existing path, or prompt for one if none. Returns the path used. */
export async function saveDocument(
	doc: LayoutDocument,
	currentPath: string | null,
	thumbnailPng: string | null
): Promise<SaveResult | null> {
	let path = currentPath;
	if (!path) {
		path = await save({
			title: 'Save Layout',
			defaultPath: `${doc.name}.lfdoc`,
			filters: [LFDOC_FILTER, JSON_FILTER]
		});
		if (!path) return null;
	}
	await writeTextFile(path, serialize(doc));
	const name = await safeBasename(path, doc.name);
	await indexDocument(doc, path, thumbnailPng);
	return { path, name };
}

/** Always prompt for a new path (Save As). */
export async function saveDocumentAs(
	doc: LayoutDocument,
	thumbnailPng: string | null
): Promise<SaveResult | null> {
	const path = await save({
		title: 'Save Layout As',
		defaultPath: `${doc.name}.lfdoc`,
		filters: [LFDOC_FILTER, JSON_FILTER]
	});
	if (!path) return null;
	await writeTextFile(path, serialize(doc));
	const name = await safeBasename(path, doc.name);
	await indexDocument(doc, path, thumbnailPng);
	return { path, name };
}

export interface OpenResult {
	doc: LayoutDocument;
	path: string;
	name: string;
}

/** Open an existing .lfdoc / .json document via the native picker. */
export async function openDocument(): Promise<OpenResult | null> {
	const selected = await open({
		title: 'Open Layout',
		multiple: false,
		directory: false,
		filters: [LFDOC_FILTER, JSON_FILTER]
	});
	if (typeof selected !== 'string') return null;
	return openDocumentAtPath(selected);
}

/** Open a document from a known path (used by the Library/Recent view). */
export async function openDocumentAtPath(path: string): Promise<OpenResult | null> {
	const text = await readTextFile(path);
	const parsed: unknown = JSON.parse(text);
	// Run through the forward-only migration seam first, then validate the result.
	const migrated = migrateDocument(parsed);
	if (!migrated || !isLayoutDocument(migrated)) {
		throw new Error('Not a valid LayoutForge document (schema mismatch).');
	}
	const doc = migrated;
	const name = await safeBasename(path, doc.name);
	const now = new Date().toISOString();
	await markOpened(doc.id, now).catch(() => undefined);
	await indexDocument(doc, path, null, now);
	return { doc, path, name };
}

/**
 * Export the document to a user-selected format. `md`/`svg` text is supplied by the caller (the
 * compilers live elsewhere); `png` bytes are supplied as a Uint8Array.
 */
export async function exportDocument(
	doc: LayoutDocument,
	format: ExportFormat,
	payload: { markdown?: string; svg?: string; png?: Uint8Array }
): Promise<string | null> {
	const filters = {
		lfdoc: [LFDOC_FILTER],
		json: [JSON_FILTER],
		md: [MD_FILTER],
		svg: [SVG_FILTER],
		png: [PNG_FILTER]
	}[format];
	const ext = format;
	const path = await save({
		title: `Export ${format.toUpperCase()}`,
		defaultPath: `${doc.name}.${ext}`,
		filters
	});
	if (!path) return null;

	switch (format) {
		case 'lfdoc':
		case 'json':
			await writeTextFile(path, serialize(doc));
			break;
		case 'md':
			await writeTextFile(path, payload.markdown ?? '');
			break;
		case 'svg':
			await writeTextFile(path, payload.svg ?? '');
			break;
		case 'png':
			if (payload.png) await writeFile(path, payload.png);
			break;
	}
	return path;
}

// ---- autosave -------------------------------------------------------------------------------

async function ensureAutosaveDir(): Promise<void> {
	const present = await exists(AUTOSAVE_DIR, { baseDir: BaseDirectory.AppData });
	if (!present) await mkdir(AUTOSAVE_DIR, { baseDir: BaseDirectory.AppData, recursive: true });
}

/**
 * Atomically write the document to the app-data autosave slot. We write to a temp file, then
 * rename it over the target — a crash mid-write can never corrupt the existing autosave, because
 * rename is atomic on the same filesystem (the target is either the old file or the fully-written
 * new one, never a half-written file).
 */
export async function writeAutosave(doc: LayoutDocument): Promise<void> {
	await ensureAutosaveDir();
	const data = serialize(doc);
	await writeTextFile(AUTOSAVE_TMP, data, { baseDir: BaseDirectory.AppData });
	try {
		await rename(AUTOSAVE_TMP, AUTOSAVE_FILE, {
			oldPathBaseDir: BaseDirectory.AppData,
			newPathBaseDir: BaseDirectory.AppData
		});
	} catch {
		// Some platforms reject rename onto an existing target; fall back to remove-then-rename.
		await remove(AUTOSAVE_FILE, { baseDir: BaseDirectory.AppData }).catch(() => undefined);
		await rename(AUTOSAVE_TMP, AUTOSAVE_FILE, {
			oldPathBaseDir: BaseDirectory.AppData,
			newPathBaseDir: BaseDirectory.AppData
		});
	}
}

/**
 * Read the autosaved document if present and valid. The payload is run through the version
 * migration seam and validated against the schema; a malformed/unknown payload is rejected
 * (returns null) rather than crashing the launch path.
 */
export async function readAutosave(): Promise<LayoutDocument | null> {
	const present = await exists(AUTOSAVE_FILE, { baseDir: BaseDirectory.AppData });
	if (!present) return null;
	try {
		const text = await readTextFile(AUTOSAVE_FILE, { baseDir: BaseDirectory.AppData });
		const parsed: unknown = JSON.parse(text);
		const migrated = migrateDocument(parsed);
		return migrated && isLayoutDocument(migrated) ? migrated : null;
	} catch {
		return null;
	}
}

/** A small debounced autosave scheduler. Call `schedule()` on every change. */
export class Autosave {
	#timer: ReturnType<typeof setTimeout> | null = null;
	#delayMs: number;
	#getDoc: () => LayoutDocument;
	#inFlight = false;

	constructor(getDoc: () => LayoutDocument, delayMs = 1500) {
		this.#getDoc = getDoc;
		this.#delayMs = delayMs;
	}

	schedule(): void {
		if (this.#timer) clearTimeout(this.#timer);
		this.#timer = setTimeout(() => void this.flush(), this.#delayMs);
	}

	async flush(): Promise<void> {
		if (this.#inFlight) return;
		this.#inFlight = true;
		try {
			await writeAutosave(this.#getDoc());
		} catch {
			// Autosave is best-effort; surfacing an error here would be noisy. The next change
			// reschedules another attempt.
		} finally {
			this.#inFlight = false;
		}
	}

	dispose(): void {
		if (this.#timer) clearTimeout(this.#timer);
		this.#timer = null;
	}
}

// ---- helpers --------------------------------------------------------------------------------

async function safeBasename(path: string, fallback: string): Promise<string> {
	try {
		const base = await basename(path);
		return base.replace(/\.(lfdoc|json)$/i, '') || fallback;
	} catch {
		return fallback;
	}
}

async function indexDocument(
	doc: LayoutDocument,
	path: string,
	thumbnailPng: string | null,
	nowIso?: string
): Promise<void> {
	const now = nowIso ?? new Date().toISOString();
	try {
		await upsertEntry({
			id: doc.id,
			name: doc.name,
			filePath: path,
			thumbnail: thumbnailPng,
			tags: [],
			createdAt: doc.createdAt,
			updatedAt: now,
			lastOpenedAt: now
		});
	} catch {
		// The index is a convenience; failing to write it must never block saving the file.
	}
}
