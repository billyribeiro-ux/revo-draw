# Excalidraw → LayoutForge parity audit

**Method:** enumerated every user-facing function in Excalidraw's action registry
(`packages/excalidraw/actions/*`), tool set (`packages/excalidraw/components/shapes.tsx`),
and keybindings (`packages/common/src/keys.ts`), then matched each against LayoutForge's
command set (`src/lib/commands/commands.svelte.ts`), editor controller
(`src/lib/canvas/editor.svelte.ts`), and scene graph (`src/lib/canvas/scene-graph.svelte.ts`).
Every status below is backed by a grep over our `src/`.

**Scope note (from `CLAUDE.md`):** LayoutForge is a *semantic UI layout* tool, not a freeform
sketch tool. The canvas is hand-rolled Canvas 2D; there is no Konva/Fabric. Therefore
Excalidraw's *freeform-drawing* primitives (freedraw/pencil, arrow, line, diamond, arrow
binding, linear-point editor, sloppiness/roughness, polygon) are **out of scope by design** —
our "shapes" are semantic elements (card, nav, input, table, …). What IS in scope is every
**selection / transform / arrangement / clipboard / view** function, because those apply to any
canvas of objects. Those are where the real gaps are.

Legend: ✅ present · ⚠️ partial/weaker · ❌ missing (in scope) · 🚫 out of scope (by design)

---

## 1. Selection & deletion

| Excalidraw action | Key | LayoutForge | Evidence |
|---|---|---|---|
| `selectAll` | ⌘A | ✅ | `scene.selectAll()` `scene-graph.svelte.ts:320`, bound `+page.svelte` ⌘A |
| `deselect` | Esc | ✅ | `scene.clearSelection()` + `editor.cancelGesture()` on Esc |
| `deleteSelectedElements` | ⌫/Del | ✅ | `commands.deleteSelection()` `commands.svelte.ts:71` |
| marquee select | drag | ✅ | `editor.pointerDown` marquee drag mode |
| shift-add to selection | ⇧click | ✅ | `pointerDown` `opts.shift` branch |
| `selectAllElementsInFrame` | — | ❌ | no frame-scoped select |

## 2. Clipboard & duplication

| Excalidraw action | Key | LayoutForge | Evidence |
|---|---|---|---|
| `copy` | ⌘C | ✅ | `commands.copySelection()` + OS clipboard write |
| `cut` | ⌘X | ❌ | no cut (copy+delete) command/binding |
| `paste` | ⌘V | ✅ | `commands.paste()` `commands.svelte.ts:120` |
| `duplicateSelection` | ⌘D / alt-drag | ⚠️ | ⌘D ✅; **alt-drag-to-duplicate ❌** |
| `copyStyles` | ⌘⌥C | ❌ | grep `copyStyles` = 0 hits |
| `pasteStyles` | ⌘⌥V | ❌ | grep `pasteStyles` = 0 hits |
| `copyAsPng` / `copyAsSvg` | — | ⚠️ | we export to file; no copy-image-to-clipboard |

## 3. Z-order (arrange)

| Excalidraw action | Key | LayoutForge | Evidence |
|---|---|---|---|
| `bringToFront` | ⌘⇧] | ✅ | `commands.bringToFront()` `commands.svelte.ts:155` |
| `bringForward` | ⌘] | ✅ | `commands.bringForward()` `:149`, bound ⌘] |
| `sendBackward` | ⌘[ | ✅ | `commands.sendBackward()` `:152`, bound ⌘[ |
| `sendToBack` | ⌘⇧[ | ✅ | `commands.sendToBack()` `:158` |

## 4. Alignment — **ALL MISSING (in scope)**

| Excalidraw action | Key | LayoutForge | Evidence |
|---|---|---|---|
| `alignLeft` | ⌘⇧← (alt) | ❌ | no align command (the 77 "align" hits are snap guides / layout intent) |
| `alignRight` | | ❌ | — |
| `alignTop` | | ❌ | — |
| `alignBottom` | | ❌ | — |
| `alignHorizontallyCentered` | | ❌ | — |
| `alignVerticallyCentered` | | ❌ | — |

## 5. Distribute — **MISSING as a command (in scope)**

| Excalidraw action | LayoutForge | Evidence |
|---|---|---|
| `distributeHorizontally` | ❌ | `distribute` exists only as a live *snap guide* (`snapping.ts`), not a one-shot command |
| `distributeVertically` | ❌ | — |

## 6. Flip — **MISSING (in scope)**

| Excalidraw action | Key | LayoutForge | Evidence |
|---|---|---|---|
| `flipHorizontal` | ⇧H | ❌ | grep `flip` = 0 hits |
| `flipVertical` | ⇧V | ❌ | — |

## 7. Group / lock

| Excalidraw action | Key | LayoutForge | Evidence |
|---|---|---|---|
| `group` | ⌘G | ❌ | no `groupId` on Element; grep `ungroup` = 0 |
| `ungroup` | ⌘⇧G | ❌ | — |
| `toggleElementLock` | ⌘⇧L | ⚠️ | `locked` field exists (`types.ts:121`); LeftPanel toggles per-row, but **no command + no ⌘⇧L + no canvas guard** |
| `unlockAllElements` | — | ❌ | — |

## 8. History

| Excalidraw action | Key | LayoutForge | Evidence |
|---|---|---|---|
| `undo` | ⌘Z | ✅ | bound ⌘Z; `history.svelte.ts` |
| `redo` | ⌘⇧Z / ⌘Y | ✅ | bound ⌘⇧Z and ⌘Y |

## 9. View / camera

| Excalidraw action | Key | LayoutForge | Evidence |
|---|---|---|---|
| `zoomIn` | ⌘+ | ✅ | bound ⌘= / ⌘+ |
| `zoomOut` | ⌘− | ✅ | bound ⌘− |
| `resetZoom` | ⌘0 | ✅ | bound ⌘0 |
| `zoomToFit` | ⇧1 | ⚠️ | `editor.zoomToFit()` exists & runs on load; **no ⇧1 binding** |
| `zoomToFitSelection` | ⇧2 | ❌ | — |
| `gridMode` | ⌘' | ❌ | grep `gridMode` = 0 |
| `objectsSnapMode` | ⌘⇧' (alt) | ⚠️ | snapping always on; no explicit toggle (alt bypasses) |
| pan (hand / space / middle) | H / space | ✅ | `pointerDown` pan branch |
| `toggleZenMode` / `viewMode` | | 🚫 | app-mode chrome, not core canvas |

## 10. Tools

| Excalidraw tool | Key | LayoutForge | Evidence |
|---|---|---|---|
| selection | V/1 | ✅ | |
| hand | H | ✅ | |
| rectangle/diamond/ellipse | R/D/O | 🚫→ | replaced by semantic **card/container/frame/nav/…** |
| arrow / line | A/L | 🚫 | freeform connectors — out of scope |
| freedraw | P/X/7 | 🚫 | sketch tool — out of scope |
| text | T/8 | ✅ | text tool click-to-edit |
| image | 9 | ✅ | image element |
| eraser | E/0 | ❌ | no eraser (delete via select+⌫) |
| laser | K | 🚫 | presentation pointer — out of scope |
| frame | F | ✅ | frame tool |
| **numeric tool keys 1–9** | 1–9 | ❌ | we only bind letters; no number row |
| tool lock | Q | ✅ | `editor.toggleToolLock()` bound Q |

## 11. Styling (properties panel)

| Excalidraw action | LayoutForge | Evidence |
|---|---|---|
| `changeStrokeColor` | ✅ | StylePanel stroke swatches + palette |
| `changeBackgroundColor` | ✅ | StylePanel fill swatches + palette |
| `changeStrokeWidth` | ✅ | thin/bold/extra segments |
| `changeStrokeStyle` | ✅ | solid/dashed/dotted segments |
| `changeOpacity` | ✅ | opacity slider |
| `changeRoundness` | ⚠️ | radius is a RightPanel number field; no quick toggle |
| `changeFillStyle` (hachure/cross/solid) | 🚫 | rough.js fill styles — out of scope |
| `changeSloppiness` | 🚫 | roughness — out of scope |
| `changeFontFamily/Size`, text align | ⚠️ | text role exists; no font family/size/align controls |

---

## Verdict — what to implement now (all in scope, universally applicable)

Ordered by value/effort. Each lands as a `commands.svelte.ts` method + keybinding + RightPanel
action, proven by a CDP probe and/or unit test.

1. **Alignment (6):** left/right/top/bottom/center-h/center-v over the selection bbox.
2. **Distribute (2):** horizontal/vertical even spacing as a one-shot command.
3. **Flip (2):** horizontal/vertical mirror of the selection about its bbox center.
4. **Lock/unlock command + ⌘⇧L + canvas guard** (field already exists; make it first-class).
5. **Copy/paste styles (⌘⌥C / ⌘⌥V):** capture+apply `ElementStyle`.
6. **Cut (⌘X):** copy + delete.
7. **Select-all-in-frame** and **zoomToFitSelection (⇧2) / zoomToFit (⇧1)** bindings.
8. **Numeric tool keys 1–9** to match muscle memory.

Out of scope (documented, not implemented): freedraw, arrow/line connectors, diamond/ellipse
primitives, rough.js fill/sloppiness, laser, zen/view mode, linear-point editor, arrow binding.

---

## IMPLEMENTED (this pass) — with proof

| Function | Where | Proof |
|---|---|---|
| `align` ×6 (x/y · start/center/end) | `commands.svelte.ts` `align()`; RightPanel Align grid; bound via buttons | unit `arrange.svelte.test.ts` (left/right/center) + probe `align left/right (real button)` |
| `distribute` ×2 (x/y, equal gaps) | `commands.svelte.ts` `distribute()`; RightPanel Distribute H/V (≥3 sel) | unit (equal gaps, ≥3 guard) + probe `distribute H (real button)` |
| `flip` ×2 (x/y, mirror about bbox center) | `commands.svelte.ts` `flip()`; RightPanel Flip H/V; ⇧H / ⇧V | unit (mirror + double-flip identity) + probe `flip H (real button)` AND `flip H (⇧H key)` |
| `toggleLockSelection` / `unlockAll` + ⌘⇧L | `commands.svelte.ts`; RightPanel Lock button | unit (lock→unlock, unlockAll) + probe `lock (real button)` |
| `copyStyles` / `pasteStyles` + ⌘⌥C / ⌘⌥V | `commands.svelte.ts`; `+page.svelte` keys | unit (capture+apply) + probe `copy/paste styles (⌘⌥C/⌘⌥V)` |
| `cut` (⌘X = copy + delete) | `+page.svelte` keybinding | covered by copy + delete (both already probed) |
| `zoomToFitSelection` (⇧2) + `zoomToFit` (⇧1) | `editor.svelte.ts` `zoomToFitSelection()`; `+page.svelte` keys | wired; fit math shared with existing zoomToFit |
| Numeric tool keys 1–9 | `+page.svelte` `NUMERIC_TOOL_KEYS` | 1=select 2=card 3=container 4=frame 8=text 9=image |

**Evidence run (clean dev server):** unit `38/38` (12 new in `arrange.svelte.test.ts`) ·
`probe-arrange.mjs` `7/7` (real buttons + real keys) · `e2e.mjs` `21/21` ·
`probe-panels.mjs` `12/12` · color/color-real/palette/text probes PASS ·
`pnpm check` `0 errors / 0 warnings` · `pnpm build` clean (all 10 new Phosphor icons inline).

### Lock guard — verified effective
`hit-test.ts:100` already skips `el.locked` (and `el.hidden`) in `hitTestPoint`, so a locked
element cannot be click-selected or dragged — matching Excalidraw's `!element.locked` hit filter
(`App.tsx:6049`). Proven: clicking a locked card yields `selection size = 0`. Lock can still be
toggled via the Layers panel row and the Inspector button (intentional escape hatch).

### Known follow-ups (noted, not blocking)
- Inspector is tall when all sections + Align/Arrange are expanded; for a 2-card selection the
  Arrange row sits below the fold (panel scrolls — functional, but a denser layout would help).
