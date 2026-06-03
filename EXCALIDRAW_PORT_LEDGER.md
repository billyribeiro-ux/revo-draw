# EXCALIDRAW_PORT_LEDGER.md

**Living completion contract** for the faithful ground-up port of the **real single-player
Excalidraw** (`excalidraw-master/`) to **Svelte 5 / SvelteKit**, replacing the existing
"LayoutForge" app in `src/`.

---

## Progress log

### Phase 0 — Foundations: **VENDORED & COMPILING** ✅ (branch `feat/excalidraw-port`)

The Excalidraw monorepo's React-free packages are vendored under `src/lib/` and type-check clean
alongside the still-running LayoutForge app. Done:

- **Build infra:** path aliases (`@excalidraw/{math,common,element,utils,fractional-indexing,excalidraw}`
  → `src/lib/*`) in `svelte.config.js`; deps added (exact pins): `roughjs 4.6.4`, `perfect-freehand
  1.2.0`, `points-on-curve 1.0.1`, `tinycolor2 1.6.0`, `nanoid 3.3.3`, `@braintree/sanitize-url
  6.0.2`, `lodash.throttle 4.1.1`, `es6-promise-pool 2.5.0` (+ `@types/{react,tinycolor2,lodash.throttle}`).
- **tsconfig aligned to Excalidraw's strictness** (`strict: true` kept; dropped the LayoutForge-era
  `noUncheckedIndexedAccess`/`noUnusedLocals`/`noUnusedParameters`/`noImplicitOverride` the vendored
  tree isn't written for). Zero-`any` discipline preserved.
- **Vendored verbatim:** `math` (15), `common` (18 + `debug.ts`), `utils` (4), `element` (49),
  `fractional-indexing` (1); plus ambient `excalidraw/global.d.ts`, the type hub
  `excalidraw/types.ts` + `excalidraw/scene/types.ts`.
- **Type-hub adaptation:** React-component imports in the hub stubbed (`components/App` →
  structural editor-controller contract that Phase 3 will fulfil; `actions/types`, `ContextMenu`,
  `charts`, `clipboard`, `data/library`, `data/types`, `i18n`, `snapping`, `scene/scrollbars`).
- **Deferred:** `utils/export.ts` (Phase 6 — re-copy when porting export).
- **Evidence:** `pnpm check` 0 errors / 0 warnings (884 files) · `pnpm build` clean ·
  `pnpm test` 141 passing (94 pure + 47 runes) · existing app unbroken.

### Phase 1 — Model / Scene / Store / History: **IN PROGRESS** 🔧

- Vendored remaining React-free model files: `excalidraw/history.ts`, `excalidraw/appState.ts`
  (`getDefaultAppState`). Scene/store/delta already present in `element/`.
- Wired `@excalidraw/*` aliases into both vitest configs (`vitest.aliases.ts`) so the vendored
  packages resolve under test, not just under the SvelteKit build.
- **Runtime gate proven** (`src/lib/element/port-model.test.ts`, 4 tests): `newElement` factory
  (seed/version/nonce/id), `syncInvalidIndices` + `validateFractionalIndices` (strictly-increasing
  fractional order), `mutateElement` (version bump + nonce regen), `newElementWith` (immutability).
  → the vendored model executes correctly in vitest 4 / Vite 8, not merely type-checks.
- **Evidence:** `pnpm check` 0/0 (887 files) · `pnpm test` 145 passing (98 pure + 47 runes) ·
  `pnpm build` clean.

- **Runes `AppState` done** (`src/lib/state/app-state.svelte.ts`): single `$state<AppState>`
  initialized from `getDefaultAppState()` (+ the 4 omitted viewport fields), React-`setState`-style
  immutable `setState(patch)` + `reset()`. Svelte autofixer clean; 3 rune tests
  (`app-state.svelte.test.ts`). Added `vitest.setup.ts` (DPR=1 polyfill for headless module-load).
- **Evidence:** `pnpm check` 0/0 (889 files) · `pnpm test` 148 passing (98 pure + 50 runes) ·
  `pnpm build` clean.

- **Reactive `EditorScene` done** (`src/lib/scene/editor-scene.svelte.ts`): wraps the vendored
  `Scene` (sole owner of element data + fractional ordering + caches) and bridges its `onUpdate`
  callback to one `$state` version counter, so reactive getters (`elements`, `allElements`,
  `version`) re-run on mutation without deep-proxying `Scene` (which would defeat its
  identity-based caches). Seeds `Scene` with `[]` (never `null` — that skips init). Documented the
  contract that `replaceAllElements` callers pass **already-synced** elements (Scene validates +
  throws in dev/test before syncing). Autofixer clean; 3 rune tests.
- **Evidence:** `pnpm check` 0/0 (891 files) · `pnpm test` 151 passing (98 pure + 53 runes) ·
  `pnpm build` clean.

- **Undo/redo engine proven** (`src/lib/element/delta-roundtrip.test.ts`, 3 tests):
  `ElementsDelta.calculate` captures moves/insertions into a non-empty delta; `applyTo` replays
  forward; an unchanged set yields an empty delta. **Finding (documented):** the BACKWARD (undo)
  direction is derived from the committed `StoreSnapshot` that `Store`/`History` maintain — and
  `new Store(app)` / `new History(store)` require the editor controller (they read `app.scene` +
  `app.state`). So full bidirectional `do→undo→redo` wiring belongs with the controller in
  **Phase 3**, not before it. Phase 1 proves the snapshot-independent half here.
- **Evidence:** `pnpm check` 0/0 (892 files) · `pnpm test` 154 passing (101 pure + 53 runes) ·
  `pnpm build` clean.

**Phase 1 status: model layer COMPLETE** — element model, Scene, fractional indexing, delta engine,
runes `AppState`, reactive `EditorScene` all vendored, adapted to runes, and proven at runtime.
Remaining undo/redo wiring (`Store`+`History`+`CaptureUpdateAction` on the controller) folds into
Phase 3.

### Phase 2 — Rendering: **IN PROGRESS** 🔧

- Vendored the static render path: `excalidraw/renderer/{staticScene,renderNewElementScene,
  helpers,roundRect}.ts` + `components/hyperlink/helpers.ts` (the only non-renderer dep staticScene
  pulls). `shape.ts` + `renderElement.ts` were already in `element/`. Deferred to their phases:
  `interactiveScene.ts` (Phase 3 selection overlay), `renderSnaps.ts` (Phase 7), `animation.ts`
  (laser trails), `staticSvgScene.ts` (Phase 6 SVG export).
- **rough.js proven at runtime** (`src/lib/element/shape-roughjs.test.ts`, 3 tests):
  `ShapeCache.generateElementShape` produces hand-drawn `Drawable` path-ops for a rectangle, is
  **seed-deterministic** (same seed → byte-identical geometry — the basis of a stable hand-drawn
  look across reloads), and varies with seed. The visual heart of Excalidraw works in our toolchain.
- **Evidence:** `pnpm check` 0/0 (898 files) · `pnpm test` 157 passing (104 pure + 53 runes) ·
  `pnpm build` clean.

- **🎉 SHAPES RENDER IN THE BROWSER** — `src/lib/x/EditorPreview.svelte` (+ dev route
  `src/routes/x/+page.svelte` at `/x`, isolated from the LayoutForge app) wires a `<canvas>` to the
  vendored `renderStaticScene`, driven by the reactive `EditorScene` + `EditorAppState`. Renders a
  hand-drawn rectangle, ellipse, and diamond via rough.js. **Browser-verified** with a headless-CDP
  probe (`scripts/probe-x-render.mjs`): 68,516 non-background canvas pixels painted; screenshot
  confirms Excalidraw's signature sketchy strokes. Svelte autofixer clean.
- **Evidence:** `pnpm check` 0/0 (901 files) · `pnpm test` 157 passing · `pnpm build` clean ·
  CDP render probe PASS (68k px) + visual screenshot.

- **🎉 INTERACTIVE DRAWING WORKS** — `src/lib/x/draw-controller.svelte.ts` implements Excalidraw's
  generic-create gesture: pointer-down makes a zero-size element of the active tool, drag resizes
  it (negative-direction aware via `viewportCoordsToSceneCoords` + `mutateElement` → ShapeCache
  invalidated → repaint), pointer-up finalizes (discards zero-size clicks) and reverts to selection.
  `EditorPreview.svelte` gained a tool toolbar + pointer handlers. **Browser-verified**
  (`scripts/probe-x-draw.mjs`): synthesized drags drew a 220×140 rectangle, 180×160 ellipse,
  200×140 diamond (dims exactly match drag boxes → coord conversion correct), tool reverted each
  time. 4 unit tests (`draw-controller.svelte.test.ts`); added `$lib` alias to the vitest configs.
- **Evidence:** `pnpm check` 0/0 (903 files) · `pnpm test` 161 passing (104 pure + 57 runes) ·
  `pnpm build` clean · CDP draw probe PASS + screenshot.

- **Freedraw works (perfect-freehand)** — controller branches generic-create vs freedraw: a stroke
  seeds a local `[0,0]` point and accumulates `pointFrom<LocalPoint>(dx,dy)` per move (dup-sample
  skip), `simulatePressure` for mouse. **Browser-verified** (`scripts/probe-x-freedraw.mjs`): a
  41-point wavy stroke captured + painted (4234 px); screenshot shows a smooth tapered
  perfect-freehand pen line. 1 unit test added (5 controller tests total). Autofixer clean.
- **Evidence:** `pnpm check` 0/0 (903 files) · `pnpm test` 162 passing (104 pure + 58 runes) ·
  `pnpm build` clean · CDP freedraw probe PASS + screenshot.

**Tools working:** selection (no-op), rectangle, ellipse, diamond (generic-create), freedraw.

- **Interactive-overlay renderer vendored & compiling** — replaced the `scrollbars`/`snapping`
  stubs with the real React-clean implementations; vendored `textAutoResizeHandle`, `renderSnaps`,
  and `renderer/interactiveScene.ts` (the selection/handles/marquee/snap-line overlay renderer).
  Collaboration excluded via a minimal `clients.ts` stub (`getClientColor`/`renderRemoteCursors`
  no-op — no remote cursors). Added `getLanguage` to the i18n stub (scrollbars RTL check).
- **Evidence:** `pnpm check` 0/0 (907 files) · existing app + tests + build unaffected.

- **🎉 SELECTION WORKS (real Excalidraw overlay)** — `EditorPreview` is now a two-canvas stack
  (static scene + interactive overlay). The selection tool hit-tests via `hitElementItself`
  (`element/collision.ts`; topmost-first; transparent shapes hit on their outline — faithful), sets
  `selectedElementIds`, and `renderInteractiveScene` paints Excalidraw's exact selection box + 4
  corner resize handles + rotation handle. interactiveScene's runtime `app` need is just
  `{state, lastPointerMoveCoords, bindModeHandler}` (one documented assertion). **Browser-verified**
  (`scripts/probe-x-select.mjs`): drew a rect, clicked its edge → selected (id matches), overlay
  painted 1924 px; screenshot shows the purple bounding box + handles. +1 controller test (6 total).
  Autofixer clean.
- **Evidence:** `pnpm check` 0/0 (907 files) · `pnpm test` 163 passing (104 pure + 59 runes) ·
  `pnpm build` clean · CDP selection probe PASS + screenshot.

- **Drag-to-move works** — selection-tool pointer-down inside the selection bbox (`getCommonBounds`)
  or on an element's outline begins an origin-based move (no float drift); pointer-move translates
  selected elements by the scene-delta; the selection overlay follows. **Browser-verified**
  (`scripts/probe-x-move.mjs`): drew a rect at (300,200), dragged it +120,+90 → landed exactly at
  (420,290), still selected; screenshot confirms. +1 controller test (7 total). Autofixer clean
  (kept `#dragOrigins` a plain `Map` — non-reactive internal drag bookkeeping).
- **Evidence:** `pnpm check` 0/0 (907 files) · `pnpm test` 164 passing (104 pure + 60 runes) ·
  `pnpm build` clean · CDP move probe PASS + screenshot.

- **🎉 RESIZE + ROTATE work (real Excalidraw transform math)** — selection-tool pointer-down on a
  transform handle (`resizeTest`) begins a resize/rotate; pointer-move runs `transformElements`
  (corner/edge resize + rotation-handle rotation) against deep-copied originals + the selection
  center; `Scene.mutateElement` auto-repaints; the selection overlay follows. **Browser-verified**
  (`scripts/probe-x-resize.mjs`, querying real handle positions via `getTransformHandles`): SE-handle
  drag grew a rect 200×160 → 304×264; rotation-handle drag set angle 0 → 0.677 rad (~39°);
  screenshot shows the resized, rotated shape with the rotated selection box. +1 controller test
  (8 total). Autofixer clean (resize/drag origin maps are non-reactive plain `Map`s).
- **Evidence:** `pnpm check` 0/0 (907 files) · `pnpm test` 165 passing (104 pure + 61 runes) ·
  `pnpm build` clean · CDP resize/rotate probe PASS + screenshot.

- **Keyboard: delete / duplicate / escape** — `EditorPreview` wires `<svelte:window onkeydown>`:
  Delete/Backspace → `deleteSelected`, ⌘/Ctrl+D → `duplicateSelected` (via `duplicateElement` →
  fresh id + (10,10) offset, copy selected), Escape → `deselect`. **Browser-verified**
  (`scripts/probe-x-keys.mjs`): select→1, ⌘D→2 (copy selected), Delete→1, Escape→deselected.
  +2 controller tests (10 total).
- **Evidence:** `pnpm check` 0/0 (907 files) · `pnpm test` 167 passing (104 pure + 63 runes) ·
  `pnpm build` clean · CDP keyboard probe PASS.

- **🎉 UNDO/REDO works (Store + History wired) — the deferred Phase-1 piece**. The controller now
  builds `new Store(app)` + `new History(store)` (app = `{scene, get state}`, the documented
  runtime boundary), subscribes `onDurableIncrementEmitter → history.record`, and `#commit()`s one
  durable snapshot per completed gesture (create/move/resize/rotate/delete/duplicate). `undo()`/
  `redo()` apply the returned `[elementsMap, appState]` back (`orderByFractionalIndex` →
  `replaceAllElements`, restore appState + selection). ⌘Z / ⌘⇧Z wired. **Browser-verified**
  (`scripts/probe-x-undo.mjs`): drew 2 → ⌘Z→1 → ⌘Z→0 → ⌘⇧Z→1. +2 controller tests (12 total) incl.
  do→undo→redo round-trip + position-restore-after-move.
- **Evidence:** `pnpm check` 0/0 (907 files) · `pnpm test` 169 passing (104 pure + 65 runes) ·
  `pnpm build` clean · CDP undo/redo probe PASS.

- **Line + arrow tools** — drag-create 2-point linear elements via `newLinearElement`; the second
  point tracks the pointer (local coords), `mutateElement` auto-computes the bbox
  (`getSizeFromPoints`); arrows get `endArrowhead: "arrow"`. **Browser-verified**
  (`scripts/probe-x-linear.mjs`): line (2 pts) + arrow (2 pts, arrowhead) drawn + painted;
  screenshot shows a plain line and an arrow with a rendered arrowhead. +1 controller test (13
  total). (Multi-point/segment editing via `LinearElementEditor` is a later refinement.)
- **Evidence:** `pnpm check` 0/0 (907 files) · `pnpm test` 170 passing (104 pure + 66 runes) ·
  `pnpm build` clean · CDP line/arrow probe PASS.

- **Text tool (textarea overlay)** — text tool click places an empty text element and opens a
  `<textarea>` overlay (Svelte 5 `{@attach}` auto-focus) positioned/fonted to match; `oninput` →
  `setEditingText` live-updates the element + recomputes the bbox (`redrawTextBoundingBox`); blur/
  Escape commits (`commitText`: deletes if empty, else keeps; one history entry). The global
  keydown handler now ignores events while typing in the textarea. **Also fixed a latent bug**:
  `setPointerCapture` was unguarded and could throw on non-active pointer ids and abort a gesture —
  now wrapped in try/catch. **Browser-verified** (`scripts/probe-x-text.mjs`): textarea focuses,
  live typing flows through `oninput`, commit persists "Hello revo" + paints it (screenshot
  confirms). (Text creation needs a canvas (`measureText`), so it's verified in-browser, not via a
  node unit test.)
- **Evidence:** `pnpm check` 0/0 (907 files) · `pnpm test` 170 passing · `pnpm build` clean ·
  CDP text probe PASS.

- **Properties panel (Phase 5 start) — stroke/background color + stroke width**. Controller gained
  a current-style layer (`strokeColor`/`backgroundColor`/`strokeWidth` over `appState.currentItem*`)
  applied to every newly-created element (`#createStyle()` spread into all factories) and to the
  selected element on change (`#applyStyle` → mutate + commit). `EditorPreview` gained an Excalidraw-
  island-styled left panel: stroke swatches, background swatches, S/M/L width. **Browser-verified**
  (`scripts/probe-x-style.mjs`): set red stroke + blue bg + width 4 → drew a rectangle with exactly
  those; screenshot shows the panel (active states) + the colored shape. +1 controller test (14 total).
- **Evidence:** `pnpm check` 0/0 (907 files) · `pnpm test` 171 passing · `pnpm build` clean ·
  CDP style probe PASS.

**Tools:** rectangle, ellipse, diamond, line, arrow, text, freedraw, selection.
**Interactions:** draw, select, move, resize, rotate, delete, duplicate, undo/redo.
**Styling:** stroke color, background color, stroke width (new + selected elements).

- **Parallel workflow (4 agents) + Phase 6 integration — dark mode & localStorage.** A Workflow
  fan-out produced 4 disjoint, self-verified assets under `src/lib/x/`: `css/theme.css` (faithful
  port of Excalidraw's light/dark CSS variables + `--theme-filter`), `persistence/web-storage.ts`
  (localStorage save/restore of elements + filtered appState + theme), `icons.ts` (18 real
  Excalidraw SVG tool/action icons), `ColorPicker.svelte` (swatch + hex picker). Then integrated
  the two highest-value ones:
  - **localStorage persistence** — controller restores on construct (before the undo baseline) and
    `saveToLocalStorage` on every `#commit()`. **Browser-verified**: drew a shape → reload → restored.
  - **Dark mode** — `EditorPreview` wraps the UI in `.excalidraw` + `class:theme--dark`, imports
    `theme.css`, applies `--theme-filter` to the canvases, dark chrome, and a sun/moon toggle
    (`controller.toggleTheme`, persisted). **Browser-verified**: `theme--dark` applied, canvas filter
    `invert(0.93) hue-rotate(180deg)` computed, chrome renders dark.
  `icons.ts` + `ColorPicker.svelte` are ready-to-wire assets for the next UI pass.
- **Evidence:** `pnpm check` 0/0 (910 files) · `pnpm test` 171 passing · `pnpm build` clean ·
  CDP persistence+dark-mode probe PASS.

- **Wave 2 (3 parallel agents) + real Excalidraw chrome integrated.** Workflow produced disjoint
  props-driven components: `StyleControls.svelte` (fill/stroke-style/sloppiness/edges/opacity),
  `ContextMenu.svelte`, `Stats.svelte`. Integrated:
  - **Toolbar now uses the real Excalidraw SVG icons** (`icons.ts`) — pointer/shapes/line/arrow/
    text/pencil/moon — replacing text labels.
  - **Full properties panel**: added controller setters `setOpacity/setFillStyle/setStrokeStyle/
    setSloppiness/setEdges` (over `appState.currentItem*` + applied to the selection), wired into
    `StyleControls` (Fill, Stroke style, Sloppiness, Edges, Opacity with the purple active highlight).
  - **Stats panel** (top-left) showing the selected element's X/Y/W/H/angle + scene count.
  - `ContextMenu.svelte` lands as a ready-to-wire asset (right-click menu).
  - **Browser-verified**: screenshot shows the editor now reads as Excalidraw — icon toolbar, the full
    property controls, stats, a styled selected shape.
- **Evidence:** `pnpm check` 0/0 (913 files) · `pnpm test` 171 passing · `pnpm build` clean · CDP
  chrome probe (8 tool icons rendered, opacity range + stats present).

- **Wave 3 (3 parallel agents) + navigation/menus integrated.** Workflow produced `image-support.ts`
  (image element + cache helpers), `HelpDialog.svelte`, `MainMenu.svelte`. Integrated:
  - **Pan / zoom** — controller `panBy` (wheel) + `zoomAt` (ctrl+wheel, zoom-around-cursor) + `resetView`;
    the render reads `appState.scroll*/zoom` so it all flows through. EditorPreview `onwheel` handler.
  - **Right-click context menu** — wired wave-2's `ContextMenu` (Duplicate/Delete/Select-none); right-click
    selects under cursor (`controller.selectAt`) then opens the menu.
  - **Main menu** (hamburger ☰): Reset canvas (`controller.clear`), Reset view, Light/Dark mode, Shortcuts.
  - **Help dialog** (`?` key + menu) — full Tools/Editor keyboard-shortcut reference with `<kbd>` chips.
  - `image-support.ts` lands as a ready-to-wire asset (image tool).
  - **Browser-verified** (`scripts/probe-x-nav.mjs`): ctrl+wheel zoom 1→~1.3/tick, right-click menu,
    hamburger menu, `?` help dialog all work; screenshot shows the full Excalidraw-faithful editor.
- **Evidence:** `pnpm check` 0/0 (916 files) · `pnpm test` 171 passing · `pnpm build` clean · CDP nav probe PASS.

**Done:** model/scene/store/history; 7 tools; select/move/resize/rotate/delete/duplicate/undo-redo;
full style controls; localStorage persistence; dark mode; real icon toolbar; stats; **pan/zoom**;
**right-click context menu**; **main menu**; **help dialog (shortcuts)**.

- **Image + eraser tools (wave 4 integration).** Wired `image-support.ts`: controller holds an
  `imageCache` (passed to `renderConfig.imageCache`) + `placeImage(file,x,y)` (load → cache →
  `createImageElement` scaled-to-fit → select); the image tool opens a hidden file `<input>` in
  EditorPreview, then places the image at the click. Eraser: drag removes elements under the
  pointer (`#eraseAt` hit-test, one history entry per stroke). **Browser-verified**
  (`scripts/probe-x-imgerase.mjs`): drew 2 shapes → eraser-drag removed 1; a synthesized PNG was
  placed + rendered (screenshot shows the image content + remaining ellipse). +1 controller test
  (15 total).
- **Evidence:** `pnpm check` 0/0 (916 files) · `pnpm test` 172 passing · `pnpm build` clean · CDP
  image/eraser probe PASS.

**Tools (9):** rectangle, ellipse, diamond, line, arrow, text, freedraw, **image**, **eraser**, selection.

- **Footer + ColorPicker hex popover.** Footer (bottom-left island): zoom out / zoom % (reset on
  click) / zoom in, separator, undo / redo icon buttons (disabled when stacks empty), dark-themed.
  Stroke + Background groups gained a custom-color swatch that opens the `ColorPicker.svelte` popover
  (palette + hex input → `setStrokeColor`/`setBackgroundColor`). **Verified**: footer renders "100%"
  + buttons; popover opens (screenshot). 0/0 (916 files), 172 tests, build clean.

**Remaining for full parity (tracked, see `prompt.md` for the handoff):** laser tool (animated trail);
marquee multi-select + modifier keys (shift/alt); multi-point linear editor; export dialog (PNG/SVG);
binding + snapping (Phase 7); Tauri (Phase 8).

---

## Scope

**IN SCOPE** — the full freeform drawing engine:

- Tools: rectangle, ellipse, diamond, line, arrow (with arrowheads + binding), freedraw,
  text, image, frame, eraser, laser, selection, hand.
- rough.js hand-drawn rendering.
- Dark mode + theming.
- localStorage persistence.

**EXCLUDED** (see §10): real-time collaboration, AI/LLM features (TTDDialog, mermaid,
diagram-to-code, magic), i18n / multi-language, and all `excalidraw-app/` server/firebase
bits.

## How to use this ledger

Each row is an atomic, claimable unit of work for a parallel sub-agent. Subsystems are
disjoint; **claim whole rows, never fragments**. When you start a row set its Status to
`WIP (<agent>)`; when the module is ported, type-checks 0/0, and has a passing test (where
applicable) set it to `DONE`. Every Status starts as `TODO`.

### Phase legend (approved plan)

| Phase | Theme |
|-------|-------|
| Phase0 | Foundations (math, common, fractional-indexing) |
| Phase1 | Element model + scene + store + history |
| Phase2 | Rendering core (shape/ShapeCache, renderElement, static/interactive/new-element scenes) |
| Phase3 | Tools / pointer state machine |
| Phase4 | Image + frame |
| Phase5 | UI shell components |
| Phase6 | Dark-mode + persistence |
| Phase7 | Deferred fidelity (binding, elbow arrows, snapping polish, eraser/laser, embeddable) |
| Phase8 | Tauri shell |

### Status legend

`TODO` → not started · `WIP (<agent>)` → claimed/in-progress · `DONE` → ported + verified · `N/A` → intentionally skipped.

### Target path map

`src/lib/math/` · `src/lib/common/` · `src/lib/fractional-indexing/` · `src/lib/element/` ·
`src/lib/scene/` · `src/lib/state/` · `src/lib/draw/` (rendering + tools) · `src/lib/x/`
(UI components) · `src/lib/persistence/`

---

## 1. Foundations — math, common, fractional-indexing

### 1a. math package (`packages/math/src/`)

| Feature / Component / Module | excalidraw-master source | Target Svelte path | Phase | Status |
|---|---|---|---|---|
| Angle math (normalizeRadians, cartesian2Polar, deg/rad, isRightAngleRads, radiansBetweenAngles, radiansDifference) | `packages/math/src/angle.ts` | `src/lib/math/angle.ts` | Phase0 | TODO |
| Math constants (PRECISION, etc.) | `packages/math/src/constants.ts` | `src/lib/math/constants.ts` | Phase0 | TODO |
| Bézier / curve math | `packages/math/src/curve.ts` | `src/lib/math/curve.ts` | Phase0 | TODO |
| Ellipse geometry | `packages/math/src/ellipse.ts` | `src/lib/math/ellipse.ts` | Phase0 | TODO |
| Line geometry | `packages/math/src/line.ts` | `src/lib/math/line.ts` | Phase0 | TODO |
| Point primitives (pointFrom, pointDistance, pointRotateRads, …) | `packages/math/src/point.ts` | `src/lib/math/point.ts` | Phase0 | TODO |
| Polygon geometry | `packages/math/src/polygon.ts` | `src/lib/math/polygon.ts` | Phase0 | TODO |
| Range helpers | `packages/math/src/range.ts` | `src/lib/math/range.ts` | Phase0 | TODO |
| Rectangle geometry | `packages/math/src/rectangle.ts` | `src/lib/math/rectangle.ts` | Phase0 | TODO |
| Segment geometry | `packages/math/src/segment.ts` | `src/lib/math/segment.ts` | Phase0 | TODO |
| Triangle geometry | `packages/math/src/triangle.ts` | `src/lib/math/triangle.ts` | Phase0 | TODO |
| Branded math types (Radians, Degrees, GlobalPoint, LocalPoint, …) | `packages/math/src/types.ts` | `src/lib/math/types.ts` | Phase0 | TODO |
| Math utils (clamp, round, PRECISION helpers) | `packages/math/src/utils.ts` | `src/lib/math/utils.ts` | Phase0 | TODO |
| Vector math | `packages/math/src/vector.ts` | `src/lib/math/vector.ts` | Phase0 | TODO |
| math barrel export | `packages/math/src/index.ts` | `src/lib/math/index.ts` | Phase0 | TODO |

### 1b. common package (`packages/common/src/`)

| Feature / Component / Module | excalidraw-master source | Target Svelte path | Phase | Status |
|---|---|---|---|---|
| Bounds (getCommonBounds, getElementBounds, ...) | `packages/common/src/bounds.ts` | `src/lib/common/bounds.ts` | Phase0 | TODO |
| Colors (palette, OKLCH helpers, color constants) | `packages/common/src/colors.ts` | `src/lib/common/colors.ts` | Phase0 | TODO |
| App constants (THEME, FONT_FAMILY, defaults, ENV) | `packages/common/src/constants.ts` | `src/lib/common/constants.ts` | Phase0 | TODO |
| Keys (KEYS map, isArrowKey, matchKey helpers) | `packages/common/src/keys.ts` | `src/lib/common/keys.ts` | Phase0 | TODO |
| Points (utility point helpers) | `packages/common/src/points.ts` | `src/lib/common/points.ts` | Phase0 | TODO |
| Random (random, randomInteger, seeded RNG for rough) | `packages/common/src/random.ts` | `src/lib/common/random.ts` | Phase0 | TODO |
| Utils (arrayToMap, throttleRAF, debounce, isShallowEqual, …) | `packages/common/src/utils.ts` | `src/lib/common/utils.ts` | Phase0 | TODO |
| Utility types | `packages/common/src/utility-types.ts` | `src/lib/common/utility-types.ts` | Phase0 | TODO |
| URL helpers | `packages/common/src/url.ts` | `src/lib/common/url.ts` | Phase0 | TODO |
| Emitter | `packages/common/src/emitter.ts` | `src/lib/common/emitter.ts` | Phase0 | TODO |
| App event bus | `packages/common/src/appEventBus.ts` | `src/lib/common/appEventBus.ts` | Phase0 | TODO |
| Binary heap | `packages/common/src/binary-heap.ts` | `src/lib/common/binary-heap.ts` | Phase0 | TODO |
| Queue | `packages/common/src/queue.ts` | `src/lib/common/queue.ts` | Phase0 | TODO |
| Promise pool | `packages/common/src/promise-pool.ts` | `src/lib/common/promise-pool.ts` | Phase0 | TODO |
| Font metadata | `packages/common/src/font-metadata.ts` | `src/lib/common/font-metadata.ts` | Phase0 | TODO |
| Editor interface types | `packages/common/src/editorInterface.ts` | `src/lib/common/editorInterface.ts` | Phase0 | TODO |
| common barrel export | `packages/common/src/index.ts` | `src/lib/common/index.ts` | Phase0 | TODO |
| bbox util (utils pkg) | `packages/utils/src/bbox.ts` | `src/lib/common/bbox.ts` | Phase0 | TODO |
| withinBounds util (utils pkg) | `packages/utils/src/withinBounds.ts` | `src/lib/common/withinBounds.ts` | Phase0 | TODO |
| shape util (utils pkg — geometry helpers) | `packages/utils/src/shape.ts` | `src/lib/common/shapeUtils.ts` | Phase0 | TODO |

### 1c. fractional-indexing (`packages/fractional-indexing/src/`)

| Feature / Component / Module | excalidraw-master source | Target Svelte path | Phase | Status |
|---|---|---|---|---|
| Fractional-indexing core (generateKeyBetween, jitter) | `packages/fractional-indexing/src/index.ts` | `src/lib/fractional-indexing/index.ts` | Phase0 | TODO |

---

## 2. Element model (`packages/element/src/`)

| Feature / Component / Module | excalidraw-master source | Target Svelte path | Phase | Status |
|---|---|---|---|---|
| Element types (ExcalidrawElement union, all subtypes) | `packages/element/src/types.ts` | `src/lib/element/types.ts` | Phase1 | TODO |
| Type checks (isLinearElement, isTextElement, isBindable, …) | `packages/element/src/typeChecks.ts` | `src/lib/element/typeChecks.ts` | Phase1 | TODO |
| newElement / newTextElement / newLinearElement / newImageElement / newFrameElement | `packages/element/src/newElement.ts` | `src/lib/element/newElement.ts` | Phase1 | TODO |
| mutateElement | `packages/element/src/mutateElement.ts` | `src/lib/element/mutateElement.ts` | Phase1 | TODO |
| Element bounds (getElementBounds, getElementAbsoluteCoords, ...) | `packages/element/src/bounds.ts` | `src/lib/element/bounds.ts` | Phase1 | TODO |
| Collision (hit-test point/shape) | `packages/element/src/collision.ts` | `src/lib/element/collision.ts` | Phase1 | TODO |
| Distance helpers | `packages/element/src/distance.ts` | `src/lib/element/distance.ts` | Phase1 | TODO |
| Comparisons | `packages/element/src/comparisons.ts` | `src/lib/element/comparisons.ts` | Phase1 | TODO |
| sizeHelpers (normalize, resize within constraints) | `packages/element/src/sizeHelpers.ts` | `src/lib/element/sizeHelpers.ts` | Phase1 | TODO |
| sortElements | `packages/element/src/sortElements.ts` | `src/lib/element/sortElements.ts` | Phase1 | TODO |
| zindex (z-order operations) | `packages/element/src/zindex.ts` | `src/lib/element/zindex.ts` | Phase1 | TODO |
| Groups (group/ungroup, getSelectedGroupIds) | `packages/element/src/groups.ts` | `src/lib/element/groups.ts` | Phase1 | TODO |
| Frame (frame membership, clipping helpers) | `packages/element/src/frame.ts` | `src/lib/element/frame.ts` | Phase4 | TODO |
| Text element (bound text, container helpers) | `packages/element/src/textElement.ts` | `src/lib/element/textElement.ts` | Phase1 | TODO |
| Text measurements (measureText, getFontString) | `packages/element/src/textMeasurements.ts` | `src/lib/element/textMeasurements.ts` | Phase1 | TODO |
| Text wrapping | `packages/element/src/textWrapping.ts` | `src/lib/element/textWrapping.ts` | Phase1 | TODO |
| containerCache | `packages/element/src/containerCache.ts` | `src/lib/element/containerCache.ts` | Phase1 | TODO |
| heading (binding heading directions) | `packages/element/src/heading.ts` | `src/lib/element/heading.ts` | Phase1 | TODO |
| Element utils | `packages/element/src/utils.ts` | `src/lib/element/utils.ts` | Phase1 | TODO |
| selection (getSelectedElements, etc.) | `packages/element/src/selection.ts` | `src/lib/element/selection.ts` | Phase1 | TODO |
| showSelectedShapeActions | `packages/element/src/showSelectedShapeActions.ts` | `src/lib/element/showSelectedShapeActions.ts` | Phase1 | TODO |
| dragElements | `packages/element/src/dragElements.ts` | `src/lib/element/dragElements.ts` | Phase3 | TODO |
| duplicate | `packages/element/src/duplicate.ts` | `src/lib/element/duplicate.ts` | Phase3 | TODO |
| align | `packages/element/src/align.ts` | `src/lib/element/align.ts` | Phase3 | TODO |
| distribute | `packages/element/src/distribute.ts` | `src/lib/element/distribute.ts` | Phase3 | TODO |
| transform (programmatic element transform) | `packages/element/src/transform.ts` | `src/lib/element/transform.ts` | Phase3 | TODO |
| elementLink | `packages/element/src/elementLink.ts` | `src/lib/element/elementLink.ts` | Phase5 | TODO |
| arrowheads | `packages/element/src/arrowheads.ts` | `src/lib/element/arrowheads.ts` | Phase3 | TODO |
| binding (bindable elements, suggested bindings) | `packages/element/src/binding.ts` | `src/lib/element/binding.ts` | Phase7 | TODO |
| linearElementEditor | `packages/element/src/linearElementEditor.ts` | `src/lib/element/linearElementEditor.ts` | Phase3 | TODO |
| arrows/focus | `packages/element/src/arrows/focus.ts` | `src/lib/element/arrows/focus.ts` | Phase7 | TODO |
| arrows/helpers | `packages/element/src/arrows/helpers.ts` | `src/lib/element/arrows/helpers.ts` | Phase7 | TODO |
| elbowArrow | `packages/element/src/elbowArrow.ts` | `src/lib/element/elbowArrow.ts` | Phase7 | TODO |
| image (element image helpers) | `packages/element/src/image.ts` | `src/lib/element/image.ts` | Phase4 | TODO |
| cropElement | `packages/element/src/cropElement.ts` | `src/lib/element/cropElement.ts` | Phase4 | TODO |
| embeddable | `packages/element/src/embeddable.ts` | `src/lib/element/embeddable.ts` | Phase7 | TODO |
| element barrel export | `packages/element/src/index.ts` | `src/lib/element/index.ts` | Phase1 | TODO |

---

## 3. Scene / Store / History

| Feature / Component / Module | excalidraw-master source | Target Svelte path | Phase | Status |
|---|---|---|---|---|
| Scene (element registry, getNonDeleted, getElementsMapIncludingDeleted) | `packages/element/src/Scene.ts` | `src/lib/scene/Scene.svelte.ts` | Phase1 | TODO |
| fractionalIndex (element ordering integrity) | `packages/element/src/fractionalIndex.ts` | `src/lib/scene/fractionalIndex.ts` | Phase1 | TODO |
| store (CaptureUpdateAction, durable/ephemeral snapshots) | `packages/element/src/store.ts` | `src/lib/state/store.svelte.ts` | Phase1 | TODO |
| delta (AppStateDelta, ElementsDelta) | `packages/element/src/delta.ts` | `src/lib/state/delta.ts` | Phase1 | TODO |
| history (undo/redo stack on deltas) | `packages/excalidraw/history.ts` | `src/lib/state/history.svelte.ts` | Phase1 | TODO |
| appState (getDefaultAppState, cleanAppStateForExport) | `packages/excalidraw/appState.ts` | `src/lib/state/appState.svelte.ts` | Phase1 | TODO |
| Renderer cache (scene Renderer) | `packages/excalidraw/scene/Renderer.ts` | `src/lib/scene/Renderer.ts` | Phase2 | TODO |
| scene index helpers (getElementsAtPosition, hasBackground, …) | `packages/excalidraw/scene/index.ts` | `src/lib/scene/index.ts` | Phase2 | TODO |
| scene types | `packages/excalidraw/scene/types.ts` | `src/lib/scene/types.ts` | Phase2 | TODO |
| normalize (scene normalization) | `packages/excalidraw/scene/normalize.ts` | `src/lib/scene/normalize.ts` | Phase1 | TODO |
| zoom (getNormalizedZoom, zoomToFit) | `packages/excalidraw/scene/zoom.ts` | `src/lib/scene/zoom.ts` | Phase2 | TODO |
| scroll (calculateScrollCenter, scrollIntoView) | `packages/excalidraw/scene/scroll.ts` | `src/lib/scene/scroll.ts` | Phase2 | TODO |
| scrollbars | `packages/excalidraw/scene/scrollbars.ts` | `src/lib/scene/scrollbars.ts` | Phase2 | TODO |

---

## 4. Rendering

| Feature / Component / Module | excalidraw-master source | Target Svelte path | Phase | Status |
|---|---|---|---|---|
| shape (ShapeCache, generateRoughOptions, _generateElementShape, rough.js bridge) | `packages/element/src/shape.ts` | `src/lib/draw/shape.ts` | Phase2 | TODO |
| renderElement (renderElementToCanvas, drawElementOnCanvas) | `packages/element/src/renderElement.ts` | `src/lib/draw/renderElement.ts` | Phase2 | TODO |
| staticScene (renderStaticScene) | `packages/excalidraw/renderer/staticScene.ts` | `src/lib/draw/staticScene.ts` | Phase2 | TODO |
| interactiveScene (selection overlay, handles, bindings hl) | `packages/excalidraw/renderer/interactiveScene.ts` | `src/lib/draw/interactiveScene.ts` | Phase2 | TODO |
| renderNewElementScene | `packages/excalidraw/renderer/renderNewElementScene.ts` | `src/lib/draw/renderNewElementScene.ts` | Phase2 | TODO |
| renderer helpers (bootstrapCanvas, fillCircle, …) | `packages/excalidraw/renderer/helpers.ts` | `src/lib/draw/renderHelpers.ts` | Phase2 | TODO |
| renderSnaps (snap-guide overlay) | `packages/excalidraw/renderer/renderSnaps.ts` | `src/lib/draw/renderSnaps.ts` | Phase7 | TODO |
| roundRect | `packages/excalidraw/renderer/roundRect.ts` | `src/lib/draw/roundRect.ts` | Phase2 | TODO |
| animation (render-loop easing for laser/animated trail) | `packages/excalidraw/renderer/animation.ts` | `src/lib/draw/animation.ts` | Phase7 | TODO |
| transformHandles (computeTransformHandles geometry) | `packages/element/src/transformHandles.ts` | `src/lib/draw/transformHandles.ts` | Phase2 | TODO |
| staticSvgScene (SVG export render) | `packages/excalidraw/renderer/staticSvgScene.ts` | `src/lib/draw/staticSvgScene.ts` | Phase6 | TODO |

---

## 5. Tools / pointer state machine

The original Excalidraw concentrates all pointer handling inside `components/App.tsx`
(~handlePointerDown/Move/Up). The port splits this monolith into a controller plus
per-tool modules under `src/lib/draw/tools/`.

| Feature / Component / Module | excalidraw-master source | Target Svelte path | Phase | Status |
|---|---|---|---|---|
| Pointer controller / state machine (extracted from App pointer handlers) | `packages/excalidraw/components/App.tsx` | `src/lib/draw/editor.svelte.ts` | Phase3 | TODO |
| Tool registry + active-tool typing | `packages/excalidraw/components/shapes.tsx` | `src/lib/draw/tools/registry.ts` | Phase3 | TODO |
| Selection tool (click/marquee/click-through) | `packages/excalidraw/components/App.tsx` | `src/lib/draw/tools/selection.ts` | Phase3 | TODO |
| Marquee selection (getElementsWithinSelection) | `packages/element/src/selection.ts` | `src/lib/draw/tools/marquee.ts` | Phase3 | TODO |
| Rectangle tool | `packages/excalidraw/components/App.tsx` | `src/lib/draw/tools/rectangle.ts` | Phase3 | TODO |
| Ellipse tool | `packages/excalidraw/components/App.tsx` | `src/lib/draw/tools/ellipse.ts` | Phase3 | TODO |
| Diamond tool | `packages/excalidraw/components/App.tsx` | `src/lib/draw/tools/diamond.ts` | Phase3 | TODO |
| Line tool (multi-point + linear editor entry) | `packages/excalidraw/components/App.tsx` | `src/lib/draw/tools/line.ts` | Phase3 | TODO |
| Arrow tool (arrowheads + binding handoff) | `packages/excalidraw/components/App.tsx` | `src/lib/draw/tools/arrow.ts` | Phase3 | TODO |
| Freedraw tool | `packages/excalidraw/components/App.tsx` | `src/lib/draw/tools/freedraw.ts` | Phase3 | TODO |
| Text tool + wysiwyg editor bridge | `packages/excalidraw/wysiwyg/textWysiwyg.tsx` | `src/lib/draw/tools/text.ts` | Phase3 | TODO |
| Image tool (insert/place) | `packages/excalidraw/components/App.tsx` | `src/lib/draw/tools/image.ts` | Phase4 | TODO |
| Frame tool | `packages/excalidraw/components/App.tsx` | `src/lib/draw/tools/frame.ts` | Phase4 | TODO |
| Eraser tool + eraser engine | `packages/excalidraw/eraser/index.ts` | `src/lib/draw/tools/eraser.ts` | Phase7 | TODO |
| Laser pointer tool + trails | `packages/excalidraw/laserTrails.ts` | `src/lib/draw/tools/laser.ts` | Phase7 | TODO |
| Animated trail (shared trail engine) | `packages/excalidraw/animatedTrail.ts` | `src/lib/draw/animatedTrail.ts` | Phase7 | TODO |
| Hand / pan tool | `packages/excalidraw/components/App.tsx` | `src/lib/draw/tools/hand.ts` | Phase3 | TODO |
| Resize / rotate engine | `packages/element/src/resizeElements.ts` | `src/lib/draw/tools/resize.ts` | Phase3 | TODO |
| resizeTest (handle hit-test) | `packages/element/src/resizeTest.ts` | `src/lib/draw/tools/resizeTest.ts` | Phase3 | TODO |
| LinearElementEditor pointer interaction | `packages/element/src/linearElementEditor.ts` | `src/lib/draw/tools/linearEditor.ts` | Phase3 | TODO |
| Snapping engine (alignment + spacing) | `packages/excalidraw/snapping.ts` | `src/lib/draw/snapping.ts` | Phase7 | TODO |
| Cursor management (setCursor, CURSOR_TYPE) | `packages/excalidraw/cursor.ts` | `src/lib/draw/cursor.ts` | Phase3 | TODO |
| Gesture (pinch/zoom multi-touch) | `packages/excalidraw/gesture.ts` | `src/lib/draw/gesture.ts` | Phase3 | TODO |
| Lasso selection engine | `packages/excalidraw/lasso/index.ts` | `src/lib/draw/tools/lasso.ts` | Phase7 | TODO |
| Lasso utils | `packages/excalidraw/lasso/utils.ts` | `src/lib/draw/tools/lassoUtils.ts` | Phase7 | TODO |
| flowchart (arrow-key element creation) | `packages/element/src/flowchart.ts` | `src/lib/draw/tools/flowchart.ts` | Phase7 | TODO |

---

## 6. UI shell components

Excalidraw uses a thin action system (`actions/*`) plus React components. In Svelte these
become `.svelte` components under `src/lib/x/`. Action logic that drives a button is folded
into the relevant component or a small action helper module.

### 6a. Top-level shell & layout

| Feature / Component / Module | excalidraw-master source | Target Svelte path | Phase | Status |
|---|---|---|---|---|
| LayerUI (top-level shell composition) | `packages/excalidraw/components/LayerUI.tsx` | `src/lib/x/LayerUI.svelte` | Phase5 | TODO |
| FixedSideContainer | `packages/excalidraw/components/FixedSideContainer.tsx` | `src/lib/x/FixedSideContainer.svelte` | Phase5 | TODO |
| Island primitive | `packages/excalidraw/components/Island.tsx` | `src/lib/x/Island.svelte` | Phase5 | TODO |
| Stack primitive | `packages/excalidraw/components/Stack.tsx` | `src/lib/x/Stack.svelte` | Phase5 | TODO |
| Section primitive | `packages/excalidraw/components/Section.tsx` | `src/lib/x/Section.svelte` | Phase5 | TODO |
| Canvas host wrapper (InteractiveCanvas) | `packages/excalidraw/components/canvases/InteractiveCanvas.tsx` | `src/lib/x/InteractiveCanvas.svelte` | Phase5 | TODO |
| Canvas host (StaticCanvas) | `packages/excalidraw/components/canvases/StaticCanvas.tsx` | `src/lib/x/StaticCanvas.svelte` | Phase5 | TODO |
| Canvas host (NewElementCanvas) | `packages/excalidraw/components/canvases/NewElementCanvas.tsx` | `src/lib/x/NewElementCanvas.svelte` | Phase5 | TODO |
| SVGLayer (overlay HTML/SVG over canvas) | `packages/excalidraw/components/SVGLayer.tsx` | `src/lib/x/SVGLayer.svelte` | Phase5 | TODO |

### 6b. Toolbar & shape actions

| Feature / Component / Module | excalidraw-master source | Target Svelte path | Phase | Status |
|---|---|---|---|---|
| Toolbar / ShapesSwitcher (shapes.tsx data) | `packages/excalidraw/components/shapes.tsx` | `src/lib/x/Toolbar.svelte` | Phase5 | TODO |
| ToolButton | `packages/excalidraw/components/ToolButton.tsx` | `src/lib/x/ToolButton.svelte` | Phase5 | TODO |
| ToolPopover | `packages/excalidraw/components/ToolPopover.tsx` | `src/lib/x/ToolPopover.svelte` | Phase5 | TODO |
| HandButton | `packages/excalidraw/components/HandButton.tsx` | `src/lib/x/HandButton.svelte` | Phase5 | TODO |
| LockButton | `packages/excalidraw/components/LockButton.tsx` | `src/lib/x/LockButton.svelte` | Phase5 | TODO |
| PenModeButton | `packages/excalidraw/components/PenModeButton.tsx` | `src/lib/x/PenModeButton.svelte` | Phase5 | TODO |
| LaserPointerButton | `packages/excalidraw/components/LaserPointerButton.tsx` | `src/lib/x/LaserPointerButton.svelte` | Phase5 | TODO |
| Actions (action bar container) | `packages/excalidraw/components/Actions.tsx` | `src/lib/x/Actions.svelte` | Phase5 | TODO |
| SelectedShapeActions (the left property panel) | `packages/excalidraw/components/Actions.tsx` (ShapeActions export) | `src/lib/x/SelectedShapeActions.svelte` | Phase5 | TODO |

### 6c. Property controls / inputs

| Feature / Component / Module | excalidraw-master source | Target Svelte path | Phase | Status |
|---|---|---|---|---|
| Button | `packages/excalidraw/components/Button.tsx` | `src/lib/x/Button.svelte` | Phase5 | TODO |
| ButtonIcon | `packages/excalidraw/components/ButtonIcon.tsx` | `src/lib/x/ButtonIcon.svelte` | Phase5 | TODO |
| ButtonIconCycle | `packages/excalidraw/components/ButtonIconCycle.tsx` | `src/lib/x/ButtonIconCycle.svelte` | Phase5 | TODO |
| ButtonSeparator | `packages/excalidraw/components/ButtonSeparator.tsx` | `src/lib/x/ButtonSeparator.svelte` | Phase5 | TODO |
| FilledButton | `packages/excalidraw/components/FilledButton.tsx` | `src/lib/x/FilledButton.svelte` | Phase5 | TODO |
| RadioSelection (iconSelectList) | `packages/excalidraw/components/RadioSelection.tsx` | `src/lib/x/RadioSelection.svelte` | Phase5 | TODO |
| RadioGroup | `packages/excalidraw/components/RadioGroup.tsx` | `src/lib/x/RadioGroup.svelte` | Phase5 | TODO |
| Range slider | `packages/excalidraw/components/Range.tsx` | `src/lib/x/Range.svelte` | Phase5 | TODO |
| Switch | `packages/excalidraw/components/Switch.tsx` | `src/lib/x/Switch.svelte` | Phase5 | TODO |
| CheckboxItem | `packages/excalidraw/components/CheckboxItem.tsx` | `src/lib/x/CheckboxItem.svelte` | Phase5 | TODO |
| TextField | `packages/excalidraw/components/TextField.tsx` | `src/lib/x/TextField.svelte` | Phase5 | TODO |
| ProjectName | `packages/excalidraw/components/ProjectName.tsx` | `src/lib/x/ProjectName.svelte` | Phase5 | TODO |
| Spinner | `packages/excalidraw/components/Spinner.tsx` | `src/lib/x/Spinner.svelte` | Phase5 | TODO |
| InlineIcon | `packages/excalidraw/components/InlineIcon.tsx` | `src/lib/x/InlineIcon.svelte` | Phase5 | TODO |
| Card | `packages/excalidraw/components/Card.tsx` | `src/lib/x/Card.svelte` | Phase5 | TODO |
| Paragraph | `packages/excalidraw/components/Paragraph.tsx` | `src/lib/x/Paragraph.svelte` | Phase5 | TODO |

### 6d. Color & font pickers

| Feature / Component / Module | excalidraw-master source | Target Svelte path | Phase | Status |
|---|---|---|---|---|
| ColorPicker (root) | `packages/excalidraw/components/ColorPicker/ColorPicker.tsx` | `src/lib/x/colorpicker/ColorPicker.svelte` | Phase5 | TODO |
| ColorInput | `packages/excalidraw/components/ColorPicker/ColorInput.tsx` | `src/lib/x/colorpicker/ColorInput.svelte` | Phase5 | TODO |
| Picker | `packages/excalidraw/components/ColorPicker/Picker.tsx` | `src/lib/x/colorpicker/Picker.svelte` | Phase5 | TODO |
| PickerColorList | `packages/excalidraw/components/ColorPicker/PickerColorList.tsx` | `src/lib/x/colorpicker/PickerColorList.svelte` | Phase5 | TODO |
| ShadeList | `packages/excalidraw/components/ColorPicker/ShadeList.tsx` | `src/lib/x/colorpicker/ShadeList.svelte` | Phase5 | TODO |
| TopPicks | `packages/excalidraw/components/ColorPicker/TopPicks.tsx` | `src/lib/x/colorpicker/TopPicks.svelte` | Phase5 | TODO |
| CustomColorList | `packages/excalidraw/components/ColorPicker/CustomColorList.tsx` | `src/lib/x/colorpicker/CustomColorList.svelte` | Phase5 | TODO |
| PickerHeading | `packages/excalidraw/components/ColorPicker/PickerHeading.tsx` | `src/lib/x/colorpicker/PickerHeading.svelte` | Phase5 | TODO |
| HotkeyLabel | `packages/excalidraw/components/ColorPicker/HotkeyLabel.tsx` | `src/lib/x/colorpicker/HotkeyLabel.svelte` | Phase5 | TODO |
| colorPickerUtils | `packages/excalidraw/components/ColorPicker/colorPickerUtils.ts` | `src/lib/x/colorpicker/colorPickerUtils.ts` | Phase5 | TODO |
| ColorPicker keyboardNavHandlers | `packages/excalidraw/components/ColorPicker/keyboardNavHandlers.ts` | `src/lib/x/colorpicker/keyboardNavHandlers.ts` | Phase5 | TODO |
| EyeDropper | `packages/excalidraw/components/EyeDropper.tsx` | `src/lib/x/EyeDropper.svelte` | Phase5 | TODO |
| FontPicker (root) | `packages/excalidraw/components/FontPicker/FontPicker.tsx` | `src/lib/x/fontpicker/FontPicker.svelte` | Phase5 | TODO |
| FontPickerList | `packages/excalidraw/components/FontPicker/FontPickerList.tsx` | `src/lib/x/fontpicker/FontPickerList.svelte` | Phase5 | TODO |
| FontPickerTrigger | `packages/excalidraw/components/FontPicker/FontPickerTrigger.tsx` | `src/lib/x/fontpicker/FontPickerTrigger.svelte` | Phase5 | TODO |
| FontPicker keyboardNavHandlers | `packages/excalidraw/components/FontPicker/keyboardNavHandlers.ts` | `src/lib/x/fontpicker/keyboardNavHandlers.ts` | Phase5 | TODO |
| IconPicker | `packages/excalidraw/components/IconPicker.tsx` | `src/lib/x/IconPicker.svelte` | Phase5 | TODO |

### 6e. Menus (dropdown / main / context)

| Feature / Component / Module | excalidraw-master source | Target Svelte path | Phase | Status |
|---|---|---|---|---|
| DropdownMenu root | `packages/excalidraw/components/dropdownMenu/DropdownMenu.tsx` | `src/lib/x/dropdownMenu/DropdownMenu.svelte` | Phase5 | TODO |
| DropdownMenuContent | `packages/excalidraw/components/dropdownMenu/DropdownMenuContent.tsx` | `src/lib/x/dropdownMenu/DropdownMenuContent.svelte` | Phase5 | TODO |
| DropdownMenuGroup | `packages/excalidraw/components/dropdownMenu/DropdownMenuGroup.tsx` | `src/lib/x/dropdownMenu/DropdownMenuGroup.svelte` | Phase5 | TODO |
| DropdownMenuItem | `packages/excalidraw/components/dropdownMenu/DropdownMenuItem.tsx` | `src/lib/x/dropdownMenu/DropdownMenuItem.svelte` | Phase5 | TODO |
| DropdownMenuItemContent | `packages/excalidraw/components/dropdownMenu/DropdownMenuItemContent.tsx` | `src/lib/x/dropdownMenu/DropdownMenuItemContent.svelte` | Phase5 | TODO |
| DropdownMenuItemCheckbox | `packages/excalidraw/components/dropdownMenu/DropdownMenuItemCheckbox.tsx` | `src/lib/x/dropdownMenu/DropdownMenuItemCheckbox.svelte` | Phase5 | TODO |
| DropdownMenuItemContentRadio | `packages/excalidraw/components/dropdownMenu/DropdownMenuItemContentRadio.tsx` | `src/lib/x/dropdownMenu/DropdownMenuItemContentRadio.svelte` | Phase5 | TODO |
| DropdownMenuItemCustom | `packages/excalidraw/components/dropdownMenu/DropdownMenuItemCustom.tsx` | `src/lib/x/dropdownMenu/DropdownMenuItemCustom.svelte` | Phase5 | TODO |
| DropdownMenuItemLink | `packages/excalidraw/components/dropdownMenu/DropdownMenuItemLink.tsx` | `src/lib/x/dropdownMenu/DropdownMenuItemLink.svelte` | Phase5 | TODO |
| DropdownMenuSeparator | `packages/excalidraw/components/dropdownMenu/DropdownMenuSeparator.tsx` | `src/lib/x/dropdownMenu/DropdownMenuSeparator.svelte` | Phase5 | TODO |
| DropdownMenuSub | `packages/excalidraw/components/dropdownMenu/DropdownMenuSub.tsx` | `src/lib/x/dropdownMenu/DropdownMenuSub.svelte` | Phase5 | TODO |
| DropdownMenuSubContent | `packages/excalidraw/components/dropdownMenu/DropdownMenuSubContent.tsx` | `src/lib/x/dropdownMenu/DropdownMenuSubContent.svelte` | Phase5 | TODO |
| DropdownMenuSubTrigger | `packages/excalidraw/components/dropdownMenu/DropdownMenuSubTrigger.tsx` | `src/lib/x/dropdownMenu/DropdownMenuSubTrigger.svelte` | Phase5 | TODO |
| DropdownMenuTrigger | `packages/excalidraw/components/dropdownMenu/DropdownMenuTrigger.tsx` | `src/lib/x/dropdownMenu/DropdownMenuTrigger.svelte` | Phase5 | TODO |
| dropdownMenu common/utils | `packages/excalidraw/components/dropdownMenu/common.ts` + `dropdownMenuUtils.ts` | `src/lib/x/dropdownMenu/utils.ts` | Phase5 | TODO |
| MainMenu | `packages/excalidraw/components/main-menu/MainMenu.tsx` | `src/lib/x/MainMenu.svelte` | Phase5 | TODO |
| MainMenu DefaultItems | `packages/excalidraw/components/main-menu/DefaultItems.tsx` | `src/lib/x/MainMenuDefaultItems.svelte` | Phase5 | TODO |
| ContextMenu | `packages/excalidraw/components/ContextMenu.tsx` | `src/lib/x/ContextMenu.svelte` | Phase5 | TODO |
| Popover | `packages/excalidraw/components/Popover.tsx` | `src/lib/x/Popover.svelte` | Phase5 | TODO |
| PropertiesPopover | `packages/excalidraw/components/PropertiesPopover.tsx` | `src/lib/x/PropertiesPopover.svelte` | Phase5 | TODO |
| ConvertElementTypePopup | `packages/excalidraw/components/ConvertElementTypePopup.tsx` | `src/lib/x/ConvertElementTypePopup.svelte` | Phase5 | TODO |

### 6f. Footer / Stats / Hints / Toast / Tooltip

| Feature / Component / Module | excalidraw-master source | Target Svelte path | Phase | Status |
|---|---|---|---|---|
| Footer | `packages/excalidraw/components/footer/Footer.tsx` | `src/lib/x/Footer.svelte` | Phase5 | TODO |
| FooterCenter | `packages/excalidraw/components/footer/FooterCenter.tsx` | `src/lib/x/FooterCenter.svelte` | Phase5 | TODO |
| HintViewer | `packages/excalidraw/components/HintViewer.tsx` | `src/lib/x/HintViewer.svelte` | Phase5 | TODO |
| Toast | `packages/excalidraw/components/Toast.tsx` | `src/lib/x/Toast.svelte` | Phase5 | TODO |
| Tooltip | `packages/excalidraw/components/Tooltip.tsx` | `src/lib/x/Tooltip.svelte` | Phase5 | TODO |
| Stats (root panel) | `packages/excalidraw/components/Stats/index.tsx` | `src/lib/x/stats/Stats.svelte` | Phase5 | TODO |
| Stats Dimension | `packages/excalidraw/components/Stats/Dimension.tsx` | `src/lib/x/stats/Dimension.svelte` | Phase5 | TODO |
| Stats MultiDimension | `packages/excalidraw/components/Stats/MultiDimension.tsx` | `src/lib/x/stats/MultiDimension.svelte` | Phase5 | TODO |
| Stats Position | `packages/excalidraw/components/Stats/Position.tsx` | `src/lib/x/stats/Position.svelte` | Phase5 | TODO |
| Stats MultiPosition | `packages/excalidraw/components/Stats/MultiPosition.tsx` | `src/lib/x/stats/MultiPosition.svelte` | Phase5 | TODO |
| Stats Angle | `packages/excalidraw/components/Stats/Angle.tsx` | `src/lib/x/stats/Angle.svelte` | Phase5 | TODO |
| Stats MultiAngle | `packages/excalidraw/components/Stats/MultiAngle.tsx` | `src/lib/x/stats/MultiAngle.svelte` | Phase5 | TODO |
| Stats FontSize | `packages/excalidraw/components/Stats/FontSize.tsx` | `src/lib/x/stats/FontSize.svelte` | Phase5 | TODO |
| Stats MultiFontSize | `packages/excalidraw/components/Stats/MultiFontSize.tsx` | `src/lib/x/stats/MultiFontSize.svelte` | Phase5 | TODO |
| Stats DragInput | `packages/excalidraw/components/Stats/DragInput.tsx` | `src/lib/x/stats/DragInput.svelte` | Phase5 | TODO |
| Stats Collapsible | `packages/excalidraw/components/Stats/Collapsible.tsx` | `src/lib/x/stats/Collapsible.svelte` | Phase5 | TODO |
| Stats CanvasGrid | `packages/excalidraw/components/Stats/CanvasGrid.tsx` | `src/lib/x/stats/CanvasGrid.svelte` | Phase5 | TODO |
| Stats utils | `packages/excalidraw/components/Stats/utils.ts` | `src/lib/x/stats/utils.ts` | Phase5 | TODO |

### 6g. Sidebar / Library

| Feature / Component / Module | excalidraw-master source | Target Svelte path | Phase | Status |
|---|---|---|---|---|
| Sidebar | `packages/excalidraw/components/Sidebar/Sidebar.tsx` | `src/lib/x/sidebar/Sidebar.svelte` | Phase5 | TODO |
| SidebarHeader | `packages/excalidraw/components/Sidebar/SidebarHeader.tsx` | `src/lib/x/sidebar/SidebarHeader.svelte` | Phase5 | TODO |
| SidebarTabs | `packages/excalidraw/components/Sidebar/SidebarTabs.tsx` | `src/lib/x/sidebar/SidebarTabs.svelte` | Phase5 | TODO |
| SidebarTab | `packages/excalidraw/components/Sidebar/SidebarTab.tsx` | `src/lib/x/sidebar/SidebarTab.svelte` | Phase5 | TODO |
| SidebarTabTrigger(s) | `packages/excalidraw/components/Sidebar/SidebarTabTrigger.tsx` + `SidebarTabTriggers.tsx` | `src/lib/x/sidebar/SidebarTabTriggers.svelte` | Phase5 | TODO |
| SidebarTrigger | `packages/excalidraw/components/Sidebar/SidebarTrigger.tsx` | `src/lib/x/sidebar/SidebarTrigger.svelte` | Phase5 | TODO |
| Sidebar common | `packages/excalidraw/components/Sidebar/common.ts` | `src/lib/x/sidebar/common.ts` | Phase5 | TODO |
| DefaultSidebar | `packages/excalidraw/components/DefaultSidebar.tsx` | `src/lib/x/DefaultSidebar.svelte` | Phase5 | TODO |
| LibraryMenu | `packages/excalidraw/components/LibraryMenu.tsx` | `src/lib/x/library/LibraryMenu.svelte` | Phase5 | TODO |
| LibraryMenuItems | `packages/excalidraw/components/LibraryMenuItems.tsx` | `src/lib/x/library/LibraryMenuItems.svelte` | Phase5 | TODO |
| LibraryMenuSection | `packages/excalidraw/components/LibraryMenuSection.tsx` | `src/lib/x/library/LibraryMenuSection.svelte` | Phase5 | TODO |
| LibraryMenuHeaderContent | `packages/excalidraw/components/LibraryMenuHeaderContent.tsx` | `src/lib/x/library/LibraryMenuHeaderContent.svelte` | Phase5 | TODO |
| LibraryMenuControlButtons | `packages/excalidraw/components/LibraryMenuControlButtons.tsx` | `src/lib/x/library/LibraryMenuControlButtons.svelte` | Phase5 | TODO |
| LibraryMenuBrowseButton | `packages/excalidraw/components/LibraryMenuBrowseButton.tsx` | `src/lib/x/library/LibraryMenuBrowseButton.svelte` | Phase5 | TODO |
| LibraryUnit | `packages/excalidraw/components/LibraryUnit.tsx` | `src/lib/x/library/LibraryUnit.svelte` | Phase5 | TODO |
| useLibraryItemSvg hook | `packages/excalidraw/hooks/useLibraryItemSvg.ts` | `src/lib/x/library/libraryItemSvg.ts` | Phase5 | TODO |

### 6h. Dialogs

| Feature / Component / Module | excalidraw-master source | Target Svelte path | Phase | Status |
|---|---|---|---|---|
| Modal | `packages/excalidraw/components/Modal.tsx` | `src/lib/x/dialogs/Modal.svelte` | Phase5 | TODO |
| Dialog | `packages/excalidraw/components/Dialog.tsx` | `src/lib/x/dialogs/Dialog.svelte` | Phase5 | TODO |
| DialogActionButton | `packages/excalidraw/components/DialogActionButton.tsx` | `src/lib/x/dialogs/DialogActionButton.svelte` | Phase5 | TODO |
| ConfirmDialog | `packages/excalidraw/components/ConfirmDialog.tsx` | `src/lib/x/dialogs/ConfirmDialog.svelte` | Phase5 | TODO |
| ActiveConfirmDialog | `packages/excalidraw/components/ActiveConfirmDialog.tsx` | `src/lib/x/dialogs/ActiveConfirmDialog.svelte` | Phase5 | TODO |
| ImageExportDialog | `packages/excalidraw/components/ImageExportDialog.tsx` | `src/lib/x/dialogs/ImageExportDialog.svelte` | Phase6 | TODO |
| JSONExportDialog | `packages/excalidraw/components/JSONExportDialog.tsx` | `src/lib/x/dialogs/JSONExportDialog.svelte` | Phase6 | TODO |
| HelpDialog | `packages/excalidraw/components/HelpDialog.tsx` | `src/lib/x/dialogs/HelpDialog.svelte` | Phase5 | TODO |
| ErrorDialog | `packages/excalidraw/components/ErrorDialog.tsx` | `src/lib/x/dialogs/ErrorDialog.svelte` | Phase5 | TODO |
| OverwriteConfirm | `packages/excalidraw/components/OverwriteConfirm/OverwriteConfirm.tsx` | `src/lib/x/dialogs/OverwriteConfirm.svelte` | Phase5 | TODO |
| OverwriteConfirmActions | `packages/excalidraw/components/OverwriteConfirm/OverwriteConfirmActions.tsx` | `src/lib/x/dialogs/OverwriteConfirmActions.svelte` | Phase5 | TODO |
| OverwriteConfirmState | `packages/excalidraw/components/OverwriteConfirm/OverwriteConfirmState.ts` | `src/lib/x/dialogs/OverwriteConfirmState.svelte.ts` | Phase5 | TODO |
| ElementLinkDialog | `packages/excalidraw/components/ElementLinkDialog.tsx` | `src/lib/x/dialogs/ElementLinkDialog.svelte` | Phase5 | TODO |
| Hyperlink (link popup over element) | `packages/excalidraw/components/hyperlink/Hyperlink.tsx` | `src/lib/x/Hyperlink.svelte` | Phase5 | TODO |
| Hyperlink helpers | `packages/excalidraw/components/hyperlink/helpers.ts` | `src/lib/x/hyperlinkHelpers.ts` | Phase5 | TODO |

### 6i. Command palette / search / welcome

| Feature / Component / Module | excalidraw-master source | Target Svelte path | Phase | Status |
|---|---|---|---|---|
| CommandPalette | `packages/excalidraw/components/CommandPalette/CommandPalette.tsx` | `src/lib/x/CommandPalette.svelte` | Phase5 | TODO |
| defaultCommandPaletteItems | `packages/excalidraw/components/CommandPalette/defaultCommandPaletteItems.ts` | `src/lib/x/commandPaletteItems.ts` | Phase5 | TODO |
| CommandPalette types | `packages/excalidraw/components/CommandPalette/types.ts` | `src/lib/x/commandPaletteTypes.ts` | Phase5 | TODO |
| SearchMenu | `packages/excalidraw/components/SearchMenu.tsx` | `src/lib/x/SearchMenu.svelte` | Phase5 | TODO |
| QuickSearch | `packages/excalidraw/components/QuickSearch.tsx` | `src/lib/x/QuickSearch.svelte` | Phase5 | TODO |
| ScrollableList | `packages/excalidraw/components/ScrollableList.tsx` | `src/lib/x/ScrollableList.svelte` | Phase5 | TODO |
| WelcomeScreen | `packages/excalidraw/components/welcome-screen/WelcomeScreen.tsx` | `src/lib/x/welcome/WelcomeScreen.svelte` | Phase5 | TODO |
| WelcomeScreen.Center | `packages/excalidraw/components/welcome-screen/WelcomeScreen.Center.tsx` | `src/lib/x/welcome/WelcomeScreenCenter.svelte` | Phase5 | TODO |
| WelcomeScreen.Hints | `packages/excalidraw/components/welcome-screen/WelcomeScreen.Hints.tsx` | `src/lib/x/welcome/WelcomeScreenHints.svelte` | Phase5 | TODO |
| DarkModeToggle | `packages/excalidraw/components/DarkModeToggle.tsx` | `src/lib/x/DarkModeToggle.svelte` | Phase6 | TODO |
| Mobile shell (MobileMenu) | `packages/excalidraw/components/MobileMenu.tsx` | `src/lib/x/MobileMenu.svelte` | Phase5 | TODO |
| MobileToolBar | `packages/excalidraw/components/MobileToolBar.tsx` | `src/lib/x/MobileToolBar.svelte` | Phase5 | TODO |
| ElementCanvasButtons (link/embeddable buttons) | `packages/excalidraw/components/ElementCanvasButtons.tsx` | `src/lib/x/ElementCanvasButtons.svelte` | Phase5 | TODO |
| icons.tsx (SVG icon catalogue) | `packages/excalidraw/components/icons.tsx` | `src/lib/x/icons.ts` | Phase5 | TODO |

---

## 7. Theming / dark mode

| Feature / Component / Module | excalidraw-master source | Target Svelte path | Phase | Status |
|---|---|---|---|---|
| Theme stylesheet (light/dark CSS vars) | `packages/excalidraw/css/theme.scss` | `src/lib/x/theme.css` | Phase6 | TODO |
| CSS variables module | `packages/excalidraw/css/variables.module.scss` | `src/lib/x/variables.css` | Phase6 | TODO |
| Global app styles | `packages/excalidraw/css/app.scss` + `styles.scss` | `src/lib/x/app.css` | Phase6 | TODO |
| THEME constant + getDefaultAppState theme | `packages/common/src/constants.ts` (THEME) | `src/lib/common/constants.ts` (covered in §1b) | Phase6 | TODO |
| DARK_THEME_FILTER (canvas invert filter) | `packages/common/src/constants.ts` (THEME_FILTER) | `src/lib/draw/themeFilter.ts` | Phase6 | TODO |
| Canvas filter application (static/interactive theme filter) | `packages/excalidraw/renderer/staticScene.ts` (theme filter usage) | covered in §4 staticScene | Phase6 | TODO |
| App-theme handling (system / explicit theme) | `excalidraw-app/useHandleAppTheme.ts` | `src/lib/x/useAppTheme.svelte.ts` | Phase6 | TODO |

---

## 8. Persistence

| Feature / Component / Module | excalidraw-master source | Target Svelte path | Phase | Status |
|---|---|---|---|---|
| localStorage (save/load scene + appState keys) | `excalidraw-app/data/localStorage.ts` | `src/lib/persistence/localStorage.ts` | Phase6 | TODO |
| LocalData (debounced save orchestration, file storage) | `excalidraw-app/data/LocalData.ts` | `src/lib/persistence/LocalData.svelte.ts` | Phase6 | TODO |
| EditorLocalStorage (typed editor storage keys) | `packages/excalidraw/data/EditorLocalStorage.ts` | `src/lib/persistence/EditorLocalStorage.ts` | Phase6 | TODO |
| restore (restoreElements / restoreAppState / restore) | `packages/excalidraw/data/restore.ts` | `src/lib/persistence/restore.ts` | Phase6 | TODO |
| json (serializeAsJSON, loadFromBlob, isValidExcalidrawData) | `packages/excalidraw/data/json.ts` | `src/lib/persistence/json.ts` | Phase6 | TODO |
| blob (loadFromBlob, getFileFromEvent) | `packages/excalidraw/data/blob.ts` | `src/lib/persistence/blob.ts` | Phase6 | TODO |
| image (data-url / file helpers) | `packages/excalidraw/data/image.ts` | `src/lib/persistence/image.ts` | Phase4 | TODO |
| filesystem (fileOpen/fileSave via browser-fs-access) | `packages/excalidraw/data/filesystem.ts` | `src/lib/persistence/filesystem.ts` | Phase6 | TODO |
| library (Library class, loadLibraryData, mergeLibraryItems) | `packages/excalidraw/data/library.ts` | `src/lib/persistence/library.svelte.ts` | Phase6 | TODO |
| data index (loadScene, exportCanvas, prepareElementsForExport) | `packages/excalidraw/data/index.ts` | `src/lib/persistence/index.ts` | Phase6 | TODO |
| data types | `packages/excalidraw/data/types.ts` | `src/lib/persistence/types.ts` | Phase6 | TODO |
| encode (compression helpers for export) | `packages/excalidraw/data/encode.ts` | `src/lib/persistence/encode.ts` | Phase6 | TODO |
| clipboard (copy/paste elements, parseClipboard) | `packages/excalidraw/clipboard.ts` | `src/lib/persistence/clipboard.ts` | Phase6 | TODO |
| Scene export (exportToCanvas / exportToSvg) | `packages/excalidraw/scene/export.ts` | `src/lib/persistence/export.ts` | Phase6 | TODO |
| utils export (exportToBlob / exportToSvg wrappers) | `packages/utils/src/export.ts` | `src/lib/persistence/exportUtils.ts` | Phase6 | TODO |

---

## 9. Keyboard shortcuts

| Feature / Component / Module | excalidraw-master source | Target Svelte path | Phase | Status |
|---|---|---|---|---|
| Shortcut registry (getShortcutFromShortcutName) | `packages/excalidraw/actions/shortcuts.ts` | `src/lib/draw/shortcuts.ts` | Phase3 | TODO |
| Shortcut key formatting (getShortcutKey) | `packages/excalidraw/shortcut.ts` | `src/lib/common/shortcut.ts` | Phase3 | TODO |
| Tool keybindings (shapes.tsx key map) | `packages/excalidraw/components/shapes.tsx` | covered in §6b Toolbar | Phase3 | TODO |
| Global keydown/keyup dispatch (App key handlers) | `packages/excalidraw/components/App.tsx` (key handlers) | `src/lib/draw/keyboard.svelte.ts` | Phase3 | TODO |
| HelpDialog shortcut tables (rendered shortcut help) | `packages/excalidraw/components/HelpDialog.tsx` | covered in §6h HelpDialog | Phase5 | TODO |

---

## 10. Explicitly OUT OF SCOPE — do NOT port

These exist in `excalidraw-master` but are intentionally excluded. Listed so a sub-agent
never accidentally claims them. Status `N/A`.

### 10a. Real-time collaboration

| Module | excalidraw-master source | Status |
|---|---|---|
| Collab orchestrator | `excalidraw-app/collab/Collab.tsx` | N/A |
| Collab error UI | `excalidraw-app/collab/CollabError.tsx` | N/A |
| Collab Portal (socket) | `excalidraw-app/collab/Portal.tsx` | N/A |
| Firebase backend | `excalidraw-app/data/firebase.ts` | N/A |
| FileManager (remote files) | `excalidraw-app/data/FileManager.ts` | N/A |
| fileStatusStore | `excalidraw-app/data/fileStatusStore.ts` | N/A |
| Encryption (E2EE for collab) | `packages/excalidraw/data/encryption.ts` | N/A |
| reconcile (CRDT-ish merge) | `packages/excalidraw/data/reconcile.ts` | N/A |
| tabSync / Locker (multi-tab collab) | `excalidraw-app/data/tabSync.ts`, `Locker.ts` | N/A |
| Share dialog / QR code | `excalidraw-app/share/*` | N/A |
| FollowMode | `packages/excalidraw/components/FollowMode/FollowMode.tsx` | N/A |
| UserList / Avatar (collab presence) | `packages/excalidraw/components/UserList.tsx`, `Avatar.tsx` | N/A |
| LiveCollaborationTrigger | `packages/excalidraw/components/live-collaboration/LiveCollaborationTrigger.tsx` | N/A |
| clients (collab client colors) | `packages/excalidraw/clients.ts` | N/A |

### 10b. AI / LLM features

| Module | excalidraw-master source | Status |
|---|---|---|
| Text-to-diagram / Mermaid dialog (entire tree) | `packages/excalidraw/components/TTDDialog/**` | N/A |
| mermaid integration | `packages/excalidraw/mermaid.ts` | N/A |
| AI data types | `packages/excalidraw/data/ai/types.ts` | N/A |
| AI app component | `excalidraw-app/components/AI.tsx` | N/A |
| MagicButton / DiagramToCodePlugin | `packages/excalidraw/components/MagicButton.tsx`, `DiagramToCodePlugin/*` | N/A |
| Excalidraw+ promo / export | `excalidraw-app/components/ExcalidrawPlus*.tsx`, `ExportToExcalidrawPlus.tsx` | N/A |
| TTD storage | `excalidraw-app/data/TTDStorage.ts` | N/A |

### 10c. i18n / multi-language

| Module | excalidraw-master source | Status |
|---|---|---|
| i18n runtime | `packages/excalidraw/i18n.ts` | N/A |
| Trans component | `packages/excalidraw/components/Trans.tsx` | N/A |
| Language detector / state / list | `excalidraw-app/app-language/*` | N/A |
| deburr (locale string helper) | `packages/excalidraw/deburr.ts` | N/A |

### 10d. excalidraw-app server bits & misc out-of-scope

| Module | excalidraw-master source | Status |
|---|---|---|
| App entry / root (`excalidraw-app/App.tsx`, `index.tsx`, `app_constants.ts`, `app-jotai.ts`) | `excalidraw-app/*` | N/A |
| Sentry / analytics | `excalidraw-app/sentry.ts`, `packages/excalidraw/analytics.ts` | N/A |
| Charts (paste chart from spreadsheet) | `packages/excalidraw/charts/**`, `PasteChartDialog.tsx` | N/A |
| Font subsetting (harfbuzz/woff2 wasm) | `packages/excalidraw/subset/**` | N/A |
| Embeddable iframe runtime (validation kept via §2 embeddable, UI deferred) | `excalidraw-app/ExcalidrawPlusIframeExport.tsx` | N/A |
| DebugCanvas / visualdebug | `excalidraw-app/components/DebugCanvas.tsx`, `packages/element/src/visualdebug.ts` | N/A |
| PublishLibrary (publish to public registry) | `packages/excalidraw/components/PublishLibrary.tsx` | N/A |
| jotai state atoms (replaced by Svelte runes) | `packages/excalidraw/editor-jotai.ts` | N/A |

---

## 11. Phase8 — Tauri shell (project-specific, not in excalidraw-master)

| Feature / Component / Module | Source / basis | Target path | Phase | Status |
|---|---|---|---|---|
| Tauri command/plugin registration | existing `src-tauri/src/lib.rs` | `src-tauri/src/lib.rs` | Phase8 | TODO |
| Tauri capabilities / FS permissions | existing `src-tauri/capabilities/` | `src-tauri/capabilities/` | Phase8 | TODO |
| SvelteKit SPA shell (ssr=false, adapter-static) | existing `src/routes/+layout.ts` | `src/routes/+layout.ts` + `+page.svelte` | Phase8 | TODO |
| Filesystem bridge (Tauri plugin-fs over browser-fs-access) | n/a — wraps §8 filesystem | `src/lib/persistence/tauriFs.ts` | Phase8 | TODO |
