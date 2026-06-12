## Cluster: excalidraw__scene__1

This cluster contains a single source file, `packages/excalidraw/scene/zoom.ts`, which holds the canonical "zoom toward a viewport anchor point" math used by Excalidraw's camera. It is critical for parity in any reimplementation because it defines exactly how scroll offsets are recomputed so the world point under the cursor (or screen center) stays fixed while zooming.

### packages/excalidraw/scene/zoom.ts

Purpose: Computes the new scroll position and zoom value such that a given viewport anchor point (`viewportX`/`viewportY`) remains visually stationary when the zoom level changes from the current zoom to `nextZoom`.

Imports (types only, L1): `AppState` and `NormalizedZoomValue` from `../types`. `NormalizedZoomValue` is a branded/clamped zoom scalar (zoom values are normalized elsewhere before being passed in here); this file does no clamping itself — it trusts `nextZoom` is already a valid normalized zoom.

- `getStateForZoom({ viewportX, viewportY, nextZoom }, appState)` — L3-L35
  - Signature as written: first arg is a destructured object `{ viewportX: number; viewportY: number; nextZoom: NormalizedZoomValue }` (L3-L13); second arg is `appState: AppState` (L13). Return type is inferred (not annotated): an object literal `{ scrollX: number; scrollY: number; zoom: { value: NormalizedZoomValue } }` (L28-L34).
  - What it does / algorithm:
    1. Converts the viewport (screen/page) coordinates into "app layer" coordinates by subtracting the editor's canvas offset within the page: `appLayerX = viewportX - appState.offsetLeft`, `appLayerY = viewportY - appState.offsetTop` (L15-L16). This removes the editor element's position on the page so the math operates in canvas-local pixel space.
    2. Reads the current zoom scalar: `currentZoom = appState.zoom.value` (L18).
    3. Computes a zoom-independent "base" scroll position by backing the current zoom's offset out of the existing scroll: `baseScrollX = appState.scrollX + (appLayerX - appLayerX / currentZoom)` and the analogous Y (L21-L22). The term `(appLayerX - appLayerX / currentZoom)` is the scroll contribution that the current zoom adds at this anchor; adding it back yields the scroll as if zoom were 1.
    4. Computes the scroll offset needed for the target zoom at the same anchor: `zoomOffsetScrollX = -(appLayerX - appLayerX / nextZoom)` and the analogous Y (L25-L26) — the negative of the same expression evaluated with `nextZoom`.
    5. Returns the combined result: `scrollX = baseScrollX + zoomOffsetScrollX`, `scrollY = baseScrollY + zoomOffsetScrollY`, and `zoom: { value: nextZoom }` (L28-L34).
  - Notable inputs/outputs & invariants:
    - Inputs: viewport anchor in page-pixel coordinates, the desired (already normalized) target zoom, and the full `appState` (only `offsetLeft`, `offsetTop`, `zoom.value`, `scrollX`, `scrollY` are read).
    - Output: a partial-state patch suitable for spreading into `appState` (commonly `setState({ ...getStateForZoom(...) })`). The returned `zoom` object intentionally carries only `{ value }`, not the full zoom object.
    - Pure function: no side effects, no mutation of `appState`, no I/O. Deterministic for given inputs.
    - Invariant: the world-space point that maps to `(viewportX, viewportY)` before the zoom change maps to the same viewport point after applying the returned scroll/zoom. This is the "zoom about a pivot" guarantee.
  - Coordinate-space / math detail (important for parity):
    - Three spaces are involved: page/viewport pixels, app-layer (canvas-local) pixels after subtracting `offsetLeft`/`offsetTop`, and world units after dividing by zoom.
    - The core identity is the algebraic factoring of the anchor offset: for any zoom `z`, the scroll term at the anchor is `appLayer - appLayer / z`. The function removes this term at `currentZoom` and re-adds its negative at `nextZoom`. Combined: `newScroll = oldScroll + (appLayer - appLayer/currentZoom) - (appLayer - appLayer/nextZoom)`, which simplifies to `oldScroll + appLayer*(1/nextZoom - 1/currentZoom)`. The code keeps the unfactored two-step form for readability.
    - Division by zoom assumes zoom is strictly positive and nonzero; normalization upstream guarantees this (no guard here).
    - Subtracting `offsetLeft`/`offsetTop` first is essential — omitting it would pivot zoom about the page origin rather than the intended canvas anchor, a common reimplementation bug.

No other functions, classes, hooks, or significant constants exist in this file. It is a single pure-function module.
