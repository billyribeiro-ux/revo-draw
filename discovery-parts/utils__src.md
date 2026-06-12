## Cluster: utils__src

Forensic source inventory of `packages/utils/src/*` — the public `@excalidraw/utils` package. This package re-exports a small public surface (export helpers, geometry/bbox helpers, shape conversion) on top of the internal `@excalidraw/element`, `@excalidraw/math`, and `@excalidraw/excalidraw` packages. Coordinate spaces below: `LocalPoint` = element-relative (top-left = `[0,0]`); `GlobalPoint` = world/scene coordinates; `Bounds` = `[minX, minY, maxX, maxY]` tuple.

---

### packages/utils/src/bbox.ts

Pure 2D line-segment / bounding-box intersection primitives used for collision-style geometry, generic over `LocalPoint | GlobalPoint`.

- **`type LineSegment<P extends LocalPoint | GlobalPoint> = [P, P]`** (L10) — a segment is an ordered pair of endpoints. NOTE: this is a *local* type alias and shadows `@excalidraw/math`'s `LineSegment`; `shape.ts` and `withinBounds.ts` import the math one, so do not conflate them.

- **`getBBox<P>(line: LineSegment<P>): Bounds`** (L12-L21) — Returns the axis-aligned bounding box of a single segment as `[min x, min y, max x, max y]` via `Math.min`/`Math.max` over the two endpoints. Pure, no side effects.

- **`doBBoxesIntersect(a: Bounds, b: Bounds)` → boolean** (L23-L25) — Standard AABB overlap test: `a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY`. Overlap is inclusive (touching edges count as intersecting). Pure.

- **`const EPSILON = 0.000001`** (L27) — tolerance for the collinearity test below.

- **`isPointOnLine<P>(l: LineSegment<P>, p: P)` → boolean** (L29-L39) — Tests if `p` is collinear with the infinite line through `l`. Builds two vectors from `l[0]` (`p1 = l[1]-l[0]`, `p2 = p-l[0]`) via `vectorFromPoint`, takes their 2D cross product (`vectorCross`); collinear when `|cross| < EPSILON`. Math note: this tests the *infinite line*, not segment containment.

- **`isPointRightOfLine<P>(l: LineSegment<P>, p: P)` → boolean** (L41-L49) — Sign-of-cross-product half-plane test: true when `vectorCross(l[1]-l[0], p-l[0]) < 0`. Determines which side of the directed line `p` lies on.

- **`isLineSegmentTouchingOrCrossingLine<P>(a, b)` → boolean** (L51-L61) — True if either endpoint of `b` lies on line `a`, or the two endpoints of `b` fall on opposite sides of `a` (XOR of `isPointRightOfLine` for `b[0]`/`b[1]`). Half of the segment-intersection test.

- **`doLineSegmentsIntersect<P>(a, b)` → boolean** (L64-L73) — Full segment-segment intersection (algorithm credited in comment L63 to martin-thoma.com). Three-stage short-circuit: bounding boxes overlap AND `a` touches/crosses line `b` AND `b` touches/crosses line `a`. Handles collinear/touching cases via `isPointOnLine`. Pure.

---

### packages/utils/src/export.ts

Public top-level export API of `@excalidraw/utils` — wraps the internal scene exporters with restore (sanitize/normalize) of elements + app state, and handles canvas/blob/SVG/clipboard targets.

- **Re-export `{ MIME_TYPES }`** (L26) — re-exposes the common MIME-type constants to consumers.

- **`type ExportOpts`** (L28-L38) — shared option bag: `elements: readonly NonDeleted<ExcalidrawElement>[]`, optional `appState` (partial `AppState` minus `offsetTop`/`offsetLeft`), `files: BinaryFiles | null`, optional `maxWidthOrHeight`, optional `exportingFrame`, optional `getDimensions(width,height) => {width,height,scale?}` callback.

- **`exportToCanvas(opts: ExportOpts & { exportPadding? })` → Promise\<HTMLCanvasElement\>** (L40-L100) — Restores elements (`restoreElements(..., { deleteInvisibleElements: true })`) and app state (`restoreAppState`), then delegates to internal `_exportToCanvas`, forcing `offsetTop/offsetLeft/width/height = 0`. The 4th argument is a sizing callback that creates a fresh `<canvas>` via `document.createElement` (DOM side effect; browser-only). Sizing math (L65-L98):
  - If `maxWidthOrHeight` is set, it warns if `getDimensions` was also supplied (mutually exclusive), then computes `max = Math.max(width,height)` and `scale = maxWidthOrHeight < max ? maxWidthOrHeight/max : (appState?.exportScale ?? 1)` — i.e. it only *shrinks* to fit; smaller content keeps the supplied export scale. Canvas dims = `width*scale`/`height*scale`.
  - Otherwise uses `getDimensions?.(...)` result (default `{width,height}`, `scale ?? 1`).

- **`exportToBlob(opts: ExportOpts & { mimeType?; quality?; exportPadding? })` → Promise\<Blob\>** (L102-L164) — Renders via `exportToCanvas`, then `canvas.toBlob`. Behaviors/invariants:
  - Warns and ignores `quality` for PNG (L111-L113).
  - Normalizes the common typo `"image/jpg"` → `MIME_TYPES.jpg` (L116-L118).
  - For JPEG with no `exportBackground`, warns and forces `exportBackground: true` (transparent JPEG would be black) by cloning opts (L120-L128).
  - Default `quality`: `0.92` for jpe?g, else `0.8` (L132).
  - If PNG and `appState.exportEmbedScene`, embeds the serialized scene JSON into PNG metadata via `encodePngMetadata`/`serializeAsJSON`. Comment (L149-L151) flags a load-bearing invariant: pass the *original uncloned* `opts.elements` to serialization so element ids stay stable. Rejects with `Error("couldn't export to blob")` if `toBlob` yields null. Async, DOM side effect.

- **`exportToSvg(opts: Omit<ExportOpts,"getDimensions"> & { exportPadding?; renderEmbeddables?; skipInliningFonts?: true; reuseImages? })` → Promise\<SVGSVGElement\>** (L166-L197) — Defaults `appState` to `getDefaultAppState()`, `files` to `{}`. Restores elements (deleting invisibles) + app state, merges in `exportPadding`, and delegates to internal `_exportToSvg` passing through `exportingFrame`/`renderEmbeddables`/`skipInliningFonts`/`reuseImages`. Async.

- **`exportToClipboard(opts: ExportOpts & { mimeType?; quality?; type: "png"|"svg"|"json" })` → Promise\<void\>** (L199-L216) — Dispatches by `type`: `"svg"` → `exportToSvg` then `copyTextToSystemClipboard(svg.outerHTML)`; `"png"` → `copyBlobToClipboardAsPng(exportToBlob(opts))` (note: passes the *promise*, not awaited); `"json"` → `copyToClipboard(elements, files)`; else throws `Error("Invalid export type")`. Side effect: writes to the system clipboard.

---

### packages/utils/src/index.ts

Barrel/re-export entry point of the package — no logic of its own.

- `export * from "./export"` (L1), `export * from "./withinBounds"` (L2), `export * from "./bbox"` (L3), and `export { getCommonBounds } from "@excalidraw/element"` (L4). Pure re-export only; defines no functions.

---

### packages/utils/src/shape.ts

Converts Excalidraw elements (and roughjs `Drawable`s) into pure mathematical "geometric shapes" (lines/polygons/curves/ellipses) decoupled from roughjs/element specifics, plus ellipse distance/containment math and rectangle-segment intersection. All generic over `Point extends GlobalPoint | LocalPoint`. File header (L1-L13) documents the design intent.

Type definitions:
- **`type Polyline<Point>`** (L62-L63) — `LineSegment<Point>[]`, a chain of segments (models a straight-line element).
- **`type Polycurve<Point>`** (L67) — `Curve<Point>[]`, a chain of cubic bezier curves (models a complex curve).
- **`type Ellipse<Point>`** (L72-L77) — `{ center, angle: Radians, halfWidth, halfHeight }`. Comment notes halfWidth/halfHeight are used in place of semi-major/minor axes for Excalidraw relevance.
- **`type GeometricShape<Point>`** (L79-L103) — discriminated union over `type` ∈ `"line" | "polygon" | "curve" | "ellipse" | "polyline" | "polycurve"`, each with a matching `data` payload.
- **`type RectangularElement`** (L105-L113) — internal union of all rectangle-ish element types (rectangle, diamond, frame-like, embeddable, image, iframe, text, selection).

Functions:
- **`getPolygonShape<Point>(element: RectangularElement)` → GeometricShape\<Point\>** (L116-L148) — Builds a 4-vertex polygon. Computes center `(cx,cy) = (x+w/2, y+h/2)`. For `"diamond"`, vertices are the four edge-midpoints (top, right, bottom, left); otherwise the four corners (TL, TR, BR, BL). Each vertex is rotated about the center by `element.angle` via `pointRotateRads`. Coordinate space follows the element's `x,y` (world if element is world-positioned).

- **`getSelectionBoxShape<Point>(element, elementsMap, padding = 10)` → GeometricShape\<Point\>** (L151-L178) — Returns the (rotated) selection box polygon. Gets `[x1,y1,x2,y2,cx,cy]` from `getElementAbsoluteCoords(element, elementsMap, true)`, inflates by `padding` on each side, then rotates all four corners about `(cx,cy)` by `element.angle`. Returns `{type:"polygon", data:[topLeft,topRight,bottomRight,bottomLeft]}` (cast to GeometricShape).

- **`getEllipseShape<Point>(element: ExcalidrawEllipseElement)` → GeometricShape\<Point\>** (L181-L195) — Maps an ellipse element to an `Ellipse` shape: center `(x+w/2, y+h/2)`, `angle`, `halfWidth=w/2`, `halfHeight=h/2`.

- **`getCurvePathOps(shape: Drawable)` → Op[]** (L197-L209) — Extracts the roughjs drawing ops for the first `"path"` set in a `Drawable`. Defensive: returns `[]` if `shape` is null/undefined (comment L198 flags this as a temporary fix for extremely large elements). Falls back to `shape.sets[0].ops` if no path set found.

- **`getCurveShape<Point>(roughShape: Drawable, startingPoint = pointFrom(0,0), angleInRadian: Radians, center: Point)` → GeometricShape\<Point\>** (L212-L248) — Converts roughjs bezier ops into a `Polycurve`. Defines a local `transform(p)` that translates by `startingPoint` then rotates about `center` by `angleInRadian`. Walks ops: `"move"` sets `p0` (asserts the op data parses to a point via `invariant`); `"bcurveTo"` builds a cubic curve `curve(p0,p1,p2,p3)` from the three control points + previous `p0`, then advances `p0 = p3`. Returns `{type:"polycurve", data}`.

- **`polylineFromPoints<Point>(points: Point[])` → Polyline\<Point\>** (L250-L263, internal) — Builds a chain of `lineSegment`s between consecutive points (n points → n-1 segments).

- **`getFreedrawShape<Point>(element: ExcalidrawFreeDrawElement, center: Point, isClosed = false)` → GeometricShape\<Point\>** (L265-L294) — Transforms each freedraw point: add element `(x,y)` offset (via `vectorAdd`/`vectorFromPoint`/`vector`), wrap to a point (`pointFromVector`), then rotate about `center` by `element.angle`. If `isClosed`, returns a polygon built from the flattened polyline points (`polygonFromPoints(polyline.flat())`); else returns the polyline.

- **`getClosedCurveShape<Point>(element: ExcalidrawLinearElement, roughShape: Drawable, startingPoint = pointFrom(0,0), angleInRadian: Radians, center: Point)` → GeometricShape\<Point\>** (L296-L350) — Produces a polygon for a closed linear element. If `element.roundness === null`, builds the polygon directly from the (transformed) element points. Otherwise extracts curve ops and reconstructs control points using an `odd` toggle (L322-L340): each `"move"` flips `odd`, and only on odd passes does it collect points from `move`/`bcurveTo`/`lineTo` ops — this de-duplicates roughjs's double-stroke output. The collected control points are tessellated via `pointsOnBezierCurves(points, 10, 5)` (tolerance 10, distance 5), then transformed and wrapped in `polygonFromPoints`. Geometry-heavy; the `odd`/even filtering is the non-obvious bit.

- **`segmentIntersectRectangleElement<Point>(element: ExcalidrawBindableElement, segment: LineSegment<Point>, gap = 0)` → Point[]** (L362-L400) — Computes intersection points of a segment with a (rotated) rectangle inflated by `gap`. Builds the 4 rotated edges (corners rotated about the rect center by `element.angle`), runs `segmentsIntersectAt(segment, edge)` on each, filters out null results. Comment (L361) marks it as TODO pending rounded-rectangle support. Returns 0–2 intersection points typically.

- **`distanceToEllipse<Point>(p: Point, ellipse: Ellipse<Point>)` → number** (L402-L457, internal) — Shortest distance from point to ellipse boundary via an iterative Newton-style approximation (3 iterations, L425-L446). Translates `p` into ellipse-local space (subtract center, rotate by `-angle`), works in the first quadrant using `|x|,|y|`, seeds `tx=ty=0.707` (≈ cos/sin 45°), refines the parametric point each iteration using the evolute terms `ex/ey`, then computes the boundary point and returns `pointDistance` to it. Classic "distance to ellipse" algorithm; 3 iterations is a fixed accuracy/perf tradeoff.

- **`pointOnEllipse<Point>(point, ellipse, threshold = PRECISION)` → boolean** (L459-L465) — `distanceToEllipse(...) <= threshold`. Boundary-proximity test.

- **`pointInEllipse<Point>(p, ellipse)` → boolean** (L467-L487) — Containment test: translate to ellipse-local + rotate by `-angle`, then check the normalized ellipse inequality `(x/halfWidth)² + (y/halfHeight)² <= 1`.

- **`ellipseAxes<Point>(ellipse)` → { majorAxis, minorAxis }** (L489-L505) — Returns full-length axes (×2 of the larger/smaller half-dimension). majorAxis = 2× the greater of halfWidth/halfHeight.

- **`ellipseFocusToCenter<Point>(ellipse)` → number** (L507-L513) — Focal distance `sqrt(majorAxis² - minorAxis²)`. (Uses full axis lengths, not semi-axes — note for parity.)

- **`ellipseExtremes<Point>(ellipse)` → Vector-like[4]** (L515-L544) — Computes the extreme points (bounding tangent points) of a rotated ellipse using the closed-form `yMax`/`xMax` formulas with `sqSum`/`sqDiff` and trig of the angle (L524-L535), offset by the center vector. Returns four points; note L541-L542 returns the `(xMax, yAtXMax)` point twice (apparent duplication in source — preserved as-is, not invented).

---

### packages/utils/src/test-utils.ts

Vitest/Jest custom matcher registration for approximate point-array comparison; executed for its side effect (extends the global `expect`).

- **`expect.extend({ toCloselyEqualPoints(received, expected, precision) })`** (L3-L33) — Custom matcher. Throws if either arg isn't an array (L5-L7). Computes a tolerance `COMPARE`: if `1/precision === 0` (i.e. precision is `Infinity`) it uses `1`, otherwise `10^(precision ?? 2)` (L9) — NOTE this means larger `precision` yields a *larger* (looser) tolerance, which is the inverse of the usual decimal-places convention; flagged for parity awareness. Passes when every expected point is within `COMPARE` of the received point in both x and y (L10-L14). On failure produces a unified string diff via `diffStringsUnified` from `jest-diff` (L16-L26). No exported functions; module-level side effect only.

---

### packages/utils/src/withinBounds.ts

Computes rotated element bounding boxes and tests element/bbox containment & overlap; powers selection-by-region and "elements overlapping a frame/box" queries. Coordinate space is world (element `x,y` added back at the end).

- **`type Element`, `type Elements`, `type Points`** (L25-L28) — local aliases: `NonDeletedExcalidrawElement`, readonly array thereof, and `readonly LocalPoint[]`.

- **`getNonLinearElementRelativePoints(element)` → [TopLeft, TopRight, BottomRight, BottomLeft]** (L31-L56, internal) — Returns the 4 element-relative vertices (top-left origin `[0,0]`). For `"diamond"` returns edge-midpoints; otherwise the rectangle corners. Excludes linear/freedraw elements at the type level.

- **`getElementRelativePoints(element)` → Points** (L59-L64, internal) — For linear/freedraw elements returns `element.points` directly; otherwise delegates to `getNonLinearElementRelativePoints`.

- **`getMinMaxPoints(points)` → { minX, minY, maxX, maxY, cx, cy }** (L66-L91, internal) — Reduces points to min/max extents (seeded `±Infinity`), then computes center `cx=(maxX+minX)/2`, `cy=(maxY+minY)/2`. Pure.

- **`getRotatedBBox(element)` → Bounds** (L93-L110, internal) — Gets relative points, finds their center, rotates every point about that center by `element.angle` (`pointRotateRads`), takes min/max of the rotated set, then offsets by `element.x/element.y` to produce world-space `[minX,minY,maxX,maxY]`. Non-obvious: the bbox is the AABB of the *rotated* relative points, so rotation is applied before the world offset.

- **`isElementInsideBBox(element, bbox, eitherDirection = false)` → boolean** (L112-L139) — Tests whether the element's rotated bbox is fully inside `bbox` (`bbox` contains `elementBBox` on all four sides). If `eitherDirection`, also returns true when `bbox` is fully inside the element's bbox (containment in either direction). Pure.

- **`elementPartiallyOverlapsWithOrContainsBBox(element, bbox)` → boolean** (L141-L159) — Overlap test using `rangeIncludesValue`/`rangeInclusive` on both axes: true when the x-ranges overlap (either bbox's min lies within the other's range) AND the y-ranges overlap likewise. Detects partial overlap and containment. Pure.

- **`elementsOverlappingBBox({ elements, bounds, type, errorMargin = 0 })` → Element[]** (L161-L228) — Main query. If `bounds` is an element, converts it to `Bounds` via `getElementBounds(bounds, arrayToMap(elements))` (L178-L180). Inflates by `errorMargin` on all sides. For each element, applies the predicate selected by `type`: `"overlap"` → `elementPartiallyOverlapsWithOrContainsBBox`; `"inside"` → `isElementInsideBBox`; `"contain"` → `isElementInsideBBox(..., true)` (either direction). On a hit, adds the element id to a `Set`, and crucially **also pulls in related elements** (L205-L223): all `boundElements`, the `containerId` of bound text elements, and arrow `startBinding`/`endBinding` target element ids — so selecting an arrow/container also returns its bound partners. Returns `elements.filter(id ∈ set)`, preserving original order. Set dedup prevents reprocessing.

---

**Parity-relevant notes**
- `bbox.ts` defines its own `LineSegment` (`[P,P]`) distinct from `@excalidraw/math`'s segment type used elsewhere in the cluster.
- `getRotatedBBox` (withinBounds) applies rotation in element-relative space *then* adds the world `x,y` offset — order matters for matching.
- `exportToCanvas` only ever scales *down* under `maxWidthOrHeight`; smaller content keeps `exportScale`.
- `getClosedCurveShape`'s `odd`-toggle filter compensates for roughjs emitting doubled stroke ops.
- `ellipseFocusToCenter` uses full axis lengths (×2), not semi-axes.
- `toCloselyEqualPoints` tolerance is `10^precision` (larger precision = looser), inverse of the usual convention.
- `ellipseExtremes` returns the `(xMax, yAtXMax)` extreme point twice in its 4-element output (verbatim from source).
