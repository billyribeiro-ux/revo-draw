/**
 * OS clipboard bridge for element copy/paste.
 *
 * Elements are serialized to JSON under a typed envelope and written to the system clipboard via
 * the webview Clipboard API (available inside Tauri). Reading back recognizes our envelope and
 * ignores unrelated clipboard text. This lets a copied selection survive app focus changes and be
 * pasted back; the editor also keeps an in-process copy as a fast, permission-free fallback.
 */
import type { ClipboardPayload } from '../elements/types.ts';

const MIME_TAG = 'layoutforge/elements';

export async function writeClipboard(payload: ClipboardPayload): Promise<void> {
	try {
		const text = JSON.stringify(payload);
		if (navigator.clipboard?.writeText) {
			await navigator.clipboard.writeText(text);
		}
	} catch {
		// Clipboard permission denied / unavailable — the in-process fallback still works.
	}
}

export async function readClipboard(): Promise<ClipboardPayload | null> {
	try {
		if (!navigator.clipboard?.readText) return null;
		const text = await navigator.clipboard.readText();
		if (!text) return null;
		const parsed: unknown = JSON.parse(text);
		if (
			typeof parsed === 'object' &&
			parsed !== null &&
			(parsed as { kind?: unknown }).kind === MIME_TAG &&
			Array.isArray((parsed as { elements?: unknown }).elements)
		) {
			return parsed as ClipboardPayload;
		}
		return null;
	} catch {
		return null;
	}
}
