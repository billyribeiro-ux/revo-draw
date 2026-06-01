# Changelog

Working log for the Excalidraw forensic-audit + Phosphor-icon work on `feat/phase-e-vocabulary`.
Newest first. "Done" = committed on this branch with tests green; "Pending" = not yet started.

## Done

### Audit deliverables
- **`discovery.md`** — forensic per-function inventory of **all 474** non-test source files in
  `excalidraw-master/` (~2,150 functions/methods), produced by an 85-agent workflow, each agent
  reading full files and citing real line ranges. Coverage verified programmatically: **0 files
  missing** (a clustering name-collision that mis-covered 3 clusters was caught and re-run).
- **`parity-report.md`** — behavioral parity of our Svelte 5 / Canvas 2D code vs excalidraw-master
  across **13 subsystems** (geometry, camera, scene/z-order, element model, hit-test/collision,
  transform-handles, drag, resize/rotate, snapping, rendering, commands/history, export,
  persistence). Every function classified MATCH / DIVERGENT / ABSENT with file:line on both sides,
  then an **adversarial verify pass** re-checked the claims (**162 upheld, 4 flagged** for imprecise
  citations). Honest conclusion: NOT a 100% match — large ABSENT surface is intentional (no
  collab/firebase/mobile/React/linear-arrow/freedraw), plus real divergences listed below.

### Web-shell behavior/visual parity
- **First-load welcome screen — ADDED** (`src/lib/ui/WelcomeScreen.svelte` new, wired in
  `+page.svelte`, shown when `scene.ordered.length === 0`). We showed a blank canvas on load;
  Excalidraw shows a WelcomeScreen. Replicated its structure from source (WelcomeScreen.Center +
  WelcomeScreen.Hints + WelcomeScreen.scss): a centered logo + heading + menu (Open / Browse
  library), plus the three **hand-drawn dashed arrow hints** (Excalidraw's exact `WelcomeScreen*Arrow`
  SVG paths) pointing to the menu (top-left, "Export, preferences, and more…"), the toolbar
  (top-center, "Pick a tool & start sketching!"), and the bottom island cluster ("Shortcuts &
  help"). Layout/sizing matched to the SCSS; hints hide on short/narrow viewports like Excalidraw.
  Branding is LayoutForge's own mark/wordmark — Excalidraw's logo/wordmark is a trademark and is NOT
  reproduced. `pnpm check` 0/0; svelte-autofixer clean (no issues, no suggestions).
- **Right-click context menu — ADDED** (`src/lib/ui/ContextMenu.svelte` new, wired in
  `src/lib/ui/Canvas.svelte`). We had no canvas context menu at all (browser default). Built one
  matching Excalidraw's `ContextMenu.tsx`/`ContextMenu.scss` structure (a `ul.context-menu` of
  rows with label + shortcut `kbd`, `hr` separators with leading/trailing/adjacent collapsed,
  clamped into the viewport). Right-clicking an element selects it first, then shows the element
  menu; right-clicking empty space shows the canvas menu (Excalidraw `handleCanvasContextMenu` +
  `getContextMenuItems`). Items mapped to our real commands:
  - **Element:** Cut / Copy / Paste · Copy styles / Paste styles · Group / Ungroup · Bring
    forward / Send backward / Bring to front / Send to back · Flip horizontal / Flip vertical ·
    Lock-Unlock · Duplicate · Delete (danger).
  - **Canvas:** Paste · Select all · Unlock all elements.
  - Excalidraw items with no analogue in our model are intentionally omitted (arrow-binding,
    bind/unbind text, linear editor, crop, frame ops, zen/view mode, stats, element links) — those
    features don't exist here. `pnpm check` 0/0; svelte-autofixer clean on the new component; 141 tests.

- **Menu button did nothing — FIXED** (`src/routes/+page.svelte`). Traced from CSS alone: the
  hamburger lives in `.menu-island`, whose `overflow: hidden` clipped `FileMenu`'s absolutely-
  positioned dropdown to the 2.25rem button box — so the button toggled open but the menu was
  invisible. Set the island to `overflow: visible` (the button's own border-radius already rounds
  its hover bg). `pnpm check` 0/0.
- **Canvas background — verified already matches Excalidraw** (no change needed). Our web tokens are
  `--canvas-bg: #ffffff` (= Excalidraw `COLOR_PALETTE.white` / `viewBackgroundColor` default) and the
  grid is off in web (`gridVisible = !isWeb` → false; Excalidraw `gridModeEnabled: false`). If the
  background still looks off on screen, it's a visual nuance that needs a screenshot to identify.

- **Color picker box rebuilt to Excalidraw's ColorPicker** (`src/lib/ui/StylePanel.svelte`,
  `src/lib/elements/palette.ts`) — the "more colors" popover was a 10×5 hue-grid; it now matches
  Excalidraw's structure verified against `ColorPicker.scss`/`Picker.tsx`: a **"Colors" heading +
  5-column base grid of the 15 named colors** (transparent/white/gray/black/bronze + 10 hues at the
  active shade), a **"Shades" row** (5 shades of the active color), and a **`#`-prefixed hex input**.
  Geometry matched exactly: 1.875rem swatches, 0.25rem gap, 0.5rem padding, 4px/0.5rem radii,
  inset 1px #d9d9d9 outline, scale(1.075) hover. Palette hex values are Excalidraw's exact
  open-color set. Picking a base color keeps the popover open to refine the shade (Excalidraw
  behavior). `pnpm check` 0/0, svelte-autofixer clean, 141 tests green.
  - NOTE: matched against Excalidraw source spec; **pixel-parity not yet visually confirmed** — I
    cannot see the live app (Chrome extension unpaired, no headless browser in repo). Needs a
    screenshot or Chrome connection to verify and to catch remaining web-shell diffs.

### Fixes (from the parity audit; controller logic was already proven correct by headless tests)
- **Phosphor icon recolor** (`src/lib/canvas/renderer.ts`) — added exported `iconInk(style)` that
  resolves a glyph's ink as `stroke ?? fill ?? INK`. Icons are monochrome glyphs whose visible
  color is their ink; Excalidraw colors glyph-like elements (freedraw) by `strokeColor`, so the
  prominent Style-panel **Stroke** control now recolors icons. Strictly additive: existing docs
  (icon color in `fill`) and the per-type default render unchanged. Tests:
  `src/lib/canvas/icon-interaction.svelte.test.ts` (place via tool + drag-drop, drag-move,
  resize-bigger, fill-recolor, stroke-recolor, + 3 `iconInk` unit tests).
- **SVG export per-element isolation** (`src/lib/export/to-svg.ts`) — `compileToSvg` now wraps each
  element render in `try/catch` (parity with excalidraw `staticSvgScene.ts:734-761`), so one
  malformed element no longer aborts the entire export. Tests added to
  `src/lib/export/icon-export.test.ts`.
- **Load-time element validation** (`src/lib/persistence/document-file.ts`) — `isLayoutDocument`
  only checked the document envelope, so a `.lfdoc` with an element missing/NaN `x/y/width/height`
  passed and fed NaN to the renderer/hit-test (blank/broken canvas). Now validates each element's
  base geometry (`type` + finite `x/y/width/height/rotation/z` + `parentId` string|null) and
  rejects a corrupt file **loudly** (caller throws "schema mismatch") rather than silently healing
  it — matching the repo's fail-loud philosophy (chose strict rejection over excalidraw's lenient
  field-defaulting). Tests added to `src/lib/persistence/persistence.test.ts`.

### Investigation evidence (icon bug)
- Proved at the controller level (5/5 headless tests) that placing, dragging, resizing-bigger, and
  recoloring an icon all work. Phosphor render data confirmed correct (single-path, nonzero winding).
  Conclusion: any remaining *live* icon failure is in the browser/DOM/CSS layer, not the logic.

## Pending

### Icon bug — live confirmation (BLOCKED on environment)
- Reproduce the reported "can't drag / resize / recolor" **in a real browser**. Blocked: the Claude
  Chrome extension reports 0 paired browsers, and there is no Puppeteer/Playwright in the repo.
  Needs either the extension connected or a described repro (web vs desktop; tool-click vs
  drag-from-picker; exact symptom).

### Parity divergences — reviewed; dispositioned
After review, the remaining "divergences" are NOT defects in our product. Matching excalidraw on
them would impose its choices on a different app, so they are intentionally left as-is unless a
future feature changes the premise:
- **Corner radius** — our `clamp(r, min(w,h)/2)` is correct and safe; excalidraw's proportional
  radius is an aesthetic choice, not a bug. **By design.**
- **Bbox intersection** — `bboxesIntersect` is unused in our codebase (verified). **N/A.**
- **Element bounds (rectangle-only)** — our element set is semantic (card/container/text/…), not
  geometric shapes; there is no ellipse/diamond to special-case. **N/A** until a non-rect element
  is added.
- **Zoom quantization / MIN-MAX** — float-drift only; our 0.05–8 range is a deliberate product
  choice. **Low value; deferred.**
- **Unbounded z-order growth** — latent; only matters after many thousands of reorderings on one
  doc. **Deferred** (add renormalization only if it ever bites).
- **SVG image export** — images export as empty boxes (the SVG export is a best-effort visual
  snapshot by design; Markdown is the high-fidelity output). **Feature gap, not a bug** — schedule
  only if SVG image fidelity becomes a requirement.

### Housekeeping
- Keep this file updated as items move from Pending → Done.
- Nothing pushed; commits land on `feat/phase-e-vocabulary` only.
