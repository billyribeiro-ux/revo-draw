# Excalidraw → revo-draw — Feature Parity Audit (web)

**Scope:** the **web editor only** (route `/x`, `src/lib/x/`). The Tauri/desktop build is excluded
per request. Features are enumerated **from `excalidraw-master` itself** — its `actions/` registry,
`shapes.tsx`/tool types, `actionProperties.tsx` (properties panel), `actionCanvas.tsx` (canvas/view),
and the component tree — not from any status doc. Each row cites the `excalidraw-master` source and
the port's real implementation (or its absence).

**Evidence basis:** all **26 headless-Chrome probes** in `scripts/probe-x-*.mjs` currently **PASS**
(runtime evidence for DONE features); MISSING rows are confirmed by code inspection of `src/lib/x/`.

> **Out of scope (correctly absent):** real-time collaboration, AI features, i18n.

---

## Gap-closing progress (branch `feat/excalidraw-parity-gaps`)

Closed since the audit, each with a passing CDP probe (`scripts/probe-x-batch*.mjs`):

- **Batch 1:** tool-letter shortcuts, select-all (⌘A), flip h/v, zoom-to-fit /
  zoom-to-selection, view mode, zen mode. *(probe-x-batch1)*
- **Batch 2a:** align ×6, distribute, lock/unlock (hit-test skips locked). *(probe-x-batch2)*
- **Batch 2b:** group / ungroup (⌘G / ⌘⇧G) + deep-select through groups. *(probe-x-batch2b)*
- **Batch 3:** text styling — font family, font size (S/M/L/XL), text align. *(probe-x-batch3)*
- **Batch 4:** full clipboard parity — OS clipboard copy/paste (excalidraw envelope),
  paste-as-plaintext, copy/paste styles (⌥⌘C / ⌥⌘V), export-to-clipboard (PNG). *(probe-x-batch4)*
- **Batch 5:** file IO — save / open `.excalidraw` (serialize/parse round-trip,
  native picker + download/input fallback). *(probe-x-batch5)*
- **Batch 6:** configurable arrowhead types (start/end: none/arrow/triangle/circle/
  bar/diamond), inherited at create + editable on selection. *(probe-x-batch6)*
- **Batch 7:** canvas background color picker + scroll-back-to-content. *(probe-x-batch7)*
- **Batch 8:** Toast (auto-dismiss status island) + HintViewer (contextual hint bar). *(probe-x-batch8)*
- **Batch 9:** hand tool + Space-drag/middle-mouse pan + lasso freeform select. *(probe-x-batch9)*
- **Batch 10:** image crop (double-click image → crop mode → handle-drag crop). *(probe-x-batch10)*
- **Batch 11:** binding-highlight overlay (suggestedBinding while drawing arrows) +
  elbow arrows (orthogonal routing + sharp/round/elbow type toggle). *(probe-x-batch11)*

Still open (lower-priority chrome/large surfaces): midpoint-snapping toggle,
color shade-ramp picker, styled tooltips with shortcuts, welcome screen, command
palette, libraries browser, embeddables, mermaid.

## Headline result

| | Count |
|---|---|
| ✅ **DONE** (implemented, wired, probe/test-backed) | **~60** |
| 🟡 **PARTIAL** (works but incomplete vs Excalidraw) | **~18** |
| ❌ **MISSING** (no real implementation) | **~53** |

**Honest verdict: NOT at full parity.** The *core drawing + editing experience* is faithful and
verified, but roughly **40% of Excalidraw's feature surface is not implemented**, and ~14% is partial.
Below is every gap.

| Category | done / partial / missing |
|---|---|
| Tools | 11 / 0 / 5 |
| Selection & transforms | 11 / 0 / 4 |
| Element actions | 9 / 1 / 12 |
| Element properties | 8 / 1 / 4 |
| Canvas & view | 6 / 3 / 7 |
| Linear & binding | 7 / 3 / 4 |
| Text | 3 / 2 / 6 |
| IO, UI chrome & misc | 5 / 8 / 11 |

---

## ✅ DONE (verified working)

- **Tools:** selection, rectangle, diamond, ellipse, line, arrow, freedraw, text, image, eraser,
  frame, laser (12). *(probes: draw, freedraw, linear, lineedit, text, imgerase, frame, laser, binding)*
- **Selection & transforms:** single-select, marquee/box-select, shift-add-to-selection, drag-to-move,
  resize (8 handles), rotate, multi-element group transform, shift aspect-lock, alt resize-from-center,
  shift 15° rotation snap, transform-handle hit-testing. *(probes: select, move, resize, marquee, modifiers)*
- **Element actions:** delete, duplicate, copy, cut, deselect, bring-to-front/forward, send-back/backward
  (z-order). *(probes: keys, clipboard, zorder)*
- **Properties:** stroke color, background (element fill) color, fill style, stroke width, stroke style,
  sloppiness, edges (sharp/round), opacity. *(probes: style, colorpicker)*
- **Canvas/view:** pan (wheel/trackpad), zoom in, zoom out, grid toggle, theme (light/dark) toggle,
  footer cluster. *(probes: nav, snap, finish)*
- **Linear/binding:** 2-point line/arrow create, multi-point editor (add/move/delete point), finalize,
  arrow↔shape binding (create + re-route on move). *(probes: linear, lineedit, binding)*
- **Text:** text-tool create, in-place textarea editing, auto-resize. *(probe: text)*
- **IO/UI:** PNG export, SVG export, export dialog, localStorage persistence, image insert, dark mode,
  help dialog (shortcuts), z-order shortcuts. *(probes: export, exportdialog, imgerase, finish, nav)*

---

## 🟡 PARTIAL (works but not to parity)

| Feature | excalidraw-master | Gap |
|---|---|---|
| Paste | `actions/actionClipboard.ts:actionPaste` | In-memory `#clipboard` only — not wired to the **OS clipboard**; no paste-as-plaintext. |
| Color picker | `components/ColorPicker/ColorPicker.tsx` | Hex input + flat preset palette only — **no shade/tint ramp** (`COLOR_PALETTE`/`topPicks`). |
| Reset zoom | `actionCanvas.tsx:resetZoom` | `resetView` also force-scrolls to 0,0 (Excalidraw keeps center). |
| Object snapping | `actionToggleObjectsSnapMode.tsx` | Works only on **⌘/Ctrl-drag** (inverted default); no persistent mode toggle/UI. |
| Stats panel | `actionToggleStats.tsx` | Always-on, read-only; **no toggle (Alt+/)**, no editable fields / zoom / scroll rows. |
| Context menu | `App.tsx getContextMenuItems` | Has z-order/clipboard/dup/delete/select-none; **missing** group, lock, link, flip, copy-styles, etc. |
| Main menu | `main-menu/MainMenu.tsx` | Has reset/grid/theme/save-image/shortcuts; **missing** Open/Save-to-file, export, canvas bg, help-extras. |
| Tooltips | `components/Tooltip.tsx` | Native `title=` only (lowercase tool name); no styled tooltip with shortcut text. |
| Keyboard shortcuts | `App.tsx` keydown / `shortcuts.ts` | Has delete/escape/dup/clipboard/z-order/undo-redo/grid/`?`; **missing tool-letter keys** (R/O/D/A/L/T/P/E/V/H/F/…). |
| Frames | `actions/actionFrame.ts` | Tool + membership + move-children work; **no frame-name editing UI**. |
| Multi-point linear create | `LinearElementEditor` | Drag-create is 2-point; **no click-to-place multi-point create**; **no elbow arrows**. |

---

## ❌ MISSING (no implementation found — the real gap list)

### Tools
- **Hand / pan tool** (`shapes.tsx` hand; space-drag / middle-mouse pan) — `panBy` is wheel-only.
- **Lasso** tool (`shapes.tsx` lasso, nested under selection).
- **Embeddable** (`constants.ts` embeddable; embed-link dialog).
- **MagicFrame** (`magicframe`; AI "wireframe to code" — borderline out-of-scope).

### Selection & transforms
- **Deep-select** through groups/frames (`App.tsx selectGroupsForSelectedElements`) — no grouping exists.
- **Flip horizontal** / **Flip vertical** (`actionFlip.ts`, Shift+H / Shift+V) — only labels in HelpDialog.
- **Directional transform-handle cursors** (`App.tsx getCursorForResizingElement`) — canvas sets no dynamic cursor.

### Element actions
- **Group** / **Ungroup** (`actionGroup.tsx`, ⌘G / ⌘⇧G) — no grouping at all.
- **Lock** / **Unlock** (`actionElementLock.ts`).
- **Align** ×6 (left/center/right/top/middle/bottom — `actionAlign.tsx`).
- **Distribute** horizontal/vertical (`actionDistribute.tsx`).
- **Select all** (`actionSelectAll.ts`, ⌘A).
- **Copy styles / Paste styles** (`actionStyles.ts`, ⌥⌘C / ⌥⌘V).
- **Paste as plaintext** (`actionClipboard.ts`).
- **Element link / hyperlink** (`actionElementLink.ts` / `actionLink.tsx`).
- **Add to library** (`actionAddToLibrary.ts`).

### Element properties
- **Font family** picker (`actionProperties.tsx:actionChangeFontFamily`) — text uses the library default.
- **Font size** (S/M/L/XL) (`actionChangeFontSize`).
- **Text align** (left/center/right) (`actionChangeTextAlign`).
- **Vertical align** (top/middle/bottom) (`actionChangeVerticalAlign`).
- **Arrowhead types** (start/end: arrow/triangle/dot/bar/none) — arrows hardcode `endArrowhead:"arrow"`.

### Canvas & view
- **Zoom-to-fit** (`actionCanvas.tsx:zoomToFit`) and **Zoom-to-selection** (`zoomToFitSelection`).
- **Midpoint snapping** toggle (`actionToggleMidpointSnapping.tsx`).
- **Scroll-back-to-content** (`App.tsx scrollToContent`).
- **Canvas background color** (`actionCanvas.tsx:changeViewBackgroundColor`) — the "Background" picker
  sets element fill, not the canvas `viewBackgroundColor`.
- **View mode** (`actionToggleViewMode.tsx`) and **Zen mode** (`actionToggleZenMode.tsx`).

### Linear & binding
- **Elbow arrows** (`elbowArrow.ts`); **configurable arrowhead types**; **live binding-highlight/suggestion** overlay.

### Text
- **Container/bound text** (text inside shapes), **arrow labels**, **double-click-to-edit existing text**
  (helpers in `element/textElement.ts` are ported but unwired); plus all font styling (above).

### IO, UI chrome & misc
- **Export to clipboard** (PNG) (`clipboard.ts:copyToClipboard`).
- **Save to `.excalidraw`** file (`actionSaveFileToDisk` / `data:saveAsJSON`).
- **Open `.excalidraw`** file (`actionLoadScene` / `data:loadFromJSON`).
- **Image crop** (`element/cropElement.ts`; double-click image).
- **Libraries** browse/add/load (`components/LibraryMenu.tsx`, `data/library.ts`).
- **Command palette / search** (`components/CommandPalette/`).
- **Welcome screen** (`welcome-screen/`).
- **Toasts** (`Toast.tsx`) — export/clipboard failures are currently silent.
- **Hint viewer** (`HintViewer.tsx`) — the contextual "Click to start/end line" hint bar.
- **Embeddables** (`element/embeddable.ts`); **Mermaid** (`TTDDialog/MermaidToExcalidraw.tsx`).

---

## Recommended order to close the gaps (quick → complex)
1. **Quick wins:** select-all (⌘A), tool-letter shortcuts, flip-h/v, canvas background color, view/zen
   mode, stats toggle, scroll-to-content, zoom-to-fit / zoom-to-selection.
2. **Grouping family:** group/ungroup → deep-select → align ×6 → distribute → lock/unlock (share the
   selection/group infrastructure).
3. **Text styling:** font family/size + text/vertical align + bound text (helpers already ported).
4. **Clipboard parity:** OS clipboard read/write, paste-as-plaintext, copy/paste styles, export-to-clipboard.
5. **File IO:** save/open `.excalidraw` (JSON serialize/restore is mostly ported).
6. **Arrowheads + elbow arrows + binding-highlight; image crop.**
7. **UX chrome:** color-shade ramp, styled tooltips, toasts, hint viewer, welcome screen.
8. **Larger/optional:** libraries, command palette, lasso, embeddables, mermaid, hand-pan + space-drag.
