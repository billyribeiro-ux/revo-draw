## Cluster: excalidraw__eraser

This cluster contains a single source file implementing the eraser tool's trail-rendering and element-hit-detection logic.

### packages/excalidraw/eraser/index.ts

Purpose: Implements the eraser tool — an animated decaying trail (`EraserTrail`) that tracks the pointer path and, on every added point, determines the set of elements (and their groups / bound text / containers) intersected by the most recent path segment, supporting both "mark to erase" and "restore" (un-erase) modes.

Imports of note (L1-L38): pulls geometry helpers from `@excalidraw/element` (`getElementBounds`, `getElementLineSegments`, `getFreedrawOutlineAsSegments`, `getFreedrawOutlinePoints`, `intersectElementWithLineSegment`, `isPointInElement`, `doBoundsIntersect`, `computeBoundTextPosition`, `getBoundTextElement`, type-guards `isArrowElement`/`isFreeDrawElement`/`isLineElement`, `shouldTestInside`, `hasBoundTextElement`/`isBoundToContainer`/`getBoundTextElementId`, `getElementsInGroup`), math helpers from `@excalidraw/math` (`lineSegment`, `lineSegmentsDistance`, `pointFrom`, `polygon`, `polygonIncludesPointNonZero`), and `arrayToMap`/`easeOut`/`THEME` from `@excalidraw/common`. Extends `AnimatedTrail` (from `../animatedTrail`). `App` is imported as a type only.

#### class `EraserTrail extends AnimatedTrail` (L40-L194)

Owns two private members: `elementsToErase: Set<ExcalidrawElement["id"]>` (L41) and `groupsToErase: Set<ExcalidrawElement["id"]>` (L42). These track the accumulated to-be-erased element IDs and the group IDs already processed (so a whole group is added/removed atomically once any member is hit).

- `constructor(app: App)` — L44-L68. Calls `super(app, {...})` configuring the underlying `AnimatedTrail` with `streamline: 0.2`, `size: 5`, `keepHead: true`, a custom `sizeMapping` callback, and a theme-dependent `fill`. The trail visually decays: `sizeMapping(c)` (L49-L62) computes two normalized factors — a time decay `t = max(0, 1 - (performance.now() - c.pressure)/DECAY_TIME)` with `DECAY_TIME = 200` (ms; `c.pressure` is repurposed as the point's creation timestamp), and a length decay `l = (DECAY_LENGTH - min(DECAY_LENGTH, c.totalLength - c.currentIndex)) / DECAY_LENGTH` with `DECAY_LENGTH = 10` — then returns `Math.min(easeOut(l), easeOut(t))`. `fill` (L63-L66) returns `rgba(0,0,0,0.2)` in light theme else `rgba(255,255,255,0.2)`. Side effect: registers the trail with the app's animation system via the superclass. Notable: `c.pressure` carries a `performance.now()` timestamp rather than real pressure — a parity-relevant detail for a reimplementation.

- `startPath(x: number, y: number): void` — L70-L74. Ends any in-progress path (`this.endPath()`), starts a new one via `super.startPath(x, y)`, and clears `elementsToErase`. Invariant: starting a new eraser stroke wipes the prior pending-erase set. Note: it clears `elementsToErase` but not `groupsToErase` here (the latter is cleared in `endPath`).

- `addPointToPath(x: number, y: number, restore = false)` — L76-L82. Appends a point via `super.addPointToPath(x, y)`, then calls `updateElementsToBeErased(restore)` and returns its result (the current array of element IDs to erase). `restore=true` switches into un-erase mode (removing previously marked elements that the segment now touches).

- `private updateElementsToBeErased(restoreToErase?: boolean)` — L84-L186. The core hit-detection pass.
  - Builds `eraserPath` (L85-L88) from the superclass current trail's `originalPoints`, mapping each `[x,y]` to a `GlobalPoint`. Returns `[]` if fewer than 2 points (L90-L92).
  - Constructs `pathSegment` (L96-L99) from only the **last two** points of the trail (`eraserPath[len-1]` → `eraserPath[len-2]`) — for performance, only the newest segment is tested each tick, not the whole path. Comment references taking "POINTS_ON_TRAIL points" but the code uses exactly the last segment.
  - `candidateElements` = `app.visibleElements.filter((el) => !el.locked)` (L101-L103); locked elements are never erasable. `candidateElementsMap = arrayToMap(candidateElements)` (L105).
  - Iterates each candidate (L107-L183). Two branches:
    - **Restore branch** (L109-L144): only when `restoreToErase` and the element is already in `elementsToErase`. If `eraserTest(...)` returns true, it removes the element — and, when `element.groupIds.at(-1)` (shallowest group) is in `groupsToErase`, removes every member of that group via `getElementsInGroup(scene.getNonDeletedElementsMap(), shallowestGroupId)` (L121-L129); also removes container id if `isBoundToContainer` (L131-L133) and bound text id if `hasBoundTextElement` (L135-L141), then deletes the element id (L143).
    - **Mark branch** (L145-L181): when `!restoreToErase` and element not yet in set. If `eraserTest(...)` true, adds the whole shallowest group (L156-L166) if not already in `groupsToErase`, adds bound text id (L168-L174), adds container id (L176-L178), and finally adds the element id (L180).
  - Returns `Array.from(this.elementsToErase)` (L185).
  - Invariants: group membership is all-or-nothing (a group is added once, guarded by `groupsToErase`); bound text and container relationships are kept consistent in both directions. Coordinate space: all points are world/`GlobalPoint` space. Side effects: mutates `elementsToErase` and `groupsToErase`.

- `endPath(): void` — L188-L193. Calls `super.endPath()`, `super.clearTrails()`, then clears both `elementsToErase` and `groupsToErase`. Resets all eraser state.

#### `const eraserTest` (L196-L304)

`eraserTest = (pathSegment: LineSegment<GlobalPoint>, element: ExcalidrawElement, elementsMap: ElementsMap, zoom: number): boolean` — module-private. Determines whether the latest eraser path segment "hits" a single element, using a tiered set of geometric tests ordered cheap-to-expensive.

- `lastPoint = pathSegment[1]` (L202) — the second endpoint, used for inside-area tests.
- **Cheap AABB pre-test** (L204-L222): computes a `threshold` of `15` for freedraw elements else `element.strokeWidth / 2` (L205). Builds an axis-aligned `segmentBounds` from the path segment expanded by `threshold` (L206-L211), and `elementBounds` from `getElementBounds(element, elementsMap)` expanded by `threshold` (L212-L218). If `doBoundsIntersect(...)` is false, returns false immediately (L220-L222). Performance gate — avoids the costly per-segment math for far-away elements.
- **Inside-area test** (L227-L232): for shapes where the filled interior should trigger erasing (`shouldTestInside(element)`), returns true if `isPointInElement(lastPoint, element, elementsMap)`.
- **Freedraw branch** (L237-L266): gets outline points (`getFreedrawOutlinePoints`) and converts to stroke segments (`getFreedrawOutlineAsSegments`). Tolerance = `Math.max(2.25, 5 / zoom)` (L244) — zoom-adaptive, visually tuned. Returns true if any outline segment is within `tolerance` of the path segment via `lineSegmentsDistance` (L246-L250). Else builds a `polygon` from the outline points offset by `element.x/element.y` (L252-L256) and returns true if `polygonIncludesPointNonZero(pathSegment[0], poly)` — checks only `pathSegment[0]` (one endpoint) as a perf optimization (L258-L263), reasoning in comment that if one endpoint is inside the closed shape the other is inside or the segment crosses the outline anyway. Returns false otherwise (L265).
- **Arrow / open-line branch** (L270-L287): for `isArrowElement(element)` or `isLineElement(element) && !element.polygon`. Tolerance = `Math.max(element.strokeWidth, (element.strokeWidth * 2) / zoom)` (L271-L274) — zoom-adaptive. Iterates each segment from `getElementLineSegments(element, elementsMap)` and returns true if any is within `tolerance` of the path segment via `lineSegmentsDistance` (L279-L284). Comment (L276-L278) notes this per-segment test guards against fast eraser movements that a single distance check would miss. Returns false otherwise (L286).
- **Default branch** (L289-L303): for all other element types. Returns true if `intersectElementWithLineSegment(element, elementsMap, pathSegment, 0, true)` yields any intersection points, OR if the element has a bound text element (`getBoundTextElement`, fetched at L268) and that bound text — repositioned via `computeBoundTextPosition` and spread over the bound text element — intersects the segment. The `0` is the gap/tolerance arg and `true` the "fall back to bounds" flag passed to `intersectElementWithLineSegment`.

Non-obvious / parity-relevant details:
- All hit detection is performed in world (`GlobalPoint`) coordinate space; `zoom` only modulates tolerances so erasing precision feels consistent on screen across zoom levels.
- Only the single most-recent path segment is tested per tick (not the cumulative path), shifting per-frame cost to O(candidate elements) while relying on frequent point updates for coverage.
- Tolerances are deliberately tuned constants: freedraw `max(2.25, 5/zoom)`, linear `max(strokeWidth, 2*strokeWidth/zoom)`, AABB threshold `15` (freedraw) / `strokeWidth/2` (others).
- The trail's `sizeMapping` reuses the `pressure` field as a `performance.now()` timestamp to drive a 200ms time-based fade combined with a 10-point length-based fade, taking the min of two `easeOut` curves.
