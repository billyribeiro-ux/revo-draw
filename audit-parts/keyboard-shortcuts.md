## Audit: keyboard-shortcuts

Scope: keyboard shortcut coverage + bindings vs Excalidraw `keyTest` definitions. Focus on
matchable ops: copy/paste, zoom, select-all, duplicate, z-order, group, lock, nudge, align,
flip, distribute, grid, undo/redo, tool keys.

OUR handler: `src/routes/+page.svelte` `onKeydown` (lines 287–489), plus `editor.svelte.ts`
zoom/tool methods.
EXCALIDRAW: `packages/excalidraw/components/App.tsx` `private onKeyDownFromPointerDownHandler` /
`handleCanvasKeyDown` region (≈5040–5340) + per-action `keyTest` in `packages/excalidraw/actions/*`.

### Coverage summary (what we already match)

| Op | Excalidraw binding | Our binding | Status |
|----|----|----|----|
| Save / Save As | (app-level) | ⌘S / ⌘⇧S | ✓ |
| Undo / Redo | ⌘Z / ⌘⇧Z, ⌘Y | ⌘Z / ⌘⇧Z, ⌘Y | ✓ |
| Duplicate | ⌘D (`actionDuplicateSelection.tsx:111`) | ⌘D | ✓ |
| Select all | ⌘A (`actionSelectAll.ts:62`) | ⌘A | ✓ |
| Copy styles | ⌘⌥C (`actionStyles.ts:68`) | ⌘⌥C | ✓ |
| Paste styles | ⌘⌥V (`actionStyles.ts:171`) | ⌘⌥V | ✓ |
| Cut | ⌘X (`actionClipboard.tsx:121`) | ⌘X | ✓ |
| Copy / Paste | OS clipboard | ⌘C / ⌘V | ✓ |
| Lock toggle | ⌘⇧L (`actionElementLock.ts:143`) | ⌘⇧L | ✓ |
| Group / Ungroup | ⌘G / ⌘⇧G (`actionGroup.tsx:199,303`) | ⌘G / ⌘⇧G | ✓ |
| Hyperlink | ⌘K (`actionLink.tsx`) | ⌘K | ✓ |
| Grid toggle | ⌘' (`actionToggleGridMode.tsx:35`) | ⌘' | ✓ |
| Z-order step | ⌘[ / ⌘] (`actionZindex.tsx:37,67`) | ⌘[ / ⌘] | ✓ |
| Z-order front/back | ⌘⌥[ / ⌘⌥] (mac) (`actionZindex.tsx:96,134`) | ⌘⌥[/] + ⌘⇧[/] | ✓ |
| Delete | Delete/Backspace (`actionDeleteSelected.tsx:305`) | Delete/Backspace | ✓ |
| Flip H / V | ⇧H / ⇧V (`actionFlip.ts:51,76`) | ⇧H / ⇧V | ✓ |
| Distribute H / V | ⌥H / ⌥V (`actionDistribute.tsx:87,118`) | ⌥H / ⌥V | ✓ |
| Eraser / Hand / Lock | E / H / Q (`actionCanvas.tsx:528,602`, `App.tsx:5104`) | E / H / Q | ✓ |
| Zoom-to-fit | ⇧1 (`actionCanvas.tsx` zoomToFit) | ⇧1 | ✓ |
| Tool letter keys | findShapeByKey | TOOL_KEYS map | ✓ (semantic remap, by-design) |

### Matchable findings

| Title | Severity | Our ref | Excal ref | Proposed fix |
|----|----|----|----|----|
| Shift+Arrow nudge step is 10px, Excalidraw uses 5px | behavior | `+page.svelte:436` | `common/src/constants.ts:22` (`ELEMENT_SHIFT_TRANSLATE_AMOUNT = 5`) | Change `const step = e.shiftKey ? 10 : 1;` to `const step = e.shiftKey ? 5 : 1;` |
| Modified arrow keys swallowed by nudge handler — ⌘⇧Arrow (align) impossible | bug | `+page.svelte:434-441` (`if (e.key.startsWith('Arrow'))` has no `mod` guard and returns early) | `actionAlign.tsx:96,130,164,198` (`CTRL_OR_CMD && shiftKey && ArrowUp/Down/Left/Right`) | Guard the nudge branch with `if (!mod && e.key.startsWith('Arrow'))`; add a preceding `⌘⇧Arrow` branch calling `commands.align('top'|'bottom'|'left'|'right')` so modified arrows reach align instead of nudging by 10 |
| No Align shortcuts at all (⌘⇧↑/↓/←/→) | behavior | `+page.svelte:287-489` (no align binding) | `actionAlign.tsx:96-200` | Add four branches: `mod && e.shiftKey && e.key==='ArrowUp'` → align top, `ArrowDown` → bottom, `ArrowLeft` → left, `ArrowRight` → right, each `e.preventDefault()` then call the corresponding `commands` align op |
| Zoom shortcuts require Cmd/Ctrl — Excalidraw also accepts Shift-only (⇧= / ⇧- / ⇧0) | behavior | `+page.svelte:408,413,418` (`if (mod && ...)`) | `actionCanvas.tsx:170-173,211-214,254-257` (`(CTRL_OR_CMD \|\| shiftKey)`) | Change the guard from `mod &&` to `(mod \|\| e.shiftKey) &&` for the `=`/`+`, `-`, and `0` zoom branches |
| Zoom matches on `event.key` not `event.code` — breaks on non-US/numpad layouts | a11y | `+page.svelte:408,413,418` (`e.key === '=' \|\| '+'`, `e.key === '-'`, `e.key === '0'`) | `actionCanvas.tsx:171,212,255` (`event.code === CODES.EQUAL \|\| NUM_ADD` etc.) | Match on `e.code === 'Equal' \|\| e.code === 'NumpadAdd'` (zoom in), `e.code === 'Minus' \|\| e.code === 'NumpadSubtract'` (out), `e.code === 'Digit0' \|\| e.code === 'Numpad0'` (reset) so numpad +/-/0 and non-Latin layouts work |
| Tool & letter shortcuts use `event.key.toLowerCase()` — break on non-Latin keyboard layouts | a11y | `+page.svelte:291-483` (all `e.key.toLowerCase()` comparisons) | `common/src/keys.ts:123-135` (`matchKey` uses `event.code` fallback when key is non-Latin); `App.tsx:5064` `findShapeByKey` | For tool/letter keys, fall back to `e.code` (e.g. `KeyV`, `KeyE`) when `e.key` is non-Latin, mirroring Excalidraw's `matchKey`. Minimum: switch the z-order-style `e.code` approach (already used at 396/402) to the tool keys |
| No "zoom to fit selection at 100%" tier — Excalidraw has ⇧2 (fit-in-viewport) AND ⇧3 (fit-selection) | behavior | `+page.svelte:472` (⇧2 → `zoomToFitSelection`) | `actionCanvas.tsx` `zoomToFitSelectionInViewport` (`CODES.TWO`) + `zoomToFitSelection` (`CODES.THREE`) | Optional: bind ⇧2 to a "center selection at ≤100%" variant and move full fit-selection to ⇧3; or leave as the single ⇧2 (low value — note only) |
| No help-dialog shortcut (`?`) | cosmetic | `+page.svelte:287-489` (no `?` handler) | `App.tsx:4993` (`event.key === KEYS.QUESTION_MARK`) | Out of scope unless a shortcuts/help panel exists; if one is added, bind `?` to open it |

### By-design divergences (do NOT fix)

- Tool letter map is semantically remapped (`R`→card, `C`→container, `F`→frame, `B`→button,
  `I`→image, numeric 1–4/8/9 → semantic analogs; `+page.svelte:265-285`). Excalidraw's
  `R`/`O`/`A`/`L`/`P` map to rectangle/ellipse/arrow/line/freedraw — those primitives don't
  exist in this product. Intentional; gaps for arrow/line/freedraw (Excalidraw 5–7) are
  deliberately unbound.
- No arrow/line/draw/laser/lasso/text-arrow shortcuts — those tools are out of scope.
- No collaboration / view-mode / theme-toggle (⌥⇧D) / pen-mode shortcuts — Excalidraw
  app-level features not present here.
- No `P` (penmode), `O` (ellipse), `A` (arrow), `L` (line), `D` as draw — primitive tools absent.
- Group uses containment (wrap-in-container / dissolve) rather than `groupIds[]`; the ⌘G/⌘⇧G
  binding is matched but the semantics are this product's containment model (documented at
  `+page.svelte:361-369`).
- Hyperlink uses `window.prompt` — acceptable given the local desktop modal pattern, though a
  richer popover is a future nicety (not a parity gap).
