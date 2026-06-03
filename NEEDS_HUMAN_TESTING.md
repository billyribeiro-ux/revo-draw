# Needs Human Testing

UPDATE (evidence pass): several items previously listed here are now proven by automated tests —
see `EVIDENCE_LEDGER.md`. Specifically VERIFIED by test/measurement: undo/redo coalescing (one entry
per gesture), the do/undo/redo fuzz invariant (5 seeds × 500 ops), click-locates-element and
create-lands-where-you-click (geometry-contract tests + a real headless-Chrome click with
`dx=dy=0.00`), atomic autosave + validated load + lossless round-trip, and the render hot-path
frame time (0.70–1.19 ms avg, well under the 16.7 ms budget). The app also boots clean in a real
browser (Chrome headless, no console errors) and in the Tauri window.

What automated checks here **cannot** confirm — these still need your hands:

### Run it in the browser
`pnpm dev` → open http://localhost:1420 . Everything is expected to work (Save/Open/Export use
browser download + file-input; the Library is desktop-only and shows empty). Then run the desktop
app with `pnpm tauri dev`.

### Items only hands-on use can validate
1. **GPU rasterization cost at scale.** The perf harness measured the JS render hot path (≈1.2 ms at
   2,000 elements); it does NOT include real canvas fill/stroke on the GPU. Open a doc with
   1,000–2,000 elements and confirm pan/zoom/drag feel smooth (no dropped frames).
2. **Runtime idle-paint count.** Proven statically (no rAF/interval; reactive-deps-only effect).
   Confirm visually that an idle canvas does not repaint (e.g. via a devtools paint-flash overlay).

1. **Drag/resize coalescing → exactly one undo entry.**
   The history layer wraps each gesture in a single `begin`/`commit` transaction, so a drag should
   produce one undo step, not many. *Test:* drag an element across the canvas, press ⌘Z once — it
   should snap back to the original position in a single step. Repeat for resize and rotate.

2. **Snapping/alignment guides feel correct and don't flicker across zoom levels.**
   The threshold is computed in screen pixels (converted to world units via zoom), so it should
   feel the same at 25% and 400%. *Test:* drag an element near another's edges/center at several
   zoom levels; guides should appear crisply, snapping should engage within a few px, and holding
   **alt** should disable it. Watch for jitter when two snap candidates compete.

3. **Hit-testing picks the intended element in dense/overlapping/nested layouts.**
   Hit-test walks front-to-back and respects rotation. *Test:* stack several elements, nest cards
   inside containers inside a frame, and click — the topmost element under the cursor should
   select, and clicking inside a child should select the child, not the parent.

4. **Text-edit overlay alignment holds under arbitrary pan/zoom/rotation.**
   The overlay `<textarea>` is positioned from the camera transform and rotated to match. *Test:*
   double-click a text element, then pan/zoom while editing (and try a rotated text element) — the
   editor box should stay glued to the element. Minor sub-pixel drift on rotated text is possible.

5. **60fps at the upper element counts (hundreds–low thousands).**
   Rendering is dirty-flag driven (no constant rAF), DPR-aware, and redraws the whole scene on
   change. *Test:* build or paste several hundred elements and drag a multi-selection; watch for
   frame drops. If needed, the renderer is the place to add per-element culling against the
   viewport.

6. **The exported Markdown actually produces good SvelteKit when fed back into Claude Code.**
   This is the real end-to-end test of the product. *Test:* draw a 2-column dashboard, tag
   semantics in the inspector, Export → Markdown, paste into Claude Code, and judge whether the
   generated SvelteKit 5 page matches your intent. The determinism and structure are verified by
   the unit test; the *usefulness* of the brief is a human judgment.

Everything else (build, type-safety, API correctness, determinism of the export, file
round-trip logic, offline icon loading) is verified-correct in code and by the automated checks.

---

## Excalidraw port — Tauri desktop (Phase 8 / milestone H)

The Excalidraw port (`src/lib/x/`, route `/x`) is mounted into the Tauri desktop window: the
window now loads `/x` (`tauri.conf.json` `app.windows[0].url`), so the desktop app **is** the
Excalidraw editor — the exact same `EditorPreview` the web serves. The web routes are unchanged
(verified: all 26 `scripts/probe-x-*.mjs` probes green from clean profiles, `pnpm build` clean).

Automated-verified for this milestone: `pnpm check` 0/0, web build clean, all web probes green,
and the Tauri Rust shell + embedded `tauri.conf.json` compile (`cargo check` runs `tauri-build`).
CDP cannot drive the native macOS WKWebView window, so the **desktop runtime** needs your hands —
run `pnpm tauri dev` (or open the built app) and confirm these behave exactly like the web `/x`:

1. **Window shows the port.** The desktop window opens on the Excalidraw editor (toolbar, panels,
   canvas) — not the old LayoutForge UI. It should look pixel-identical to http://localhost:1420/x .
2. **Persistence parity (localStorage in the webview).** Draw a few shapes → quit the app →
   relaunch → the drawing is restored (the port uses `localStorage`, which the Tauri webview
   persists in its app-data dir — same code path as web).
3. **Export saves a real file (the one genuine platform difference).** Menu → "Save as image…" →
   PNG/SVG → a **native save dialog** appears and writes the file to the chosen location.
   (On web this is an `<a download>`; in Tauri `downloadBlob` routes through `plugin-dialog` `save`
   + `plugin-fs` `writeFile`. fs scope already allows Desktop/Documents/Downloads/AppData.)
4. **Image import.** Image tool → the native file picker opens → the picked image is placed.
   (Uses the webview's `<input type=file>`; if it doesn't open a picker on your macOS/WKWebView,
   switch it to `plugin-dialog` `open` — note it here.)
5. **Overlay title bar.** `titleBarStyle: Overlay` + `hiddenTitle`: confirm the macOS traffic-light
   buttons (top-left) don't obscure the left properties panel / toolbar, and the window is draggable.
6. **Text fonts under CSP.** Text tool → typed text renders in the expected hand-drawn font (or a
   clean fallback). The CSP allows `font-src 'self' data:` only — if Excalifont fails to load, note it.

Deferred (not required for behaviour parity, tracked): real **file-based** documents (open/save
`.excalidraw` via plugin-fs/sql instead of localStorage), and retiring the legacy LayoutForge app at
`/` (left intact so the web `/` route is untouched; the desktop window simply doesn't load it).
