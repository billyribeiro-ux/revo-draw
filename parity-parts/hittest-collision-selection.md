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
