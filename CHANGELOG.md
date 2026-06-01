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

### Parity divergences worth addressing (each as its own focused commit)
- **Corner radius** — ours clamps radius to half-min-dimension; excalidraw uses a proportional/
  adaptive radius (`utils.ts:483-504`). (rendering)
- **Bbox intersection** — ours is inclusive (edge-touching = overlap) and lacks null-guards;
  excalidraw uses strict overlap + null guards (`bounds.ts:1276`). (geometry)
- **Element bounds** — ours implements only the rectangle branch; excalidraw special-cases
  ellipse/diamond/linear and memoizes via a version-keyed cache (`bounds.ts:151`). (geometry/bounds)
- **Zoom quantization** — ours does not round zoom on write; excalidraw clamps+rounds every write
  (`normalize.ts:7-9`); also MIN/MAX differ (0.05–8 vs 0.1–30). (camera)
- **Unbounded z-order growth** — latent, not user-visible today. (scene/z-order)
- **SVG image export** — images currently fall through to an empty box; no dataURL embed/crop/cache. (export)

### Housekeeping
- Keep this file updated as items move from Pending → Done.
- Nothing pushed; commits land on `feat/phase-e-vocabulary` only.
