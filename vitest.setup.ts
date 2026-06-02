// Browser globals that the vendored Excalidraw modules read at import time (e.g.
// appState.ts computes a default export scale from `devicePixelRatio`; renderElement.ts uses it
// for offscreen canvas sizing). The headless `node` test environment doesn't define them, so
// polyfill to the DPR=1 desktop default. No effect in the real app (browser/Tauri provide them).
if (typeof (globalThis as { devicePixelRatio?: number }).devicePixelRatio === "undefined") {
	(globalThis as { devicePixelRatio?: number }).devicePixelRatio = 1;
}
