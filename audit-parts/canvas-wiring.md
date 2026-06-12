## Audit: canvas-wiring

Side-by-side parity audit of the canvas chrome/behavior axis: cursor styles per tool, selection-box + transform-handle rendering (color/size/dash), pointer-event handling, DPR. Selection OVERLAY only — element content is out of scope.

OUR files:
- `src/lib/ui/Canvas.svelte`
- `src/lib/canvas/renderer.ts`
- `src/lib/canvas/editor.svelte.ts` (cursor + handle geometry, referenced)

EXCAL files:
- `excalidraw-master/packages/excalidraw/components/canvases/InteractiveCanvas.tsx`
- `excalidraw-master/packages/excalidraw/renderer/interactiveScene.ts`
- `excalidraw-master/packages/excalidraw/cursor.ts` (cursor module, referenced)
- `excalidraw-master/packages/element/src/resizeTest.ts` (resize/rotation cursor mapping, referenced)
- `excalidraw-master/packages/element/src/transformHandles.ts` (handle sizes, referenced)

### Matchable findings

| Title | Severity | Our ref | Excal ref | Proposed fix |
|---|---|---|---|---|
| Rotation handle shows `crosshair` instead of `grab` | behavior | `editor.svelte.ts:1048` (`if (kind === 'rotate') return 'crosshair';`) | `resizeTest.ts:268` (`case "rotation": return "grab";`) | Return `'grab'` for the rotate handle: `if (kind === 'rotate') return 'grab';` |
| Active panning uses `grab` instead of `grabbing` | behavior | `editor.svelte.ts:1018` (`if (this.tool === 'hand' \|\| this.spaceHeld \|\| this.isPanning) return 'grab';`) | `App.tsx:8286` (`setCursor(..., CURSOR_TYPE.GRABBING)` on pan start) vs `GRAB` when armed | Split: return `'grabbing'` when `this.isPanning` is true, `'grab'` only when armed (hand tool / space held but not dragging). |
| Transform handle squares are sharp-cornered, not rounded | visual | `renderer.ts:1835-1838` (`ctx.rect(...)`, no radius) | `interactiveScene.ts:1365-1368` (`context.roundRect(x, y, width, height, 2 / appState.zoom.value)`) | Replace the `ctx.rect(...)` for resize handles with `ctx.roundRect(h.world.x - hs/2, h.world.y - hs/2, hs, hs, 2 / zoom)`. |
| Transform handle stroke width 1.25/zoom vs Excalidraw 1/zoom | cosmetic | `renderer.ts:1834` & `:1829` (`strokeWidthFor(zoom, 1.25)`) | `interactiveScene.ts:1358` (`context.lineWidth = 1 / appState.zoom.value`) | Use `strokeWidthFor(zoom, 1)` for both the square and rotate-circle handle strokes. |
| Per-element selection outline 1.5/zoom vs Excalidraw 1/zoom | cosmetic | `renderer.ts:1776` (`ctx.lineWidth = strokeWidthFor(zoom, 1.5)`) | `interactiveScene.ts:976` (`context.lineWidth = (activeEmbeddable ? 4 : 1) / appState.zoom.value`) | Set the selection-border line width to `strokeWidthFor(zoom, 1)` to match the 1px selection stroke. |
| Multi-select union-bounds box is solid, not dashed | visual | `renderer.ts:1800-1806` (`ctx.strokeRect(...)`, no `setLineDash`) | `interactiveScene.ts:1946` (`context.setLineDash([2 / appState.zoom.value])` for the multi-select common bounds) | Before the union `strokeRect`, set `ctx.setLineDash([2 / zoom])` and reset to `[]` after, matching Excalidraw's dashed multi-select bounding box. |
| Marquee fill color/alpha diverges from Excalidraw's `rgba(0,0,200,0.04)` | visual | `renderer.ts:1888-1891` (`globalAlpha = 0.09; fillStyle = input.selectionColor`) | `renderSelectionElement` `packages/element/src/renderElement.ts:764` (`context.fillStyle = "rgba(0, 0, 200, 0.04)"`) | Use a near-transparent blue wash: set `globalAlpha = 0.04` (or fill `rgba(0,0,200,0.04)` directly) so the marquee body is a faint blue rather than a ~9%-alpha selection-color block. |
| Marquee stroke width 1/zoom OK but no parity for selectionColor stroke | cosmetic | `renderer.ts:1893-1895` | `renderElement.ts:773-775` (`lineWidth = 1/zoom; strokeStyle = selectionColor; strokeRect(...)`) | Stroke already matches (1/zoom + selectionColor); only the fill (above) needs the alpha fix. No separate change. |
| Transform handle square size 9px vs Excalidraw 8px (mouse) | cosmetic | `editor.svelte.ts:116` (`HANDLE_SCREEN_PX = 9`) | `transformHandles.ts:49-53` (`transformHandleSizes = { mouse: 8, ... }`) | This constant doubles as hit radius AND visual size. If matching the visual square exactly, draw the square at 8px while keeping the 9px hit radius; otherwise lower `HANDLE_SCREEN_PX` to 8 (minor). |
| Canvas element has no accessible label | a11y | `Canvas.svelte:420` (`<canvas bind:this={canvasEl} tabindex="0" style:cursor></canvas>`) | `InteractiveCanvas.tsx:227` (`{t("labels.drawingCanvas")}` as canvas child text) | Add `aria-label="Drawing canvas"` to the `<canvas>` so screen readers announce the focusable canvas. |
| Hover over element body always returns `move`; Excalidraw selection tool hover is auto | behavior | `editor.svelte.ts:1027-1028` (`return hit ? 'move' : 'default';`) | `cursor.ts:88-89` (selection tool → `resetCursor` / auto on plain hover; `move` only appears on actual drag) | Optional alignment: return `'default'` on hover and switch to `'move'` only while a move gesture is in-flight. Lower priority — `move` on hover is a reasonable affordance; flag for product decision. |

### By-design divergences (do NOT fix)

- **Single render-on-dirty `$effect` instead of a persistent rAF `AnimationController`.** Excalidraw runs `AnimationController.start(INTERACTIVE_SCENE_ANIMATION_KEY, ...)` (`InteractiveCanvas.tsx:173-198`) to drive binding-highlight animations every frame. Our renderer is a pure dirty-flag-driven `$effect` (`Canvas.svelte:52-94`) with no continuous loop — correct for a tool with no animated overlays. By design (CLAUDE.md: dirty-flag, no constant rAF).
- **No collaborator/remote cursor wiring.** Excalidraw builds `remotePointerViewportCoords`, `remoteSelectedElementIds`, `remotePointerUsernames`, calls `renderRemoteCursors` (`InteractiveCanvas.tsx:96-136`, `interactiveScene.ts:2034`). Single-user local-first app — no collab. By design.
- **No linear-element / arrow point handles, binding highlights, focus-point indicators, midpoint snap dots, elbow-arrow handles.** Excalidraw's `renderLinearPointHandles`, `renderBindingHighlightForBindableElement*`, `renderFocusPointIndicator`, `renderSingleLinearPoint` (`interactiveScene.ts:115-1343`) are all for rough.js shapes/arrows. We have no rectangle/ellipse/arrow primitives. By design.
- **No crop handles / text auto-resize handle / reset-auto-resize handle.** `renderCropHandles`, `renderResetAutoResizeHandle`, `renderTextBox` (`interactiveScene.ts:1388-1550`) are Excalidraw image-crop and text-element features. Our text overlay is an HTML `<textarea>` (`Canvas.svelte:422-438`). By design.
- **No scrollbars overlay.** Excalidraw renders `getScrollBars` (`interactiveScene.ts:2042-2068`). We pan an infinite canvas without scrollbars. By design.
- **No search-match highlight overlay.** `appState.searchMatches` rendering (`interactiveScene.ts:1987-2028`) is an Excalidraw-app feature absent here. By design.
- **Warm-paper desktop backdrop + dot-grid vs Excalidraw white + (no default grid).** `Canvas.svelte:32-48` deliberately keeps the Tauri desktop's `oklch(0.955 0.004 110)` paper and editorial dot grid; the web build derives `#ffffff`/`#6965db` from `.x-web` tokens to match Excalidraw where it counts (selection color). Distinct product visual language. By design.
- **OKLCH color literals throughout the renderer** vs Excalidraw's hex/rgba. Selection color is token-matched to `#6965db` on web (`Canvas.svelte:46`); the rest is intentionally a different palette. By design.
- **`devicePixelRatio || 1` fallback** (`Canvas.svelte:105`) vs Excalidraw's bare `window.devicePixelRatio` (`InteractiveCanvas.tsx:152`). Functionally equivalent (DPR is never 0); the `|| 1` is a harmless guard. Not a divergence worth changing.
- **rAF-throttled pointer-move coalescing** (`Canvas.svelte:181-198`) mirrors Excalidraw's `throttleRAF` intent; implementation differs but behavior matches. By design.
