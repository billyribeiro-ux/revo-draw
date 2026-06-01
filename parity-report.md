# Excalidraw Parity Report — revo-draw (LayoutForge) vs excalidraw-master

> Behavioral / per-function parity of our Svelte 5 + hand-rolled Canvas 2D implementation against the

> React/TSX excalidraw-master source. Each axis was compared by an agent reading BOTH real codebases,

> then an independent adversarial verifier re-checked the cited evidence. Generated 2026-06-01.


## How to read this

- **MATCH** — same behavior/algorithm; file:line cited on both sides.

- **DIVERGENT** — exists but differs (algorithm, edge case, default/threshold, or potential bug). Severity tagged.

- **ABSENT** — no equivalent. Most are intentional (single-user, no React/collab/firebase/mobile); real gaps are called out.

- A literal textual diff across React↔Svelte is not meaningful; this judges BEHAVIOR.


## Verification

Independent skeptic agents re-checked every MATCH sample and every DIVERGENCE claim against the cited lines:

**162 claims upheld, 4 refuted.** The 4 refuted claims had inaccurate line citations (a call-site cited instead of the implementation) — their broad conclusion may still hold but the *evidence* did not, so they are flagged below for manual confirmation rather than trusted:

1. `camera-viewport` — MATCH "pan via scroll mutation": cited excal line was the screen→world conversion, not a pan mutation.

2. `rendering` — MATCH "getCornerRadius": ours clamps to half-min; excalidraw uses a proportional/adaptive radius (`utils.ts:483-504`) — likely a **real DIVERGENCE**, recheck.

3. `transform-handles`/`rendering` — DIVERGENT "rotation-handle stalk": behavior real, but cited excal line was a call-site, not the gap constant.

4. (see per-axis detail) — one further citation imprecision.


## Executive summary (per axis)

| Axis | MATCH | DIVERGENT | ABSENT |
|---|---|---|---|
| geometry | 15 | 9 | 16 |
| camera-viewport | 7 | 5 | 5 |
| scene-zorder | 1 | 13 | 12 |
| element-model | 0 | 11 | 13 |
| hittest-collision-selection | 5 | 6 | 10 |
| transform-handles | 3 | 4 | 3 |
| drag-move | 2 | 7 | 5 |
| resize-rotate | 6 | 2 | 5 |
| snapping | 3 | 7 | 7 |
| rendering | 12 | 10 | 16 |
| commands-history | 5 | 15 | 12 |
| export | 3 | 6 | 9 |
| persistence-clipboard | 4 | 10 | 9 |

> Counts are textual tallies of status tokens in each section (approximate); see each section for the authoritative table.


---

## Parity: geometry

Axis focus: 2D vector / matrix / bbox / rotation / oriented-box math.

OUR implementation: `src/lib/canvas/geometry.ts` (hand-rolled, Canvas-2D-oriented). Objects use `{x,y}` / `{a,b,c,d,e,f}` shapes (matching `CanvasRenderingContext2D.setTransform`). Excalidraw uses branded tuple types (`[x,y]` points/vectors, `[number,number,number,number]` bounds) split across `@excalidraw/math` (`point.ts`, `vector.ts`, `segment.ts`, `line.ts`, `ellipse.ts`, `angle.ts`, `rectangle.ts`) and `@excalidraw/element/bounds.ts`.

Key scope difference up front: revo-draw elements are **semantic UI boxes** (rectangles/icons/text), all hit-tested and bounded as axis-aligned-or-rotated **rectangles**. Excalidraw additionally has freedraw/linear/arrow/diamond/ellipse elements, so a large fraction of `bounds.ts`, plus all of `segment.ts`/`line.ts`/`ellipse.ts`, exists to bound and collide arbitrary curves/polylines/ellipses. Those are ABSENT in ours by scope, not by oversight.

### Classification table

| Excalidraw fn | Status | Ours ref | Excal ref | Note |
|---|---|---|---|---|
| `pointRotateRads` (point.ts) | MATCH | `geometry.ts:145` `rotate` | `point.ts:125` | Identical rotate-about-center formula; both early-return the point when angle is falsy/0. |
| `pointDistance` (point.ts) | MATCH | `geometry.ts:142` `distance` | `point.ts:195` | Both `Math.hypot(dx,dy)`. |
| `pointDistanceSq` (point.ts) | ABSENT | — | `point.ts:211` | Squared-distance fast path; ours always uses `hypot`. No perf-critical inner loop needs it in our scope. Minor gap. |
| `pointCenter` (point.ts) | MATCH | `geometry.ts:158` `bboxCenter` (box variant) | `point.ts:184` | Ours has no two-point midpoint helper but `bboxCenter` computes the box center identically `(a+b)/2`. |
| `pointTranslate` (point.ts) | MATCH | `geometry.ts:127` `add` | `point.ts:170` | Component-wise add. |
| `pointScaleFromOrigin` (point.ts) | DIVERGENT | `geometry.ts:133` `scale` + `add` (composable) | `point.ts:229` | Ours has no single "scale a point about an origin" helper; equivalent is `add(origin, scale(sub(p,origin), m))`. Behaviorally reachable, cosmetic. |
| `pointsEqual` (point.ts) | DIVERGENT | `geometry.ts:264` `approxEqual` (scalar) | `point.ts:108` | Ours compares scalars with `eps=1e-6` and `<=`; Excalidraw compares 2D points with `tolerance=PRECISION` and strict `<`. No point-pair equality in ours, only scalar. cosmetic. |
| `isPoint`/`isValidPoint`/`pointFromArray`/`pointFromPair`/`pointFromVector` (point.ts) | ABSENT | — | `point.ts:50,64,76,89,257` | Tuple<->point plumbing + runtime type guards needed because Excalidraw passes untyped arrays across module boundaries. Ours uses typed `Vec2` objects; guards unnecessary. Intentional. |
| `isPointWithinBounds` (point.ts) | MATCH | `geometry.ts:187` `pointInBBox` | `point.ts:244` | Both test a point inside an axis-aligned box (Excalidraw's via min/max of two corner points; ours via x/y/w/h). Same inclusive semantics. |
| `vector` / `vectorFromPoint` (vector.ts) | MATCH | `geometry.ts:124` `vec`, `geometry.ts:130` `sub` | `vector.ts:10,28` | Construction + point-difference. (Ours lacks the `threshold/defaultValue` degenerate-vector fallback in `vectorFromPoint` — only used by Excalidraw arrow binding, out of scope.) |
| `vectorAdd`/`vectorSubtract`/`vectorScale` (vector.ts) | MATCH | `geometry.ts:127,130,133` `add`/`sub`/`scale` | `vector.ts:91,102,116` | Identical. |
| `vectorDot` (vector.ts) | MATCH | `geometry.ts:136` `dot` | `vector.ts:63` | Identical. |
| `vectorMagnitude`/`vectorMagnitudeSq` (vector.ts) | DIVERGENT | `geometry.ts:139` `length` | `vector.ts:137,127` | Ours has `length` (= magnitude via `hypot`) but **no squared-magnitude** variant. cosmetic/minor. |
| `vectorCross` (vector.ts) | ABSENT | — | `vector.ts:51` | 2D cross/perp-dot. Only used by Excalidraw segment intersection; ours has no segment math. Intentional by scope. |
| `vectorNormalize` (vector.ts) | ABSENT | — | `vector.ts:147` | No normalize helper in ours. Used by arrow/curve direction math. Intentional. |
| `vectorNormal` (vector.ts) | ABSENT | — | `vector.ts:160` | Right-hand normal. Same scope as above. Intentional. |
| `degreesToRadians`/`radiansToDegrees` (angle.ts) | ABSENT | — | `angle.ts:29,33` | Ours stores/uses radians throughout and never converts to/from degrees. Intentional. |
| `normalizeRadians` (angle.ts) | ABSENT | — | `angle.ts:11` | Ours does not wrap rotation into `[0,2π)`. See divergences — potential gap for rotation handle math (bug-risk to confirm against editor). |
| `radiansBetweenAngles`/`radiansDifference`/`isRightAngleRads`/`cartesian2Polar` (angle.ts) | ABSENT | — | `angle.ts:43,47,64,21` | Snapping-angle / polar helpers; ours uses a different (translation-based) snapping model. Intentional. |
| `linesIntersectAt` (line.ts) | ABSENT | — | `line.ts:23` | Infinite-line intersection. No line/segment geometry in ours. Intentional by scope. |
| `segmentsIntersectAt` / `distanceToLineSegment` / `pointOnLineSegment` / `lineSegmentIntersectionPoints` / `lineSegmentsDistance` / `lineSegmentRotate` (segment.ts) | ABSENT | — | `segment.ts:69,116,102,161,181,54` | Entire segment subsystem (used for visual/frame collision of non-rect shapes). Ours hit-tests rectangles via oriented-box only. Intentional by scope; see gaps for the one place this could matter (frame containment of rotated children). |
| `ellipseIncludesPoint` / `ellipseTouchesPoint` / `ellipseDistanceFromPoint` / `ellipseSegmentInterceptPoints` / `ellipseLineIntersectionPoints` (ellipse.ts) | ABSENT | — | `ellipse.ts:52,72,88,143,197` | No ellipse element type in ours; UI boxes are rectangles. Intentional by scope. |
| `rectangleIntersectRectangle` (rectangle.ts) | DIVERGENT | `geometry.ts:199` `bboxesIntersect` | `rectangle.ts:32` | Same AABB-overlap test, but ours is **inclusive** on touching edges (`!(a.x+a.w < b.x ...)`, i.e. `>=` overlap) while Excalidraw is **strict** (`minX1 < maxX2 && maxX1 > minX2 ...`). For zero-overlap edge-touching boxes ours returns `true`, Excalidraw `false`. severity: behavioral. |
| `rectangleIntersectLineSegment` / `rectangleFromNumberSequence` (rectangle.ts) | ABSENT | — | `rectangle.ts:19,13` | Segment-vs-rect; no segments in ours. Intentional. |
| `getBoundsFromPoints` (bounds.ts) | MATCH | `geometry.ts:223` `boundsOfPoints` | `bounds.ts:683` | Min/max over points. Excalidraw returns `[minX,minY,maxX,maxY]` + optional `padding`; ours returns `{x,y,w,h}` and has no padding param (callers add margin themselves). Same algorithm. |
| `aabbForElement` (bounds.ts) | MATCH | `geometry.ts:255` `orientedBBox` (+ `orientedCorners` `:176`) | `bounds.ts:1203` | Both rotate the 4 corners about the element center and take min/max. Ours has no `offset` padding param (applied by callers). Same algorithm for the rectangle case. |
| `getCommonBounds` / `getCommonBoundingBox` (bounds.ts) | MATCH | `geometry.ts:239` `unionBBox` | `bounds.ts:1008,1158` | Union of element bounds. Ours unions pre-rotated `orientedBBox` per element (see `scene-graph.svelte.ts:66`), matching Excalidraw which unions each element's rotated `getElementBounds`. |
| `getCenterForBounds` (bounds.ts) | MATCH | `geometry.ts:158` `bboxCenter` | `bounds.ts:1194` | Center of a bounds rect. |
| `getCommonBounds` empty case | MATCH | `geometry.ts:240,224` | `bounds.ts:1012` | Both return a zero box `(0,0,0,0)` on empty input. |
| `pointInsideBounds` (exclusive) (bounds.ts) | DIVERGENT | `geometry.ts:187` `pointInBBox` | `bounds.ts:1259` | `pointInBBox` is **inclusive** (`>=`/`<=`); Excalidraw `pointInsideBounds` is **exclusive** (`>`/`<`). Excalidraw also ships `pointInsideBoundsInclusive` (`bounds.ts:1267`) which exactly matches ours. So ours == the inclusive variant; the exclusive variant is absent. severity: behavioral (only at exact edge coords). |
| `pointInsideBoundsInclusive` (bounds.ts) | MATCH | `geometry.ts:187` `pointInBBox` | `bounds.ts:1267` | Exact match: inclusive `>=`/`<=` on both axes. |
| `boundsContainBounds` (bounds.ts) | MATCH | `geometry.ts:213` `bboxContains` | `bounds.ts:1290` | Ours' doc comment explicitly cites this. Both: inner fully inside outer, inclusive on edges. Algorithms agree (Excalidraw checks all 4 inner corners inclusive; ours checks min/max directly — equivalent). |
| `doBoundsIntersect` (bounds.ts) | DIVERGENT | `geometry.ts:199` `bboxesIntersect` | `bounds.ts:1276` | Same overlap intent but Excalidraw uses **strict** `<`/`>` (and null-guards both inputs → false); ours is **inclusive** and has no null guard. Edge-touching differs (see `rectangleIntersectRectangle` row). severity: behavioral. |
| `getElementBounds` / `ElementBounds` cache / `calculateBounds` per-type (bounds.ts) | DIVERGENT (rect-only subset) | `geometry.ts:255` `orientedBBox` | `bounds.ts:105,151,1000` | Ours implements only the rectangle branch (rotate 4 corners). Excalidraw special-cases ellipse (`hypot(w·cos,h·sin)`), diamond (4 edge-midpoints), linear/freedraw (rough.js curve path ops). Also Excalidraw memoizes via `WeakMap` keyed on element `version`; ours recomputes. For our rectangle-only element set the rect branch is the correct & complete equivalent; the missing branches are out of scope; the cache is absent (perf only). severity: cosmetic (scope). |
| `getElementAbsoluteCoords` (bounds.ts) | DIVERGENT | `geometry.ts:163` `bboxCorners` + `geometry.ts:158` `bboxCenter` | `bounds.ts:250` | Excalidraw returns `[x1,y1,x2,y2,cx,cy]`; ours splits into `bboxCorners` (TL,TR,BR,BL) and `bboxCenter`. Same underlying coords for rectangles. cosmetic. |
| `getResizedElementAbsoluteCoords` (bounds.ts) | ABSENT (in geometry) | — (resize lives in `editor.svelte.ts`) | `bounds.ts:1047` | Rect branch is trivial (`x,y,x+w,y+h`); ours handles resize in the editor controller, not geometry. Linear/freedraw rescale branch out of scope. Intentional split. |
| `getClosestElementBounds` (bounds.ts) | ABSENT | — | `bounds.ts:1120` | Nearest-element-by-center; used by Excalidraw scroll-to-content. Not needed in our scope. Intentional. |
| `getVisibleSceneBounds` (bounds.ts) | DIVERGENT | `camera.svelte.ts` (not geometry.ts) | `bounds.ts:1179` | Viewport-in-world. Ours derives this from the camera matrix (`world = (screen-pan)/zoom`) in `camera.svelte.ts`, not in geometry.ts. Equivalent concept, different home. cosmetic. |
| `getDraggedElementsBounds` / `getArrowhead*` / `getDiamondPoints` / `getCubicBezierCurveBound` / `getMinMaxXYFromCurvePathOps` / `getElementLineSegments` / `getSegmentsOnEllipse` (bounds.ts) | ABSENT | — | `bounds.ts:1034,717,525,602,630,303,478` | Arrowhead geometry, diamond/curve/bezier bounding, per-shape segment decomposition. All tied to element types ours doesn't have. Intentional by scope. |
| Affine matrix ops: `multiply`/`invert`/`apply`/`rotationMatrix`/`translation`/`scaling`/`compose` | (no Excalidraw counterpart) | `geometry.ts:53-120` | — | Excalidraw `@excalidraw/math` has no affine-matrix module; it does world<->screen via scalar `scrollX/scrollY/zoom` arithmetic. See "Our extensions". |

### Divergences & gaps

1. **AABB-intersect edge inclusivity (`bboxesIntersect`).** `geometry.ts:199` returns `true` for boxes that merely touch along an edge (e.g. `a` ends at x=100, `b` starts at x=100), because the test is `!(a.x+a.width < b.x || ...)` — strict `<` negated to inclusive `>=`. Excalidraw's `rectangleIntersectRectangle` (`rectangle.ts:38`) and `doBoundsIntersect` (`bounds.ts:1287`) use strict `<`/`>` and return `false` for edge-touching. Behavioral: marquee/overlap intersect tests will catch elements that exactly graze the marquee edge where Excalidraw would not. Confirm whether our marquee uses CONTAIN (`bboxContains`) — if so the user-visible impact is nil; the divergence only bites any caller of `bboxesIntersect` directly. severity: behavioral.

2. **`pointInBBox` is inclusive; Excalidraw's primary `pointInsideBounds` is exclusive.** `geometry.ts:187` uses `>=`/`<=`. Excalidraw's default `pointInsideBounds` (`bounds.ts:1259`) is exclusive `>`/`<`; the inclusive twin `pointInsideBoundsInclusive` (`bounds.ts:1267`) matches ours exactly. So ours corresponds to the inclusive variant. Only differs at exact-edge coordinates (a click precisely on a box boundary registers as a hit in ours). For UI-box hit-testing, inclusive is the more user-friendly choice; flag only so the intentional alignment with the *inclusive* (not default) Excalidraw function is on record. severity: behavioral (edge-only).

3. **No `normalizeRadians`.** `angle.ts:11` wraps angles into `[0, 2π)`. Ours never normalizes rotation. `pointInOrientedBox`/`orientedCorners`/`rotate` are immune (trig is periodic), so AABB and hit-testing are unaffected. The risk is anywhere rotation values are *compared* or *accumulated* (e.g. a rotation handle that sums deltas across gestures, or angle-snapping). That math lives in `editor.svelte.ts`, not geometry.ts — geometry.ts itself is correct without it. Marked bug-risk pending confirmation that the editor normalizes before comparing angles. severity: bug-risk (out-of-file; verify in editor).

4. **No segment / line / ellipse subsystem.** All of `segment.ts`, `line.ts`, `ellipse.ts`, plus `rectangleIntersectLineSegment` and the curve/bezier/diamond bounding in `bounds.ts`, are absent. This is correct for a semantic-UI-box editor: every element bounds & hit-test reduces to a (possibly rotated) rectangle, handled by `orientedBBox`/`pointInOrientedBox`. The one place Excalidraw uses segment math that *could* matter to us is precise frame-containment of rotated children (`getElementLineSegments`); ours approximates containment via axis-aligned `orientedBBox` union (`scene-graph.svelte.ts:66`) + `bboxContains`, which is looser than Excalidraw's per-edge test for rotated elements. Acceptable for the export-spec use case. severity: cosmetic (scope).

5. **No element-bounds memoization.** Excalidraw's `ElementBounds` caches per-element bounds in a `WeakMap` keyed on `version` (`bounds.ts:90,143`). Ours recomputes `orientedBBox` on every call. Pure perf; no behavioral difference. For a single-user local canvas this is fine. severity: cosmetic.

6. **Missing squared-distance / squared-magnitude fast paths.** `pointDistanceSq` (`point.ts:211`) and `vectorMagnitudeSq` (`vector.ts:127`) have no equivalents. Ours always pays the `sqrt`. No correctness impact; negligible perf at our element counts. severity: cosmetic.

### Our extensions (no Excalidraw counterpart in this axis)

These exist in `geometry.ts` because revo-draw drives a `CanvasRenderingContext2D` directly via affine matrices, whereas Excalidraw composes world<->screen from scalar `scrollX/scrollY/zoom` and never materializes a matrix:

- **Affine 2×3 matrix type + algebra** — `Matrix`/`IDENTITY` (`geometry.ts:33,51`), `matrix` (`:53`), `translation` (`:57`), `scaling` (`:61`), `rotationMatrix` (`:65`), `multiply` (`:72`), `compose` (`:84`), `invert` (`:88`), `apply` (`:105`), `applyVector` (`:113`, linear-only/no-translation transform), `scaleOf` (`:118`, uniform-scale magnitude used to convert px thresholds across zoom). The `{a,b,c,d,e,f}` layout deliberately matches `ctx.setTransform` argument order so the camera matrix applies to the context with zero conversion.
- **`clamp`** (`geometry.ts:260`) — scalar clamp; Excalidraw inlines `Math.min(Math.max(...))` per call site, no shared helper.
- **`approxEqual`** (`geometry.ts:264`) — scalar near-equality with `eps`; Excalidraw's nearest analog is the *point-pair* `pointsEqual` (`point.ts:108`), not a scalar helper.
- **`pointInOrientedBox`** (`geometry.ts:192`) — hit-tests a point against a rotated rectangle by un-rotating the point into the box's local frame (`rotate(p, -rotation, center)` then AABB test) with a `rotation===0` fast path. Excalidraw reaches the same result indirectly (rotate the box corners, or build line segments) but has no single "un-rotate the query point" rectangle helper; this is a cleaner formulation for an all-rectangles element model.

(Note: the broader Markdown-export compiler and semantic-layout inference are a different subsystem — not part of this geometry axis — so they are out of scope for this comparison.)


---

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


---

## Parity: scene-zorder

Axis focus: reactive document model, element CRUD, z-order / reordering, parent-child.

OUR implementation: `src/lib/canvas/scene-graph.svelte.ts` — a Svelte-5-runes singleton `SceneGraph`
holding a single `LayoutDocument`. Hierarchy is a real **tree**: every element has a `parentId`,
sibling order is an explicit integer `z` field, root order is the `rootOrder: ElementId[]` array.
Geometry is world-space; reparenting preserves world position.

EXCALIDRAW counterpart: `Scene.ts` (the mutable element store + caches), `zindex.ts` (z-order
actions), `mutateElement.ts` (in-place patch + version bump), `sortElements.ts` (group/bound-text
normalization). Excalidraw has **no tree**: all elements live in one flat ordered array; "z-order"
IS array position, encoded into a per-element `index` (fractional index string) that is kept in
sync with array order via `syncInvalidIndices`/`syncMovedIndices`. Containment is expressed by
`frameId` / `groupIds` / `containerId` references, not a parent tree.

This is the central architectural divergence and it colours every row below: ours is
*tree + integer-z-per-sibling-group*; theirs is *flat-array + fractional-index*.

### Classification table

| Excalidraw fn | Status | Ours ref | Excal ref | Note |
|---|---|---|---|---|
| `Scene` element store / caches (`elements`, `nonDeletedElements`, `elementsMap`, frames) | DIVERGENT | `scene-graph.svelte.ts:31-67` | `Scene.ts:108-176` | Ours stores `doc.elements` keyed map + `rootOrder` + derived `ordered`; theirs caches flat arrays + maps + deleted/non-deleted split. We have no `isDeleted` tombstones (no collab), so no non-deleted cache. Severity: behavioral (intentional). |
| `Scene.replaceAllElements` | DIVERGENT | `replaceDocument` `scene-graph.svelte.ts:154-159` | `Scene.ts:271-301` | Ours swaps the whole `LayoutDocument` and clears selection; no `syncInvalidIndices` (we have no fractional indices) and no frame-likes rebuild. Severity: behavioral. |
| `Scene.mapElements` (map-all, no-op if unchanged) | ABSENT | — | `Scene.ts:254-269` | No bulk-map primitive; callers iterate `updateElement`. Intentional for our scope. |
| `Scene.insertElementsAtIndex` / `insertElement` | DIVERGENT | `addElement` / `addElements` `scene-graph.svelte.ts:161-180` | `Scene.ts:341-375` | Ours inserts into `rootOrder` at an optional index (root only) and assigns into the map; theirs splices into the flat array at any index then `syncMovedIndices`. Ours has no index-based insert for non-root (uses `z`). Severity: behavioral. |
| `Scene.getElement` / `getNonDeletedElement` | MATCH | `get` `scene-graph.svelte.ts:71-73` (`has` :75-77) | `Scene.ts:228-240` | Map lookup by id. Ours returns `undefined`, theirs `null`; no deleted variant (no tombstones). |
| `Scene.getElementIndex` | DIVERGENT | `childOrderOf` index-of `scene-graph.svelte.ts:91-95` | `Scene.ts:377-379` | Theirs = position in flat array (global z). Ours has no single global index; closest is position within a sibling group sorted by `z`. Severity: behavioral. |
| `Scene.getContainerElement` | DIVERGENT | `ancestorsOf` / `get(parentId)` `scene-graph.svelte.ts:111-121` | `Scene.ts:381-395` | Theirs resolves `containerId` (text→container binding). Ours has generic `parentId`; no separate bound-text container concept. Severity: cosmetic (different model, same "find parent"). |
| `Scene.getElementsFromId` (id-or-group expansion) | ABSENT | — | `Scene.ts:397-407` | No groups in our model. Intentional. |
| `Scene.mutateElement` / `mutateElement.ts` `mutateElement` | DIVERGENT | `updateElement` `scene-graph.svelte.ts:183-188` | `Scene.ts:411-445`, `mutateElement.ts:37-144` | Both mutate in place. Theirs: per-key dirty diff, `ShapeCache.delete` on size change, elbow-arrow point recompute, `version`/`versionNonce`/`updated` bump, conditional `triggerUpdate`. Ours: blind `Object.assign` + `touch()` (revision++ / dirty / updatedAt). No version/nonce (no collab), no per-key equality skip, no shape cache. Severity: behavioral (intentional; no collab/CRDT). |
| `mutateElement.ts` `newElementWith` (immutable copy + version bump) | ABSENT | — | `mutateElement.ts:146-178` | We mutate in place; immutability for undo is handled by the history layer's snapshots, not here. Intentional. |
| `mutateElement.ts` `bumpVersion` | ABSENT | — | `mutateElement.ts:185-193` | No element `version`/`versionNonce` fields (no collab reconciliation). Intentional. |
| `zindex.ts` `moveOneRight` (bring forward one) | DIVERGENT | `bringForward`→`reZOrder(+1)` `scene-graph.svelte.ts:252-254, 276-291` | `zindex.ts:316-395, 574-580` | Ours swaps `z` with the next sibling in the same parent group — single element, single step, no frame/group/bound-text awareness, no multi-select contiguous grouping. Theirs shifts the whole selection by one slot in the flat array accounting for frames/groups/bindings. Severity: behavioral. |
| `zindex.ts` `moveOneLeft` (send backward one) | DIVERGENT | `sendBackward`→`reZOrder(-1)` `scene-graph.svelte.ts:255-257, 276-291` | `zindex.ts:316-395, 566-572` | Mirror of above; single-element z-swap vs selection-aware flat-array shift. Severity: behavioral. |
| `zindex.ts` `moveAllRight` (bring to front) | DIVERGENT | `bringToFront` `scene-graph.svelte.ts:258-263` | `zindex.ts:397-481, 594-604` | Ours sets `z = nextZ(parent)` (max sibling z + 1) — within sibling group only. Theirs moves selection to end of array, frame/group-aware. No re-pack. Severity: behavioral; bug-risk noted below (unbounded z growth). |
| `zindex.ts` `moveAllLeft` (send to back) | DIVERGENT | `sendToBack` `scene-graph.svelte.ts:264-274` | `zindex.ts:397-481, 582-592` | Ours sets `z = min-1` then `normalizeZ` re-packs the sibling group to 0..n-1. Theirs moves to front of array, frame/group-aware. Ours re-packs (good); see bug note re: the `min` seed. Severity: behavioral. |
| `zindex.ts` `getIndicesToMove` (selection + contiguous deleted) | ABSENT | — | `zindex.ts:36-70` | No deleted tombstones; selection handled directly in `selectedElements` derived. Intentional. |
| `zindex.ts` `toContiguousGroups` | ABSENT | — | `zindex.ts:72-81` | Only needed for multi-element flat-array shifting. Intentional gap (our z-order is single-element). |
| `zindex.ts` `getTargetIndex` / `getTargetIndexAccountingForBinding` / `getContiguousFrameRangeElements` | ABSENT | — | `zindex.ts:83-147, 197-303` | Frame/group/bound-text aware target resolution. No frames/groups/bindings in our model. Intentional. |
| `zindex.ts` `shiftElementsAccountingForFrames` | ABSENT | — | `zindex.ts:483-561` | Frame-children-aware shifting. Intentional (no frames). |
| `zindex.ts` `moveArrowAboveBindable` | ABSENT | — | `zindex.ts:153-191` | Arrow-binding z-fixup. No arrows/bindings. Intentional. |
| `sortElements.ts` `normalizeElementOrder` / `defragmentGroups` / `normalizeBoundElementsOrder` | DIVERGENT | `collectOrdered` `scene-graph.svelte.ts:127-143`, `childOrderOf` :91-95 | `sortElements.ts:5-119` | Theirs re-clusters a flat array so group members and bound texts sit contiguously, recursing nested groups. Ours achieves contiguity structurally: depth-first tree walk emits each subtree contiguously, children ordered by `z`. Same *goal* (stable, group-contiguous ordering) via different mechanism. Severity: behavioral. |
| `fractionalIndex.ts` `syncInvalidIndices` / `syncMovedIndices` | DIVERGENT | `normalizeZ` `scene-graph.svelte.ts:294-300` | `fractionalIndex.ts` (+ called from `Scene.ts:285,367`, `zindex.ts:392,478`) | Both reconcile "logical order" with stored order keys after a move. Theirs generates fractional-index strings between neighbours; ours re-packs integer `z` to 0..n-1 within a sibling group. Ours only runs `normalizeZ` on `sendToBack`; theirs syncs on every reorder/insert. Severity: behavioral. |
| `getNonDeletedElements` split | ABSENT | — | `Scene.ts:50-65` | No tombstones. Intentional. |
| `Scene.onUpdate` / `triggerUpdate` / `sceneNonce` callbacks | DIVERGENT | `touch` (revision++) `scene-graph.svelte.ts:147-151` | `Scene.ts:303-324, 141-145` | Theirs is an explicit pub/sub + random nonce for the React renderer. Ours uses a `$state` `revision` counter that Svelte reactivity propagates to the canvas renderer. Same role, different reactivity model. Severity: cosmetic. |
| `Scene.destroy` | ABSENT | — | `Scene.ts:326-339` | Singleton lives for the session; `replaceDocument` resets state. Intentional. |

### Divergences & gaps

1. **bringToFront grows `z` unboundedly without re-pack (bug-risk).**
   `bringToFront` (`scene-graph.svelte.ts:258-263`) sets `el.z = nextZ(parent)` = max sibling z + 1
   and never normalizes, whereas `sendToBack` (:264-274) re-packs via `normalizeZ`. Repeated
   bring-to-front leaves ever-larger sparse `z` values. Functionally fine (order is by `z`
   comparison, `childOrderOf` sorts), and these are not money values, but it is asymmetric with
   `sendToBack` and diverges from Excalidraw, which keeps indices dense/normalized via
   `syncMovedIndices` after every reorder. Severity: bug-risk (latent, not user-visible today).

2. **`sendToBack` min-seed when the element is the only/sole child.**
   `scene-graph.svelte.ts:270`: `siblings.reduce((m, e) => Math.min(m, e.z), 1)`. The reduce seed is
   `1`, so with no other siblings `min = 1` and the element gets `z = 0`, then `normalizeZ` repacks
   to `0` — correct by luck. With siblings whose min z is already `> 1` the seed `1` would win and
   yield `z = 0`; still correct because `normalizeZ` repacks afterwards. The seed is effectively
   inert because of the trailing `normalizeZ`, but it is a confusing magic number (a min-reduce
   seeded with a non-extreme value). Severity: cosmetic. Evidence: lines 264-274.

3. **Single-element z-order only; no multi-selection reorder.**
   Excalidraw's `moveOne*`/`moveAll*` operate on the *whole selection* as contiguous groups
   (`getIndicesToMove` + `toContiguousGroups`, `zindex.ts:36-81`). Ours' `bringForward` etc. take a
   single `id`. If the editor needs "bring all selected forward," it must call per-element, which
   does not preserve relative order or contiguity the way Excalidraw guarantees. Severity:
   behavioral (a real gap if multi-select reorder is a product requirement; see KNOWN_GAPS).

4. **No fractional indices / no global z.** Ours has no single global stacking order across the
   whole document — order is per-sibling-group `z` plus tree position. Cross-parent z comparisons
   are undefined by design. Excalidraw's flat array gives a total order. This is intentional given
   the tree model but means "is element A above element B" globally is only answerable via the
   depth-first `ordered` walk, not a numeric compare. Severity: behavioral (intentional).

5. **`updateElement` does no dirty-diff, version bump, or shape-cache invalidation.**
   `mutateElement.ts:77-144` skips unchanged keys, bumps `version`/`versionNonce`/`updated`, and
   deletes the shape cache on width/height/points change. Ours `Object.assign`s blindly and bumps a
   global `revision` (`scene-graph.svelte.ts:183-188`). No per-element versioning (no collab) and no
   shape cache (Canvas 2D re-renders from `revision`). Intentional, but note ours always marks dirty
   even on a no-op patch. Severity: behavioral (intentional).

6. **`reparent` cycle-guard + world-position preservation is an EXTENSION-shaped divergence.**
   `scene-graph.svelte.ts:222-243` rejects self-parenting and descendant cycles, moves between
   `rootOrder` and child groups, and places the moved element at top of the new sibling group via
   `nextZ`. Excalidraw has no parent tree to reparent within; the nearest analog is `frameId`
   reassignment scattered across frame actions. Treated as ours-side behavior with no direct
   Excalidraw counterpart in these files. Severity: behavioral (intentional model difference).

### Our extensions (no Excalidraw counterpart in these files)

- **Tree hierarchy traversal:** `childrenOf` (`:80-88`), `childOrderOf` (`:91-95`),
  `descendantsOf` (`:98-108`), `ancestorsOf` (`:111-121`), `isAncestor` (`:123-125`),
  `collectOrdered` (`:127-143`). Excalidraw has no parent tree; containment is `frameId`/`groupIds`
  references resolved by helper functions, not a recursive parent/child walk.
- **`reparent`** (`:222-243`) and **`nextZ`** (`:245-248`) — tree reparenting with cycle rejection
  and world-position preservation. No Excalidraw equivalent.
- **`translateSubtree`** (`:191-201`) — moving a parent walks the subtree and shifts all descendants
  by a world delta (because children store world geometry, not parent-relative). Excalidraw moves
  frame children via separate frame logic, not a subtree walk.
- **`removeElement` returns the removed subtree** (`:204-215`) for undo payloads, and prunes
  `rootOrder`. Excalidraw deletes via `isDeleted` tombstones (kept for collab), never physically
  removing; ours physically deletes (no collab).
- **Selection helpers as scene state:** `select`/`selectOne`/`addToSelection`/`toggleSelection`/
  `clearSelection`/`selectAll`/`isSelected` (`:304-333`) live on the scene using a reactive
  `SvelteSet`. `selectAll` (:320-330) deliberately mirrors Excalidraw `actionSelectAll` semantics
  (skip hidden/locked) — cited in code. Excalidraw keeps selection in `AppState`, separate from the
  Scene store.
- **Derived geometry selectors:** `ordered` (:46), `contentBounds` (:49-55), `selectedElements`
  (:58-60), `selectionBounds` (:63-67), and `centroidOf` (:338-350) — reactive `$derived` bounds/
  centroid helpers for zoom-to-fit and paste-offset. Excalidraw computes these via standalone
  utils, not Scene members.
- **`addElements`** (`:172-180`) — bulk add of a pasted subtree preserving parent links and root
  membership.

### Sanity of correspondence

The two systems agree on the *behavioral contract* of element CRUD and "make ordering stable and
group-contiguous," but reach it through opposite data models (integer-z tree vs fractional-index
flat array). The bulk of ABSENT rows (frames, groups, bound text, arrows, fractional indices,
tombstones, versioning, collab nonces) are intentional per our single-user / no-collab / Canvas-2D
scope. The two findings worth tracking are (1) the asymmetric un-normalized `bringToFront` and
(3) the single-element-only z-order vs Excalidraw's selection-aware reorder.


---

## Parity: element-model

Axis focus: the element discriminated union, the create/factory + per-type defaults
path, and id generation. Compared against Excalidraw's `newElement.ts` (element
constructors) and `typeChecks.ts` (the type-guard family).

Frameworks differ fundamentally: Excalidraw models **freeform drawing primitives**
(rectangle / ellipse / diamond / arrow / line / freedraw / text / image / frame /
embeddable / iframe) plus rough.js render seeds, collaboration version vectors, and
text-binding. LayoutForge models **semantic UI components** (button, nav, card, hero,
…) that compile to a Markdown layout spec. So the discriminated unions are NOT meant to
correspond member-for-member; what is comparable is the *factory algorithm*, *defaults
strategy*, *id generation*, and the *type-guard / container-membership* pattern. Judged
on behavior, not member overlap.

### Classification table

| Excalidraw fn | Status | Ours ref | Excal ref | Note |
|---|---|---|---|---|
| `_newElementBase` (base element factory) | DIVERGENT | `defaults.ts:368-416` `createElement` | `newElement.ts:78-156` | Same role: stamp a complete base + merge caller overrides. Differs in default set, id source, and out-of-range guard (below). |
| id assignment `rest.id \|\| randomId()` (nanoid) | DIVERGENT | `uuid.ts:16-56` `uuidv7` (always self-generated) | `newElement.ts:127`, `random.ts:16` | Different algorithm AND policy: ours is monotonic UUID v7 and ids are NEVER caller-overridable; Excalidraw uses nanoid and accepts a caller-supplied id. See divergences. |
| `seed: randomInteger()` (rough.js render seed) | ABSENT | — | `newElement.ts:145`, `random.ts:9` | No rough.js; clean Canvas 2D render. Intentional per scope (rule 8). |
| `version` / `versionNonce` (collab reconciliation) | ABSENT | — | `newElement.ts:146-147` | No collaboration. Intentional per scope (single-user, no collab). |
| `updated: getUpdatedTimestamp()` (per-element mtime) | DIVERGENT | doc-level `updatedAt` `types.ts:541` | `newElement.ts:150`, `utils.ts:650` | Ours tracks freshness at the document level only, not per element. Intentional: no per-element diff/sync. |
| `isDeleted: false` (soft-delete tombstone) | ABSENT | — | `newElement.ts:148` | Ours hard-deletes from the `elements` map; `hidden` (`types.ts:166`) is a render flag, not a tombstone. Intentional (no collab merge → no tombstones). |
| oversize guard (`x/y/w/h` ∉ ±1e6 → `console.error`) | ABSENT | — | `newElement.ts:103-123` | No equivalent sanity clamp/log in `createElement`. Minor real gap (see divergences). |
| default props merge (`DEFAULT_ELEMENT_PROPS`) | DIVERGENT | `defaults.ts:122-131` `BASE_STYLE`+`defaultStyle` | `newElement.ts:83-99`, `constants.ts:422-431` | Same idea (defaults under caller overrides). Different defaults: opacity 1 vs 100; strokeWidth bucket `'bold'` vs numeric 2; no `roughness`. See divergences. |
| `newTextElement` (measure → size → align-offset) | DIVERGENT | `createElement('text', …)` `defaults.ts:265,27` | `newElement.ts:239-291` | Excalidraw measures the glyphs and sets `width/height` from metrics + shifts x/y by text/vertical align. Ours uses a fixed default box (240×32) and never measures. Behavioral, but intentional: text is a semantic region, not laid-out glyphs. |
| `getTextElementPositionOffsets` | ABSENT | — | `newElement.ts:217-237` | Tied to glyph measurement; n/a (no text metrics). Intentional. |
| `getAdjustedDimensions` / `refreshTextDimensions` | ABSENT | — | `newElement.ts:293-440` | Re-measure-on-edit for text. n/a (no measured text). Intentional. |
| `adjustXYWithRotation` | ABSENT | — | `newElement.ts:373-418` | Rotation-aware reflow of text box on resize. Ours stores rotation (`types.ts:159`) but resize math lives in `editor.svelte.ts`, not the factory. Out of axis. |
| `newFrameElement` / `newMagicFrameElement` | DIVERGENT | `createElement('frame', …)` `defaults.ts:62-64,135-137` | `newElement.ts:183-215` | Both special-case frames. Excalidraw adds a `name` field + `magicframe` variant; ours has a single `frame` semantic type with a `LayoutIntent`, no AI-magic variant. Scope difference. |
| `newImageElement` (strokeColor transparent, status/fileId/scale/crop) | DIVERGENT | `createElement('image', …)` `defaults.ts:267,151,240-246` | `newElement.ts:527-546` | Both seed image-specific fields. Ours: `fit:'cover'`, optional `alt`/`aspectRatio`. No async `status`/`fileId` (R2/file pipeline) — images here are layout placeholders. Scope difference. |
| `newLinearElement` / `newArrowElement` / `newFreeDrawElement` | ABSENT | — | `newElement.ts:442-525` | No freeform/linear primitives. Intentional per scope (semantic UI only). `divider` (`types.ts:289`) is the nearest cousin but is a styled box, not a points-array line. |
| `newEmbeddableElement` / `newIframeElement` | ABSENT | — | `newElement.ts:165-181` | No live web embeds. Intentional. `svg` element (`types.ts:300`) is the inert analogue. |
| `isImageElement` / `isTextElement` / `isFrameElement` … (type guards) | DIVERGENT | `isContainerType` `types.ts:77-79` + discriminant `el.type === …` | `typeChecks.ts:40-91` | Ours has one membership guard (`isContainerType`) over a const tuple; per-type narrowing is done inline via the `type` discriminant + `ElementByType` map (`types.ts:495-533`). Excalidraw exports a guard per type. Same narrowing behavior, different surface. |
| `isFrameLikeElement` / `isIframeLikeElement` (category guards) | DIVERGENT | `CONTAINER_TYPES` tuple + `isContainerType` `types.ts:60-79` | `typeChecks.ts:84-91,58-64` | Both define "category membership." Ours: a single broad `container` category (13 types). Excalidraw: many fine-grained categories (frame-like, iframe-like, bindable, rectanguloid…). Coarser by design. |
| `isBindableElement` / `isTextBindableContainer` / `hasBoundTextElement` / `isBoundToContainer` | ABSENT | — | `typeChecks.ts:177-302` | Text-to-container binding model. Ours has no bound-text concept (`label`/`content` are inline string fields). Intentional. |
| `isBindingElement` / `isArrowBoundToElement` | ABSENT | — | `typeChecks.ts:160-175,304-306` | Arrow binding. No arrows. Intentional. |
| `isUsingAdaptiveRadius` / `isUsingProportionalRadius` / `canApplyRoundnessTypeToElement` / `getDefaultRoundnessTypeForElement` | DIVERGENT | per-type `radius` in `perTypeStyle` `defaults.ts:133-212` | `typeChecks.ts:308-356` | Both decide corner rounding by type. Excalidraw computes an adaptive vs proportional roundness *type* at render. Ours bakes a fixed px `radius` per semantic type at create time. Simpler, static. |
| `isValidPolygon` / `canBecomePolygon` / `getLinearElementSubType` | ABSENT | — | `typeChecks.ts:358-371,380-394` | Polygon/line geometry. No linear elements. Intentional. |
| `isFlowchartNodeElement` / `isEligibleFrameChildType` | DIVERGENT | `isContainerType` (parent eligibility) `types.ts:77` | `typeChecks.ts:274-282,396-414` | `isEligibleFrameChildType` whitelists which types may be a frame child; ours allows any element to nest under any container (`parentId`, `types.ts:152`) and gates by container-ness of the *parent*, not the child type. Behavioral difference in nesting rules. |
| `isExcalidrawElement` (runtime schema check w/ `assertNever`) | ABSENT | — | `typeChecks.ts:244-272` | No runtime "is this one of my element types" validator on load. Persistence trusts the `.lfdoc` shape. Minor gap (see divergences). |

### Divergences & gaps

1. **id generation — UUID v7 (monotonic) vs nanoid; non-overridable vs overridable.**
   Ours: `uuid.ts:16-56` always self-mints a time-sortable UUID v7 with a 12-bit
   intra-millisecond monotonic counter (`seq`, `uuid.ts:14,21-31`) and a backwards-clock
   clamp (`uuid.ts:28`). `createElement` explicitly strips any caller-supplied `id`
   (`defaults.ts:387,392`) so it can NEVER be overridden. Excalidraw uses
   `rest.id || randomId()` (`newElement.ts:127`) where `randomId()` is `nanoid()`
   (`random.ts:16`) — opaque, non-time-ordered, and **caller-overridable** (needed for
   collab reconciliation and remote element insertion). Severity: behavioral. The
   non-overridable policy is a deliberate, stronger invariant for a single-user file
   (no id collision-resolution needed); the v7 time-ordering is a feature (sortable
   files/library rows). Not a bug, but a genuine algorithmic divergence to record.

2. **No oversize position/size guard.** Excalidraw logs (`newElement.ts:103-123`) when
   any of x/y/w/h falls outside ±1e6. `createElement` (`defaults.ts:368-416`) has no
   such guard; a runaway drag or a malformed paste can mint an element with absurd
   geometry silently. Severity: bug-risk (low). Real, if minor, gap — worth a clamp or
   dev-mode warning given the infinite canvas.

3. **Default style values differ from Excalidraw's `DEFAULT_ELEMENT_PROPS`.**
   `BASE_STYLE` (`defaults.ts:122-127`) uses `opacity: 1` (0..1 scale, per
   `types.ts:146`) whereas Excalidraw uses `opacity: 100` (0..100, `constants.ts:429`).
   `strokeWidth` is a bucket `'bold'` (`defaults.ts:123`, → 2px via `STROKE_WIDTH_PX`,
   `types.ts:107`) vs Excalidraw's raw `2` (`constants.ts:426`). Ours has no
   `roughness` (no rough.js). Severity: cosmetic — the scales are internally consistent
   within each app; only matters if a document were ever cross-imported (not a goal).

4. **Text is a fixed semantic box, not measured glyphs.** `newTextElement`
   (`newElement.ts:239-291`) derives width/height from `measureText` and offsets x/y by
   align. Ours mints text at a static 240×32 (`defaults.ts:27`) with `textRole`/
   `textAlign` metadata only (`defaults.ts:266`). Severity: behavioral, intentional —
   text exports as a semantic heading/body region, not pixel-fitted type. Recorded
   because it is the single largest factory-algorithm difference.

5. **Frame-child eligibility is inverted.** Excalidraw gates nesting on the *child's*
   type (`isEligibleFrameChildType`, `typeChecks.ts:396-414`). Ours gates on the
   *parent's* container-ness (`isContainerType`, `types.ts:77`) and lets any element
   nest under any container via `parentId`. Severity: behavioral. Looser model; fine for
   a layout tool but means e.g. a frame could be parented under a card, which Excalidraw
   forbids. Worth noting if nesting rules ever tighten.

6. **No runtime element-schema validator on load.** Excalidraw's `isExcalidrawElement`
   (`typeChecks.ts:244-272`) uses `assertNever` to reject unknown element types at
   runtime. Ours trusts the deserialized `.lfdoc` shape (no equivalent guard in this
   axis). Severity: bug-risk (low) — a hand-edited or future-version file with an
   unknown `type` would flow into the renderer/exporter unchecked. Acceptable for a
   local single-user file but a real gap vs the reference.

### Our extensions (no Excalidraw counterpart)

- **`SemanticType` union of 37 UI-component types** (`types.ts:14-57`) and the
  `ElementByType` precise-typing map (`types.ts:495-533`) — the core domain model.
  Excalidraw has ~13 drawing primitives; the entire semantic vocabulary is an extension.
- **`LayoutIntent`** (`types.ts:90-102`) + `defaultLayout` (`defaults.ts:60-118`):
  per-container flex/grid/gap/justify/align/responsive intent baked at create time. No
  Excalidraw analogue (Excalidraw is freeform geometry, not layout intent).
- **`defaultLabel`** (`defaults.ts:215-256`): human label per type, surfaced in the
  Markdown export. No counterpart.
- **`typeSpecificDefaults`** (`defaults.ts:259-348`): rich per-type seed content
  (button text, table columns, breadcrumb items, hero copy, etc.) so a dropped element
  looks intentional. Excalidraw's per-type extras (points/arrowheads/fileId) are
  geometric, not content.
- **`IconRef` + per-element embedded icon** (`types.ts:124-128,177`) and the standalone
  `IconElement` / `SvgElement` (`types.ts:282-306`): offline Phosphor icon identity +
  sanitized SVG body for round-trippable, code-generatable icons. No counterpart.
- **`isContainerType` over a const tuple** (`types.ts:60-79`): single coarse
  container-membership guard replacing Excalidraw's guard-per-category family.
- **`ClipboardPayload`** (`types.ts:549-552`) — a typed subtree whose ids are explicitly
  regenerated on paste (consistent with the non-overridable-id invariant in divergence 1).
- **`createBlankDocument`** (`defaults.ts:419-432`) — whole-document factory (canvas
  size, OKLCH background, v7 doc id). Excalidraw's app-level scene init is not in this
  element-model axis.


---

## Parity: hittest-collision-selection

Scope of axis: point hit-test (which element is under the pointer), marquee/box containment
(which elements a drag-rectangle selects), and handle hit detection (which resize/rotate handle
the pointer is over).

OUR implementation is a layout-sketching tool whose only element shapes are **axis-aligned
rectangles that can carry a `rotation`** (semantic boxes / icons). Excalidraw supports
rectangles, diamonds, ellipses, linear elements (line/arrow), freedraw, frames, text, images,
embeds, and binding — so most of Excalidraw's collision surface is shape-specific machinery that
has no counterpart in our box-only model. The judgement below treats those as ABSENT-by-scope
unless the absence changes box behavior.

Files compared:
- Ours: `src/lib/canvas/hit-test.ts` (+ geometry helpers in `src/lib/canvas/geometry.ts`)
- Excal: `packages/element/src/collision.ts`, `selection.ts`, `resizeTest.ts`

### Classification table

| Excalidraw fn | Status | Ours ref | Excal ref | Note |
|---|---|---|---|---|
| `hitElementItself` (point-in-element, top-level) | DIVERGENT | `hit-test.ts:151` `pointInElement` / `hit-test.ts:117` `hitTestPoint` | `collision.ts:119` | Both do cheap rotated-AABB test then precise test. Ours stops at the rotated AABB (which IS the precise shape for boxes); Excal adds outline-vs-inside distinction, `threshold`, frame-name bounds, and a version cache. For boxes ours is behaviorally equivalent except no `threshold` padding and no transparent-fill "border only" rule. |
| `isPointInRotatedBounds` | MATCH | `geometry.ts:192` `pointInOrientedBox` | `collision.ts:194` | Identical algorithm: if angle 0 test AABB directly; else rotate the point by `-angle` about the box center and test the unrotated AABB. Ours has no `tolerance` param (always 0). |
| `isPointInElement` (ray-cast even-odd) | DIVERGENT | `geometry.ts:192` `pointInOrientedBox` | `collision.ts:756` | Excal uses a general even-odd ray-cast (count outline intersections, odd = inside) to support diamonds/ellipses/loops. Ours uses direct rotated-AABB containment. For rectangles the two are equivalent; the ray-cast is only needed for non-rectangular shapes we don't have. |
| `isPointOnElementOutline` / `distanceToElement` | ABSENT (by scope) | — | `collision.ts:742` | Border-proximity hit with a `tolerance`. Lets Excal grab transparent/stroke-only shapes by their edge. Ours always treats a box as a filled, fully-draggable body (no transparent fill, no edge-only grab), so this is intentionally absent. |
| `getElementsWithinSelection` (marquee) | DIVERGENT | `hit-test.ts:131` `hitTestMarquee` | `selection.ts:90` | Both normalize the rect and, in CONTAIN mode, select elements whose AABB is enveloped (`boundsContainBounds` == our `bboxContains`). Differences: (1) ours uses the element's **rotated** AABB (`orientedBBox`) which matches Excal's intent for rotated boxes; (2) ours does NOT inflate by `strokeWidth/2`; (3) ours has no "overlap" mode, no group cohesion, no frame clipping, no bound-text union — all out of scope. |
| `boundsContainBounds` (containment predicate) | MATCH | `geometry.ts:213` `bboxContains` | `selection.ts:219` (usage) | Inclusive-edge "inner fully inside outer" AABB test; identical comparison. |
| marquee rect normalization | MATCH | `hit-test.ts:142` `marqueeRect` | `selection.ts:100-103` | Both take min/max of the two drag corners to build a positive-area rect. |
| `shouldTestInside` | ABSENT (by scope) | — | `collision.ts:82` | Decides whether a shape is grabbable from its interior vs only its outline (depends on fill transparency, bound text, loop-closure for line/freedraw). Ours: boxes are always interior-grabbable; no transparent-fill or open-path cases exist. |
| `resizeTest` (handle hit detection) | DIVERGENT | `hit-test.ts:99` `hitHandle` (+ `selectionHandles`/`orientedHandles`) | `resizeTest.ts:49` | Both test rotation handle then the 8 resize handles. Excal uses **rectangle containment** (`isInsideTransformHandle`, the handle's own w/h box) and resolves ties by first-match key order; ours uses **radius/nearest-center** (`Math.hypot <= radius`, picks the closest). Behaviorally similar but our tie-break is nearest-wins vs Excal's fixed key order. See divergences. |
| `isInsideTransformHandle` | DIVERGENT | `hit-test.ts:99` `hitHandle` | `resizeTest.ts:39` | Excal: point inside the handle's rectangle `[x,y,w,h]`. Ours: point within `radiusWorld` of the handle center. Different geometry (square vs circle), and ours scales the hit area by `radiusWorld` passed from the controller rather than a fixed handle size / zoom. |
| side-resizing (`canResizeFromSides` + `getSelectionBorders` + `pointOnLineSegment`) | ABSENT | — | `resizeTest.ts:92`, `277`, `getTransformHandleTypeFromCoords:189` | Excal lets you resize by grabbing an edge (not just a corner/mid handle), via `SIDE_RESIZING_THRESHOLD/zoom`. Ours has no edge-segment resize affordance — only the 8 discrete handles. Real (if minor) capability gap. |
| `getElementWithTransformHandleType` | MATCH (analogue) | controller iterates handles via `hitHandle` | `resizeTest.ts:130` | Excal reduces over elements to find the first with a handle hit; ours tests handles for the active selection. Same role: map pointer -> (element, handleType). |
| `getCursorForResizingElement` / `rotateResizeCursor` | ABSENT (cosmetic) | — | `resizeTest.ts:220-275` | Picks the bi-directional resize cursor and rotates it with the element angle. Ours sets cursors elsewhere (editor/renderer); not part of hit-test. Cosmetic. |
| z-order iteration for topmost hit | MATCH | `hit-test.ts:117` `hitTestPoint` (loop `length-1 -> 0`) | `collision.ts:315` `getAllHoveredElementAtPoint` (loop `length-1 -> 0`) | Both walk front-to-back (end of array = highest z) so the visually-top element wins. |
| `bindingBorderTest` / `getHoveredElementForBinding` / `...FocusPoint` / `getAllHoveredElementAtPoint` | ABSENT (by scope) | — | `collision.ts:257`, `305`, `341`, `370` | Arrow-binding hover detection. No arrows/binding in our model. |
| `intersectElementWithLineSegment` + per-shape intersect helpers | ABSENT (by scope) | — | `collision.ts:428-732` | Segment/shape intersection for rect/diamond/ellipse/linear/freedraw, used by binding and overlap-marquee. We have no shapes needing segment intersection and no overlap-marquee. |
| `hitElementBoundingBox` / `hitElementBoundingBoxOnly` | DIVERGENT | `geometry.ts:192` `pointInOrientedBox` | `collision.ts:212`, `222` | Excal `hitElementBoundingBox` == our oriented-AABB test (rename). `...BoundingBoxOnly` (hit the box frame but not the shape) is moot for us because box shape == box bounds. |
| `hitElementBoundText` | ABSENT (by scope) | — | `collision.ts:231` | Hit test against an element's bound text. No bound-text containers in our model. |
| `isBindableElementInsideOtherBindable` | ABSENT (by scope) | — | `collision.ts:793` | Containment-for-binding. No binding. |
| selection bookkeeping: `getSelectedElements`, `getTargetElements`, `isSomeElementSelected`, `makeNextSelectedElementIds`, `getVisibleAndNonSelectedElements`, `excludeElementsInFramesFromSelection`, `getSelectionStateForElements`, `getActiveTextElement` | ABSENT (here) | scene-graph / editor modules | `selection.ts:52-561` | These are selection-set/state management, not collision math. Our equivalents live in `scene-graph.svelte.ts` / `editor.svelte.ts`, outside this axis' file. The group/frame/bound-text/linear-editor specifics are out of scope. |

### Divergences & gaps

1. **Point hit-test has no threshold / edge-only grab (`hitElementItself`).** Excal pads the hit
   test by `threshold` (rotated-bounds tolerance) and, for transparent-fill shapes, requires the
   pointer to be near the **outline** (`isPointOnElementOutline`, `collision.ts:174-180`). Ours
   (`hit-test.ts:121`) is strict containment of the un-rotated point in the box with zero
   tolerance and always treats the box as filled. Severity: behavioral. For an opaque-box layout
   tool this is acceptable, but small or stroke-only-looking boxes are slightly harder to click
   than in Excalidraw, and there is no near-miss tolerance.

2. **Marquee does not inflate by stroke width (`getElementsWithinSelection`).** Excal expands the
   element AABB by `strokeWidth/2` before the containment test (`selection.ts:154-159`) so a box
   is considered fully enclosed only when its stroke is enclosed too. Ours (`hit-test.ts:135`)
   tests the geometric `orientedBBox` with no stroke padding. Severity: cosmetic/behavioral —
   off by half a stroke width at the marquee boundary; negligible at typical stroke widths.

3. **Marquee is CONTAIN-only; no OVERLAP mode.** Excal supports `boxSelectionMode === "overlap"`
   (`selection.ts:228-326`) selecting elements the marquee merely intersects, plus group
   cohesion and frame clipping. Ours implements only CONTAIN (`hit-test.ts:131`, documented as
   matching Excal default). Severity: behavioral — a deliberate scope choice, but Excalidraw users
   can toggle overlap selection and we cannot.

4. **Handle hit uses nearest-center radius, not the handle rectangle (`resizeTest` /
   `isInsideTransformHandle`).** Excal hit-tests the pointer against each handle's
   `[x,y,width,height]` rectangle and returns the **first** match in key order
   (`resizeTest.ts:79-90`), with the rotation handle checked first (`resizeTest.ts:72-77`). Ours
   (`hit-test.ts:99-111`) computes Euclidean distance to each handle center and returns the
   **nearest within `radiusWorld`**. Differences: (a) circular vs square hit area; (b) tie-break
   is "closest center" for us vs "first in fixed key order" for Excal — at a corner where two
   adjacent handles could match, the two can disagree which handle wins; (c) ours iterates a flat
   handle list where the rotate handle is just one entry (`hit-test.ts:59`), so it is NOT
   prioritized over a coincident resize handle the way Excal explicitly prioritizes rotation.
   Severity: behavioral (corner tie-break + rotate-vs-resize priority can differ); not a crash
   risk but a perceptible UX divergence on dense/overlapping handles.

5. **No side/edge resizing.** Excal allows resizing by dragging an element edge segment
   (`canResizeFromSides` + `getSelectionBorders` + `pointOnLineSegment`, `resizeTest.ts:92-124`).
   Ours offers only the 8 discrete handles plus rotate. Severity: behavioral — a genuine
   capability gap, though minor for a sketching tool.

6. **Handle placement margin matches Excal intent.** Both `selectionHandles` (`hit-test.ts:38`)
   and `orientedHandles` (`hit-test.ts:68`) inflate the box by a margin so handles sit OUTSIDE
   the body (cited against `transformHandles.ts:158`). This is a correct port of Excal's
   `dashedLineMargin + handleMargin` offset and fixes the "small element body is all handles"
   problem. No divergence; noted as a correct match of the placement rule even though the
   detection geometry (radius vs rect, divergence #4) differs.

### Our extensions (no Excalidraw counterpart)

- `selectionHandles(bounds, rotateOffsetWorld, marginWorld)` (`hit-test.ts:38`) and
  `orientedHandles(el, rotation, rotateOffsetWorld, marginWorld)` (`hit-test.ts:68`) —
  self-contained handle *generators*. Excalidraw's equivalent (`getTransformHandles` in
  `transformHandles.ts`, zoom-aware, omit-sides logic) lives outside the three compared files;
  ours folds generation + world-space placement into hit-test with an explicit margin param.
- `elementCorners(el)` (`hit-test.ts:157`) — returns the rotated corner polygon for drawing
  selection outlines; a rendering helper colocated with hit-test, no collision-axis analogue in
  the Excal files read.
- `pointInElement(el, world)` (`hit-test.ts:151`) — thin drag-start convenience wrapper over
  `pointInOrientedBox`; conceptually equals `hitElementItself` minus threshold/caching.

Note: the dominant "extension" of the whole product — the semantic Markdown export
(`src/lib/export/to-markdown.ts`) — is unrelated to this axis and is intentionally not listed
here.


---

## Parity: transform-handles

Axis focus: placement/sizing of the 8 resize handles + the rotate handle, and the outside-the-box margin that keeps the element body draggable.

Sources read in full:
- Ours: `src/lib/canvas/hit-test.ts` (handle geometry: `selectionHandles`, `orientedHandles`, `hitHandle`) plus the call sites in `src/lib/canvas/editor.svelte.ts` (margin / radius / rotate-offset derivation).
- Excalidraw: `excalidraw-master/packages/element/src/transformHandles.ts`.

### Classification table

| Excalidraw fn | Status | Ours ref | Excal ref | Note |
|---|---|---|---|---|
| `generateTransformHandle` (rotate a handle center about box center) | MATCH | `hit-test.ts:75,87-96` (`place` = `rotate(pt, rotation, c)`) | `transformHandles.ts:95-110` | Both rotate the handle anchor about the box center by the element angle. Ours stores a center point; Excal returns a `[x,y,w,h]` rect (handle drawn as a box), but the anchor math is identical. |
| `getTransformHandlesFromCoords` (compute 8 + rotation handle positions, outside-box margin) | DIVERGENT (cosmetic→behavioral) | `selectionHandles` `hit-test.ts:38-61`; `orientedHandles` `hit-test.ts:68-97` | `transformHandles.ts:133-270` | Same conceptual algorithm: corners/midpoints inflated outward by a margin, rotation handle above the top-center. Differences: (1) ours always emits all 8 side+corner handles; Excal omits N/S/W/E unless the box exceeds `minimumSizeForEightHandles` (`transformHandles.ts:218-220`). (2) Excal also omits cardinal sides by default via `DEFAULT_OMIT_SIDES` (sides shown only when `canResizeFromSides`). Ours has no omit mechanism. (3) Margin: ours uses a single constant-screen `HANDLE_SCREEN_PX=9` margin; Excal composes `dashedLineMargin + handleMargin - centeringOffset` (`:158`). All zoom-divided so screen-constant in both. |
| Zoom-independent handle sizing (`size / zoom.value`) | MATCH (different layer) | `editor.svelte.ts:193-198,225,289` via `camera.screenDistanceToWorld(...)` | `transformHandles.ts:142-152` | Both keep handle size + hit radius constant on screen by dividing by zoom (ours converts a fixed screen-px distance to world). Equivalent behavior. |
| Rotation-handle gap above top edge (`ROTATION_RESIZE_HANDLE_GAP = 16`) | MATCH | `editor.svelte.ts:117` `ROTATE_OFFSET_SCREEN=26`; applied `hit-test.ts:59,95` (`y - rotateOffsetWorld`) | `transformHandles.ts:55,199-213` | Both place the rotate handle at top-center, offset upward by a screen-constant gap. Magnitude differs (ours 26px from box top; Excal 16px gap *plus* the handle/dashed margins). Cosmetic, not behavioral. |
| `getTransformHandles` (per-element omit rules: locked, elbow arrow, linear, frame, image margins) | DIVERGENT (behavioral) | `editor.svelte.ts:221-230` (`currentHandles`) | `transformHandles.ts:272-326` | Ours has no per-type omit/margin logic: every selected element gets the full 8+rotate set with one margin. Excal returns `{}` for locked/elbow-arrow, special-cases linear/freedraw via `OMIT_SIDES_FOR_LINE_*`, removes rotation for frames, and uses `margin = 0` for images / `SPACING+8` for linear. Most of this is out-of-scope for our element model (no arrows/freedraw/frames-with-no-rotation), but the locked case differs — see Divergences. |
| `canResizeFromSides` / `getOmitSidesForEditorInterface` (mobile/phone side-resize gating) | ABSENT | — | `transformHandles.ts:112-131` | Intentional. Single-user desktop (Tauri/macOS) app; no phone/touch form-factor gating in scope. |
| `hasBoundingBox` (whether to show the selection bbox at all) | ABSENT | — | `transformHandles.ts:328-354` | Intentional. Logic is about linear-element editing / mobile, neither of which exists in our element set. Ours always shows handles for a selection. |
| `OMIT_SIDES_FOR_*` / `DEFAULT_OMIT_SIDES` constants | ABSENT | — | `transformHandles.ts:57-93` | Intentional given no arrows/lines/frames; but their absence is also why our 8-handle set is unconditional (see DIVERGENT row 2). |
| `transformHandleSizes` per-pointer (mouse 8 / pen 16 / touch 28) | DIVERGENT (cosmetic) | `editor.svelte.ts:116` `HANDLE_SCREEN_PX=9` (single size) | `transformHandles.ts:49-53` | Ours uses one handle size for all input. Excal scales hit/visual size by pointer type (bigger for pen/touch). Desktop-mouse-only scope, so cosmetic. |
| `hitHandle` (find handle under pointer) | EXTENSION-ish / no direct Excal counterpart in this file | `hit-test.ts:100-111` | (Excal hit-tests handles elsewhere, e.g. `resizeTest`) | Ours does nearest-center-within-radius; Excal’s file produces handle *rects* and hit-tests them in a separate module. Behaviorally compatible (point-in-handle vs nearest-within-radius). |

### Divergences & gaps

1. **Unconditional 8 handles vs size-gated side handles** — *severity: behavioral.*
   Excal only adds N/S (`transformHandles.ts:220-243`) and W/E (`:244-267`) when `Math.abs(width|height) > minimumSizeForEightHandles` (= `5 * 8 / zoom`). Below that, only the 4 corners + rotation appear, so a tiny element doesn’t get crowded with overlapping side handles. Ours (`hit-test.ts:50-60`, `86-96`) always returns all 8 + rotate regardless of size. On a very small element our four side-midpoint handles can sit nearly on top of corner handles, and `hitHandle` (nearest-center) will arbitrate between them — a subtly different resize affordance than Excalidraw. Mitigated in ours by the outside-the-box margin (which is the actual fix for "small element body undraggable"), but the size-gating itself is not replicated.

2. **No omit-sides / per-type rules; locked elements still show handles** — *severity: behavioral.*
   Excal `getTransformHandles` returns `{}` for `element.locked` (`transformHandles.ts:282-288`), so a locked element shows no resize/rotate affordance. Our `currentHandles` (`editor.svelte.ts:221-230`) builds handles for whatever is selected. Note `hitTestPoint`/`hitTestMarquee` (`hit-test.ts:120,134`) already skip `el.locked`, so a locked element generally can’t become the sole selection — but if it is selected by other paths, handles would still render. Worth a guard. Arrows/freedraw/frame omit rules are out-of-scope (those element types don’t exist in our `SemanticType` model).

3. **Margin composition differs** — *severity: cosmetic.*
   Ours uses a single screen-constant margin `HANDLE_SCREEN_PX (=9px)` inflating the box symmetrically (`hit-test.ts:43-49`, `79-85`). Excal composes `dashedLineMargin (margin/zoom) + handleMargin (size/zoom) - centeringOffset ((size - spacing*2)/(2*zoom))` and additionally centers each handle by `±handleWidth/2`. Net outward offset and exact handle pixel positions therefore differ by a few px. Both are zoom-invariant; visual placement is close but not pixel-identical.

4. **Rotate-handle offset magnitude differs** — *severity: cosmetic.*
   Ours: `ROTATE_OFFSET_SCREEN = 26px` measured from the (inflated) box top (`editor.svelte.ts:117`, `hit-test.ts:59,95`). Excal: `ROTATION_RESIZE_HANDLE_GAP = 16px` *added on top of* the dashed-line + handle margins (`transformHandles.ts:199-213`). Direction and screen-constancy match; the absolute gap differs.

5. **Pointer-type handle sizing** — *severity: cosmetic.* Ours has one size; Excal scales for pen/touch (`transformHandles.ts:49-53`). Out of scope for a desktop mouse app.

### Our extensions (no Excalidraw counterpart in this file)

- `hitTestPoint` (`hit-test.ts:117-124`) — topmost-element pick in oriented box, back-to-front; Excalidraw’s equivalent lives in other modules, not `transformHandles.ts`.
- `hitTestMarquee` (`hit-test.ts:131-139`) — full-containment marquee selection (documented to match Excal `selection.ts:219` "contain" mode); an extension relative to *this* file.
- `marqueeRect` (`hit-test.ts:142-149`) — normalize a drag into a positive-area rect. No counterpart here.
- `pointInElement` (`hit-test.ts:152-154`) and `elementCorners` (`hit-test.ts:157-159`) — oriented hit / corner polygon helpers for our hand-rolled Canvas 2D renderer.
- `hitHandle` (`hit-test.ts:100-111`) — nearest-center-within-radius handle pick; Excal hit-tests handle rects in a separate resize module, so ours is a self-contained equivalent rather than a port of code in this file.

### Summary

Core geometry (rotate-about-center handle placement, outside-box margin, top-center rotate handle, zoom-invariant sizing) is a faithful behavioral match. The meaningful gaps are the **size-gated side handles** and **per-element omit rules (locked / type-specific)**, both behavioral; the rest are cosmetic offset/sizing constants or intentionally-out-of-scope features (mobile gating, linear/frame/arrow handling, `hasBoundingBox`).


---

## Parity: drag-move

Axis: pointer move gesture, drag threshold, group/subtree move, drag-from-center (alt).

Scope note: Excalidraw's drag-move logic for selected elements lives in
`packages/element/src/dragElements.ts` (the per-element mutation engine) and is
orchestrated by `App.tsx` (`handleCanvasPointerMoveForSelectedElements`, the
threshold/offset plumbing). Ours lives entirely in
`src/lib/canvas/editor.svelte.ts` (the `'move'` arm of `pointerMove`,
`#moveRoots`, `#applySnap`, `#dropTargetUnder`, and the `'move'` arm of
`pointerUp`). We render to Canvas 2D, are single-user, have no arrows/bindings,
no frames-as-element-containers (frames are just container elements), and no
collaboration — several Excalidraw branches are therefore intentionally absent.

### Classification table

| Excalidraw fn / algorithm | Status | Ours ref | Excal ref | Note |
|---|---|---|---|---|
| `dragSelectedElements` (move the selection) | DIVERGENT | editor.svelte.ts:360-389 (`pointerMove` `'move'`), :383 `translateSubtree` | dragElements.ts:35-171 | Same goal; different model. Excal applies an **absolute offset** to each element's pointer-down snapshot (drift-free); ours applies an **incremental delta** from `lastWorld`. See divergences. |
| `calculateOffset` (snap + grid-merge of offset) | DIVERGENT | editor.svelte.ts:660-681 (`#applySnap`) | dragElements.ts:173-202 | Both fold object-snap into the drag delta; Excal also applies grid-point snap per-axis when no object snap on that axis. Ours has no grid snap during move. |
| `updateElementCoords` (per-element write from original) | DIVERGENT | editor.svelte.ts:369-384, scene `translateSubtree` | dragElements.ts:204-220 | Excal writes `original.x + offset` (anchored to snapshot). Ours adds incremental `dx,dy` to live position. Functionally equivalent for the common case; differs on float-drift and snap-back. |
| `getDragOffsetXY` (pointer offset from selection origin) | DIVERGENT | implicit: editor.svelte.ts:319 (`startWorld`) | dragElements.ts:222-229 | Excal computes pointer-minus-common-bounds-top-left once and stores it; ours stores the world pointer-down point and works in deltas. Different bookkeeping, equivalent intent. |
| Drag threshold gate (`DRAGGING_THRESHOLD = 10`) | DIVERGENT | editor.svelte.ts:120-122, :363-367 | constants.ts:19; App.tsx (drag uses absolute model, no screen gate on the move itself) | Ours gates the move with a 10px **screen** travel check before any nudge. Excal does NOT pre-gate the selection move on a screen threshold; it drags from the first move (drift-free so jitter is harmless). 10px is used by Excal for *arrow unbind* and *link activation*, not the move start. |
| Group / frame-children expansion (move frame moves its children) | DIVERGENT | editor.svelte.ts:653-658 (`#moveRoots`) + scene `translateSubtree` | dragElements.ts:75-85 | Excal expands selected **frames** to also move all elements whose `frameId` is in the set (via `scene.getNonDeletedElements`). Ours moves whole subtrees of selected roots via `translateSubtree`, and de-dupes nested selection in `#moveRoots`. Same net effect (container + descendants move together) by a different mechanism. |
| De-dup of frame-and-its-elements (`Set` + `elementsToUpdateIds`) | MATCH | editor.svelte.ts:653-658 (`#moveRoots` filter) | dragElements.ts:72-74, 106-108 | Both avoid moving an element twice when both it and its container are selected. Excal uses a `Set`; ours drops any selected element whose parent is also selected so only roots translate (subtree translate handles the rest). |
| Drag-from-center / symmetric expand (alt) — *for move* | ABSENT (correctly) | n/a | n/a (alt-during-move = duplicate in Excal, App.tsx:10173) | "Drag-from-center" (`shouldResizeFromCenter`) is a **create/resize** behavior, not a move behavior, in both codebases. In Excal, alt during a *move* triggers element **duplication**, not center-expand. Ours maps alt-during-move to **snap bypass** (editor.svelte.ts:334, :375). Neither implements alt-duplicate-on-drag. |
| Shift = axis-lock during move | ABSENT | n/a (ours: shift during move toggles selection only at pointerdown) | App.tsx:10021-10038 | Excal zeroes the smaller-magnitude axis of `dragOffset` when shift is held, locking the drag to one axis. Ours has no axis-lock during move. Real gap. |
| Arrow initial-drag / unbind logic | ABSENT (intentional) | n/a | dragElements.ts:142-169 | No arrows/bindings in our model. Out of scope. |
| Elbow-arrow early bail / start+end binding filter | ABSENT (intentional) | n/a | dragElements.ts:46-67 | No arrows. Out of scope. |
| `updateBoundElements` (bound text + arrows follow) | DIVERGENT (partial) | editor.svelte.ts:383 (`translateSubtree`) | dragElements.ts:139-141, 127-138 | Excal separately re-positions bound text and bound arrows. Ours has no bindings, but our subtree translate moves child text naturally (children are real subtree members, not bound siblings). |
| Bail on missing original snapshot (duplicate-during-drag) | ABSENT | n/a | dragElements.ts:89-97 | Excal returns early if any `originalElements` entry is missing (duplicate-during-drag race). Ours has no per-gesture snapshot map and no alt-duplicate, so the hazard doesn't exist. Intentional. |
| `dragNewElement` (size the new element while dragging) | MATCH (relocated) | editor.svelte.ts:569-616 (`#updateCreate`) | dragElements.ts:231-353 | Different axis (create, not move) but the **alt = expand-from-center** and **abs-distance-from-origin sizing with corner anchoring** algorithm matches. Included because it is the canonical drag-from-center implementation. |

### Divergences & gaps

1. **Absolute-offset vs incremental-delta move model** (bug-risk).
   - Excal (`dragElements.ts:204-220`, `App.tsx:10012-10015`): every move computes
     `dragOffset = pointerNow - drag.origin` and writes `originalElement.x + offset`
     for each element, reading the **pointer-down snapshot**. This is drift-free:
     N moves never accumulate float error, and clearing the snap snaps cleanly back.
   - Ours (`editor.svelte.ts:369-384`): computes `dx = world.x - lastWorld.x`,
     applies it via `translateSubtree`, then advances `lastWorld`. This is an
     **accumulating** model. Per-move it is correct, but: (a) floating-point error
     can accumulate over a long drag; (b) snap correction is folded into the delta
     and `lastWorld` is advanced by the *snapped* delta (:384), so the element can
     "stick" to a guide and the cursor-to-element offset drifts when snap toggles
     mid-drag. Excal avoids both by always recomputing from origin + snapshot.
     Severity: bug-risk (visible as cursor drift on snap engage/release; low risk
     of cumulative drift on normal-length drags).

2. **10px screen drag-threshold gating the move start** (behavioral).
   - Ours (`editor.svelte.ts:363-367`): the element does not move at all until the
     pointer has traveled `DRAG_THRESHOLD_PX = 10` **screen px** from pointer-down.
   - Excal: the selection move (`dragSelectedElements`) is **not** pre-gated by a
     screen threshold; once `drag.hasOccurred` is set it drags from the first
     `pointermove`. Excal's drift-free absolute model means a 1px jitter produces a
     1px move (invisible), so a guard isn't needed. `DRAGGING_THRESHOLD` in Excal
     gates *arrow unbinding* (`dragElements.ts:148-149`), *link activation*
     (`App.tsx:1357`), and *linear midpoint creation* — never the move start.
   - Net: ours adds a click-vs-drag dead-zone Excal lacks. The CLAUDE-comment claim
     "Matches Excalidraw (DRAGGING_THRESHOLD = 10)" (editor.svelte.ts:120-122) is
     only half-true: the constant value matches, but Excal applies it to a different
     decision. Severity: behavioral (different feel; ours is arguably better UX but
     it is a divergence, and the cited-rule comment overstates parity).

3. **No shift axis-lock during move** (behavioral gap).
   - Excal (`App.tsx:10021-10038`): shift held during a move zeroes the
     smaller-magnitude axis of `dragOffset`, constraining the drag to pure
     horizontal/vertical. Ours consumes shift at pointer-down for selection toggling
     (editor.svelte.ts:311) and tracks `#shiftHeld` for rotate snap, but the `'move'`
     arm never reads it. Dragging with shift held in ours moves freely in 2D.
     Severity: behavioral.

4. **No grid snap during move** (behavioral, scope-dependent).
   - Excal's `calculateOffset` (`dragElements.ts:183-197`) applies `getGridPoint`
     per-axis on any axis without an active object snap. Ours `#applySnap`
     (editor.svelte.ts:660-681) only does object/alignment snapping; there is no
     grid quantization of the drag. We have a dot-grid (`gridVisible`) but it is
     visual-only during move. Severity: behavioral (only matters when grid mode is
     on; our grid is decorative).

5. **alt semantics during move differ** (cosmetic/by-design).
   - Excal: alt-during-move = duplicate-the-selection (`App.tsx:10173`). Ours:
     alt-during-move = bypass snapping (editor.svelte.ts:334, :375). These are
     deliberate, different product choices; neither is wrong, but a user with
     Excalidraw muscle memory will be surprised. Severity: cosmetic.

6. **Reparent-on-drop is ours-only behavior layered onto the move** (extension, noted here for completeness). Excal handles frame membership via separate
   `frameToHighlight`/`getElementsInResizingFrame` plumbing and does not reparent a
   shape into an arbitrary container by drop. See "Our extensions".

### Our extensions (no Excalidraw drag-move counterpart)

- **`#dropTargetUnder` + drop-to-reparent** (editor.svelte.ts:683-709, and the
  `pointerUp` `'move'` arm :415-435). On drop, the dragged roots are reparented into
  the topmost container under the cursor (cycle-safe via `isAncestor`, skips the
  current parent and the moving subtree). Excalidraw's frame-highlight is the nearest
  analogue but it assigns *frame membership*, not a general parent/child reparent into
  any container element. This is core to our semantic-hierarchy product and feeds the
  Markdown export's nesting.
- **`dropTargetId` live preview** (editor.svelte.ts:179, :387) — reactive overlay of
  the prospective drop container during the drag. No Excalidraw equivalent.
- **Single-history-transaction gesture wrap** (editor.svelte.ts:318 `history.begin`,
  :434 `history.commit`) — a whole drag = one undo, with `commit()` detecting a no-op
  move and discarding without restoring (so a click that didn't move keeps its
  selection). Excalidraw uses `captureUpdate`/store deltas instead; behaviorally
  similar but architecturally ours.
- **`translateSubtree`-based group move** (editor.svelte.ts:383) — moving by true
  parent/child subtree rather than Excal's frame-membership-set expansion.


---

## Parity: resize-rotate

Scope: resize math (single element, rotated-local-frame, multi-AABB scale), aspect lock,
resize-from-center, and rotation. OUR implementation is the editor controller
`src/lib/canvas/editor.svelte.ts`; the Excalidraw counterpart is
`excalidraw-master/packages/element/src/resizeElements.ts`.

Framework note: Excalidraw is React + a rich element model (linear/freedraw/elbow-arrow/text
containers/image-scale/bindings). Ours is a hand-rolled Canvas-2D semantic-layout tool whose
elements are all rectangles with `x,y,width,height,rotation`. We have no linear elements, no
bound-text auto-sizing, no bindings, no image-scale, no freedraw. So a large portion of
Excalidraw's resize machinery is type-specific bookkeeping that is genuinely out of scope for us.
The judgment below is on the *geometric resize/rotate behavior*, not the per-type plumbing.

### Classification table

| Excalidraw fn | Status | Ours ref | Excal ref | Note |
|---|---|---|---|---|
| `transformElements` (dispatch: 1 vs N, rotation vs resize) | MATCH | `editor.svelte.ts:740-745` (`#updateResize` splits sole-rotated vs AABB) + `:895-919` (`#updateRotate`) | `resizeElements.ts:87-201` | Same dispatch shape: single-rotated path, multi/AABB path, single-rotation path, multi-rotation path. Ours is split across pointer-phase methods instead of one fn. |
| `rotateSingleElement` | MATCH | `editor.svelte.ts:895-919` (`#updateRotate`, used for N=1 too) | `resizeElements.ts:203-266` | Angle from `atan2(pointer-center)`; shift → discrete-angle snap. See divergence on angle convention + snap step. |
| `rotateMultipleElements` (rotate each element's center about selection center, add delta) | MATCH | `editor.svelte.ts:895-919` (`#updateRotate`) | `resizeElements.ts:404-488` | Both rotate each element center about the group center and offset angle by `centerAngle + origAngle`. See divergence on incremental vs absolute formulation. |
| `getNextSingleWidthAndHeightFromPointer` (rotate pointer into local frame, scale from anchor) | MATCH | `editor.svelte.ts:822-882` (`#updateResizeRotated`) | `resizeElements.ts:928-1020` | Same core idea: un-rotate pointer about center, move dragged edges in local space, keep opposite edge fixed. See divergences on resize-from-center and aspect-lock-via-max-ratio. |
| `resizeSingleElement` (apply width/height + recompute origin so anchor is fixed) | MATCH | `editor.svelte.ts:822-882` (`#updateResizeRotated`) + `:740-813` (`#updateResize` for unrotated) | `resizeElements.ts:722-926` | Anchor-preserving origin recompute. Ours derives origin via local anchor → world; Excalidraw via `getResizedOrigin` trig. Equivalent geometry. |
| `getResizedOrigin` / `getResizeAnchor` (anchor lookup per handle+modifier) | MATCH (behavioral equiv) | `editor.svelte.ts:859-874` (anchor = opposite local corner) and `:773-786` (center anchor) | `resizeElements.ts:573-720` | Excalidraw enumerates anchors as a closed-form trig table; ours computes the opposite corner/edge directly in the local frame and rotates. Same resulting anchor for the unrotated and rotated cases. |
| `getNextMultipleWidthAndHeightFromPointer` (common-bbox scale from anchor, flip flags) | DIVERGENT | `editor.svelte.ts:740-813` (`#updateResize` AABB branch) | `resizeElements.ts:1022-1147` | Both scale a common AABB from the opposite-side anchor. Ours derives scale from edge deltas (`width = right - x`), Excalidraw from `|pointer - anchor| / dim`. Ours has NO flip support (negative-size mirror). See divergences. |
| `resizeMultipleElements` (scale each element x/y about anchor; per-type updates) | DIVERGENT | `editor.svelte.ts:803-812` (scale loop in `#updateResize`) | `resizeElements.ts:1149-1500` | Same affine: `nx = anchor + offset*scale`. Ours scales x and y independently per handle; Excalidraw forces uniform scale (`keepAspectRatio`) when any element is rotated/grouped/text. See divergences. |
| `measureFontSizeFromWidth` / `resizeSingleTextElement` (font scales with box) | ABSENT | — | `resizeElements.ts:285-402` | Out of scope: our text elements don't auto-scale font on resize. Intentional. |
| `rescalePointsInElement` (rescale linear/freedraw point arrays) | ABSENT | — | `resizeElements.ts:268-283` | Out of scope: no linear/freedraw elements. Intentional. |
| `getResizeOffsetXY` (pointer→handle offset in element-local space) | ABSENT | — | `resizeElements.ts:490-547` | Not needed: ours uses raw pointer deltas / local-frame pointer directly; no separate offset capture. Acceptable. |
| `getResizeArrowDirection` (which end of a linear arrow is being resized) | ABSENT | — | `resizeElements.ts:549-560` | Out of scope: no arrows. Intentional. |
| Bound-text / binding / elbow-arrow / image-scale handling | ABSENT | — | `resizeElements.ts` (scattered) | Out of scope: no bindings/containers/images-with-scale. Intentional. |

### Divergences & gaps

1. **No flip (negative-dimension mirror) on resize — `severity: behavioral`.**
   Excalidraw permits dragging a handle past the opposite side: width/height go negative,
   `flipByX/flipByY` are computed (`resizeElements.ts:1117-1138`), points/positions mirror, and
   in single-element resize the origin is shifted by the negative dimension
   (`resizeElements.ts:845-850`). Ours clamps in every path: unrotated AABB clamps `width/height`
   to `MIN_SIZE` (`editor.svelte.ts:797-798`); rotated single clamps the dragged edge against the
   opposite edge minus `MIN_SIZE` (`editor.svelte.ts:840-843`); multi scales by `width/origin.width`
   which can never go negative. Result: in ours you can never flip a shape by overshooting a handle;
   the box just collapses to the minimum and stays oriented. This is a deliberate simplification for
   a layout tool (flipping a semantic block is rarely wanted) but it IS a behavioral divergence from
   Excalidraw.

2. **Resize-from-center not applied in the rotated-single path — `severity: bug-risk`.**
   Excalidraw applies `shouldResizeFromCenter` uniformly: in
   `getNextSingleWidthAndHeightFromPointer` it doubles the delta
   (`nextWidth = 2*nextWidth - origElement.width`, `resizeElements.ts:996-999`) and the anchor
   becomes `"center"` in `getResizeAnchor` (`resizeElements.ts:578-580`). Ours honors alt-resize-
   from-center ONLY in the unrotated AABB branch (`editor.svelte.ts:773-786`). In
   `#updateResizeRotated` (`editor.svelte.ts:822-882`) `this.#altHeld` is never read — alt is
   ignored, so resizing a *rotated* element with alt held does not expand from center. For a single
   rotated element this is a missing edge case (silent no-op of the modifier), hence bug-risk.

3. **Aspect-lock algorithm differs (corner ratio vs max-ratio) — `severity: behavioral`.**
   Excalidraw single-element aspect lock for a corner handle (`handleDirection.length === 2`) uses
   `ratio = Math.max(widthRatio, heightRatio)` and rescales BOTH dims by that ratio
   (`resizeElements.ts:1009-1013`), so the box follows whichever axis the pointer pushed further.
   Ours (`editor.svelte.ts:789-795` AABB, `:849-857` rotated) picks the *driving* axis by comparing
   `|width|/ar` vs `|height|`: if width is "ahead" it derives height from width, else width from
   height. These agree in the common diagonal-drag case but diverge near the aspect diagonal: the
   max-ratio rule always grows to the larger of the two, ours can shrink one axis to match the other.
   Also Excalidraw handles 1-D (side) handles under aspect lock by cross-scaling
   (`nextHeight *= widthRatio; nextWidth *= heightRatio`, `resizeElements.ts:1005-1008`); ours runs
   the same corner-style branch for side handles, which for a pure side drag yields a slightly
   different coupled dimension. Both are "reasonable aspect lock," but not byte-identical.

4. **Multi-element resize does not force uniform scale for rotated/grouped members —
   `severity: bug-risk`.**
   Excalidraw sets `keepAspectRatio = shouldMaintainAspectRatio || any element is rotated || text ||
   in a group` and, when true, forces `scaleX = scaleY = scale` (`resizeElements.ts:1306-1318`).
   Reason: scaling a rotated child by independent x/y factors *skews* it (a rotated rectangle is no
   longer a rectangle under non-uniform scale). Ours always applies independent `sx`/`sy` in the
   multi branch (`editor.svelte.ts:800-812`) and never special-cases rotated members — and critically
   our multi-AABB scale leaves each element's `rotation` untouched while changing only `x,y,w,h`. So
   a multi-selection that contains a rotated element resized non-uniformly will distort that element's
   apparent box (the stored w/h scale per-axis while the rotation is fixed). This is a real
   correctness gap for the (admittedly uncommon) multi-select-with-rotated-member resize.

5. **Rotation angle convention & normalization differ — `severity: cosmetic`.**
   Excalidraw computes an *absolute* target angle `(5π/2 + atan2(dy,dx))` and normalizes to
   `[0, 2π)` via `normalizeRadians` (`resizeElements.ts:220-226`, `415-420`, `448`). Ours computes a
   *delta* from the gesture-start pointer angle and adds it to the stored base
   (`editor.svelte.ts:898-906`), never normalizing (angles can accumulate outside `[0,2π)`). Visually
   identical rotation; the difference is only the stored numeric range. For a single-user canvas with
   no angle-equality checks this is cosmetic, but downstream code comparing raw `rotation` values
   should be aware ours is unnormalized.

6. **Discrete-angle (shift) snap: same 15° step, different rounding — `severity: cosmetic`.**
   Both snap to 15° (π/12) when shift is held. Excalidraw uses `SHIFT_LOCKING_ANGLE` and
   `angle += step/2; angle -= angle % step` (floor-after-bias, `resizeElements.ts:222-225`). Ours uses
   `Math.round(delta / step) * step` (`editor.svelte.ts:903-906`). Round-to-nearest and bias-then-floor
   produce the same bucket for all inputs (both are "nearest multiple"), so behavior matches; the only
   subtlety is ours snaps the *delta* while Excalidraw snaps the *absolute* angle, so ours only lands on
   true 15° gridlines when the element started at a 15°-aligned angle. Minor.

7. **`MIN_SIZE` floor vs Excalidraw's per-type minimums — `severity: cosmetic`.**
   Ours floors every resize to `MIN_SIZE = 4` world units (`editor.svelte.ts:119`, applied at
   `:797-798`, `:840-843`, `:877-881`). Excalidraw has no single global min in this file — it rejects
   `nextWidth/Height === 0` (`resizeElements.ts:875-880`, `1185`) and applies type-specific minimums
   (font size, bound-text approx line width/height, `resizeElements.ts:784-794`). For our
   rectangle-only model a flat 4px floor is a reasonable stand-in; acceptable.

### Our extensions (no Excalidraw counterpart in this file)

- **Sole-vs-AABB resize dispatch via `soleSelected` + `sole` drag field**
  (`editor.svelte.ts:211-215`, `:729-737`, `:742-745`): we explicitly branch a *single rotated*
  element into a local-frame resize and everything else into AABB scaling. Excalidraw reaches the
  same outcome through `getResizedElementAbsoluteCoords` + `getResizedOrigin` rather than a top-level
  branch. Our split is a structural extension, not a behavioral one.
- **Drop-target reparenting during resize? No** — but `#dropTargetUnder` / reparent on move
  (`editor.svelte.ts:683-709`, `:416-430`) is a layout-tool extension with no resize-time analog in
  Excalidraw's file.
- **`cursorForHandle` rotation-aware resize cursor** (`editor.svelte.ts:1047-1063`): maps handle +
  element rotation to one of four bidirectional CSS cursors. Excalidraw computes resize cursors
  elsewhere (not in `resizeElements.ts`); within this axis it's effectively ours.
- **`gestureActive` reactive flag** (`editor.svelte.ts:154`, `:245`) so the style panel hides during
  any transform — a UI concern with no element-layer counterpart.
- **Single history transaction per gesture** (`editor.svelte.ts:714`, `:456-459`): begin on
  resize/rotate start, commit on pointerup, so a whole drag is one undo. Excalidraw's history is
  driven by the app-level store, not this file.
- **Everything in world-space, camera as the single conversion point** (`editor.svelte.ts:255`,
  `:337`): a deliberate architectural choice; Excalidraw mixes scene + viewport coords.


---

## Parity: snapping

Axis focus: alignment guides, equal-spacing distribution, snap thresholds, alt/modifier bypass.

OUR file: `/Users/billyribeiro/development/revo-draw/src/lib/canvas/snapping.ts` (216 lines, pure function `resolveSnap` + helper `detectEqualSpacing`).

EXCAL file: `/Users/billyribeiro/development/revo-draw/excalidraw-master/packages/excalidraw/snapping.ts` (1415 lines).

The two implementations solve the same UX problem (snap a moving/resizing box to neighbors, surface guide lines, do equal-spacing distribution) but with structurally different models:

- Ours is **AABB feature lines** (3 per axis: left/center/right edge) compared against every other box's 3 feature lines, axis-independent, single pure pass. World-space throughout, threshold passed in world units by the caller.
- Excalidraw is **corner point snapping** (`PointSnap`, rotated corners + center) plus a separate **gap snapping** model (`GapSnap`) built from precomputed `Gap` structures cached in `SnapCache`. Two-pass (compute offset, then recompute lines at snapped position). Threshold is `SNAP_DISTANCE=8` screen px divided by zoom.

Excalidraw's "gap" model and ours' "equal-spacing" model are the closest conceptual cousins but are NOT the same algorithm (see Divergences).

### Classification table

| Excalidraw fn | Status | Ours ref | Excal ref | Note |
|---|---|---|---|---|
| `getSnapDistance(zoom)` — `SNAP_DISTANCE/zoom` | MATCH | snapping.ts:52-57 (`SnapConfig.thresholdWorld`, doc says caller converts screen px via zoom) | snapping.ts:48-50, const 41 | Same zoom-independent feel. Ours delegates the screen-px→world division to the caller; Excal bakes `8/zoom` here. Same result. |
| `isSnappingEnabled(...)` / alt/modifier bypass | DIVERGENT | snapping.ts:14 (doc) + caller in editor.svelte.ts | snapping.ts:162-192 | See divergences. Bypass key differs (we use Alt/skip-call; Excal uses CMD/CTRL toggle vs. a persisted snap-mode, plus lasso/arrow special cases). |
| `getPointSnaps(...)` — nearest edge/center point snap per axis | MATCH | `resolveSnap` align loops snapping.ts:80-104 | snapping.ts:636-690 | Same core: minimize abs offset independently per axis, keep nearest. Ours uses 3 feature lines/axis; Excal uses corner points incl. rotated corners + center. |
| `getElementsCorners(...)` — rotated corners + center; diamond/ellipse mid-edges | DIVERGENT | `xFeatures`/`yFeatures` snapping.ts:45-50 | snapping.ts:198-313 | Ours = axis-aligned edges+center only; no rotation, no shape-specific midpoints. Per-scope acceptable but a behavioral gap for rotated/ellipse elements. |
| `getVisibleGaps(...)` — build all pairwise gaps per axis, cached | DIVERGENT | `detectEqualSpacing` snapping.ts:160-215 | snapping.ts:328-444 | Ours computes nearest left/right (top/bottom) neighbor on the fly; no cache, no all-pairs gap set. |
| `getGapSnaps(...)` — center-of-gap + side (left/right/top/bottom) snapping | DIVERGENT | `detectEqualSpacing` snapping.ts:160-215 | snapping.ts:446-614 | Both do equal-spacing, but Excal snaps to gap CENTER and to MATCHING a neighbor's gap length (side snaps); ours only equalizes the two immediate gaps. Different feature set. |
| `snapDraggedElements(...)` — orchestrator for drag, two-pass | DIVERGENT | `resolveSnap` snapping.ts:63-148 | snapping.ts:692-807 | Ours is single-pass; Excal recomputes snaps at snapped position to draw lines without shift. See divergences. |
| `snapResizingElements(...)` — snap during resize handles | ABSENT | — | snapping.ts:1108-1244 | Our `resolveSnap` is move-only by signature (takes a Candidate box, returns top-left). Resize snapping not wired here. Likely real gap if resize snapping is in scope. |
| `snapNewElement(...)` — snap while drawing a new element | ABSENT | — | snapping.ts:1246-1316 | No equivalent entry point. |
| `getSnapLinesAtPointer(...)` — crosshair pointer snap lines | ABSENT | — | snapping.ts:1318-1400 | Intentional: no pointer-crosshair snapping feature in our scope. |
| `createPointSnapLines(...)` — group point snaps into rendered lines | MATCH (partial) | guide construction snapping.ts:109-133 | snapping.ts:828-896 | Both produce a guide line spanning aligned features. Ours emits `SnapGuide{axis,position,from,to}` directly; Excal groups by coordinate key and dedupes. Same intent. |
| `createGapSnapLines(...)` — render gap distribution guides | DIVERGENT | spacing guides snapping.ts:183-186, 206-209 | snapping.ts:915-1106 | Ours emits two `distribute` guide segments (the two gaps). Excal renders per-direction segment pairs with intersection clamping. Conceptually similar, geometrically different. |
| `areRoughlyEqual(a,b,prec=0.01)` | DIVERGENT | inline `Math.abs(gapL-gapR) <= tol*2` snapping.ts:178,201 | snapping.ts:194-196 | Ours uses a configurable spacing tolerance (`tol*2`); Excal uses a fixed 0.01 epsilon for the resize-angle guard, not for gap equality. |
| `round(x)` — 6-decimal rounding for determinism | ABSENT | — | snapping.ts:809-812 | Ours does not round snap coordinates; relies on float math. Cosmetic — could cause sub-pixel guide jitter vs. Excal's stable rounded coords. |
| `dedupePoints` / `dedupeGapSnapLines` | ABSENT | — | snapping.ts:814-826, 898-913 | Ours can emit duplicate/overlapping guides (one per axis per snap); no dedupe pass. Minor visual. |
| `SnapCache` (static reference points + gaps cache) | ABSENT (intentional) | — | snapping.ts:122-155 | Ours recomputes every call (pure). Excal caches across a drag gesture for perf on large scenes. Per-scope: acceptable for single-user small docs; perf gap at scale. |
| `isActiveToolNonLinearSnappable(...)` | ABSENT (intentional) | — | snapping.ts:1402-1414 | Tool-gating lives in our `editor.svelte.ts` controller, not in the pure module. |

### Divergences & gaps

1. **Alt bypass vs. CMD/CTRL toggle (behavioral).** Our module's contract (snapping.ts:14) is "holding the bypass modifier (alt) simply skips calling this" — snapping is ON by default, Alt disables. Excalidraw (`isSnappingEnabled`, snapping.ts:162-192) inverts this: snapping is OFF by default behind a persisted `objectsSnapModeEnabled` setting, and `CTRL_OR_CMD` toggles it (enables when off, disables when on). Excal also special-cases lasso dragging and refuses single-arrow snapping (give way to binding). Different default and different key. severity: behavioral.

2. **Equal-spacing model is narrower than gap snapping (bug-risk).** Ours (`detectEqualSpacing`, snapping.ts:160-215) only handles the case where the candidate sits BETWEEN a left and right (or top and bottom) neighbor and equalizes those two gaps. Excalidraw's gap model (snapping.ts:446-614) additionally supports: (a) snapping the selection's CENTER to the center of a gap larger than the selection (`center_horizontal`/`center_vertical`), and (b) SIDE snaps that match the selection's distance-to-a-neighbor to an existing gap length elsewhere (`side_left/right/top/bottom`) — i.e. "make this gap equal to that other gap" even when the candidate is not nestled between two elements. Ours produces no snap in those configurations. severity: bug-risk (missing common distribution affordance, not a crash).

3. **Spacing equality tolerance differs from threshold semantics (behavioral).** Ours gates equal-spacing on `Math.abs(gapL - gapR) <= tol*2` (snapping.ts:178, 201) using a separate `spacingToleranceWorld`. Excalidraw does not pre-gate by gap-difference; it computes the offset needed and keeps it iff `|offset| <= minOffset` (the snap distance), competing directly against point snaps on the same axis budget. So Excal's gap snap and point snap share one threshold and the smallest offset wins; ours runs alignment first (snapping.ts:80-133) and then ADDITIONALLY applies spacing on top (snapping.ts:136-145), which can move the box twice on the same axis (align then re-distribute) rather than picking the single nearest snap. severity: behavioral.

4. **Single-pass vs. two-pass guide computation (cosmetic).** Excalidraw computes the snap offset, then resets and recomputes snaps at the snapped position so the rendered lines don't shift (snapping.ts:756-793). Ours builds guides in the same pass using the post-snap `resultX/resultY` (snapping.ts:112-133), which is mostly equivalent for align guides but the distribute guides are computed against the already-aligned position (snapping.ts:136-140) — acceptable. severity: cosmetic.

5. **No rotation / shape-aware snap points (behavioral).** `xFeatures`/`yFeatures` (snapping.ts:45-50) assume axis-aligned boxes. Excalidraw's `getElementsCorners` (snapping.ts:198-313) rotates corners by `element.angle` and uses mid-edge points for diamonds/ellipses. Rotated elements snap by their visual extent in Excal; ours snaps by the unrotated AABB. severity: behavioral (only matters once rotation is exercised; rotation IS supported in our editor per repo map).

6. **No determinism rounding / dedupe (cosmetic).** Excal rounds all coords to 6 decimals (snapping.ts:809-812) and dedupes guide lines. Ours emits raw floats and can push duplicate guides. severity: cosmetic.

7. **Resize and new-element snapping absent (behavioral gap).** `resolveSnap` only returns an adjusted top-left for a moving box. Excal has dedicated `snapResizingElements` (1108) and `snapNewElement` (1246). If the editor expects snap feedback during resize/draw, that path is unimplemented in this module. severity: behavioral (verify against editor.svelte.ts before calling it a hard gap).

### Our extensions

- **`SnapGuide.kind: 'align' | 'distribute'` tagging** (snapping.ts:26-27): ours emits a single typed guide object carrying its own draw extent (`from`/`to`) and a semantic kind. Excalidraw splits this across `PointSnapLine` / `GapSnapLine` / `PointerSnapLine` union types. Our shape is purpose-built for the hand-rolled Canvas 2D renderer.
- **Self-contained `from`/`to` extent on every guide** (snapping.ts:113, 125): ours computes the guide segment span (min/max of candidate + aligned others) inline so the renderer needs no element lookup. Excal computes line endpoints inside `create*SnapLines`.
- **Pure `(candidate, others, config) -> {x,y,guides}` signature** with no `AppState`, no `SnapCache`, no React `app` handle — directly unit-testable, matching our "pure pass" doc (snapping.ts:13). This is a deliberate architectural simplification, not a feature.


---

## Parity: rendering

Axis: Canvas2D draw of elements + selection overlay, DPR, dirty rendering.

Scope note: Excalidraw splits rendering across **two canvases** — a *static scene*
(`staticScene.ts` → `renderElement.ts`) for element bodies, and an *interactive scene*
(`interactiveScene.ts`) for selection/handles/overlays. Ours is a **single** canvas drawn by one
`render()` pass in `renderer.ts` that paints both element bodies and the selection overlay. So the
correct correspondence is: our `render()` ≈ `_renderStaticScene` + `_renderInteractiveScene` merged,
our `drawElement` ≈ `renderElement`/`drawElementOnCanvas`, our `drawSelection` ≈
`renderSelectionBorder`+`renderTransformHandles`. Frameworks differ (React-orchestrated vs Svelte
`$effect`), so I judge algorithm/behavior, not call structure.

The two products also have disjoint element vocabularies. Excalidraw draws *freehand geometric
shapes* (rectangle/ellipse/diamond/line/arrow/freedraw/text/image/frame/embeddable) via roughjs into
**per-element cached offscreen canvases**. Ours draws ~35 *semantic UI primitives* (button, input,
table, chart, nav, hero, …) with bespoke hand-coded glyphs directly to the main context, no caching,
no roughjs. That is an intentional product divergence, not a defect — but it dominates the table
below.

### Classification table

| Excalidraw fn | Status | Ours ref | Excal ref | Note |
|---|---|---|---|---|
| `_renderStaticScene` (top-level paint loop: clear, bg, grid, paint visible in order) | MATCH (algorithm) | `render` renderer.ts:62-93 | staticScene.ts:229-479 | Same shape: reset transform, paint bg, optional grid, iterate ordered elements painting each. |
| `bootstrapCanvas` (setTransform→scale, paint bg or clear) | MATCH | `render` renderer.ts:66-71 | helpers.ts:31-77 | We `setTransform(dpr,…)`, `clearRect`, then `fillRect` bg. Excal scales by `scale` (=DPR) then fills bg. Same net effect; we always clear+fill, Excal clears only for transparent bg. |
| `getNormalizedCanvasDimensions` (canvas.width / scale) | DIVERGENT (cosmetic) | Canvas.svelte:60-61,100-101 | helpers.ts:23-29 | Excal stores backing px in `canvas.width` and divides by scale to get CSS px. We keep CSS px in `camera.viewportWidth` and set `canvas.width = rect.width*dpr` separately. Equivalent result; bookkeeping differs. |
| `context.scale(zoom, zoom)` + scroll-translate camera application | MATCH | `render` renderer.ts:76-77 | staticScene.ts:261 | Excal applies `scale(zoom)` then each element self-translates by `scrollX/Y`. We compose `dpr * worldToScreen` into one `setTransform` so world coords map straight to device px. Same world→screen mapping. |
| `strokeGrid` (grid lines, bold every `gridStep`, hide regular when actualGridSize<10, 0.5px crisp offset) | DIVERGENT (cosmetic) | `drawGrid` renderer.ts:97-139 | staticScene.ts:56-130 | Both adapt density to zoom and have a major/minor tier. Excal draws **dashed lines**; ours draws **dots** (editorial style). Excal hides regular lines at `actualGridSize<10`; ours doubles/halves world step to stay 14–48px and bails at screenStep<4. Excal uses 0.5px crisp-offset at zoom===1; ours has no sub-pixel snap. Intentional visual-language difference. |
| `renderElement` / `drawElementOnCanvas` (per-type dispatch: rect/ellipse/diamond/line/arrow/freedraw/text/image/frame) | DIVERGENT (behavioral, by design) | `drawElement` renderer.ts:148-272 | renderElement.ts:387-601, 780-1072 | Same role (switch on `element.type`, save/rotate/alpha, dispatch to a per-type drawer). Bodies are wholly different: Excal renders roughjs `Drawable`s for geometric primitives; ours renders ~35 semantic UI glyphs. No type overlaps. Intentional product divergence. |
| element rotation about center (`translate(c)→rotate(angle)→translate(-c)`) | MATCH | `drawElement` renderer.ts:150-155 | drawElementFromCanvas renderElement.ts:703-719 | Both rotate around element center. Ours rotates the live draw; Excal rotates the cached-canvas blit. Same transform math. |
| per-element opacity (`globalAlpha`) | DIVERGENT (behavioral) | `drawElement` renderer.ts:156 | `getRenderOpacity` renderElement.ts:108-132,794-800 | We set `globalAlpha = style.opacity ?? 1`. Excal combines element×frame opacity and erase-pending dimming. We have no frame-opacity inheritance or erase state (no frames-with-opacity, no eraser tool). Scope-appropriate. |
| element canvas caching (`generateElementWithCanvas` / `elementWithCanvasCache` WeakMap, regen on zoom/theme/version) | ABSENT (intentional) | — | renderElement.ts:603-663 | Excal rasterizes each element to an offscreen canvas keyed by zoom/theme/version and blits it; a perf optimization for expensive roughjs shapes. Ours draws every element live each frame. Acceptable: our glyphs are cheap vector ops and our scenes are small/single-user. Real but deliberate gap. |
| `cappedElementCanvasSize` (clamp offscreen canvas to Safari area/dim limits) | ABSENT (intentional) | — | renderElement.ts:149-202 | Only relevant to the offscreen-canvas cache, which we don't have. |
| `imageSmoothingEnabled=false` for axis-aligned/right-angle elements | ABSENT (gap, minor) | — | renderElement.ts:1000-1061 | Excal disables smoothing when angle is 0 or a right angle to sharpen blitted bitmaps. We draw vectors live so there's no blit to sharpen; mostly N/A, but our raster `drawImage`/icon paths (renderer.ts:854-962) don't toggle smoothing. Low impact. |
| `drawImagePlaceholder` (image element placeholder glyph) | DIVERGENT (cosmetic) | `drawImage` renderer.ts:586-605 | renderElement.ts:361-385 | Both paint a placeholder for an image. Excal blits a FontAwesome "image" SVG centered; ours strokes a mountains-and-sun glyph. Same intent. |
| frame outline render (roundRect with `FRAME_STYLE.radius/zoom`, name tab) | DIVERGENT (cosmetic) | `drawFrame` renderer.ts:348-365 | renderElement.ts:802-845 | Both: rounded rect + a title label above the frame. Excal uses theme stroke + magicframe color; ours adds a drop shadow and uses paper fill. Behaviorally equivalent role. |
| text rendering with manual multiline wrap | DIVERGENT (behavioral) | `drawText`+`wrapText` renderer.ts:543-584 | renderElement.ts:546-595 | Excal splits on explicit `\n` and lays each line at `getLineHeightInPx` with `getVerticalOffset`; it does NOT auto-wrap (width is precomputed). Ours measures and **greedily word-wraps** to `el.width`. Different algorithm: ours wraps, Excal honors hard newlines only. Also ours ignores RTL handling (renderElement.ts:548-555). For a wireframe spec tool the difference is benign. |
| `frameClip` / `shouldApplyFrameClip` (clip element draw to containing frame) | ABSENT (intentional) | — | staticScene.ts:132-156, 318-345 | Excal clips children to their frame. Our "frame" is a styling element, not a clipping container; children aren't clipped. Deliberate per our model (geometry is world-space, no frame clip). |
| `renderLinkIcon` (cached per-zoom link badge canvas) | ABSENT (intentional) | — | staticScene.ts:158-228 | No hyperlink feature in ours. |
| iframe/embeddable second-pass render + placeholder label | ABSENT (intentional) | — | staticScene.ts:387-461 | No embeddables/iframes in ours. |
| `renderStaticScene` throttle via `throttleRAF` (coalesce to one paint per frame, latest-args) | DIVERGENT (behavioral) | Canvas.svelte:45-87 `$effect` | staticScene.ts:482-501; throttleRAF utils.ts:155-188 | Both are dirty-driven, not a constant loop. Excal coalesces repeated `renderStaticScene(throttle=true)` calls into one rAF with latest args. Ours relies on Svelte `$effect` reactive batching: the effect re-runs when any read dep changes and Svelte coalesces synchronous invalidations into one microtask flush. Net: both paint once per burst of changes; ours flushes on microtask (sooner), Excal on next rAF. The pointermove path in Canvas.svelte:185 does its own rAF throttle. Functionally close; timing model differs. |
| `_renderInteractiveScene` (overlay paint loop) | MATCH (role) | `drawSelection`/`drawGuides`/`drawMarquee` renderer.ts:1756-1886 + `render` renderer.ts:90-92 | interactiveScene.ts:1552-2076 | Same role: after elements, paint selection borders, transform handles, marquee, snap guides. Merged into our single pass vs Excal's separate canvas. |
| `renderSelectionElement` (the marquee/drag-selection rectangle) | MATCH | `drawMarquee` renderer.ts:1872-1885 | renderElement.ts:756-778 | Both: translucent fill + 1/zoom stroked rect in selection color. Excal hardcodes `rgba(0,0,200,0.04)` fill + 0.5/zoom offset for crisp 1px; ours uses `globalAlpha=0.09` over the shell selection color and no 0.5 offset. Same behavior, minor color/offset diff. |
| `renderSelectionBorder` (per-element selection outline, rotated, dashed for groups/remote, multi-pass for multi-color) | DIVERGENT (behavioral) | `drawSelection` renderer.ts:1756-1796 | interactiveScene.ts:947-1000 | Both stroke a rotated rect around each selected element, outset by padding (ours `3/zoom`; Excal `DEFAULT_TRANSFORM_HANDLE_SPACING*2/zoom`). Ours draws a solid 1.5/zoom accent outline per element + a plain union AABB for multi-select. Excal supports **layered multi-color dashed borders** (one stroke per remote collaborator color, lineDashOffset-staggered) and dashed for locked/remote/group. We have no collab/locking/groups, so single solid color is correct for our scope. |
| `renderTransformHandles` (resize squares + rotation circle, roundRect handles, selectionColor stroke) | MATCH | `drawSelection` handle loop renderer.ts:1810-1829 | interactiveScene.ts:1345-1386 | Both: white-filled handles stroked in selection color; rotation handle drawn as a filled circle; resize handles as small squares (Excal prefers roundRect 2/zoom corners, ours sharp `rect`). Both size handles in screen-constant units (Excal via `getTransformHandles(zoom)`, ours via `handleSizeWorld`). Same behavior; corner-rounding cosmetic. |
| rotation-handle stalk (line from top-mid to rotate handle) | MATCH | `drawSelection` renderer.ts:1798-1808 | (implicit in `getTransformHandles` spacing) interactiveScene.ts:1899-1905 | Excal positions the rotation handle above the box with a gap (no explicit stalk line — the gap is visual). Ours explicitly strokes a connector line from the `n` handle to the rotate handle. Behaviorally equivalent affordance; ours adds an explicit stalk. |
| multi-select union bounding box (dashed, transform handles on common bounds) | MATCH | `drawSelection` renderer.ts:1789-1796 + handles | interactiveScene.ts:1936-1983 | Both compute common bounds and draw a dashed/plain rect + corner handles for >1 selection. Excal dashes (`2/zoom`); ours strokes solid 1/zoom. Excal omits rotation handle when a frame is in the set; ours relies on editor-supplied handle list. Minor. |
| `getCommonBounds` multi-selection AABB | MATCH (delegated) | `scene.selectionBounds` (consumed at renderer.ts:1790) | interactiveScene.ts:1944 | We consume precomputed `selectionBounds`; Excal computes inline. Equivalent. |
| `renderFrameHighlight` (drop-target/frame-hover highlight) | DIVERGENT (cosmetic) | `drawDropTarget` renderer.ts:1737-1754 | interactiveScene.ts:1002-1030 | Both highlight a single hovered drop-target element. Excal strokes `rgb(0,118,255)` rounded rect at frame radius. Ours fills translucent accent + dashed accent stroke. Same role (reparent/frame drop hint), different look. |
| `renderSnaps` / alignment-guide overlay | MATCH (role) | `drawGuides` renderer.ts:1832-1870 | interactiveScene.ts:2030 (`renderSnaps`) | Both draw alignment/snap guide lines during drag. Ours draws guide lines with end-caps and dashes distribute-guides; Excal's `renderSnaps` (separate file) draws point/gap snaps. Same purpose; our guide algorithm is independent (see snapping axis). |
| `renderElementsBoxHighlight` (group/locked highlight) | ABSENT (intentional) | — | interactiveScene.ts:1032-1078 | No groups/locked-element highlighting in ours. |
| `renderLinearPointHandles` / `renderSingleLinearPoint` (per-point handles for lines/arrows) | ABSENT (intentional) | — | interactiveScene.ts:1080-1203, 196-224 | No linear/arrow element type in ours. |
| `renderBindingHighlightForBindableElement*` (arrow-binding suggestion highlights) | ABSENT (intentional) | — | interactiveScene.ts:226-931 | No arrows/bindings in ours. |
| `renderFocusPointIndicator` / connection line / circle (arrow focus points) | ABSENT (intentional) | — | interactiveScene.ts:1205-1343 | No arrows in ours. |
| `renderCropHandles` (image crop affordance) | ABSENT (intentional) | — | interactiveScene.ts:1388-1491 | No image cropping in ours. |
| `renderTextBox` / `renderResetAutoResizeHandle` (text-edit affordances) | ABSENT (intentional) | — | interactiveScene.ts:1493-1550 | No in-canvas text editing in ours. |
| `renderRemoteCursors` (collab cursors) | ABSENT (intentional) | — | interactiveScene.ts:2034-2040 | No collaboration in ours (single-user per CLAUDE.md). |
| scrollbars (`getScrollBars` + roundRect paint) | ABSENT (gap) | — | interactiveScene.ts:2042-2068 | Excal paints overlay scrollbars. Ours has none (relies on infinite-pan + zoom-to-fit). Real but minor UX gap. |
| search-match highlight rects | ABSENT (intentional) | — | interactiveScene.ts:1987-2028 | No canvas search in ours. |
| `getCornerRadius` (size-aware radius clamp) | MATCH | `roundRect` clamp renderer.ts:274-285 | utils.ts (getCornerRadius), used renderElement.ts:456 | Both clamp corner radius to half the min dimension. Ours: `Math.min(r, min(w,h)/2)`. Equivalent guard. |

### Divergences & gaps

Behavioral / bug-risk items worth tracking:

1. **No per-element render caching** (`generateElementWithCanvas`, renderElement.ts:603-663) — ABSENT
   by design. Ours redraws every visible element on every dirty paint. Fine for small single-user
   scenes and cheap vector glyphs, but there is no upper bound: a document with hundreds of richly
   detailed primitives will repaint all of them each frame during a drag. Severity: behavioral
   (perf), acceptable for stated scope, but the only structural perf risk in the renderer.

2. **Text wrapping diverges** (`drawText`/`wrapText` renderer.ts:543-584 vs renderElement.ts:546-595)
   — ours greedily word-wraps to `el.width`; Excal honors only explicit `\n` and never auto-wraps.
   Also ours has no RTL handling. For a wireframe-spec tool this is benign, but text laid out in our
   canvas will not match a faithful Excalidraw text element. Severity: behavioral.

3. **Throttle/dirty model differs** (Canvas.svelte:45-87 `$effect` vs `throttleRAF`,
   staticScene.ts:482-501). Both are dirty-driven (no constant rAF). Ours coalesces via Svelte's
   reactive flush (microtask); Excal coalesces via one rAF with latest-args. The pointermove handler
   (Canvas.svelte:185) adds its own rAF throttle, so high-frequency drags are frame-bounded. Net
   behavior matches "paint once per burst." Severity: cosmetic (timing).

4. **Selection border is single-color/solid** (`drawSelection` renderer.ts:1756-1796 vs
   `renderSelectionBorder` interactiveScene.ts:947-1000). Excal's layered multi-color dashed borders
   exist to show remote collaborators and locked/group state — none of which we have. Correct for
   scope; flagged so a future collab/lock feature knows to extend `drawSelection`. Severity:
   cosmetic.

5. **Scrollbars absent** (interactiveScene.ts:2042-2068). Minor UX gap; ours relies on zoom-to-fit
   and infinite pan. Severity: cosmetic.

6. **Image-smoothing toggle absent** (renderElement.ts:1000-1061). Mostly N/A (we draw vectors, not
   blits), but our raster icon/SVG/image paths (renderer.ts:854-962, 586-605) never set
   `imageSmoothingEnabled`. Low impact. Severity: cosmetic.

7. **Grid is dots, not dashed lines** (`drawGrid` renderer.ts:97-139 vs `strokeGrid`
   staticScene.ts:56-130). Both density-adapt to zoom with a major/minor tier; Excal also applies a
   0.5px crisp offset at zoom===1 that ours lacks. Pure visual-language choice. Severity: cosmetic.

No correctness **bug-risk** divergences were found in the rendering math itself: DPR handling
(Canvas.svelte:98-101 + renderer.ts:66-77), rotation-about-center (renderer.ts:150-155), screen-
constant stroke widths (`strokeWidthFor` renderer.ts:143-146), and radius clamping
(renderer.ts:282) all mirror Excalidraw's behavior correctly.

### Our extensions (no Excalidraw counterpart)

These exist only in ours because our product is a *semantic UI wireframe* tool, not a freehand
diagram tool:

- **~35 semantic primitive drawers** in renderer.ts — `drawButton` (variant-aware fills, embedded
  icon + centered label, 470-519), `drawInput` (522-541), `drawTable` (column/row skeleton, 607-649),
  `drawChart` (line/bar/pie/donut/area/scatter synthetic data, 651-740), `drawNav`/`drawSidebar`
  (413-468), `drawList` (742-777), `drawTabs` (779-821), `drawModal` (823-852), `drawCheckbox`/
  `drawRadio`/`drawToggle`/`drawSlider`/`drawDropdown` (1011-1161), `drawStatCard` (1163-1208),
  `drawBadge`/`drawProgress`/`drawAvatar`/`drawAlert`/`drawTooltip` (1210-1362),
  `drawBreadcrumb`/`drawPagination`/`drawStepper`/`drawAccordion` (1364-1551), and the marketing
  blocks `drawSectionHeader`/`drawHero`/`drawFeatureGrid`/`drawTestimonial`/`drawCtaSection`
  (1553-1733). None have an Excalidraw counterpart.
- **`drawEmbeddedIcon`** (renderer.ts:939-962) + **`drawIcon`/`drawSvg`** (854-934) — Phosphor/SVG
  path rasterization as a composable per-element property, with `parseViewBox` (964-970) and a
  sub-pixel skip (`size*zoom < 0.5`). Excalidraw has no equivalent "icon as element property."
- **`VARIANT_COLORS`** semantic palette (renderer.ts:1003-1009) + **`userStrokeWidth`** thin/bold/
  extra bucket resolution (288-292) + **`applyDash`** stroke-style buckets (295-307) — our style-token
  system, not present in Excal's roughjs-driven styling.
- **`labelText`** helper (renderer.ts:340-346) and the divider orientation-inference logic
  (`drawDivider` 972-999) — bespoke to our semantic elements.

The deeper extension noted in the prompt — the semantic Markdown export compiler
(`src/lib/export/to-markdown.ts`) — is the product's reason to exist and has no rendering-axis
counterpart in Excalidraw at all.


---

## Parity: commands-history

Axis focus: user operations, undo/redo snapshots, gesture coalescing / transactions.

### Architectural framing

Excalidraw and LayoutForge (LF) make a **fundamentally different undo/redo choice**, and that
choice cascades through every function below.

- **Excalidraw**: a *delta* engine. `Store` (`store.ts`) observes the scene, computes a
  structural-clone snapshot only of *changed* elements, and emits a `StoreDelta` (added / removed /
  updated diffs). `History` (`history.ts`) keeps stacks of *inverse deltas*; undo/redo *applies* a
  delta forward onto the live scene and pushes the re-inverted delta to the opposite stack. Built
  for **multiplayer/collab and remote reconciliation** (versions, versionNonce, `applyLatestChanges`,
  ephemeral vs durable increments, micro/macro action scheduling).
- **LF**: a *full-snapshot* engine (`history.svelte.ts`). Every committed gesture stores a complete
  `structuredClone` of the document; undo/redo just *replaces* the whole document with a prior
  clone. Single-user, local-first, no collab — so correctness is automatic (no inverse-command
  drift) and the snapshot machinery, delta math, version reconciliation, and ephemeral-increment
  plumbing are deliberately ABSENT.

Because of this, the entire `StoreDelta` / `StoreChange` / `StoreSnapshot` / increment subsystem in
`store.ts` has **no per-function LF counterpart** — LF collapses it into two operations: "clone the
doc" and "compare two canonical strings." I classify those Excalidraw functions as ABSENT
(intentional, per single-user scope) rather than enumerating each as a divergence, and instead map
the *behavioral* contracts (coalescing, no-op suppression, redo-stack reset, stack cap, undo/redo
semantics) that LF must still satisfy.

The user-facing *command* algorithms (align, distribute, flip, group, lock, styles, duplicate) DO
have direct counterparts and are compared line-by-line.

### Classification table

| Excalidraw fn | Status | Ours ref | Excal ref | Note |
|---|---|---|---|---|
| `History.record` (push entry, reset redo) | DIVERGENT | `history.svelte.ts:115` (`commit`) | `history.ts:117` | Both push one entry per durable change and clear the redo/future stack. LF clears `#future` unconditionally on any committed change; Excalidraw clears redo **only when the element delta is non-empty** (a pure appState/selection change keeps redo). LF has no appState-only entries, so the asymmetry is mostly moot — see Divergences. |
| `History.undo` / `perform` (pop, apply, push inverse) | DIVERGENT | `history.svelte.ts:143` | `history.ts:139,157` | Same net behavior (move top entry from undo→redo, restore prior state). Excalidraw *loops* popping entries until one produces a **visible** change (skips no-op/appState-only deltas); LF restores exactly one snapshot, no skip-until-visible loop. |
| `History.redo` | MATCH | `history.svelte.ts:154` | `history.ts:148` | Symmetric to undo on both sides. |
| `History.clear` | MATCH | `history.svelte.ts:165` (`reset`) | `history.ts:108` | Both empty undo/redo and re-baseline. LF also re-seeds the baseline clone+key. |
| `History.isUndoStackEmpty` / `isRedoStackEmpty` | MATCH | `history.svelte.ts:78` (`canUndo`/`canRedo`) | `history.ts:98,102` | Boolean derived from stack length on both sides. |
| `HistoryChangedEvent` emitter | ABSENT | — | `history.ts:83,134` | LF uses Svelte `$derived` (`canUndo`/`undoLabel`) instead of an event emitter; UI reactivity replaces the observer. Intentional (Svelte runes vs React event bus). |
| `Store.commit` (flush micro, run one macro) | DIVERGENT | `history.svelte.ts:115` (`commit`) | `store.ts:183` | Both are the commit boundary. Excalidraw runs queued micro-actions then exactly one macro action chosen by precedence (IMMEDIATELY > NEVER > EVENTUALLY). LF's `commit` is a plain transaction-depth decrement + no-op check + single push; no micro/macro queue. |
| `Store.scheduleCapture` / `scheduleAction` (`CaptureUpdateAction`) | ABSENT | — | `store.ts:101,110` | LF has no IMMEDIATELY/NEVER/EVENTUALLY taxonomy; every `transact`/`commit` is "immediately durable." Ephemeral (drag/resize) updates are kept out of history by NOT wrapping them in `transact` (the editor uses `begin`/`commit` and the no-op check), not by an action enum. Intentional. |
| `Store.scheduleMicroAction` / `flushMicroActions` | ABSENT | — | `store.ts:117,305` | Async multi-step capture deferral — only needed for async freedraw/text/image + collab. ABSENT, intentional (no async element creation, no collab). |
| `Store.processAction` (durable vs ephemeral dispatch) | ABSENT | — | `store.ts:317` | Folded into LF's single durable commit path. Intentional. |
| `StoreSnapshot.maybeClone` (clone only if changed) | DIVERGENT | `history.svelte.ts:32` (`cloneDocument`) + `:115` no-op check | `store.ts:761` | Same *intent* (don't record when nothing changed). Excalidraw clones only the changed elements and returns the SAME instance if nothing changed (reference-equality short-circuit). LF always full-clones, then suppresses the *entry* via canonical-string equality. Different mechanism, same observable result (no spurious undo entry); LF is O(doc) per commit vs Excalidraw O(changed). |
| `StoreSnapshot.detectChangedElements` (version/hash diff) | DIVERGENT | `history.svelte.ts:40` (`canonical`/`stableStringify`) | `store.ts:904` | Both detect "did the document change." Excalidraw compares per-element `version` + a `hashElementsVersion`; LF builds a canonical sorted-key JSON string and string-compares. LF's is content-based (no version counters), so it is immune to version drift but cannot tell *which* element changed (it doesn't need to). |
| `StoreSnapshot.createElementsSnapshot` (deep-copy changed only) | DIVERGENT | `history.svelte.ts:32` | `store.ts:970` | Excalidraw deep-copies only changed elements and shares the rest by reference (structural sharing). LF *deliberately* deep-clones everything — the file header (`history.svelte.ts:9-14`) documents that an earlier structural-sharing version aliased a stale element and corrupted an undo; a fuzz test forced full cloning. Intentional anti-sharing, opposite of Excalidraw. |
| `StoreDelta.calculate` / `inverse` / `squash` / `applyTo` | ABSENT | — | `store.ts:507-637` | The whole delta algebra. LF stores states, not deltas, so there is nothing to inverse/squash/apply. Intentional. |
| `StoreSnapshot.getChangedElements` / `getChangedAppState` | ABSENT | — | `store.ts:691,714` | Diff computation for delta emission. ABSENT (no deltas). Intentional. |
| `getObservedAppState` / `ObservedAppState` | ABSENT | — | `store.ts:1006` | Selects the appState subset that participates in undo (selection, group, bg color…). LF keeps selection/camera OUT of history entirely (only the document is snapshotted), so there is no observed-appState concept. See Divergences (selection-in-undo). |
| `alignElements` / `calculateTranslation` | MATCH | `commands.svelte.ts:240` (`align`) | `align.ts:17,52` | Identical algorithm: union bbox of selection, per-group min/center/max delta. LF's `#topLevelSelection` roots ≙ Excalidraw's `getSelectedElementsByGroup` groups. start/end/center formulas match byte-for-byte. |
| `distributeElements` (gap + negative-step center fallback) | DIVERGENT | `commands.svelte.ts:274` (`distribute`) | `distribute.ts:17` | Gap path identical (sort by mid, `step = (extent − span)/(n−1)`, walk running pos). Overlap fallback: Excalidraw finds the boxes whose start==bounds.start / end==bounds.end and steps between *their* mids, holding those two fixed; LF pins `sorted[0]`/`sorted[last]` and steps between *their* mids. After sorting by mid these usually coincide, but if the extreme-start box ≠ smallest-mid box (possible when widths differ), the pinned pair differs. severity: behavioral. |
| `flipElements` (mirror about bbox center) | DIVERGENT | `commands.svelte.ts:328` (`flip`) | `actionFlip.ts:110` | Both mirror the selection about its common-bbox center. Excalidraw mirrors via `resizeMultipleElements` with negative scale (`flipByX/Y`, resize-from-center, maintain aspect) so element *content* (text/arrowheads/chirality) is mirrored, then re-centers to prevent drift. LF has no internal chirality, so it does a position mirror (`x' = 2c − (x+w)`) plus an explicit rotation inversion (`−θ` for X, `π−θ` for Y). Net visual result equivalent for LF's element set; algorithm differs (no resize, no arrowhead swap, no re-center pass). severity: cosmetic (correct for LF's scope). |
| arrow-only flip (swap arrowheads) | ABSENT | — | `actionFlip.ts:116-129` | LF has no arrow elements/arrowheads. Intentional. |
| `actionGroup` (assign `groupIds`) | DIVERGENT | `commands.svelte.ts:386` (`group`) | `actionGroup.tsx:91` | Excalidraw grouping is a *flat tag*: it pushes a new `randomId()` into each element's `groupIds[]` and reorders so grouped elements are contiguous; geometry untouched. LF has no `groupIds` model — it creates a **real `container` element** sized to the selection AABB and reparents the selection into it. Same user intent (one selectable unit), structurally different (real containment node vs tag). severity: behavioral. |
| `actionUngroup` (pop `groupIds`) | DIVERGENT | `commands.svelte.ts:426` (`ungroup`) | `actionGroup.tsx:215` | Excalidraw removes the innermost group id from each member's `groupIds[]`. LF dissolves the container element: reparents its children to the container's parent (preserving world coords) and deletes the container. Mirror of the group divergence. severity: behavioral. |
| `actionToggleElementLock` (`shouldLock = every(!locked)`) | DIVERGENT | `commands.svelte.ts:358` (`toggleLockSelection`) | `actionElementLock.ts:21` | **Different threshold on mixed selections.** Excalidraw locks iff **every** selected element is currently unlocked (`elements.every(el => !el.locked)`) — a mixed lock/unlock selection therefore *unlocks*. LF locks iff **some** element is unlocked (`ids.some(id => !locked)`) — a mixed selection *locks*. Opposite outcome for the mixed case. severity: bug-risk. |
| `actionUnlockAllElements` | MATCH | `commands.svelte.ts:368` (`unlockAll`) | (action registry) | Both clear `locked` on every locked element in the doc as one entry. |
| `actionCopyStyles` (capture primary element style) | DIVERGENT | `commands.svelte.ts:452` (`copyStyles`) | `actionStyles.ts:41` | Both capture one source element's style. Excalidraw picks the **first** element matching `selectedElementIds` and serializes the whole element(s) (incl. bound text) to a module-level JSON string with `EVENTUALLY` (non-undoable) capture. LF picks the **last** selected (`els[els.length-1]`) and returns just the `style` object to the caller (no module global). Source-element pick order differs (first vs last). severity: cosmetic. |
| `actionPasteStyles` (apply style to selection) | DIVERGENT | `commands.svelte.ts:460` (`pasteStyles`) | `actionStyles.ts:72` | Both apply the captured style to every selected element as one undo entry (`IMMEDIATELY`). Excalidraw copies an explicit allow-list of style props (stroke/fill/opacity/roughness/roundness + text font props, with type-guards, frame special-casing, arrowhead copy, text bbox redraw). LF shallow-merges the whole `style` object. Equivalent for LF's flat `ElementStyle`; Excalidraw's is far more property-aware. severity: cosmetic. |
| `actionDuplicateSelection` / `duplicateElements` | DIVERGENT | `commands.svelte.ts:95` (`duplicateSelection`), `:490` (`#cloneSubtree`) | `actionDuplicateSelection.tsx:39` | Both clone the selection as one undo entry, regenerate ids, offset, and select the clones. **Offset differs**: Excalidraw uses `DEFAULT_GRID_SIZE / 2` (`= 10`) on x and y; LF defaults to `24`. Excalidraw also remaps `groupIds`/`frameId`/binding refs; LF remaps `parentId` via an id map across the subtree. severity: cosmetic (offset is a tunable default). |
| `paste` (regenerate ids, offset, reparent) | DIVERGENT | `commands.svelte.ts:126` (`paste`) | (clipboard.ts, not in scope file) | LF's clipboard paste regenerates all ids, remaps `parentId` within the pasted set, offsets by `24`, selects new roots. Excalidraw's paste offset/centering logic lives in `clipboard.ts`/`App` (not in the read files). Behavior is analogous; default offset differs. severity: cosmetic. |

### Divergences & gaps

1. **Lock threshold on mixed selections (bug-risk).** `commands.svelte.ts:361`
   `const anyUnlocked = ids.some(id => !this.#scene.get(id)?.locked)` → locks when *any* is
   unlocked. Excalidraw `actionElementLock.ts:21` uses `every(!locked)` → locks only when *all* are
   unlocked, so a mixed selection unlocks. The user-visible consequence: select one locked + one
   unlocked element and hit lock — LF locks both; Excalidraw unlocks both. The toggle label is
   correct relative to LF's own predicate, but the convention differs from Excalidraw. Pick one and
   document it; this is the single most likely "why did the toggle do the opposite?" complaint.

2. **Distribute overlap fallback pins a different pair (behavioral).** `commands.svelte.ts:299`
   pins `sorted[0]`/`sorted[last]` (smallest/largest *mid*). Excalidraw `distribute.ts:50-51` pins
   the boxes whose *start* equals `bounds.start` and whose *end* equals `bounds.end`. For unequal
   widths the box with the smallest mid is not necessarily the box with the smallest start, so the
   re-spacing baseline can differ. Only triggers when elements overlap on the axis (`step < 0`).

3. **No "skip-until-visible" undo loop (behavioral, but inert at LF scope).** Excalidraw
   `history.ts:179-219` keeps popping entries until one yields a visible change, so a chain of
   selection-only deltas is consumed in a single undo press. LF stores no selection-only entries
   (selection isn't in history), so every LF undo entry is by construction visible — the loop is
   unnecessary. Flagged for completeness, not a real gap.

4. **Redo-stack reset is unconditional (behavioral, inert).** `history.svelte.ts:128`
   `this.#future = []` on every committed change. Excalidraw `history.ts:127-132` preserves redo
   across pure appState/selection-only changes. Again, LF doesn't record appState-only entries, so
   the conditional is moot — but if LF ever adds selection-to-history, this would discard redo on a
   bare click.

5. **Full-clone vs structural-sharing snapshots (intentional inversion).** `history.svelte.ts:9-14`
   documents that LF *deliberately* abandoned structural sharing (which Excalidraw uses at
   `store.ts:970-986`) after a fuzz test proved aliasing corrupted undo. This is a conscious
   trade: O(doc) clone per commit for guaranteed isolation. Correct for LF's element-count scale.

6. **Selection / camera / appState not in history (intentional gap).** Excalidraw records an
   `ObservedAppState` slice (selection, group, bg color) in deltas (`store.ts:1006`). LF snapshots
   only the `LayoutDocument`; selection is restored implicitly by the document replace but is not a
   first-class undoable axis. Consistent with single-user scope; means "undo my selection" is not
   supported (matches most desktop tools).

7. **No version / versionNonce / collab reconciliation (intentional gap).** `HistoryDelta.applyTo`
   excludes `version`/`versionNonce` and `applyLatestChanges` reconciles against remote edits
   (`history.ts:29-34,68-80`). LF has no versions and no remote peer, so these are absent by design.

8. **No ephemeral increments (intentional gap).** Excalidraw emits `EphemeralIncrement` during
   drag/resize for live collab cursors (`store.ts:253,488`). LF keeps interactive gestures out of
   history via `begin`/`commit` + the canonical no-op check (`history.svelte.ts:105-131`); there is
   nothing to broadcast.

### Our extensions (no Excalidraw counterpart)

- **`History.cancel`** (`history.svelte.ts:134`): aborts an in-flight gesture and *restores the
  pre-gesture baseline* (Escape / window-blur mid-drag). Excalidraw has no symmetric mid-gesture
  abort that rolls back the live scene from the history layer — it relies on the action returning
  the prior elements. This is an LF affordance for the canvas drag model.
- **`History.begin` / `commit` / `depth` nesting** (`history.svelte.ts:105,115,83`): explicit
  re-entrant transaction depth with a re-snapshot at the *outermost* begin. The header documents
  this fixed a "click deletes my element" bug from a stale baseline. Excalidraw's coalescing is
  driven by the `CaptureUpdateAction` scheduler instead; LF's depth counter is a distinct mechanism.
- **`canonical` / `stableStringify`** (`history.svelte.ts:40,53`): content-addressed, sorted-key
  serialization used purely for no-op suppression. Excalidraw uses version counters + hashes; LF's
  string canonicalization is its own design (also drives the `#baselineKey` cache).
- **`Commands.createAt` + `#findContainerAt`** (`commands.svelte.ts:43,61`): drop-and-auto-parent
  into the deepest container under the cursor, in one transaction. Excalidraw's frame membership is
  computed post-hoc (`updateFrameMembershipOfSelectedElements`); LF folds auto-parenting into create.
- **`Commands.changeType`** (`commands.svelte.ts:210`): re-type an element in place, migrating to the
  new type's defaults while preserving geometry/style/id. No Excalidraw equivalent (Excalidraw has
  fixed element types). Semantic-layout-specific.
- **`Commands.patchLayout`** (`commands.svelte.ts:202`): edit a container's `LayoutIntent`
  (flex/grid direction, gap, alignment). Pure LayoutForge semantic-layout concept feeding the
  Markdown export; no Excalidraw analog.
- **`Commands.reparent`** (`commands.svelte.ts:174`): first-class parent/child link change preserving
  world geometry — LF's containment model. Excalidraw has frames + groups but no general reparent
  command at this layer.
- **`#cloneSubtree` / `#rootBounds` / `#topLevelSelection` / `#nextZUnder`**
  (`commands.svelte.ts:490,475,485,444`): containment-tree helpers (subtree clone with id remap,
  per-root union bbox, gesture-root filtering, next-z computation). Excalidraw's equivalents operate
  over flat `groupIds`, not a parent/child tree.


---

## Parity: export

Axis focus: visual SVG/PNG export of the scene, plus our semantic Markdown compiler (which has no
Excalidraw analogue). The two codebases pursue **different goals** for the visual export:

- **Excalidraw** renders a *pixel-faithful* SVG/canvas via roughjs + a shape cache, reproducing the
  exact hand-drawn look (stroke styles, roughness, bound text, frames, images, embeddables, dark
  mode filters, font inlining, scene-embed payloads).
- **Ours** (`to-svg.ts`) is explicitly a *best-effort approximate* visual reference ("not meant to
  be pixel-perfect"), drawing each semantic element as a plain rect/text/line/polyline. Our raster
  export (`to-png.ts`) reuses the *live Canvas 2D renderer* (`render()`), so it is faithful to OUR
  renderer, the way Excalidraw's `exportToCanvas` is faithful to ITS renderer.

So at the algorithm level, our SVG path is a parallel reimplementation, not a port. The
correspondences below judge behavioral intent (frame the content, pad it, paint in z-order,
honor rotation/opacity, deterministic numbers), not the hand-drawn fidelity Excalidraw layers on.

### Classification table

| Excalidraw fn | Status | Ours ref | Excal ref | Note |
|---|---|---|---|---|
| `getCanvasSize` (common bounds + padding ×2 → [minX,minY,w,h]) | MATCH | `to-png.ts:12` `contentBounds` + `rasterize` `to-png.ts:24-37` | `export.ts:564-573` | Both compute union bounds of all elements and add `padding*2` on each dimension. Ours uses `orientedBBox`+`unionBBox`; Excal uses `getCommonBounds`+`distance`. SVG side: ours uses a fixed `canvas.width/height + 80` frame instead (see divergence). |
| `getExportSize` (truncated w×h × scale) | DIVERGENT | `to-png.ts:36-41` | `export.ts:575-585` | Ours rounds `cssW/cssH` then multiplies by `scale` for the bitmap (`Math.round`); Excal `Math.trunc(dimension*scale)`. Rounding vs truncation differs by ≤1px. severity cosmetic. |
| `exportToCanvas` (offscreen raster, scrollX/Y offset, scale, bg, theme) | DIVERGENT | `to-png.ts:24-78` `rasterize` | `export.ts:176-280` | Same shape: create canvas at `size*scale`, offset content into a padded frame, render via the real renderer, paint bg, disable grid. Differences: ours has no dark-mode theme, no font preloading, no image cache, no frame-rendering config, and applies `maxDimension` clamp (Excal has none). severity behavioral (scope: single-user, no dark export, no embedded images). |
| `exportToSvg` (build `<svg>` root, viewBox, w/h×scale, bg rect, render elements) | DIVERGENT | `to-svg.ts:12-27` `compileToSvg` | `export.ts:289-506` | Both produce an `<svg>` with viewBox, width/height, a background rect, then per-element nodes. Ours omits: scene-embed metadata payload, font-face inlining, frame clip-paths, `exportScale`, dark-mode. Ours frames by `canvas.width/height+80` not by content bounds. severity behavioral. |
| `renderSceneToSvg` (paint-order iteration, skip deleted, skip bound text, embeddables on top) | DIVERGENT | `to-svg.ts:21-24` loop + `paintOrder` `to-svg.ts:29-48` | `staticSvgScene.ts:708-786` | Both iterate elements and emit one node each. Ours sorts by `(parentId tree, z, id)` depth-first; Excal relies on caller-provided fractional-index order and splits iframe-like to a second pass. Ours has no `try/catch` per element (a throw aborts the whole SVG). severity bug-risk (one malformed element aborts our entire SVG; Excal isolates failures). |
| `renderElementToSvg` (per-type SVG node: rect/diamond/ellipse/line/arrow/freedraw/image/text/frame/embeddable) | DIVERGENT | `to-svg.ts:56-199` `renderEl` | `staticSvgScene.ts:87-706` | Both are the per-element dispatch. Excal uses roughjs `ShapeCache` for hand-drawn shapes, supports bound text masks, image symbols/crop, embeddables, links; ours emits plain primitives for our richer semantic types (table/chart/list/input/button). Disjoint type sets — no shape is a literal match, but the *role* (one node per element, honoring transform+opacity) matches. severity behavioral. |
| rotation transform `rotate(degree cx cy)` | MATCH | `to-svg.ts:50-54` `transform` | `staticSvgScene.ts:99-117,163-167` | Both rotate about the element's bbox center. Excal computes `cx,cy` from `getElementAbsoluteCoords`; ours from `bboxCenter`. Excal degree = `180*angle/Math.PI` (angle already radians); ours `rotation*180/Math.PI`. Same formula, same pivot. |
| opacity attr (`stroke-opacity`/`fill-opacity` when !=1) | DIVERGENT | `to-svg.ts:62` | `staticSvgScene.ts:137-141,157-160` | Both gate on `opacity !== 1`. Excal folds in the *containing frame's* opacity (`frame.opacity * element.opacity / 10000`) and sets separate stroke/fill opacity; ours uses a single `opacity=` attr from `el.style.opacity` only (no frame compositing). severity cosmetic (we have no frame-opacity concept). |
| `truncateText` (ellipsize frame label to frame width) | ABSENT | — | `export.ts:65-94` | No equivalent. Our SVG draws container labels as a fixed-position `<text>` without measuring/truncating (`to-svg.ts:188-194`). Intentional per scope: we don't render frame name labels at all, and our labels are short region names. Minor gap. |
| `addFrameLabelsAsTextElements` (inject frame titles as text elements for export) | ABSENT | — | `export.ts:102-131` | No equivalent. Our frames become Markdown "Screen" headings; in SVG/PNG we draw the container box + optional label text inline, not a separate measured title element. Intentional per scope. |
| `getFrameRenderingConfig` / `prepareElementsForRender` (frame clip/outline/name toggles; export-single-frame; overlapping-frame filtering) | ABSENT | — | `export.ts:133-174,207-222` | No frame-rendering subsystem (no clip paths, no "export just this frame", no overlap filtering). Intentional: single-document export, no Excalidraw frames feature. |
| `encodeSvgBase64Payload` / `decodeSvgBase64Payload` (embed scene JSON in SVG metadata for round-trip) | ABSENT | — | `export.ts:508-561` | No scene-embed in SVG. Intentional: our round-trip format is the `.lfdoc` JSON file on disk, not an embedded SVG payload. |
| font-face inlining (`Fonts.generateFontFaceDeclarations`) | ABSENT | — | `export.ts:435-447` | Ours sets `font-family="Inter, system-ui, sans-serif"` on the `<svg>` and relies on viewer fonts; no `@font-face` data-URL inlining. severity cosmetic (text may render with a fallback font in an isolated viewer). |
| `applyDarkModeFilter` / `exportWithDarkMode` theme path | ABSENT | — | `export.ts:462-465`, `staticSvgScene.ts:388-392,624-627,679-683` | No dark-mode export. PNG always paints `doc.canvas.background` (`to-png.ts:68`). Intentional per scope (no theme toggle in product). |
| image `symbol`/`use` caching + crop mask + roundness clip | ABSENT | — | `staticSvgScene.ts:437-597` | Our `image` element in SVG falls through to a plain `box` rect (`to-svg.ts` has no `image` case → default), and `to-png.ts` relies on the live renderer. No dataURL embedding, no crop, no reuse-cache. severity behavioral (images export as empty boxes in SVG). |
| `maybeWrapNodesInFrameClipPath` (clip children to containing frame) | ABSENT | — | `staticSvgScene.ts:66-85` | No frame clipping. Children are not clipped to parents in our export. Intentional (no frames feature). |
| bound-text rendering (text bound to container/arrow, mask) | ABSENT | — | `staticSvgScene.ts:101-116,283-376,648-689` | No bound-text concept; our `text` is a standalone element. Intentional. |
| `MAX_DECIMALS_FOR_SVG_EXPORT` precision clamp on rough output | MATCH (intent) | `to-svg.ts:206-209` `round` (dp=0 coords, 2-4 for transform/scale) | `staticSvgScene.ts:50-64,155` | Both bound numeric precision for deterministic/compact SVG. Excal clamps roughjs decimal places; ours rounds every emitted coordinate to integers (or 2-4 dp for transforms/scale). Same goal (stable, low-precision numbers). |

### Divergences & gaps

1. **SVG framing differs from PNG framing and from Excalidraw (behavioral).**
   `to-svg.ts:14-20` frames the SVG by `doc.canvas.width/height + 80` with a fixed `viewBox="-40 -40 …"`,
   i.e. it frames the *document canvas*, not the *content bounds*. `to-png.ts` (and Excalidraw's
   `getCanvasSize`) frame by the **union of element bounds** + padding. Consequence: elements placed
   outside the nominal `doc.canvas` rectangle are clipped/offset in the SVG but correctly captured in
   the PNG. Two of our own exports disagree on framing. This is the most material divergence on this axis.

2. **No per-element error isolation in SVG (bug-risk).**
   `renderSceneToSvg` (`staticSvgScene.ts:734-761`) wraps each element in `try/catch` so one bad
   element does not abort the export. Our `compileToSvg` loop (`to-svg.ts:21-24`) calls `renderEl`
   directly; a throw (e.g. malformed `viewBox`/`svgPath` on an `icon`) aborts the entire SVG string.
   `parseVb` (`to-svg.ts:201-204`) is defensive, but other element branches assume well-formed data.

3. **Rounding vs truncation of export pixel size (cosmetic).**
   `getExportSize` uses `Math.trunc(dimension*scale)` (`export.ts:580`); ours rounds CSS dims then
   multiplies (`to-png.ts:36-41`). Off-by-one bitmap dimensions on fractional bounds; not visible.

4. **`maxDimension` clamp is ours-only (extension, but a behavioral divergence from Excal).**
   `to-png.ts:31-34` shrinks `scale` so neither side exceeds `maxDimension` (4096 for PNG, 360 for
   thumbnails). Excalidraw's `exportToCanvas` has no such cap (it multiplies by `exportScale`
   unconditionally). Reasonable for a thumbnail generator; means very large LayoutForge documents
   export at <2× where Excalidraw would honor the requested scale.

5. **Opacity compositing (cosmetic).** Excal multiplies element opacity by its containing frame's
   opacity (`staticSvgScene.ts:137-141`); we have no frame-opacity, so a single `opacity=` attr
   suffices. Not a gap given our model.

6. **Images export as empty boxes in SVG (behavioral).** Our `image` element type has no case in
   `renderEl`, so it hits the `default` branch and draws a bordered box (no raster). Excal embeds the
   dataURL via `<symbol>/<use>`. PNG export is fine (live renderer draws images), but the SVG visual
   reference loses image content. Likely a real (if minor) gap, since `image` is a supported element type.

7. **Font inlining / dark mode / scene-embed are all absent**, all intentional per LayoutForge scope
   (single-user, no theme toggle, JSON round-trip on disk, portable visual reference only).

### Our extensions (no Excalidraw counterpart)

- **`compileToMarkdown` — the semantic Markdown layout-spec compiler (`to-markdown.ts:34-75`).**
  THE product. No Excalidraw analogue whatsoever. Excalidraw exports pixels/JSON; we export *layout
  intent* as a Claude-Code brief. Supporting algorithms, all extensions:
  - `buildForest` (`to-markdown.ts:95-127`): orphan/cycle-safe parent grouping with `effectiveParent`
    fallback (missing/non-container parents reparent to root) and a `visited` cycle guard.
  - `geometricOrder` (`to-markdown.ts:134-141`): banded top-to-bottom, then left-to-right reading
    order with a 12px row tolerance and id tiebreaker — a determinism primitive with no Excal peer.
  - `resolveIntent` / `inferMode` / `inferGap` / `inferGridCols` / `clusterCount` / `similarSizes`
    (`to-markdown.ts:574-662`): geometry → flex/grid/flow + gap + column-count inference.
  - `childSizingHint` (`to-markdown.ts:277-329`): infers grow/fixed/hug + cross-axis stretch per child.
  - `sizingDescriptor` / `regionDescriptor` / `leafDescriptor` / `containerSublines`
    (`to-markdown.ts:227-566`): semantic per-type descriptors for ~40 element types.
  - `layoutSentence` / `layoutClause` / `responsiveClause` (`to-markdown.ts:666-712`): natural-language
    layout + responsive directives.
  - `implementationInstructions` (`to-markdown.ts:716-738`): the deterministic SvelteKit/Svelte-5
    instruction footer.
  - `quote` (`to-markdown.ts:747-750`): whitespace-normalizing, determinism-preserving string quoter.
- **`makeThumbnail` (`to-png.ts:111-118`)**: small base64 PNG for the LibraryView grid. Excalidraw has
  thumbnailing elsewhere, but not in this export module.
- **Semantic-element SVG primitives in `renderEl` (`to-svg.ts:112-185`)**: table/chart/list/input/button
  draw bespoke approximations (header rows, axis polylines, bar/line series, placeholder text). No
  Excal counterpart — Excalidraw has no such high-level UI element types.


---

## Parity: persistence-clipboard

Axis focus: save / open / restore / validate, clipboard copy/paste envelope, version migration.

OUR files:
- `src/lib/persistence/document-file.ts` — save/open/save-as/import/export + atomic autosave + browser fallbacks
- `src/lib/persistence/clipboard.ts` — OS clipboard envelope (`layoutforge/elements`)
- `src/lib/persistence/migrate.ts` — forward-only `schemaVersion` migration seam

EXCALIDRAW files:
- `packages/excalidraw/data/restore.ts` — element/appState/library restore + repair (data healing)
- `packages/excalidraw/data/json.ts` — serialize/validate envelope (`type: "excalidraw"`)
- `packages/excalidraw/clipboard.ts` — clipboard envelope + multi-MIME read/write

These two products differ at the data-model level. Excalidraw restores a flat, ordered array of
heterogeneous drawing primitives (arrows, freedraw, text-with-bindings, frames, images, files) and
spends most of `restore.ts` *healing* cross-element references (bindings, containers, frame
membership, fractional indices). LayoutForge stores a keyed map + `rootOrder` of semantic UI
elements with parent/child nesting, single-user, no collab, no binary files, no fractional-index
reconciliation. So the bulk of `restore.ts` is intentionally ABSENT, and our migration seam is a
deliberately thinner analog of Excalidraw's per-element `restoreElementWithProperties` defaulting.

### Classification table

| Excalidraw fn | Status | Ours ref | Excal ref | Note |
|---|---|---|---|---|
| `serializeAsJSON` (typed envelope: type/version/source/elements/appState/files, `JSON.stringify(_,null,2)`) | DIVERGENT | `document-file.ts:58` `serializeDocument` | `json.ts:52` | Both pretty-print with 2-space indent. Ours serializes the whole `LayoutDocument` verbatim (id/name/schemaVersion/elements/rootOrder/canvas); Excalidraw wraps in an export envelope with `type`/`version`/`source` and strips files/appState by mode. Our envelope identity lives *inside* the doc (`schemaVersion`), not a wrapper. severity: cosmetic. |
| `isValidExcalidrawData` (validate parsed import: `type==="excalidraw"`, elements array, appState object) | MATCH | `document-file.ts:42` `isLayoutDocument` | `json.ts:115` | Both are runtime type-guards gating an import. Ours checks `schemaVersion===SCHEMA_VERSION` + required shape (id/name/elements obj/rootOrder array/canvas obj); Excal checks `type` tag + loose element/appState shape. Same role: reject foreign/malformed payloads before load. |
| `loadFromJSON` / `loadFromBlob` (pick file -> parse -> restore) | MATCH | `document-file.ts:123` `openDocument` / `:145` `openDocumentAtPath` | `json.ts:102` | Both: pick file, read text, JSON.parse, run restore/migrate, validate, return restored doc. Ours adds Tauri-vs-browser host split + library index update. |
| `saveAsJSON` (serialize -> Blob -> fileSave with handle reuse) | MATCH | `document-file.ts:70` `saveDocument` / `:96` `saveDocumentAs` | `json.ts:77` | Both serialize then write via native picker, remembering the path/handle. Ours splits save (reuse path) vs save-as (always prompt); Excal reuses `fileHandle` unless it's an image handle. |
| `restoreElements` (iterate, drop `selection`, dedupe ids, restore each, sync indices, repair) | DIVERGENT | `migrate.ts:22` `migrateDocument` (+ `:56` `normalizeLegacyIcons`) | `restore.ts:764` | Ours has NO per-element id-dedupe, no `syncInvalidIndices`, no binding/container/frame repair pass — intentional: our model is a keyed map with explicit `rootOrder`, no fractional indices, no cross-element bindings. We DO have an analogous normalization walk (`normalizeLegacyIcons`). severity: behavioral (scoped: most repair has no counterpart in our model). |
| `restoreElement` (per-type defaulting of every field, font/lineHeight detection, legacy field migration) | DIVERGENT | `migrate.ts:56` `normalizeLegacyIcons` | `restore.ts:413` | Excal fills missing defaults for every element field on load (opacity, strokeWidth, version, roundness, etc.) so old/partial elements never crash the renderer. Ours does NOT default-fill element fields on load — it relies on `createElement()` defaults at creation time and only migrates the legacy `iconName`/`iconSvgPath` pair to unified `icon`. A hand-edited `.lfdoc` missing fields would not be healed. severity: bug-risk. |
| `restoreElementWithProperties` (`element.x ?? 0`, `version || 1`, opacity null-coalesce, strip legacy props) | DIVERGENT | (none — relies on `createElement` defaults) | `restore.ts:327` | Same intent as above: tolerant field defaulting. We have no load-time field-coercion layer. severity: bug-risk (only matters for externally-mutated files). |
| `repairBinding` / `repairContainerElement` / `repairBoundElement` / `repairFrameMembership` | ABSENT | — | `restore.ts:200/664/712/751` | Intentional. No arrow bindings, bound-text containers, or frames-as-binding-targets in our model. Our nesting is parent/child via `rootOrder`/children, not boundElements arrays. Not a gap. |
| `restoreLinearElementPoints` / `restoreFreedrawPoints` | ABSENT | — | `restore.ts:101/126` | Intentional. No freedraw/linear point arrays or pressure data in semantic-UI elements. Not a gap. |
| `restoreAppState` (coalesce supplied/local/default per key, legacy key migration, zoom number->object, grid normalize) | DIVERGENT | `document-file.ts` (`doc.canvas` loaded verbatim) | `restore.ts:1013` | Excal merges three sources (file appState / local appState / defaults) key-by-key, migrates legacy keys, normalizes zoom/grid. Ours loads `doc.canvas` as-is with no per-key defaulting or legacy-key migration. Acceptable given single-user + simpler canvas state, but no resilience to a partial/foreign `canvas`. severity: behavioral. |
| `restoreLibraryItems` / `restoreLibraryItem` (migrate array-form items, default id/status/created) | ABSENT | — | `restore.ts:1100/1108` | No library-of-reusable-element-groups concept. Our `library-db.ts` is a *document index* (metadata), a different thing. Not a gap. |
| `bumpElementVersions` (version+1 for reconciliation) | ABSENT | — | `restore.ts:957` | Intentional. No version/versionNonce reconciliation; undo/redo uses immutable snapshots (`history.svelte.ts`), no collab merge. Not a gap. |
| `serializeAsClipboardJSON` (typed `excalidrawClipboard` envelope, gather files, strip frameId for orphaned frame children) | DIVERGENT | `clipboard.ts:13` `writeClipboard` | `clipboard.ts:142` | Both build a typed JSON envelope of elements. Excal also collects referenced binary files and rewrites `frameId:null` for elements copied without their frame. Ours just `JSON.stringify(payload)` — caller pre-builds the `{kind, elements}` payload; no file gathering, no frame-orphan fixup (no files/frames in model). severity: behavioral (scoped). |
| `copyToClipboard` (serialize -> write both `excalidrawClipboard` + `text/plain` MIME) | DIVERGENT | `clipboard.ts:13` `writeClipboard` | `clipboard.ts:194` | Excal writes the JSON under BOTH a custom MIME and `text/plain` so paste works across surfaces. Ours writes only `text/plain` via `navigator.clipboard.writeText` and tags the envelope with an in-payload `kind: "layoutforge/elements"` field instead of a real custom MIME type. severity: behavioral. |
| `copyTextToSystemClipboard` (3-tier: clipboardEvent -> writeText -> execCommand) | DIVERGENT | `clipboard.ts:13` `writeClipboard` | `clipboard.ts:586` | Excal has a 3-stage fallback chain (paste-event dataTransfer, `navigator.clipboard.writeText`, legacy `document.execCommand`). Ours uses only `navigator.clipboard.writeText` guarded by optional-chaining; on failure it silently relies on the editor's in-process copy. No execCommand fallback. severity: behavioral. |
| `parseClipboard` / `parseClipboardEventTextData` (detect our envelope via `clipboardContainsElements`, else text/mixedContent) | DIVERGENT | `clipboard.ts:24` `readClipboard` | `clipboard.ts:522` | Both recognize the app's own JSON envelope and ignore foreign clipboard text. Ours checks `parsed.kind === MIME_TAG && Array.isArray(parsed.elements)` (analogous to `clipboardContainsElements`, `clipboard.ts:73`). Ours has no HTML/mixedContent/image-URL parsing path (intentional: no image paste). severity: cosmetic (the element-recognition core matches; extras are out of scope). |
| `readSystemClipboard` (multi-MIME `navigator.clipboard.read()` with readText fallback) | DIVERGENT | `clipboard.ts:24` `readClipboard` | `clipboard.ts:256` | Ours only `readText()`; Excal reads multiple MIME types/images via `clipboard.read()`. Scoped out (text envelope only). severity: cosmetic. |
| `clipboardContainsElements` (envelope type-guard) | MATCH | `clipboard.ts:30-37` (inline in `readClipboard`) | `clipboard.ts:73` | Same algorithm: check envelope type tag + `Array.isArray(elements)`. Ours inlines it; Excal accepts 3 type tags, ours one (`layoutforge/elements`). |
| `filterOutDeletedFiles` (drop files referenced only by deleted elements on export) | ABSENT | — | `json.ts:34` | Intentional — no binary files. Not a gap. |
| `serializeLibraryAsJSON` / `saveLibraryAsJSON` / `isValidLibrary` | ABSENT | — | `json.ts:128/137/147` | Intentional — no `.excalidrawlib` library export. Not a gap. |
| `copyBlobToClipboardAsPng` (write PNG blob to clipboard) | ABSENT | — | `clipboard.ts:556` | We export PNG to *file* (`document-file.ts:166` `exportDocument` png branch) but never copy a PNG to clipboard. Minor gap vs Excal, not in our documented scope. |
| `createPasteEvent` / `parseDataTransferEvent` / `parseHTMLTree` (synthetic events, drag-drop, HTML tree walk) | ABSENT | — | `clipboard.ts:89/466/212` | Intentional — no drag-drop import, no HTML paste, no React synthetic events. Not a gap. |
| (atomic crash-safe write: tmp + rename, backup-swap fallback) | EXTENSION | `document-file.ts:240` `atomicWrite` / `:278` `writeAutosave` | — | Excalidraw has no equivalent in these files (it relies on the File System Access API / browser download). Our autosave is a genuine extension. |
| (debounced autosave scheduler) | EXTENSION | `document-file.ts:304` `Autosave` | — | No counterpart; Excal app-level autosave lives outside these files (localStorage-based). |
| (forward-only `schemaVersion` step machine) | EXTENSION | `migrate.ts:22` `migrateDocument` | — | Excal does data-healing on load but has no explicit numbered forward-step migration framework in these files; ours is structured (`STEPS` table, guard loop, reject-if-newer). |
| (semantic Markdown / SVG / PNG export dispatch) | EXTENSION | `document-file.ts:166` `exportDocument` | — | The Markdown export compiler is LayoutForge's core product; Excal's analog (PNG/SVG) lives in other files, and Markdown has no counterpart at all. |

### Divergences & gaps

1. **No load-time element field defaulting (bug-risk).** Excalidraw's `restoreElement` /
   `restoreElementWithProperties` (`restore.ts:413/327`) defensively fill every element field with
   a default on load (`element.x ?? 0`, `version || 1`, `opacity == null ? default : opacity`,
   roundness inference, legacy-prop stripping). LayoutForge's load path (`openDocument` ->
   `migrateDocument` -> `isLayoutDocument`) does NOT heal element interiors — `normalizeLegacyIcons`
   only migrates the `iconName`/`iconSvgPath` pair (`migrate.ts:56`). A `.lfdoc` that round-trips
   through our own `createElement()` is always complete, so in practice this is safe; but a
   hand-edited or externally-produced file with a missing field passes `isLayoutDocument`
   (which only checks top-level shape, `document-file.ts:42`) and reaches the renderer un-healed.
   Excalidraw is strictly more robust here.

2. **`restoreElements` repair passes absent (behavioral, mostly scoped).** The entire
   binding/container/frame/index-repair machinery (`restore.ts:764-945`, plus `repairBinding`
   `:200`, `repairContainerElement` `:664`, `repairBoundElement` `:712`, `repairFrameMembership`
   `:751`, `syncInvalidIndices`) has no analog. Justified: our model has no arrow bindings, no
   bound-text containers, no fractional indices. The one piece that *could* matter — **duplicate-id
   detection** (`restore.ts:818`, regenerates id on collision) — has no analog in
   `migrateDocument`. If a `.lfdoc` `elements` map somehow contained a child referenced twice in
   `rootOrder`/children, we would not detect or repair it. Low likelihood given the keyed-map shape.

3. **`restoreAppState` per-key coalescing absent (behavioral).** Excal merges file/local/default
   appState key-by-key and migrates legacy keys + normalizes zoom/grid (`restore.ts:1013`). We load
   `doc.canvas` verbatim. A partial/foreign `canvas` object (missing zoom/pan) is not normalized,
   so a malformed canvas could produce a bad camera. `isLayoutDocument` only checks `canvas` is a
   non-null object, not its fields.

4. **Clipboard envelope uses an in-payload tag, not a custom MIME (behavioral).** Excal writes the
   JSON under a real `application/vnd.excalidraw+json`-style MIME *and* `text/plain`
   (`clipboard.ts:194/202`), and on read inspects multiple MIME types. Ours writes only `text/plain`
   and self-identifies via a `kind: "layoutforge/elements"` field inside the JSON
   (`clipboard.ts:11/13/30`). Functionally equivalent for round-tripping within the app, but ours
   cannot coexist with other clipboard producers/consumers the way a custom MIME would, and a plain
   copy-as-text of our JSON by an external tool would be re-recognized as elements on paste.

5. **No clipboard write fallback chain (behavioral).** Excal's `copyTextToSystemClipboard`
   (`clipboard.ts:586`) tries clipboardEvent -> `writeText` -> `execCommand`. Ours
   (`clipboard.ts:13`) tries only `writeText` and swallows failures, leaning on the editor's
   in-process copy buffer. Acceptable for a single desktop webview where the in-process buffer
   always works, but cross-focus OS paste fails silently if `writeText` is unavailable.

6. **No PNG-to-clipboard.** Excal `copyBlobToClipboardAsPng` (`clipboard.ts:556`) is absent; we only
   export PNG to a file (`exportDocument`, `document-file.ts:166`). Minor, outside documented scope.

7. **Migration framework shape differs (not a defect).** `migrateDocument` (`migrate.ts:22`) is a
   numbered forward-step machine with a misbehaving-step guard, a `version > SCHEMA_VERSION` reject
   (file newer than app), and a 64-iteration loop guard. Excalidraw has no numbered-step framework
   in these files — it does inline data-healing on every load regardless of version. Ours is more
   explicit/auditable; Excal's is more tolerant. Today `STEPS` is empty (v1 only), so
   `migrateDocument` is effectively a validator + icon normalizer.

### Our extensions (no Excalidraw counterpart in these files)

- **`atomicWrite` (`document-file.ts:240`)** — crash-safe tmp-write + atomic rename, with a
  backup-swap fallback when the platform rejects rename-over-existing. Injectable `AtomicFs` so the
  crash-simulation can be unit-tested. No analog in Excalidraw's persistence files.
- **`writeAutosave` / `readAutosave` (`document-file.ts:278/289`)** — app-data autosave slot,
  migrated + validated on read, returns `null` (not throw) on malformed payload so launch never
  crashes.
- **`Autosave` debounced scheduler (`document-file.ts:304`)** — `schedule()`/`flush()` with
  in-flight guard and best-effort error swallowing.
- **Tauri-vs-browser host split** — every save/open/export branches on `isTauri()` with browser
  download / `<input type=file>` fallbacks (`document-file.ts:359-401`), including `oncancel`
  handling. Excalidraw is browser-only.
- **Library index integration (`indexDocument`, `document-file.ts:403`)** — every save/open upserts
  a metadata row in the SQLite document index; failures never block the file write.
- **`migrateDocument` forward-step framework (`migrate.ts:22`)** — structured numbered migration vs
  Excalidraw's inline per-element healing.
- **Multi-format `exportDocument` dispatch (`document-file.ts:166`)** including the semantic
  **Markdown** export — LayoutForge's core product output, with no Excalidraw counterpart.


---
