## Parity: camera-viewport

Axis focus: world<->screen transforms, pan, zoom, zoom-to-fit (cursor-anchored zoom,
center-on-point, fit-bounds). Excalidraw keeps the viewport transform as `scrollX/scrollY`
(scene units) + `zoom.value` inside `AppState`; the transform helpers live in
`packages/common/src/utils.ts`, `scene/scroll.ts`, `scene/zoom.ts`, `scene/normalize.ts`,
`actions/actionCanvas.tsx`, with `clamp`/`round`/`roundToStep` in `packages/math/src/utils.ts`.

Our equivalent is the single `Camera` class in `src/lib/canvas/camera.svelte.ts`, which owns
`panX/panY` (screen pixels) + `zoom`, and exposes a `Matrix` for `ctx.setTransform`.

### Coordinate-model note (load-bearing)

The two codebases use algebraically equivalent but differently-parameterized transforms:

- Excalidraw: `screenX = (sceneX + scrollX) * zoom + offsetLeft` (`utils.ts:439-458`).
  `scrollX/scrollY` are stored in **scene units**, added *before* scaling; `offsetLeft/Top`
  is the canvas DOM offset within the page.
- Ours: `screenX = zoom * worldX + panX` (`camera.svelte.ts:4-5,38-40`). `panX/panY` are
  stored in **screen pixels**, added *after* scaling; there is no DOM offset because the
  canvas is full-bleed (Tauri SPA), so screen coords are already canvas-relative.

The relation is `panX = scrollX * zoom + offsetLeft`. Behavior is identical for all the
transform/pan/zoom-anchor operations below; only the stored representation differs. This is
an intentional simplification valid for our single-canvas, no-DOM-offset scope.

### Classification table

| Excalidraw fn | Status | Ours ref | Excal ref | Note |
|---|---|---|---|---|
| `viewportCoordsToSceneCoords` (utils.ts) | MATCH | camera.svelte.ts:45-47 | utils.ts:417-437 | screen->world inverse transform |
| `sceneCoordsToViewportCoords` (utils.ts) | MATCH | camera.svelte.ts:50-52 | utils.ts:439-458 | world->screen transform |
| pan via `scrollX/scrollY` mutation (App handleWheel) | MATCH | camera.svelte.ts:65-68 | utils.ts:433-434 | screen-delta pan; ours screen px, theirs scene-unit |
| `getStateForZoom` (zoom.ts) | MATCH | camera.svelte.ts:74-82 | zoom.ts:3-35 | cursor-anchored zoom: keep world pt under anchor fixed |
| `getNormalizedZoom` (normalize.ts) | DIVERGENT | camera.svelte.ts:75 | normalize.ts:7-9 | ours clamps only; theirs clamps + `round(z,6)`. Diff MIN/MAX. |
| `MIN_ZOOM` / `MAX_ZOOM` (constants) | DIVERGENT | camera.svelte.ts:23-24 | constants.ts:303-304 | ours 0.05/8; theirs 0.1/30 |
| `centerScrollOn` (scroll.ts) | MATCH | camera.svelte.ts:114-117 | scroll.ts:31-58 | center viewport on a scene point at fixed zoom (no offsets in ours) |
| `calculateScrollCenter` (scroll.ts) | DIVERGENT | camera.svelte.ts:97-111 | scroll.ts:60-92 | both center on common bounds; ours also sets zoom (fit), theirs zoom-preserving + closest-bounds fallback |
| `zoomValueToFitBoundsOnViewport` (actionCanvas) | DIVERGENT | camera.svelte.ts:97-111 | actionCanvas.tsx:259-275 | min(w,h) fit; theirs caps at 1.0, ours caps at MAX_ZOOM |
| `zoomToFitBounds` (actionCanvas) | DIVERGENT | camera.svelte.ts:97-111 | actionCanvas.tsx:277-357 | ours = fit + center; theirs floors to ZOOM_STEP, offsets, fitToViewport mode |
| `zoomToFit` (actionCanvas) | MATCH | editor.svelte.ts:950-957 | actionCanvas.tsx:359-393 | gather bounds (content/selection) then fit |
| `isOutsideViewPort` (scroll.ts) | ABSENT | — | scroll.ts:15-29 | helper for closest-bounds fallback; not needed (no fallback) |
| `getClosestElementBounds` fallback (scroll.ts) | ABSENT | — | scroll.ts:75-81 | "scroll to nearest element when off-screen"; not ported |
| `roundToStep` zoom snapping (math utils) | ABSENT | — | utils.ts(math):17-24 | zoom not snapped to 0.1 steps in ours |
| `clamp` / `round` (math utils) | MATCH (clamp) / ABSENT (round) | camera.svelte.ts:75,104 | math/utils.ts:3-15 | inline `Math.min/max` clamp; no `round` of zoom |
| `getNormalizedGridSize/Step` (normalize.ts) | ABSENT | — | normalize.ts:11-17 | grid-size clamping; out of camera axis scope |

### Divergences & gaps

1. **`getNormalizedZoom` does not round the zoom value (bug-risk).** Excalidraw normalizes
   *every* zoom write through `clamp(round(zoom, 6), MIN_ZOOM, MAX_ZOOM)` (normalize.ts:7-9),
   which both bounds the value and quantizes to 6 decimals to prevent float drift accumulating
   across many wheel events. Our `Camera.zoomTo` (camera.svelte.ts:75) only clamps:
   `Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZoom))`. Because `zoomBy` multiplies
   (`zoom * factor`, camera.svelte.ts:86) and the wheel handler uses `Math.exp(-deltaY*0.01)`
   (editor.svelte.ts:926), repeated zooming accumulates irrational factors with no rounding,
   so the displayed zoom percentage drifts to values like 99.97% / 100.04% and never lands
   exactly on 1.0 after a round-trip. severity: bug-risk.

2. **Different zoom bounds (behavioral).** Ours: `MIN_ZOOM = 0.05`, `MAX_ZOOM = 8`
   (camera.svelte.ts:23-24). Excalidraw: `MIN_ZOOM = 0.1`, `MAX_ZOOM = 30`
   (constants.ts:303-304). Users can zoom further out (down to 5%) and not as far in (8x vs
   30x). Defensible for a layout-sketching tool, but it is a genuine threshold difference.
   severity: behavioral.

3. **Zoom-to-fit clamps differently and skips step-flooring (behavioral).** Excalidraw's
   non-`fitToViewport` path runs `zoomValueToFitBoundsOnViewport` which returns
   `Math.min(adjustedZoomValue, 1)` (actionCanvas.tsx:274) — i.e. fit-to-screen never zooms
   *in* past 100%; it only ever shrinks to fit, then floors the result to the nearest
   `ZOOM_STEP` (0.1) via `roundToStep(..., ZOOM_STEP, "floor")` (actionCanvas.tsx:335). Our
   `Camera.fit` (camera.svelte.ts:104) computes the same `min(availW/w, availH/h)` but clamps
   to `[MIN_ZOOM, MAX_ZOOM]` with **no 1.0 cap and no step flooring**, so fitting a tiny
   selection zooms *in* up to 8x and to arbitrary non-step zoom levels (e.g. 3.47x). This is
   closer to Excalidraw's `fitToViewport: true` branch (actionCanvas.tsx:314-322) than to the
   default keyboard "Zoom to fit" (Shift+1). severity: behavioral.

4. **Padding model differs (cosmetic).** Ours subtracts a fixed pixel `padding` on each side
   before fitting (default 64; callers pass 80 — editor.svelte.ts:951,956 — camera.svelte.ts:97-104).
   Excalidraw uses `canvasOffsets` (left/top/right/bottom for floating UI panels) and a
   `viewportZoomFactor` multiplier (actionCanvas.tsx:296-322), not a symmetric pixel pad.
   Same visual goal; different parameterization. severity: cosmetic.

5. **No off-screen "closest element" fallback (gap, intentional).** Excalidraw's
   `calculateScrollCenter` falls back to `getClosestElementBounds` when the common bounds are
   larger than the viewport (scroll.ts:74-82, guarded by `isOutsideViewPort` scroll.ts:15-29).
   We have no equivalent: `Camera.fit` always rescales to fit the full bounds, so the content
   is never larger than the viewport and the fallback is moot. Intentional per our scope.

6. **No zoom-step keyboard increments (gap).** Excalidraw snaps Ctrl+/Ctrl- to `ZOOM_STEP`
   (0.1) boundaries via `roundToStep`. Our `zoomIn/zoomOut` multiply by a fixed `1.2` /
   `1/1.2` (editor.svelte.ts:944-948), producing non-step values (1.2, 1.44, 1.728, ...).
   Functional but not byte-parity with Excalidraw's zoom ladder. severity: cosmetic
   (folded into divergence #1's lack of rounding rather than listed separately below).

### Our extensions (no Excalidraw counterpart)

- `Camera.worldToScreen` / `Camera.screenToWorld` as reactive `$derived` `Matrix` objects
  (camera.svelte.ts:38-42) handed directly to `ctx.setTransform`. Excalidraw never
  materializes a matrix; it applies scalar `(scene+scroll)*zoom+offset` arithmetic per point.
  This is an architectural extension for the hand-rolled Canvas-2D renderer.
- `Camera.toWorld` / `Camera.toScreen` (camera.svelte.ts:45-52) — matrix-apply wrappers; the
  behavioral equivalents of the two utils functions but expressed via the matrix.
- `Camera.screenDistanceToWorld` (camera.svelte.ts:55-57) — convert a pixel *distance*
  (hit-test slop, handle radius) to world units by `d / zoom`. Excalidraw inlines this at
  call sites; ours centralizes it.
- `Camera.zoomBy` (camera.svelte.ts:85-87) — multiplicative zoom convenience over `zoomTo`.
- `Camera.reset` (camera.svelte.ts:90-94) — zoom=1, pan=0 (world origin at canvas top-left),
  distinct from `zoomReset` which re-centers (editor.svelte.ts:958-960).
- `Camera.setViewport` (camera.svelte.ts:59-62) — viewport size is owned by the Camera as
  reactive state; Excalidraw stores `width/height` in AppState instead.
