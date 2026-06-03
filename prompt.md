# revo-draw — Excalidraw port: continuation prompt

You are continuing a faithful Svelte 5 / SvelteKit port of the **real single-player Excalidraw**
(reference source in the gitignored `excalidraw-master/`, read-only) into **revo-draw**. A large,
working core already exists on branch **`feat/excalidraw-port`**. Your job: finish the remaining
parity work, one verified milestone at a time.

> **Scope reminder:** in-scope = full single-player Excalidraw. **Out of scope:** real-time
> collaboration, AI, i18n. The old "LayoutForge" app at route `/` is legacy; the port lives at
> route **`/x`** and under **`src/lib/x/`**.

---

## 0. First, read these (in order)
1. `EXCALIDRAW_PORT_LEDGER.md` — the living completion contract + a per-milestone progress log of
   everything done so far. **This is the source of truth for status.**
2. This file (`prompt.md`) — what's left and how to do it.
3. `CLAUDE.md` (project) + your global `~/.claude/CLAUDE.md` — the hard rules.

## 1. Non-negotiable rules (already enforced; keep them green)
- **TypeScript strict, zero `any`, zero `@ts-ignore`.** `pnpm check` must stay **0 errors / 0 warnings**.
- **Svelte 5 runes only** (`$state`/`$derived`/`$effect`/`$props`). No stores, `export let`, `$:`.
  Run the **svelte MCP autofixer** on every `.svelte`/`.svelte.ts` you touch.
- **pnpm only.** Exact version pins (no `^`).
- The vendored Excalidraw tree (`src/lib/{math,common,element,utils,fractional-indexing,excalidraw}`)
  is type-checked under Excalidraw's own strictness (tsconfig already aligned). Import via aliases:
  `@excalidraw/{math,common,element,element/types,utils,fractional-indexing,excalidraw,excalidraw/types}`.
- **Commit AND push at every green milestone** (the operator wants this — don't just commit locally).
  Branch with the work-streams + the ledger; commit messages cite the rule followed + end with the
  Co-Authored-By line.

## 2. Architecture you're extending
- **`src/lib/x/draw-controller.svelte.ts`** — the editor "App" as a runes class. Owns: the reactive
  `EditorScene` (`scene`), `EditorAppState` (`appState`), `Store`+`History` (undo/redo), tool state,
  the pointer state machine (`pointerDown`/`pointerMove`/`pointerUp`), style setters, camera
  (`panBy`/`zoomAt`/`resetView`), image cache, persistence hooks. **Most new behavior goes here.**
  - One durable history entry per gesture: every completed gesture calls `#commit()` (which also
    `saveToLocalStorage`). New mutating actions must `#commit()` once at the end.
  - Mutations go through the vendored model (`mutateElement`, `Scene.mutateElement`,
    `syncInvalidIndices`); `Scene.mutateElement` auto-triggers a repaint. **Never** mutate elements
    in place without going through `mutateElement` (it invalidates the rough.js `ShapeCache`).
  - `Scene.replaceAllElements` **validates fractional indices and throws in dev/test** — always pass
    already-`syncInvalidIndices`'d elements.
- **`src/lib/x/EditorPreview.svelte`** — the view: two stacked canvases (`renderStaticScene` +
  `renderInteractiveScene`), toolbar, properties panel, footer, menus, dialogs, the text `<textarea>`
  overlay, file input. Render runs in `$effect`s keyed on `scene.elements` + `appState.current`.
- **Disjoint components** under `src/lib/x/` (props-driven, no controller import): `StyleControls`,
  `ColorPicker`, `Stats`, `ContextMenu`, `MainMenu`, `HelpDialog`, plus modules `icons.ts`
  (`ICONS` SVG strings), `persistence/web-storage.ts`, `image-support.ts`.
- **Vendored renderers** (already in place): `excalidraw/renderer/{staticScene,interactiveScene,
  renderNewElementScene,renderSnaps,helpers,roundRect}.ts`, `element/{shape,renderElement,...}`.

## 3. The verification loop (do this for EVERY change)
1. `pnpm check` → 0/0. `pnpm test` → all pass (`pnpm test:runes` for the controller suite).
2. svelte MCP autofixer on touched `.svelte`/`.svelte.ts`.
3. **Browser-verify with a headless-Chrome CDP probe** (copy the pattern from any
   `scripts/probe-x-*.mjs`). Run `pnpm dev` (port 1420), then `node scripts/probe-x-<feature>.mjs`.
   Assert real state on `window.__draw` (the controller is exposed there) + count canvas pixels +
   `Page.captureScreenshot` to `/tmp/*.png` and **Read the PNG** to eyeball it.
   - **CDP gotcha:** the *first* synthesized mouse event after load must be a `mouseMoved` before
     `mousePressed`, or Chrome won't emit `pointerdown` (cold-pointer). All probes warm up with a
     move first. Tools that immediately focus an overlay (text) are flaky via CDP mouse — drive them
     via `window.__draw.<method>(...)` + verify the overlay/DOM.
4. `pnpm build` clean. Then commit + push.

## 4. What's left — do these top-to-bottom (each is one milestone)

### A. Marquee multi-select + multi-element transforms (high value, moderate)
Today selection is single (`selectedId: string | null`). Excalidraw selects many.
- **Refactor** `selectedId` → `selectedIds: Set<string>` (or keep `selectedId` + add `selectedIds`).
  Update `selectedElements` getter, `#select`, and `appState.selectedElementIds`.
- **Marquee:** when the selection tool drags on empty canvas, draw a selection rectangle
  (`appState.selectionElement` — `renderInteractiveScene` already renders it if set) and on move
  compute enclosed elements (`getElementsWithinSelection` exists in `element/` — grep it; or use
  `getCommonBounds`/element bounds). On pointerUp, select them all.
- **Multi-move/resize/rotate** already mostly work via `transformElements` + the drag loop because
  they iterate `selectedElements`; verify `getCommonBounds(selectedElements)` drives the group bbox.
- Verify: drag-marquee over 3 shapes → 3 selected; group-move/resize keeps relative positions.

### B. Modifier keys for transforms (quick)
`transformElements(originalElements, handle, selected, scene, shouldRotateWithDiscreteAngle,
shouldResizeFromCenter, shouldMaintainAspectRatio, px, py, cx, cy)` — currently the last three bools
are hardcoded `false`. Thread the live `shiftKey`/`altKey` from the pointer event into the resize
gesture (Shift = aspect-lock / 15° rotation snap, Alt = resize-from-center). Store the modifiers on
`pointermove`. Verify with a probe dispatching the drag with `modifiers: 8` (shift) / `1` (alt).

### C. Multi-point line/arrow editor (`LinearElementEditor`) (complex)
Today line/arrow are 2-point drag-create only. Excalidraw's `element/linearElementEditor.ts` is
already vendored (a static-method class on immutable state). Wire it: double-click a linear element
(or the linear tool in multi-point mode) → enter point-editing; render point handles via
`renderInteractiveScene` (`renderLinearPointHandles`); add/move/delete points. Port the relevant
`App.tsx` pointer handlers (`handleLinearElementOnPointerDown`, `onPointerMoveFromPointerDownHandler`
linear branch). This is the biggest tool item.

### D. Export dialog — PNG / SVG (moderate; needs export pipeline)
- Vendor `excalidraw/scene/export.ts` (`exportToCanvas`, `exportToSvg`) + `utils/src/export.ts`
  (was deferred — re-copy from `excalidraw-master`, stub/port its `data/*` deps). They reuse the
  same `renderStaticScene`/`renderSceneToSvg`, so most deps already exist.
- Build `src/lib/x/ExportDialog.svelte` (props-driven; reuse the `Dialog`/modal pattern from
  `HelpDialog.svelte`). PNG via `exportToCanvas → toBlob → download`; SVG via `exportToSvg →
  serialize → download`. Add a "Save as image" main-menu item + the dialog.
- Verify: export a 2-shape scene to PNG; assert the blob is a valid non-trivial PNG.

### E. Laser pointer (moderate; needs trail subsystem)
Port `excalidraw/animatedTrail.ts` + `laserTrails.ts` (rAF-driven fading trail rendered on the
interactive canvas, NOT persisted to the scene/history). Add a `laser` tool that feeds pointer
points to the trail and renders it each frame in the interactive `$effect` (or a dedicated rAF).
Deferred so far precisely because it's a separate animation path — keep laser strokes out of
`#elements`/history.

### F. Snapping + arrow binding (Phase 7; complex)
- **Snapping:** `excalidraw/snapping.ts` + `renderer/renderSnaps.ts` are vendored. During
  move/resize, compute snap lines (`getSnapLinesAtPointer`/`getElementsCorners`/`SnapCache`), set
  `appState.snapLines` (the interactive renderer already draws them), and adjust the drag offset to
  the nearest snap within threshold. Alt bypasses.
- **Binding:** `element/binding.ts` (large) — when an arrow endpoint is dropped near a bindable
  shape, set `startBinding`/`endBinding` + the shape's `boundElements`; on the bound shape's move,
  `updateBoundElements(element, scene)` re-routes the arrow. Wire `app.bindModeHandler`/
  `suggestedBinding` (the interactive renderer already highlights `suggestedBinding`).

### G. Misc polish
- ColorPicker popover: verify the hex `<input>` end-to-end (the component validates on change/Enter;
  the prior CDP probe didn't target the input cleanly — write a focused probe or test).
- Frame tool (`frame`), bring-to-front/back z-order commands + shortcuts (`Ctrl+[`/`Ctrl+]`),
  copy/paste (clipboard), grid mode.

### H. Phase 8 — Tauri
Mount the `src/lib/x/` UI into the Tauri shell branch of `src/routes/+page.svelte` (it already
branches `{#if isWeb}`), reconcile persistence behind `src/lib/platform.ts` (Tauri fs/sql vs web
localStorage), and retire the legacy LayoutForge components.

## 5. Working style
- Prefer **incremental, verified milestones** over big drops. After each: check 0/0 → test → autofix
  → CDP probe + screenshot → `pnpm build` → update `EXCALIDRAW_PORT_LEDGER.md` progress log →
  commit + **push**.
- For wide, disjoint UI work, the operator has opted into **parallel sub-agent Workflows**: produce
  self-contained new files under `src/lib/x/` (props-driven, no shared-file edits), then YOU
  integrate + verify serially. Don't edit `draw-controller.svelte.ts` / `EditorPreview.svelte` while
  a workflow's agents are running `pnpm check` (race).
- Be honest about status — never claim 100% until the ledger's rows are actually `DONE` with a
  verification artifact noted.

## 6. Quick commands
```sh
pnpm dev            # http://localhost:1420  (editor at /x)
pnpm check          # must be 0/0
pnpm test           # pure + runes suites
pnpm build          # Vite 8 / Rolldown
node scripts/probe-x-<name>.mjs   # headless-Chrome verification (dev server must be running)
```
The controller is exposed in the browser as `window.__draw` for probes.
