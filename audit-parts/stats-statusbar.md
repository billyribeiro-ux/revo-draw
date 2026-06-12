## Audit: stats-statusbar

### Surface-mismatch note (read first)

Our `StatusBar.svelte` is a **persistent bottom footer** showing live element-count, selection-count, cursor x/y, snap-bypass badge, and zoom %. Excalidraw has **no such footer**. The file named as the counterpart — `Stats/index.tsx` — is the floating, draggable, collapsible "Stats for nerds" debug **panel** (top-right, `position: absolute; top: 60px; width: 204px`) toggled from the menu. It shows static scene metrics (Shapes count, scene bounding Width/Height) and per-element editable property rows (x/y/w/h/angle/fontSize) — **never a live cursor coordinate readout**. The zoom % in Excalidraw lives in a separate `reset-zoom-button` (`actionCanvas.tsx:239-253`), not in Stats.

Because the surfaces differ in fundamental form (footer vs. floating panel) and the panel is a debug overlay tied to Excalidraw's editable-element model, most differences are by-design. The matchable findings below are limited to concrete chrome/a11y items where the *same concept* exists in our footer and we diverge from a real Excalidraw value or pattern.

### Matchable findings

| Title | Severity | Our ref | Excal ref | Proposed fix |
|---|---|---|---|---|
| Zoom % readout is inert; Excalidraw's is a click-to-reset control with a11y label | a11y | StatusBar.svelte:27 | actionCanvas.tsx:239-253 | Wrap the zoom span in a `<button class="zoom-reset" title="Reset zoom" aria-label="Reset zoom" onclick={() => camera.resetZoom?.()}>` so the readout is operable and labeled, matching Excalidraw's `reset-zoom-button` (`title`+`aria-label="resetZoom"`, content `{(zoom*100).toFixed(0)}%`). At minimum add `title`/`aria-label`. |
| Footer regions lack accessible labels for assistive tech | a11y | StatusBar.svelte:13,21 | Stats/index.tsx:188-193 (titled `<h2>` heading) | Add `aria-label="Document stats"` to `.left` and `aria-label="View stats"` to `.right` (or wrap counts in a labeled group). Excalidraw labels its stats region with a heading; our footer exposes raw numbers with no semantic label. |
| Cursor coordinate uses full-width-space separator that screen readers/copy mangle | cosmetic | StatusBar.svelte:25 | n/a (Excalidraw has no cursor readout; Stats x/y rows use plain `<div>` label+value, Stats.scss:41-43) | Replace the `　` (U+3000 ideographic space) literal in `x {cx}　y {cy}` with normal spacing and separate spans: `x {cx}` `<span class="dot">·</span>` `y {cy}`, consistent with the `·` separator already used elsewhere in this file (line 16, 26). |
| Selection-count metric label differs from Excalidraw's term | cosmetic | StatusBar.svelte:17 | Stats/index.tsx:212,362 (`t("stats.shapes")` → "Shapes"; selected count row line 362-363) | Excalidraw's Stats panel labels element totals "Shapes" and shows selected count as a bare number under the "Shapes" row when multiple selected. Our "selected" wording is fine for a footer; if matching Excalidraw vocabulary, the element-count term could read "shapes". Low priority — our "elements" matches our semantic product. |

### By-design divergences (do NOT fix)

- **Footer status bar vs. floating Stats panel.** Our persistent bottom footer is a deliberate, cleaner surface than Excalidraw's draggable top-right debug overlay (`Stats.scss:1-6`: `position:absolute; top:60px; width:204px`). Do not convert our footer into a collapsible Island panel.
- **Live cursor x/y readout.** Excalidraw shows no cursor world-coordinate readout anywhere in chrome. Our `x {cx} y {cy}` is an intentional addition for a layout tool; keep it.
- **Snap-bypass badge.** Excalidraw has no "snap off" status badge in chrome (snapping/grid state lives in the Stats `CanvasGrid` row, `index.tsx:226-233`). Our badge is a product-specific affordance; keep it.
- **Editable per-element property rows** (Position/Dimension/Angle/FontSize, `index.tsx:302-351`) and **scene bounding-box Width/Height** (`index.tsx:215-222`). These belong to Excalidraw's debug panel and its rectangle/ellipse/text element model; they are not part of our footer's role. Not a footer concern.
- **Collapsible sections, Island padding, close button, `<h2>`/`<h3>` headings, `renderCustomStats` hook** (`index.tsx:187-239`, `Stats.scss:14-25,56-75`). Panel chrome that does not apply to a single-row footer.
- **`getCommonBounds` / throttled scene-dimension recompute, `getAtomicUnits`, group/crop handling** (`index.tsx:148-183`). Debug-panel internals tied to Excalidraw's element types; out of scope.
- **i18n (`t(...)`) and RTL handling** (`Stats.scss:9-12`). Our app is single-locale macOS desktop; not a parity target.
