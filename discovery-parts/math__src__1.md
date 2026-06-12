## Cluster: math__src__1

This cluster covers the polygon, range, rectangle, segment, triangle geometry primitives plus the shared type definitions and scalar math utilities of `@excalidraw/math`. All point-bearing functions are generic over `GlobalPoint | LocalPoint` (both are branded `[x, y]` tuples), so the math is coordinate-space agnostic: callers must pre-transform to a single space. PRECISION (`10e-5`) is the global epsilon shared across segment/polygon containment tests.

### packages/math/src/polygon.ts

Polygon construction, closure normalization, and point-in-polygon / point-on-polygon containment tests. Operates purely on `[x,y]` tuples; "polygon" here is an array of points that is auto-closed (first point repeated at end).

- `polygon<Point>(...points: Point[]): Polygon<Point>` — L7-L11. Variadic constructor; forwards to `polygonClose` and brand-casts. Side effect: none. Output is closed (last point === first).
- `polygonFromPoints<Point>(points: Point[]): Polygon<Point>` — L13-L17. Same as `polygon` but takes an array rather than varargs. Both share `polygonClose`.
- `polygonIncludesPoint<Point>(point, polygon): boolean` — L19-L42. Classic ray-casting (even-odd) point-in-polygon test. Iterates edges with the `j = i++` previous-index idiom; for each edge straddling the horizontal ray at `y` (`(yi>y && yj<=y) || (yi<=y && yj>y)`) it computes the edge's x-intersection `((xj-xi)*(y-yi))/(yj-yi)+xi` and toggles `inside` if the test point is left of it. Returns parity of crossings. Note: no epsilon — exact float comparison; points exactly on a horizontal edge are handled by the asymmetric `<=`/`>` boundaries. Division by `(yj-yi)` is guarded by the straddle test (the two cannot both be on the same side, so denominator != 0).
- `polygonIncludesPointNonZero<Point extends [number, number]>(point, polygon): boolean` — L44-L70. Non-zero winding-number variant (handles self-intersecting polygons differently from even-odd). Uses `(i+1)%length` to wrap edges (does NOT assume pre-closed input). For each upward-crossing edge with the point strictly left it increments `windingNumber`; for downward-crossing edges with the point strictly right it decrements. Cross-product sign `(xj-xi)*(y-yi)-(x-xi)*(yj-yi)` is the orientation test. Returns `windingNumber !== 0`. Distinct from `polygonIncludesPoint` for non-simple polygons.
- `pointOnPolygon<Point>(p, poly, threshold = PRECISION): boolean` — L72-L87. Tests whether `p` lies on any edge (within `threshold`) by building `lineSegment(poly[i], poly[i+1])` for each consecutive pair and calling `pointOnLineSegment`. Loop bound is `l = poly.length - 1` so it walks edges, not the closing wrap (assumes pre-closed polygon where last===first). Short-circuits on first hit.
- `polygonClose<Point>(polygon: Point[])` — L89-L95 (internal). Returns the polygon unchanged if already closed, else appends a copy of `polygon[0]`. Invariant: output's first and last points are equal.
- `polygonIsClosed<Point>(polygon: Point[])` — L97-L101 (internal). Returns `pointsEqual(polygon[0], polygon[last])` (epsilon equality imported from `./point`).

Performance/parity note: `polygonIncludesPoint` (even-odd) and `polygonIncludesPointNonZero` (winding) can disagree on self-intersecting/overlapping geometry; a reimplementation must pick the same one per call site. Even-odd uses exact float comparisons (no epsilon); winding likewise.

### packages/math/src/range.ts

Inclusive numeric range (`[start, end]` branded tuple) construction and set operations. Pure scalar math, no points.

- `rangeInclusive(start: number, end: number): InclusiveRange` — L12-L14. Wraps `[start, end]` via `toBrandedType` (from `@excalidraw/common`). No validation that start <= end.
- `rangeInclusiveFromPair(pair: [start, end]): InclusiveRange` — L22-L24. Brand-casts an existing pair.
- `rangesOverlap([a0,a1],[b0,b1]): boolean` — L34-L47. Inclusive overlap test. If `a0 <= b0` overlap iff `a1 >= b0`; if `a0 >= b0` overlap iff `b1 >= a0`; final `return false` is unreachable in practice (the two branches together cover all cases including `a0 === b0`). Treats endpoints as inclusive ([1,3] vs [3,5] overlaps at 3).
- `rangeIntersection([a0,a1],[b0,b1]): InclusiveRange | null` — L57-L69. Computes `[max(a0,b0), min(a1,b1)]`; returns it if `rangeStart <= rangeEnd`, else `null`. Output is brand-cast.
- `rangeIncludesValue(value, [min,max]): boolean` — L78-L83. `value >= min && value <= max` (inclusive both ends).

### packages/math/src/rectangle.ts

Axis-aligned rectangle primitive represented as two corner points `[topLeft, bottomRight]`, plus rectangle/segment and rectangle/rectangle intersection.

- `rectangle<P>(topLeft: P, bottomRight: P): Rectangle<P>` — L6-L11. Brand-casts the two-corner tuple. No normalization (assumes topLeft <= bottomRight component-wise).
- `rectangleFromNumberSequence<Point>(minX, minY, maxX, maxY): Rectangle<Point>` — L13-L17. Builds corners via `pointFrom` and forwards to `rectangle`.
- `rectangleIntersectLineSegment<Point>(r, l): Point[]` — L19-L30. Derives the 4 edges of the rectangle from its two corners (top, right, bottom, left — built explicitly with `pointFrom(r[1][0], r[0][1])` etc.), computes `lineSegmentIntersectionPoints(l, edge)` for each, and filters out nulls. Returns 0-4 intersection points. Coordinate detail: assumes axis-aligned rect; edges are reconstructed from the two stored corners.
- `rectangleIntersectRectangle<Point>(rectangle1, rectangle2): boolean` — L32-L39. Standard AABB overlap: `minX1 < maxX2 && maxX1 > minX2 && minY1 < maxY2 && maxY1 > minY2`. Strict inequalities, so edge-touching rectangles do NOT count as intersecting (open-boundary semantics — differs from `rangesOverlap`'s inclusive semantics).

### packages/math/src/segment.ts

Finite line-segment primitive and its geometry: construction, type guard, rotation, segment/segment and line/segment intersection, point-to-segment distance, and segment-to-segment distance. Imports vector ops and the infinite-line intersection from `./line`.

- `lineSegment<P>(a: P, b: P): LineSegment<P>` — L25-L30. Brand-casts `[a, b]`.
- `isLineSegment<Point>(segment: unknown): segment is LineSegment<Point>` — L37-L43. Runtime type guard: array of length 2 whose both elements pass `isPoint`.
- `lineSegmentRotate<Point>(l, angle: Radians, origin?): LineSegment<Point>` — L54-L63. Rotates both endpoints by `angle` (radians) about `origin`, defaulting to the segment's midpoint (`pointCenter`). Note: computes `pointCenter(l[0],l[1])` twice when origin is omitted (minor redundancy).
- `segmentsIntersectAt<Point>(a, b): Point | null` — L69-L100. Finite segment×segment intersection via the parametric cross-product method. Builds vectors `r = a1-a0`, `s = b1-b0`; `denominator = cross(r,s)`; returns null if parallel (denominator 0). Then `i = b0-a0`, `u = cross(i,r)/denominator`, `t = cross(i,s)/denominator`. Returns null if `u === 0` (a special-case rejection). Intersection point `p = a0 + r*t` returned only when `t in [0,1)` and `u in [0,1)` (half-open intervals — endpoint at parameter 1 excluded). NON-OBVIOUS PARITY DETAIL: the half-open `< 1` bounds and the `u === 0` rejection mean shared-endpoint and certain collinear-touch cases return null; a reimplementation must replicate these exact bounds.
- `pointOnLineSegment<Point>(point, line, threshold = PRECISION): boolean` — L102-L114. Returns true if `distanceToLineSegment` is exactly 0, else `distance < threshold`.
- `distanceToLineSegment<Point>(point, line): number` — L116-L152. Euclidean distance from a point to the closest point on a finite segment. Projects via `param = dot/len_sq` (dot of point-offset onto segment direction). Clamps the projection: `param<0` -> first endpoint, `param>1` -> second endpoint, else the interior projection `(x1+param*C, y1+param*D)`. Guards `len_sq !== 0` (degenerate zero-length segment yields distance to its single endpoint). Returns `sqrt(dx^2+dy^2)`.
- `lineSegmentIntersectionPoints<Point>(l, s, threshold?): Point | null` — L161-L179. Computes the intersection of the two INFINITE lines through the segments via `linesIntersectAt`, then accepts the candidate only if it lies on BOTH finite segments (`pointOnLineSegment` against `s` and `l` with optional `threshold`). Used by rectangle intersection above. Threshold-based (epsilon-tolerant) unlike `segmentsIntersectAt` (exact parametric).
- `lineSegmentsDistance<Point>(s1, s2): number` — L181-L195. Minimum distance between two segments: 0 if they intersect (`lineSegmentIntersectionPoints`), otherwise the min of the four endpoint-to-opposite-segment distances. Correct for non-parallel non-intersecting segments since the closest pair always involves an endpoint.

Note: there are TWO distinct segment-intersection routines with different semantics — `segmentsIntersectAt` (exact, half-open, rejects `u===0`) and `lineSegmentIntersectionPoints` (line-intersect then threshold-test membership). Parity work must map each call site to the correct one.

### packages/math/src/triangle.ts

Single-function module: point-in-triangle test.

- `triangleIncludesPoint<P>([a,b,c]: Triangle<P>, p: P): boolean` — L14-L28. Barycentric/half-plane sign test. Inner helper `triangleSign(p1,p2,p3) = (p1[0]-p3[0])*(p2[1]-p3[1]) - (p2[0]-p3[0])*(p1[1]-p3[1])` is the 2D cross product / signed area. Computes signs `d1,d2,d3` of the point against each edge; the point is inside iff all signs agree (`!(has_neg && has_pos)`). Documented behavior: returns FALSE for points exactly on the edges? — NOTE the doc comment claims edge points return FALSE, but with `d===0` neither `has_neg` nor `has_pos` is set for that edge, so an exactly-on-edge point actually returns TRUE in this implementation (the comment is misleading; flag for parity). Winding-order independent.

### packages/math/src/types.ts

Types-only module (no runtime code). Defines all branded geometric types used across `@excalidraw/math`. Branding (`& { _brand: ... }`) enforces nominal typing on structurally-identical tuples.

- `Radians` (L9) — `number` branded `excalimath__radian`.
- `Degrees` (L15) — `number` branded `excalimath_degree`.
- `InclusiveRange` (L24) — `[number, number]` branded `excalimath_degree` (note: shares the degree brand string — likely a copy-paste, but functionally just a brand).
- `GlobalPoint` (L34-L36) — `[x, y]` branded `excalimath__globalpoint` (world/canvas/scene space).
- `GlobalCoord` (L44-L46) — `{x,y}` object form, branded; marked TODO for removal.
- `LocalPoint` (L52-L54) — `[x, y]` branded `excalimath__localpoint` (local space).
- `LocalCoord` (L62-L64) — `{x,y}` object form, branded; marked TODO for removal.
- `Line<P>` (L71-L73) — `[p, q]` infinite line, branded `excalimath_line`.
- `LineSegment<P>` (L80-L82) — `[a, b]` finite segment, branded `excalimath_linesegment`.
- `Vector` (L91-L93) — `[u, v]` branded `excalimath__vector`.
- `Triangle<P>` (L100-L106) — `[a, b, c]` branded `excalimath__triangle`.
- `Rectangle<P>` (L111-L113) — `[a, b]` (two corners) branded `excalimath__rectangle`.
- `Polygon<Point>` (L123-L125) — `Point[]` branded `excalimath_polygon`; comment notes rectangles and diamonds are modelled as polygons.
- `Curve<Point>` (L134-L141) — 4-point tuple (cubic Bezier control points) branded `excalimath_curve`.
- `PolarCoords` (L143-L147) — `[radius, angle]` (angle in radians), unbranded.
- `Ellipse<Point>` (L154-L160) — `{center, halfWidth, halfHeight}` (uses half-extents instead of semi-axes) branded `excalimath_ellipse`.
- `ElementsSegmentsMap` (L162) — `Map<string, LineSegment<GlobalPoint>[]>`.

### packages/math/src/utils.ts

Scalar math utilities and the global precision constant. No points/geometry.

- `PRECISION` (L1) — `const = 10e-5` (i.e. 1e-4). The shared epsilon used by segment/polygon containment defaults across the package.
- `clamp(value, min, max): number` — L3-L5. `Math.min(Math.max(value, min), max)`.
- `round(value, precision, func = "round"): number` — L7-L15. Rounds `value` to `precision` decimal places using `Math[func]` (round/floor/ceil). Adds `Number.EPSILON` before multiplying by `10^precision` to counter binary float representation error, then divides back. Side effect: none.
- `roundToStep(value, step, func = "round"): number` — L17-L24. Snaps `value` to the nearest multiple of `step` via `factor = 1/step`, `Math[func](value*factor)/factor`. Used for grid/step snapping.
- `average(a, b): number` — L26. `(a + b) / 2`.
- `isFiniteNumber(value: any): value is number` — L28-L30. Type guard: `typeof === "number" && Number.isFinite`.
- `isCloseTo(a, b, precision = PRECISION): boolean` — L32-L33. `Math.abs(a - b) < precision`. Strict `<` (exactly-at-precision is not "close").
