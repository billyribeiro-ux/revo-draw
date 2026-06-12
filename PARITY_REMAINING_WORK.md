# Excalidraw Parity — Remaining Work, Evidence & Continuation Prompt

**Branch:** `feat/excalidraw-parity-gaps` · **As of:** 2026-06-12 · **pnpm:** 11.6.0 (pinned, consistent)

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

## 1. DONE — 20 fixes, 24 audit findings, all probe-verified & pushed

All 20 fix-probes pass (`for p in scripts/probe-x-fix*.mjs; do node "$p"; done` → **20/20 PASS**).
Every commit also passed `pnpm check` 0/0 + 172 unit tests + the existing regression probes.

| Bug | Commit | Fix (wired the ported fn) | Evidence probe |
|---|---|---|---|
| #1 stale shape-cache on style edit | `3731960` | `ShapeCache.delete` per style mutation (= upstream `newElementWith` fresh ref) | `probe-x-fix01-stylecache.mjs` |
| #3/#4 roundness ignored at create | `39db1ff` | `#getCurrentItemRoundness` (App.tsx:9500) into line+generic create | `probe-x-fix03-roundness-create.mjs` |
| #6 creation origin not grid-snapped | `b19ecfa` | `getGridPoint(x,y, ctrl?null:effectiveGridSize)` | `probe-x-fix06-gridsnap-create.mjs` |
| #12 resize handle teleports | `e9fcf4d` | `getResizeOffsetXY` captured + subtracted on move | `probe-x-fix12-resize-offset.mjs` |
| #13/#16 group selection/outline | `63d1798` | `selectGroupsForSelectedElements` in `#setSelection` | `probe-x-fix13-group-selection.mjs` |
| #15 dbl-click deep-enter group | `e0d8230` | `#enterGroup` (App.tsx:6533) sets `editingGroupId` | `probe-x-fix15-dblclick-group.mjs` |
| #18/#19 arrow endpoint re/un-bind | `f7b4c8b` | `bindOrUnbindBindingElement` on linear pointer-up | `probe-x-fix18-endpoint-rebind.mjs` |
| #24 font-size doesn't re-anchor | `9099714` | port `offsetElementAfterFontResize` (actionProperties.tsx:230) | `probe-x-fix24-fontsize-anchor.mjs` |
| #29 sloppiness doesn't re-seed | `91b9fbf` | `{ seed: randomInteger(), roughness }` (actionProperties.tsx:611) | `probe-x-fix29-sloppiness-seed.mjs` |
| #30 setEdges wrong radius/elbow | `a14df6a` | per-type `isUsingAdaptiveRadius` + skip elbow (actionProperties.tsx:1499) | `probe-x-fix30-setedges-pertype.mjs` |
| #31 naive delete | `46255a9` | port `deleteSelectedElements` + `fixBindingsAfterDeletion` | `probe-x-fix31-delete.mjs` |
| #32 Delete key fires with Cmd/Ctrl held | `1bb3bb3` | keyboard delete guard skips when Cmd/Ctrl is held (`actionDeleteSelected` key rule) | `probe-x-fix32-delete-modifier-guard.mjs` |
| #33 duplicate breaks groups | `a05df17` | batch `duplicateElements({type:'in-place'})` shared groupIdMap | `probe-x-fix33-duplicate-group.mjs` |
| #34 selectAll grabs locked/bound | `4aedafe` | `actionSelectAll` filter `!locked && !(text&&containerId)` | `probe-x-fix34-selectall-filter.mjs` |
| #36 flip drifts/no swap/no rebind | `1b37569` | 3 branches: arrowhead swap, `bindOrUnbindBindingElements`, recenter | `probe-x-fix36-flip.mjs` |
| #35/#37/#38/#42/#43 keyboard | `2c67468` | z-order chords (event.code+Darwin Alt), lock, align, zoom, view/zen | `probe-x-fix35-keyboard.mjs` |
| #40 reset-zoom loses viewport center | `1b66a2d` | `getStateForZoom({viewportX:w/2,viewportY:h/2,nextZoom:1})` | `probe-x-fix40-reset-zoom-center.mjs` |
| #41 zoom-to-fit uses 0.85 multiplier | `95b632e` | `zoomValueToFitBoundsOnViewport` cap + `roundToStep` floor | `probe-x-fix41-zoom-to-fit.mjs` |
| #44 Shift+wheel vertical-pans | `156e7cd` | Shift branch pans X by `(deltaY || deltaX) / zoom` | `probe-x-fix44-shift-wheel-horizontal.mjs` |
| UI empty-canvas panels | `e4731d5` | `showProperties` (= `showSelectedShapeActions`) + `statsOpen` gate; Alt+/ toggles stats | `probe-x-fixUI-panel-visibility.mjs` |

**Precision wins (audit wording was looser than real upstream — verified against source):**
- #13 box-selection runs in `"contain"` mode (`selection.ts:347-363`): a partial-group box selects
  *nothing*; only a whole-group box selects. Probe asserts the true contract + a control case.
- #24 font re-anchor formula keeps the *center* fixed for center-aligned text (not just "moves").

---

## 2. REMAINING — the real to-do list (one bug per commit, same recipe)

### Tier 1 — Wiring fixes (fast; the ported fn exists, just call it)

| Bug | What's wrong | Wire this (upstream ref) | Primary file(s) |
|---|---|---|---|
| **#21** | arrow type↔elbow conversion doesn't reposition x/y, reset angle, rebuild points, rebind | port `changeArrowType` (`actionProperties.tsx:1803-1965`) | `draw-controller.svelte.ts` (~`setArrowType`/`#convertArrowType`) |
| **#5** | new elements never parented to frame under cursor (`frameId` always null) | `getTopLayerFrameAtSceneCoords` at pointerDown → pass `frameId` to create | `draw-controller.svelte.ts` create branches (~2375-2490) |
| **#22** | drawn line/arrow not auto-selected; no `LinearElementEditor` | set `selectedElementIds`+`selectedLinearElement` on finalize (App.tsx:10934) | `draw-controller.svelte.ts` linear finalize (~3060) |
| **#23** | linear point-editor Cmd/Ctrl hard-coded false (grid-bypass dead) | forward real `ctrlKey`/`metaKey` into `#linearEvent` | `draw-controller.svelte.ts:2069` `#linearEvent` |
| **#25** | tool always reverts to selection; `activeTool.locked` (tool pin / Q) not honored | add tool-lock state; gate reset on `!locked` | `draw-controller.svelte.ts` + `EditorPreview.svelte` |
| **#26** | `pasteAsPlaintext` ignores excalidraw envelope (pastes raw JSON as text) | parse `data.elements` branch first (App.tsx:3762) | `draw-controller.svelte.ts:~1370` |
| **#27/#28** | plain paste: no newline-split, no center-on-cursor, no wrap | `isPlainPaste ? [text] : text.split("\n")` + center/wrap (App.tsx:4158) | `draw-controller.svelte.ts:~1409` |
| **#39** | `alignSelected` guards on element count not group count; no frame-exclusion | guard on `getSelectedElementsByGroup(...).length>1 && !some(isFrameLikeElement)` | `draw-controller.svelte.ts` `alignSelected` |

### Tier 2 — Text cluster (medium; helpers ported, editor wiring needed)

| Bug | What's wrong | Wire this (upstream ref) | Primary file(s) |
|---|---|---|---|
| **#7** | text tool always drops free-floating empty text; no container binding / edit-existing | `getTextBindableContainerAtPosition` + `hasBoundTextElement` (App.tsx:8965) | `draw-controller.svelte.ts:~2316` text-tool branch |
| **#8** | double-click on canvas/element never creates/edits text | add text-edit branch in `doubleClickAt` (App.tsx:6406) | `draw-controller.svelte.ts:~2085` |
| **#9** | in-place text editor ignores camera transform (mis-positioned when panned/zoomed) | `sceneCoordsToViewportCoords` + scale font by zoom (App.tsx:5745) | `EditorPreview.svelte:~836` editor overlay |
| **#10** | edited text double-renders (painted on canvas AND in textarea) | filter `editingTextId` out of the renderable map (Renderer.ts:106) | `EditorPreview.svelte:~459-487` |

### Tier 3 — Property partials (small)

| Bug | What's wrong | Wire this | File |
|---|---|---|---|
| #11 | resize aspect-lock not inverted for images (shift backwards) | `selectedElements.some(isImageElement) ? !shift : shift` (App.tsx:12661) | `draw-controller.svelte.ts:~2469` |
| #52 line→polygon | `setBackgroundColor` drops the line-closeable→fill enable | port `actionProperties.tsx:397-421` | `draw-controller.svelte.ts:~515` |
| #bound-text color | stroke/opacity/font don't propagate to a container's bound text | apply to `getBoundTextElement` too (actionProperties.tsx:322) | `draw-controller.svelte.ts` `#applyStyle`/`#applyTextStyle` |

### Tier 4 — Heavy ports (real work, NOT wiring — do last)

| Bug | Scope | Notes |
|---|---|---|
| **#2** | multi-point line/arrow creation state machine (click-to-add-points, rubber-band preview, Esc/Enter/dbl-click finalize) | App.tsx:10884-10925 `multiElement`. Largest single item. |
| **#17** | eraser trail (segment-intersection over the drag path, accumulate delete set) | App.tsx:8114 + eraser trail. Current: 1 element per discrete sample. |
| **#48–72** | the 6 stub modules — replace placeholders with real (or re-exported) impls | `src/lib/excalidraw/clipboard.ts`, `clients.ts`, `i18n.ts`, `data/library.ts`, `data/types.ts`, `actions/types.ts`. These are `[k: string]: unknown` / `declare class` stubs today. |

### Tier 5 — Visual / layout fidelity (the `/x` page "looks off" vs Excalidraw)

These are NOT behavioral bugs (the functions compute correctly) — they're how the chrome
*looks*. Different verification: screenshot `/x` headless, compare to real Excalidraw's CSS, fix the
markup/CSS, re-screenshot. Drive via `/tmp/shot.mjs` pattern (headless Chrome → `Page.captureScreenshot`).

| Item | Symptom | Where | Status |
|---|---|---|---|
| **Empty-canvas panels** | properties + stats panels showed on empty canvas | `EditorPreview.svelte` + `showProperties`/`statsOpen` getters | ✅ **DONE** (`e4731d5`, probe `probe-x-fixUI-panel-visibility.mjs`) |
| **Panel is two detached islands** | Stroke/width is one floating box, Fill/Sloppiness/Edges/Opacity a separate detached box below — should be ONE continuous rounded panel | `EditorPreview.svelte` `.properties` markup + `StyleControls.svelte`; check `theme.css` `.properties`/`.prop-group` | ⬜ TODO |
| **Welcome screen sparse** | only title + 2 links; upstream centers logo + "All your data is saved locally" + richer menu-hint cluster | `WelcomeScreen.svelte` vs `welcome-screen/` | ⬜ TODO |
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
> remaining bugs with the exact ported function to wire for each.
>
> Work through the remaining bugs **one per commit**, in this order: Tier 1 (wiring) → Tier 2 (text)
> → Tier 3 (property partials) → Tier 4 (heavy: #2 multi-point, #17 eraser trail, #48–72 stub
> modules). For EACH bug follow the verification recipe in §0: read the upstream reference and cite
> file:line; wire the **already-ported, byte-identical** helper in `src/lib/x/draw-controller.svelte.ts`
> or `EditorPreview.svelte` (never re-author ported logic); run `pnpm check` (must be 0/0) and the
> svelte autofixer on touched files; write a **differential** probe `scripts/probe-x-fixNN-*.mjs`
> that asserts our output equals what the upstream rule computes (drive `window.__draw` /
> `window.__shapeCache` via headless Chrome); run `pnpm test` (172) + relevant existing probes for
> no-regression; then commit + push citing the rule and the runtime evidence.
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
