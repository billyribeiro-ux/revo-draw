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
import { isTauri } from '@tauri-apps/api/core';
import { basename } from '@tauri-apps/api/path';
import { SCHEMA_VERSION, type LayoutDocument } from '../elements/types.ts';
import { migrateDocument } from './migrate.ts';
import { markOpened, upsertEntry } from './library-db.ts';

const LFDOC_FILTER = { name: 'LayoutForge Document', extensions: ['lfdoc'] };
const JSON_FILTER = { name: 'JSON', extensions: ['json'] };
const MD_FILTER = { name: 'Markdown', extensions: ['md'] };
const SVG_FILTER = { name: 'SVG', extensions: ['svg'] };
const PNG_FILTER = { name: 'PNG', extensions: ['png'] };

const AUTOSAVE_DIR = 'autosave';
const AUTOSAVE_FILE = 'autosave/current.lfdoc';
const AUTOSAVE_TMP = 'autosave/current.lfdoc.tmp';
const TAURI_ONLY_MESSAGE = 'File operations require the LayoutForge desktop app.';

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

/** Serialize a document to the on-disk JSON form. Exported so the round-trip test can use it. */
export function serializeDocument(doc: LayoutDocument): string {
	// Stable key order via JSON.stringify on a plain snapshot. Pretty-printed for diff-ability.
	return JSON.stringify(doc, null, 2);
}
const serialize = serializeDocument;

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
	if (!isTauri()) {
		// Browser: download the .lfdoc. There is no persistent path to remember.
		browserDownloadText(`${doc.name}.lfdoc`, serialize(doc), 'application/json');
		return { path: `${doc.name}.lfdoc`, name: doc.name };
	}
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
	if (!isTauri()) {
		browserDownloadText(`${doc.name}.lfdoc`, serialize(doc), 'application/json');
		return { path: `${doc.name}.lfdoc`, name: doc.name };
	}
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

/** Open an existing .lfdoc / .json document via the native picker (Tauri) or file input (browser). */
export async function openDocument(): Promise<OpenResult | null> {
	if (!isTauri()) {
		const picked = await browserPickTextFile('.lfdoc,.json,application/json');
		if (!picked) return null;
		const parsed: unknown = JSON.parse(picked.text);
		const migrated = migrateDocument(parsed);
		if (!migrated || !isLayoutDocument(migrated)) {
			throw new Error('Not a valid LayoutForge document (schema mismatch).');
		}
		return { doc: migrated, path: picked.name, name: picked.name.replace(/\.(lfdoc|json)$/i, '') };
	}
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
	ensureTauriRuntime();
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
	const ext = format;
	if (!isTauri()) {
		// Browser: trigger a download in the chosen format.
		const file = `${doc.name}.${ext}`;
		if (format === 'lfdoc' || format === 'json') browserDownloadText(file, serialize(doc), 'application/json');
		else if (format === 'md') browserDownloadText(file, payload.markdown ?? '', 'text/markdown');
		else if (format === 'svg') browserDownloadText(file, payload.svg ?? '', 'image/svg+xml');
		else if (format === 'png' && payload.png) browserDownloadBytes(file, payload.png);
		return file;
	}
	const filters = {
		lfdoc: [LFDOC_FILTER],
		json: [JSON_FILTER],
		md: [MD_FILTER],
		svg: [SVG_FILTER],
		png: [PNG_FILTER]
	}[format];
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
	if (!isTauri()) return;
	const present = await exists(AUTOSAVE_DIR, { baseDir: BaseDirectory.AppData });
	if (!present) await mkdir(AUTOSAVE_DIR, { baseDir: BaseDirectory.AppData, recursive: true });
}

/**
 * The injectable filesystem primitives the atomic-write algorithm needs. Real callers pass the
 * Tauri fs ops; tests pass an in-memory fake so the crash-safety invariant can be proven without
 * a Tauri runtime.
 */
export interface AtomicFs {
	writeText(path: string, data: string): Promise<void>;
	rename(from: string, to: string): Promise<void>;
	remove(path: string): Promise<void>;
}

/**
 * Atomic write: write to `tmp`, then rename `tmp` over `target`. A crash between the write and the
 * rename can never corrupt `target` — rename is atomic on one filesystem, so `target` is either
 * the old file or the fully-written new one, never half-written. If the platform rejects rename
 * onto an existing target, fall back to a backup swap that keeps the old target restorable until
 * the new target is in place. This function is pure w.r.t. its `fs` argument, which is what makes
 * the crash-simulation test possible.
 */
export async function atomicWrite(
	fs: AtomicFs,
	tmp: string,
	target: string,
	data: string
): Promise<void> {
	await fs.writeText(tmp, data);
	try {
		await fs.rename(tmp, target);
	} catch {
		const backup = `${target}.bak`;
		await fs.remove(backup).catch(() => undefined);
		await fs.rename(target, backup);
		try {
			await fs.rename(tmp, target);
		} catch (error) {
			await fs.rename(backup, target).catch(() => undefined);
			throw error;
		}
		await fs.remove(backup).catch(() => undefined);
	}
}

/** The real Tauri-backed fs ops for app-data, used by writeAutosave. */
const appDataFs: AtomicFs = {
	writeText: (path, data) => writeTextFile(path, data, { baseDir: BaseDirectory.AppData }),
	rename: (from, to) =>
		rename(from, to, {
			oldPathBaseDir: BaseDirectory.AppData,
			newPathBaseDir: BaseDirectory.AppData
		}),
	remove: (path) => remove(path, { baseDir: BaseDirectory.AppData })
};

/**
 * Atomically write the document to the app-data autosave slot via {@link atomicWrite}, so a crash
 * mid-write can never corrupt the existing autosave.
 */
export async function writeAutosave(doc: LayoutDocument): Promise<void> {
	if (!isTauri()) return;
	await ensureAutosaveDir();
	await atomicWrite(appDataFs, AUTOSAVE_TMP, AUTOSAVE_FILE, serialize(doc));
}

/**
 * Read the autosaved document if present and valid. The payload is run through the version
 * migration seam and validated against the schema; a malformed/unknown payload is rejected
 * (returns null) rather than crashing the launch path.
 */
export async function readAutosave(): Promise<LayoutDocument | null> {
	if (!isTauri()) return null;
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

function ensureTauriRuntime(): void {
	if (!isTauri()) throw new Error(TAURI_ONLY_MESSAGE);
}

// ---- browser file I/O fallbacks -------------------------------------------------------------
// The app runs in two hosts: the Tauri desktop shell (native dialogs + fs) and a plain browser.
// In the browser there is no filesystem, so Save/Export trigger a download and Open uses a file
// picker. These are used only when `isTauri()` is false, so the desktop path is unchanged.

function browserDownloadText(filename: string, text: string, mime: string): void {
	browserDownloadBlob(filename, new Blob([text], { type: mime }));
}

function browserDownloadBytes(filename: string, bytes: Uint8Array): void {
	browserDownloadBlob(filename, new Blob([bytes as BlobPart], { type: 'image/png' }));
}

function browserDownloadBlob(filename: string, blob: Blob): void {
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	a.remove();
	// Revoke on the next tick so the download has started.
	setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Browser open: present a file picker and read the chosen .lfdoc/.json as text. */
function browserPickTextFile(accept: string): Promise<{ name: string; text: string } | null> {
	return new Promise((resolve) => {
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = accept;
		input.onchange = () => {
			const file = input.files?.[0];
			if (!file) {
				resolve(null);
				return;
			}
			const reader = new FileReader();
			reader.onload = () => resolve({ name: file.name, text: String(reader.result ?? '') });
			reader.onerror = () => resolve(null);
			reader.readAsText(file);
		};
		// Cancel handling: modern browsers fire `cancel` when the picker is dismissed without a
		// selection. Resolve null so the open flow completes instead of leaving a dangling Promise.
		input.oncancel = () => resolve(null);
		input.click();
	});
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
