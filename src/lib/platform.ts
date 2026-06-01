/*
 * Runtime platform detection.
 *
 * LayoutForge ships two distinct shells from one SvelteKit (adapter-static, ssr=false) codebase:
 *   - WEB    — running in a plain browser. Pixel-faithful Excalidraw clone: full-bleed canvas with
 *              floating Islands, no native window chrome.
 *   - TAURI  — running inside the macOS desktop app. Keeps the native title bar / tool rail / status
 *              bar shell (its own design; not changed by the web-parity work).
 *
 * Tauri v2 injects `__TAURI_INTERNALS__` onto `window` before any app code runs, and v1 used
 * `__TAURI__`. We check both so the detection is version-robust. Because `ssr = false`, this module
 * only ever evaluates in the browser, so `window` is always present.
 */

function detectTauri(): boolean {
	if (typeof window === 'undefined') return false;
	return '__TAURI_INTERNALS__' in window || '__TAURI__' in window;
}

/** True when running inside the Tauri desktop shell; false in a plain web browser. */
export const isTauri: boolean = detectTauri();

/** True when running as a plain web app (the Excalidraw-parity build). */
export const isWeb: boolean = !isTauri;

/** The root shell class — `x-web` swaps in the Excalidraw token palette (see excalidraw-web.css). */
export const shellClass: 'x-web' | 'x-tauri' = isTauri ? 'x-tauri' : 'x-web';
