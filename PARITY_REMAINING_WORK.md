# Excalidraw Parity — Remaining Work, Evidence & Continuation Prompt

**Branch:** `feat/excalidraw-parity-gaps` · **As of:** 2026-06-13 · **pnpm:** 11.6.0 (pinned, consistent)

This is the single source of truth for finishing the web-editor (`/x`, `src/lib/x/`) parity
campaign against `excalidraw-master`. It lists **what's done (with runtime evidence)**, **what's
left (with the exact ported function to wire)**, **every file involved**, and a **ready-to-paste
continuation prompt**.

---

## 0. The one principle that drives every fix

The end-to-end audit (`PARITY_E2E_AUDIT.md`, `PARITY_E2E_FINDINGS.json`) proved by `diff` that the
ported **pure-logic + renderer** layers are **byte-identical** to upstream:
`src/lib/math`, `src/lib/element`, `src/lib/common`, `src/lib/utils`, `src/lib/fractional-indexing`,
and the renderer files (`renderElement`, `staticScene`, `interactiveScene`, `shape.ts`/`ShapeCache`).

➡️ **Therefore: never re-author ported logic. The bug is almost always that
`src/lib/x/draw-controller.svelte.ts` (or `EditorPreview.svelte`) doesn't CALL the byte-identical
helper that already exists in-repo.** Each fix = wire the existing function, then prove it with a
differential probe that asserts our output equals what the upstream rule computes.

**Verification recipe per fix (non-negotiable):**
1. Read the upstream reference (`excalidraw-master/...`) — cite file:line.
2. Wire the ported helper in the controller / EditorPreview.
3. `pnpm check` → 0/0. svelte autofixer on touched `.svelte`/`.svelte.ts` → clean.
4. Write `scripts/probe-x-fixNN-*.mjs` — a **differential** probe (assert our value == the upstream
   rule's value), driving `window.__draw` (+ `window.__shapeCache`) via headless Chrome.
5. `pnpm test` (172) green + relevant existing probes green (no regression).
6. Commit + push (one bug per commit), citing the rule + evidence in the message.

Dev server: `pnpm dev` (http://localhost:1420/x). Probes: `node scripts/probe-x-fixNN-*.mjs`
(exit 0 = pass). Test hooks live at `EditorPreview.svelte:70-74` (`window.__draw`, `window.__shapeCache`).

---

## 1. DONE — Tier 1 + Tier 2 + Tier 3 + Tier 4 complete, all entries probe-verified & pushed

Each completed row below landed as an isolated commit with a dedicated probe. Every commit also
passed `pnpm check` 0/0 + 172 unit tests + the relevant existing regression probes.

| Bug | Commit | Fix (wired the ported fn) | Evidence probe |
|---|---|---|---|
| #1 stale shape-cache on style edit | `3731960` | `ShapeCache.delete` per style mutation (= upstream `newElementWith` fresh ref) | `probe-x-fix01-stylecache.mjs` |
| #2 multi-point linear creation | `f1a2dde` | click starts `multiElement`-style line/arrow creation; move rubber-bands; clicks commit; Enter/Escape/dbl-click finalize | `probe-x-fix02-multipoint-linear.mjs` |
| #3/#4 roundness ignored at create | `39db1ff` | `#getCurrentItemRoundness` (App.tsx:9500) into line+generic create | `probe-x-fix03-roundness-create.mjs` |
| #5 frame parenting on create | `7156bcc` | `#topLayerFrameAtSceneCoords` at pointerDown → new elements get `frameId` | `probe-x-fix05-frame-parenting.mjs` |
| #6 creation origin not grid-snapped | `b19ecfa` | `getGridPoint(x,y, ctrl?null:effectiveGridSize)` | `probe-x-fix06-gridsnap-create.mjs` |
| #7 text tool container binding | `3b0380a` | `getTextBindableContainerAtPosition` + `hasBoundTextElement`; click container creates/reopens bound text | `probe-x-fix07-text-container-binding.mjs` |
| #8 double-click text editing flow | `0b63fd0` | selection-mode double-click edits text, creates free text on canvas, or opens bound text on containers | `probe-x-fix08-double-click-text.mjs` |
| #9 text editor camera transform | `33dff27` | `sceneCoordsToViewportCoords` positions editor overlay and scales dimensions/font by zoom | `probe-x-fix09-text-editor-camera.mjs` |
| #10 edited text double-renders | `f0c4c70` | active `editingTextId` is filtered from static render element list/map while textarea owns editing | `probe-x-fix10-hide-editing-text-render.mjs` |
| #11 image resize aspect-lock | `63dc6f7` | image selections invert `shouldMaintainAspectRatio`: no-Shift locks, Shift frees distortion | `probe-x-fix11-image-aspect-lock.mjs` |
| #12 resize handle teleports | `e9fcf4d` | `getResizeOffsetXY` captured + subtracted on move | `probe-x-fix12-resize-offset.mjs` |
| #13/#16 group selection/outline | `63d1798` | `selectGroupsForSelectedElements` in `#setSelection` | `probe-x-fix13-group-selection.mjs` |
| #15 dbl-click deep-enter group | `e0d8230` | `#enterGroup` (App.tsx:6533) sets `editingGroupId` | `probe-x-fix15-dblclick-group.mjs` |
| #17 eraser trail | `3c075af` | eraser strokes accumulate segment intersections, delete on pointer-up, support all-hit click fallback and one-gesture undo | `probe-x-fix17-eraser-trail.mjs` |
| #18/#19 arrow endpoint re/un-bind | `f7b4c8b` | `bindOrUnbindBindingElement` on linear pointer-up | `probe-x-fix18-endpoint-rebind.mjs` |
| #21 arrow type conversion geometry | `663fe6e` | `changeArrowType` rebuilds from absolute endpoints, resets elbow x/y/angle, reroutes/rebinds | `probe-x-fix21-arrow-type-conversion.mjs` |
| #22 line/arrow finalize selection | `e120372` | finalize selects created linear element + installs `LinearElementEditor` | `probe-x-fix22-linear-finalize-selection.mjs` |
| #23 linear editor modifier forwarding | `684e2ae` | real Cmd/Ctrl modifiers flow into `#linearEvent` so grid-bypass works | `probe-x-fix23-linear-modifiers.mjs` |
| #24 font-size doesn't re-anchor | `9099714` | port `offsetElementAfterFontResize` (actionProperties.tsx:230) | `probe-x-fix24-fontsize-anchor.mjs` |
| #25 active tool lock ignored | `283bdba` | `activeToolLocked` + Q toggle; creation reset gated by lock state | `probe-x-fix25-tool-lock.mjs` |
| #26 plaintext paste envelope | `fbdbd1a` | `pasteAsPlaintext` parses Excalidraw clipboard envelopes before text fallback | `probe-x-fix26-plain-paste-envelope.mjs` |
| #27/#28 text paste split/plain/wrap | `248f736` | `isPlainPaste ? [text] : text.split("\n")`, cursor-centering, max-width wrapping | `probe-x-fix27-28-text-paste.mjs` |
| #29 sloppiness doesn't re-seed | `91b9fbf` | `{ seed: randomInteger(), roughness }` (actionProperties.tsx:611) | `probe-x-fix29-sloppiness-seed.mjs` |
| #30 setEdges wrong radius/elbow | `a14df6a` | per-type `isUsingAdaptiveRadius` + skip elbow (actionProperties.tsx:1499) | `probe-x-fix30-setedges-pertype.mjs` |
| #31 naive delete | `46255a9` | port `deleteSelectedElements` + `fixBindingsAfterDeletion` | `probe-x-fix31-delete.mjs` |
| #32 Delete key fires with Cmd/Ctrl held | `1bb3bb3` | keyboard delete guard skips when Cmd/Ctrl is held (`actionDeleteSelected` key rule) | `probe-x-fix32-delete-modifier-guard.mjs` |
| #33 duplicate breaks groups | `a05df17` | batch `duplicateElements({type:'in-place'})` shared groupIdMap | `probe-x-fix33-duplicate-group.mjs` |
| #34 selectAll grabs locked/bound | `4aedafe` | `actionSelectAll` filter `!locked && !(text&&containerId)` | `probe-x-fix34-selectall-filter.mjs` |
| #36 flip drifts/no swap/no rebind | `1b37569` | 3 branches: arrowhead swap, `bindOrUnbindBindingElements`, recenter | `probe-x-fix36-flip.mjs` |
| #35/#37/#38/#42/#43 keyboard | `2c67468` | z-order chords (event.code+Darwin Alt), lock, align, zoom, view/zen | `probe-x-fix35-keyboard.mjs` |
| #39 align guard | `b709f03` | `getSelectedElementsByGroup(...).length > 1` and frame-like selection exclusion | `probe-x-fix39-align-guard.mjs` |
| #40 reset-zoom loses viewport center | `1b66a2d` | `getStateForZoom({viewportX:w/2,viewportY:h/2,nextZoom:1})` | `probe-x-fix40-reset-zoom-center.mjs` |
| #41 zoom-to-fit uses 0.85 multiplier | `95b632e` | `zoomValueToFitBoundsOnViewport` cap + `roundToStep` floor | `probe-x-fix41-zoom-to-fit.mjs` |
| #44 Shift+wheel vertical-pans | `156e7cd` | Shift branch pans X by `(deltaY || deltaX) / zoom` | `probe-x-fix44-shift-wheel-horizontal.mjs` |
| #52 line→polygon background fill | `50c6083` | non-transparent background on selected closeable lines applies `toggleLinePolygonState(line, true)` | `probe-x-fix52-line-polygon-background.mjs` |
| #48–72 stub modules | `d3f6ac9` | replaced six Excalidraw stubs with concrete local-safe clipboard, clients, i18n, library, data, and action surfaces | `probe-x-fix48-72-stub-modules.mjs` |
| #bound-text style propagation | `ea946ea` | stroke/opacity/text-style actions expand selected containers to their bound text labels | `probe-x-fix-bound-text-style-propagation.mjs` |
| UI empty-canvas panels | `e4731d5` | `showProperties` (= `showSelectedShapeActions`) + `statsOpen` gate; Alt+/ toggles stats | `probe-x-fixUI-panel-visibility.mjs` |

**Precision wins (audit wording was looser than real upstream — verified against source):**
- #13 box-selection runs in `"contain"` mode (`selection.ts:347-363`): a partial-group box selects
  *nothing*; only a whole-group box selects. Probe asserts the true contract + a control case.
- #24 font re-anchor formula keeps the *center* fixed for center-aligned text (not just "moves").

---

## 2. REMAINING — the real to-do list (one bug per commit, same recipe)

### Tier 1 — Wiring fixes

✅ Complete. All Tier 1 rows are now in the DONE table above.

### Tier 2 — Text cluster

✅ Complete. All Tier 2 rows are now in the DONE table above.

### Tier 3 — Property partials

✅ Complete. All Tier 3 rows are now in the DONE table above.

### Tier 4 — Heavy ports (real work, NOT wiring — do last)

✅ Complete. All Tier 4 rows are now in the DONE table above.

### Tier 5 — Visual / layout fidelity (the `/x` page "looks off" vs Excalidraw)

These are NOT behavioral bugs (the functions compute correctly) — they're how the chrome
*looks*. Different verification: screenshot `/x` headless, compare to real Excalidraw's CSS, fix the
markup/CSS, re-screenshot. Drive via `/tmp/shot.mjs` pattern (headless Chrome → `Page.captureScreenshot`).

| Item | Symptom | Where | Status |
|---|---|---|---|
| **Empty-canvas panels** | properties + stats panels showed on empty canvas | `EditorPreview.svelte` + `showProperties`/`statsOpen` getters | ✅ **DONE** (`e4731d5`, probe `probe-x-fixUI-panel-visibility.mjs`) |
| **Panel is two detached islands** | Stroke/width was one floating box, Fill/Sloppiness/Edges/Opacity a separate detached box below — now one continuous rounded panel | `EditorPreview.svelte` `.properties` + transparent internal controls in `StyleControls.svelte` / `TextControls.svelte` / `ArrowheadControls.svelte` | ✅ **DONE** (`5be217c`, probe `probe-x-fixUI-single-properties-panel.mjs`) |
| **Welcome screen sparse** | only title + 2 links; upstream centers logo + "All your data is saved locally" + richer menu-hint cluster | `WelcomeScreen.svelte` vs `welcome-screen/` | ✅ **DONE** (`f27a498`, probe `probe-x-fixUI-welcome-screen.mjs`) |
| **Toolbar/island spacing & sizing** | verify glyph size, island padding, gaps, active-state vs upstream `.Island`/`.App-toolbar` CSS | `Toolbar`/`EditorPreview.svelte` + `theme.css` | ⬜ TODO (audit) |
| **Footer / zoom cluster** | confirm position, separators, undo/redo styling vs upstream `.footer` | `EditorPreview.svelte` footer + `theme.css` | ⬜ TODO (audit) |
| **Color picker / shade ramp layout** | confirm popover layout, top-picks row, hex input vs `ColorPicker/` | `ColorPicker.svelte` | ⬜ TODO (audit) |

Reference CSS: `excalidraw-master/packages/excalidraw/css/` and per-component `.scss` files.
Our tokens/layout: `src/lib/x/css/theme.css`.

---

## 3. Every file in play

**Edit targets (where fixes land):**
- `src/lib/x/draw-controller.svelte.ts` — the controller (most fixes)
- `src/lib/x/EditorPreview.svelte` — keyboard/wheel handlers, text-editor overlay, render-map, test hooks
- `src/routes/x/+page.svelte` — page-level key handling (a few)
- `src/lib/x/*.svelte` (StyleControls, TextControls, ColorPicker, ArrowheadControls, ContextMenu, MainMenu, …) — UI panels if a control is missing

**Ported helpers to call (byte-identical to upstream — do NOT modify):**
- `src/lib/element/` — `selectGroupsForSelectedElements`, `getResizeOffsetXY`, `duplicateElements`,
  `bindOrUnbindBindingElement(s)`, `fixBindingsAfterDeletion`, `deleteSelectedElements`-equivalents,
  `getTopLayerFrameAtSceneCoords`, `LinearElementEditor`, `redrawTextBoundingBox`, `isUsingAdaptiveRadius`,
  `isElbowArrow`, `getContainerElement`, `getBoundTextElement`, `getTextBindableContainerAtPosition`
- `src/lib/common/` — `getGridPoint`, `randomInteger`, `CODES`, `isDarwin`, `viewportCoordsToSceneCoords`,
  `sceneCoordsToViewportCoords`, `arrayToMap`, `DEFAULT_GRID_SIZE`
- `src/lib/excalidraw/renderer/` — renderers (read-only; they consume state the controller must set)

**Reference (read-only, never edit):** `excalidraw-master/packages/excalidraw/{components/App.tsx,actions/*,scene/*}`

**Evidence/probes:** `scripts/probe-x-fix*.mjs` (this campaign), `scripts/probe-x-*.mjs` (prior batches —
run as regression). Audit: `PARITY_E2E_AUDIT.md`, `PARITY_E2E_FINDINGS.json`.

---

## 4. ▶︎ CONTINUATION PROMPT (paste this to resume)

> Continue the Excalidraw web-editor parity campaign on branch `feat/excalidraw-parity-gaps`. Read
> `PARITY_REMAINING_WORK.md` first — it has the principle, the done-list with evidence, and the
> remaining visual-fidelity items.
>
> Tier 1–4 behavioral parity is complete. Work through the Tier 5 visual-fidelity table one item per
> commit. For EACH item: screenshot `/x` headless, compare against the relevant upstream Excalidraw
> CSS/component source, adjust `EditorPreview.svelte` / `src/lib/x/*.svelte` / `theme.css`, run
> `pnpm check` (must be 0/0) and the svelte autofixer on touched files, add or update a visual probe,
> run `pnpm test` (172) + relevant existing probes for no-regression, then commit + push citing the
> runtime evidence.
>
> 1000% precision: if the audit's wording differs from `excalidraw-master` source, the source wins —
> verify the real contract (e.g. box-selection "contain" mode). Start the dev server with `pnpm dev`.
> Don't touch `pnpm-lock.yaml` unless a dependency genuinely changes. Keep `PARITY_REMAINING_WORK.md`
> and `CHANGELOG.md` updated as you go.

### 4b. ▶︎ VISUAL-FIDELITY PROMPT (the `/x` page "looks off" — paste to resume Tier 5)

> The `/x` web editor's chrome still looks off vs real Excalidraw. Work through the **Tier 5** table
> in `PARITY_REMAINING_WORK.md` (§2), one item per commit. This track is VISUAL, not behavioral, so
> the recipe differs: (1) screenshot `/x` headless — adapt the `/tmp/shot.mjs` pattern (headless
> Chrome → `Page.captureScreenshot` → PNG) for the relevant state (empty canvas, tool active, element
> selected); (2) compare against real Excalidraw's CSS in
> `excalidraw-master/packages/excalidraw/css/` and the per-component `.scss`; (3) fix the markup/CSS
> in `src/lib/x/*.svelte` + `src/lib/x/css/theme.css` (match spacing, sizing, island grouping, tokens
> — cite the upstream value); (4) run `pnpm check` 0/0 + svelte autofixer on touched files; (5)
> **re-screenshot and visually confirm the before/after**; (6) commit + push with the before/after
> noted. Where a layout invariant can be asserted programmatically (e.g. "panel visible only when X"),
> also add a `scripts/probe-x-fixUI-*.mjs` probe like `probe-x-fixUI-panel-visibility.mjs`. Start with
> the **two-detached-islands** item (the style panel should be ONE continuous rounded panel) and the
> **sparse welcome screen**. Don't touch `pnpm-lock.yaml`. Keep this doc + `CHANGELOG.md` updated.
