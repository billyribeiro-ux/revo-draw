## Cluster: math__src__0

This cluster covers the lower-level geometry primitives of the `@excalidraw/math` package: angle/radian utilities, Legendre-Gauss quadrature constants, cubic/quadratic Bezier curve math, ellipse intersection/distance math, line intersection, the public barrel export, and the `Point` primitive. All functions are generic over `GlobalPoint | LocalPoint` (branded `[number, number]` tuples) so the same math works in both coordinate spaces; the branding is purely a type-level distinction with no runtime cost.

---

### packages/math/src/angle.ts

Radian/degree conversion and angle-range/normalization helpers operating on branded `Radians`/`Degrees` numbers.

- `normalizeRadians(angle: Radians): Radians` — L11-L14. Maps any radian value into the half-open range `[0, 2π)`. Uses a branch: negative angles get `((angle % 2π) + 2π)` to fold them positive; non-negative just `angle % 2π`. Pure; cast result back to branded `Radians`. Invariant: output is always in `[0, 2π)`.
- `cartesian2Polar([x, y]: P): PolarCoords` — L21-L27. Converts a cartesian point (relative to origin 0,0) into polar `[radius, angle]`. Radius is `Math.hypot(x, y)`; angle is `normalizeRadians(Math.atan2(y, x))`. Note: `atan2(y, x)` (y first) and the angle is normalized to `[0, 2π)`. Generic over `GlobalPoint | LocalPoint`.
- `degreesToRadians(degrees: Degrees): Radians` — L29-L31. `degrees * π / 180`, cast to `Radians`. Pure.
- `radiansToDegrees(degrees: Radians): Degrees` — L33-L35. `radians * 180 / π`, cast to `Degrees`. Note the parameter is misnamed `degrees` but is actually radians; behavior is correct (radians→degrees).
- `isRightAngleRads(rads: Radians): boolean` — L43-L45. True when angle is a multiple of 90° (right angle). Tests `Math.abs(Math.sin(2 * rads)) < PRECISION` — `sin(2θ)` is zero at θ = 0, 90, 180, 270°. `PRECISION` imported from `./utils`.
- `radiansBetweenAngles(a, min, max): boolean` — L47-L62. Tests whether angle `a` falls within the arc from `min` to `max`. All three are normalized first. If `min < max` it is a simple `a >= min && a <= max`; otherwise the range wraps past 0, so it returns `a >= min || a <= max`. Handles wrap-around arcs correctly.
- `radiansDifference(a, b): Radians` — L64-L77. Smallest absolute angular difference between two angles. Normalizes both, computes `a - b`, then folds the difference into `[-π, π]` by adding/subtracting `2π`, returns `Math.abs(diff)`. Output range `[0, π]`.

---

### packages/math/src/constants.ts

Types-free constant module: the 24-point Legendre-Gauss quadrature abscissae and weights used for numeric Bezier arc-length integration.

- `LegendreGaussN24TValues` — L3-L28. Array of 24 abscissae (the `t` sample positions in `[-1, 1]`) for n=24 Gaussian quadrature. Listed in ± pairs. Consumed by `curve.ts` arc-length functions.
- `LegendreGaussN24CValues` — L30-L55. Array of 24 weights `c_i` paired index-for-index with the abscissae. Reference cited in comments: https://pomax.github.io/bezierinfo/legendre-gauss.html.

No functions; pure data. Precision detail: values carry ~40 significant digits as source literals (JS truncates to f64).

---

### packages/math/src/curve.ts

Cubic Bezier curve constructor plus the package's curve math: line-segment intersection (Newton's method), closest-point search, tangents, Catmull-Rom approximations, offsetting, and Gauss-quadrature arc length. Imports from `./point`, `./vector`, `./constants`.

- `curve(a, b, c, d): Curve<Point>` — L15-L22. Constructor: packs 4 control points into a `[a,b,c,d]` tuple cast to `Curve<Point>` (P0 start, P1/P2 control, P3 end). Pure.
- `solveWithAnalyticalJacobian(curve, lineSegment, t0, s0, tolerance=1e-3, iterLimit=10): number[] | null` — L24-L113. Internal. Newton-Raphson root finder for the 2D system "cubic Bezier point at param `t` = line point at param `s`". Each iteration computes the Bezier point via the Bernstein form (L47-L56), the line point by linear interpolation (L59-L62), residuals `fx,fy`, the `error = |fx|+|fy|` (L1-norm), analytical derivatives `dfx_dt/dfy_dt` (the cubic's velocity, L75-L89) and line derivatives (L92-L93), then the 2x2 Jacobian determinant (L96). Returns `null` if the determinant is near-singular (`< 1e-12`, L98) or if the iteration limit is hit. Newton step updates `t0,s0` (L102-L109). Returns `[t, s]`. Side-effect-free except local mutation.
- `bezierEquation(c: Curve<Point>, t: number): Point` — L115-L128. Evaluates the cubic Bezier at parameter `t` using the explicit Bernstein polynomial `(1-t)³P0 + 3(1-t)²t·P1 + 3(1-t)t²·P2 + t³·P3` for both coordinates. Returns a `Point`. Core sampling primitive used throughout.
- `initial_guesses` — L130-L134. Internal seed list `[[0.5,0],[0.2,0],[0.8,0]]` of `[t0,s0]` starting points for the intersection solver (s0 always 0).
- `calculate([t0,s0], l, c, tolerance=1e-2, iterLimit=4): Point | null` — L136-L163. Internal. Runs `solveWithAnalyticalJacobian` from one seed; rejects the solution if either parameter falls outside `[0,1]` (L158, i.e. the intersection lies off either the curve or the segment); otherwise returns `bezierEquation(c, t)`. Note the looser default tolerance (1e-2) and lower iter limit (4) than the raw solver.
- `curveIntersectLineSegment(c, l, opts?): Point[]` — L168-L212. Public. Tries each of the three `initial_guesses` in order, returning a single-element array on the first success, else `[]`. Returns at most one intersection point (does not exhaustively find all roots — a parity caveat: a line can cross a cubic up to 3 times but this only returns the first found).
- `curveClosestPoint(c, p, tolerance=1e-3): Point | null` — L227-L275. Public. Finds the closest point on the curve to `p`. Two-stage: (1) coarse sweep over `maxSteps=30` samples (L256-L262) to bracket the nearest `t`; (2) golden-ish bisection `localMinimum` over `[t0,t1]` around that step minimizing `pointDistance` (L232-L252, L266-L268). `localMinimum` ternary-narrows by comparing `f(k-e)` vs `f(k+e)`. Returns the Bezier point at the found parameter.
- `curvePointDistance(c, p): number` — L284-L295. Public. Returns `pointDistance(p, curveClosestPoint(c, p))`, or `0` if no closest point found.
- `isCurve(v): v is Curve<P>` — L300-L311. Type guard: array of length 4 where every element passes `isPoint`.
- `curveTangent([p0,p1,p2,p3], t): Vector` — L313-L331. Returns the (unnormalized) derivative vector of the cubic at `t` — i.e. the velocity `B'(t)`. Hand-expanded derivative of the Bernstein form for both axes. Used by arc-length and offsetting.
- `curveCatmullRomQuadraticApproxPoints(points: GlobalPoint[], tension=0.5)` — L333-L356. Converts a polyline into quadratic-Bezier control/segment pairs via Catmull-Rom. For each segment uses neighbors `p0`(prev, clamped),`p1`,`p2`(next, clamped), computes one control point offset by `(p2-p0)*tension/2`, pushes `[controlPoint, p2]`. Returns `undefined` if `< 2` points. GlobalPoint-only.
- `curveCatmullRomCubicApproxPoints(points: Point[], tension=0.5): Curve<Point>[] | undefined` — L358-L389. Generic cubic version. Per segment uses 4 neighbors (`p0..p3`, ends clamped), computes two tangents scaled by `tension`, derives `cp1 = p1 + tangent1/3` and `cp2 = p2 - tangent2/3`, emits a full `Curve` `[p1, cp1, cp2, p2]`. This is the standard Catmull-Rom→Bezier conversion (tangent/3 = the 1/3 control-point spacing). Returns `undefined` for `< 2` points.
- `curveOffsetPoints([p0,p1,p2,p3], offset, steps=50): GlobalPoint[]` — L391-L409. Samples the cubic at `steps+1` parameters, at each computing the normalized tangent (`vectorNormalize(curveTangent)`), its normal (`vectorNormal`), and offsetting the sampled point along the scaled normal. Produces a parallel/offset curve polyline. Used for variable-width / outline rendering.
- `offsetPointsForQuadraticBezier(p0, p1, p2, offsetDist, steps=50): GlobalPoint[]` — L411-L436. Same offsetting idea but for a quadratic Bezier: samples `(1-t)²P0 + 2(1-t)t·P1 + t²P2`, computes the quadratic tangent `2(1-t)(P1-P0) + 2t(P2-P1)`, normal, and offsets.
- `curveLength(c): number` — L447-L464. Approximates total arc length via 24-point Legendre-Gauss quadrature integrating `|B'(t)|` over `[0,1]`. Maps each abscissa with `t = 0.5·x_i + 0.5` (shift `[-1,1]`→`[0,1]`), sums `c_i · |curveTangent(t)|`, scales by `z2 = 0.5`. High accuracy for smooth cubics. Performance: 24 tangent evaluations, no sampling loop.
- `curveLengthAtParameter(c, t): number` — L474-L503. Partial arc length from 0 to `t`. Short-circuits `t<=0 → 0`, `t>=1 → curveLength(c)`. Otherwise rescales the quadrature interval to `[0,t]` using `z1=z2=t/2`, abscissa map `parameter = z1·x_i + z2`, scales result by `z1`.
- `curvePointAtLength(c, percent): P` — L513-L556. Returns the point at a given fraction of total arc length. Clamps `percent<=0`/`>=1` to endpoints. Computes `targetLength = totalLength·percent`, then binary-searches `t` in `[0,1]` (seed `t=percent`), comparing `curveLengthAtParameter(c,t)` to target, with `tolerance = totalLength·0.0001` and `maxIterations=20`. This is the arc-length-parametrization helper (constant-speed sampling). Performance note: each iteration calls `curveLengthAtParameter` (24-point quadrature), so up to ~20×24 tangent evals.

---

### packages/math/src/ellipse.ts

Ellipse primitive plus point-containment, point-on-outline test, nearest-distance, and line/segment intersection. Imports from `./point`, `./vector`, `./utils`. Ellipses here are axis-aligned (no rotation field — the constructor doc mentions a slant angle but the type/impl only store center + halfWidth + halfHeight).

- `ellipse(center, halfWidth, halfHeight): Ellipse<Point>` — L33-L43. Constructor returning `{ center, halfWidth, halfHeight }`. Note: despite the doc comment mentioning an `angle` parameter, no angle is accepted or stored — axis-aligned only.
- `ellipseIncludesPoint(p, ellipse): boolean` — L52-L61. Inside-or-on test. Normalizes `(p - center)` by the half-axes and returns `nx² + ny² <= 1` (standard ellipse implicit equation). Coordinate space: same as the ellipse's center.
- `ellipseTouchesPoint(point, ellipse, threshold=PRECISION): boolean` — L72-L78. True when `ellipseDistanceFromPoint <= threshold` — i.e. point lies on the outline within tolerance.
- `ellipseDistanceFromPoint(p, ellipse): number` — L88-L137. Shortest Euclidean distance from a point to the ellipse outline. Iterative numeric method (3 fixed iterations) approximating the nearest outline point: works in the first quadrant on `|px|,|py|` (uses symmetry), starts the parameter at `(0.707, 0.707)` (≈45°), and on each iteration uses the evolute (`ex,ey`) and the ratio of distances `r/q` to refine the parametric `(tx, ty)`, re-normalizing to keep it on the unit circle. Reflects the result back into the original quadrant via `Math.sign` (L131-L134) and returns the distance. Non-obvious: this is the well-known "Eberly" iterative point-on-ellipse method; 3 iterations is a fixed accuracy/speed tradeoff.
- `ellipseSegmentInterceptPoints(e, s): Point[]` — L143-L195. Intersections of a line **segment** with the ellipse. Builds the quadratic in `t` from the segment direction `dir` and offset `diff` (each scaled by `1/(rx²)` and `1/(ry²)`), with `a = dir·mDir`, `b = dir·mDiff`, `c = diff·mDiff - 1`, discriminant `d = b² - ac`. If `d>0` returns the 0,1, or 2 roots `t_a,t_b` that fall in `[0,1]` (clamped to the segment); if `d===0` the single tangent root. Returns up to 2 points. Note: scaling uses `rx*rx`/`ry*ry` for both `dir` and `diff` (the `mDir`/`mDiff` quadratic-form vectors).
- `ellipseLineIntersectionPoints({center, halfWidth, halfHeight}, [g, h]): Point[]` — L197-L231. Intersections of an infinite **line** (through g,h) with the ellipse. Translates to ellipse-centered coords, forms the quadratic `a t² + b t + c = 0` from the line param and ellipse half-axes, solves both roots `t1,t2`, maps back to two candidate points, filters out `NaN` (no-intersection) results. If both candidates coincide (`pointsEqual`) returns a single tangent point. Coordinate detail: unlike the segment version, `t` is **not** clamped to `[0,1]` — the line is infinite.

---

### packages/math/src/index.ts

Pure barrel re-export; no logic. Re-exports everything from: `./angle`, `./curve`, `./ellipse`, `./line`, `./point`, `./polygon`, `./range`, `./rectangle`, `./segment`, `./triangle`, `./types`, `./vector`, `./utils` (L1-L13).

---

### packages/math/src/line.ts

Infinite-line constructor and line-line intersection. Imports `pointFrom` from `./point`.

- `line(a: P, b: P): Line<P>` — L11-L13. Constructor: packs two points into a `[a, b]` tuple cast to `Line<P>` (interpreted as an infinite line through both).
- `linesIntersectAt(a: Line, b: Line): Point | null` — L23-L39. Intersection of two infinite lines via the standard line-equation/Cramer's-rule form. Builds each line's `Ax + By = C` coefficients (`A = y2-y1`, `B = x1-x2`, `C = A·x1 + B·y1`), computes `D = A1·B2 - A2·B1`. If `D !== 0` returns the unique intersection `((C1·B2 - C2·B1)/D, (A1·C2 - A2·C1)/D)`; if `D === 0` (parallel/collinear) returns `null`. Pure.

---

### packages/math/src/point.ts

The `Point` primitive: constructors/converters, equality, rotation, translation, distance, scaling, and bounds checks. The most foundational module of the package. Imports from `./angle`, `./utils`, `./vector`.

- `pointFrom(x, y): Point` (plus 2 overloads) — L22-L42. Overloaded factory: accepts either `(x, y)` numbers, a `{x, y}` object, or a coord, returning a branded `[x, y]` tuple. Runtime impl checks `typeof xOrCoords === "object"` to choose object-destructure vs number form. The object/coord overloads are marked for future removal (TODO comments, L26/L30).
- `pointFromArray(numberArray: number[]): Point | undefined` — L50-L56. Returns a Point only if the array has exactly length 2, else `undefined`. Safe converter from loose number arrays.
- `pointFromPair(pair: [number, number]): Point` — L64-L68. Reinterprets an exact 2-tuple as a Point (cast only, no copy/validation).
- `pointFromVector(v: Vector, offset = pointFrom(0,0)): P` — L76-L81. Adds a vector to an origin point (default origin 0,0), returning the resulting point. The bridge between Vector and Point spaces.
- `isPoint(p: unknown): p is LocalPoint | GlobalPoint` — L89-L98. Type guard: array of length 2 with both elements `number` and not `NaN`. Note: explicitly rejects NaN (unlike `isValidPoint` which uses `isFiniteNumber`).
- `pointsEqual(a, b, tolerance=PRECISION): boolean` — L108-L115. Coordinate-wise approximate equality: both `|a-b| < tolerance`. Used as the canonical "same point" check across the geometry code.
- `pointRotateRads(point, center, angle: Radians): Point` — L125-L139. Rotates `point` around `center` by `angle` radians using the standard 2D rotation matrix applied to `(point - center)` then re-adding `center`. Early-returns the input unchanged when `angle` is falsy (0). This is THE rotation primitive for element transforms; parity-critical (matrix order: `x' = dx·cos - dy·sin + cx`, `y' = dx·sin + dy·cos + cy`).
- `pointRotateDegs(point, center, angle: Degrees): Point` — L149-L155. Degree wrapper that converts via `degreesToRadians` and delegates to `pointRotateRads`.
- `pointTranslate(p, v = [0,0]): To` — L170-L175. Adds a vector to a point. WARNING in source (L160-L163): this is NOT element-aware — callers must handle element rotation themselves. Generic over differing From/To brands (used for global↔local coordinate transfer).
- `pointCenter(a, b): P` — L184-L186. Midpoint `((a+b)/2)` of two points.
- `pointDistance(a, b): number` — L195-L200. Euclidean distance via `Math.hypot(dx, dy)`.
- `pointDistanceSq(a, b): number` — L211-L219. Squared distance `dx² + dy²` (avoids the sqrt; for comparisons only). Performance helper.
- `pointScaleFromOrigin(p, mid, multiplier)` — L229-L233. Scales `p` away from/toward origin `mid` by `multiplier`: `pointTranslate(mid, vectorScale(vectorFromPoint(p, mid), multiplier))`. Used for resize/zoom transforms.
- `isPointWithinBounds(p, q, r): boolean` — L244-L255. True if `q` lies within the axis-aligned bounding box defined by `p` and `r` (min/max on each axis). Documented as an approximation to "q on segment pr".
- `isValidPoint(point: unknown): point is LocalPoint` — L257-L264. Stricter guard: array length 2 with both elements passing `isFiniteNumber` (rejects NaN AND Infinity, unlike `isPoint`).

---

### Cross-file parity notes

- Branded types (`GlobalPoint`, `LocalPoint`, `Radians`, `Degrees`, `PolarCoords`, `Vector`, `Curve`, `Line`, `LineSegment`, `Ellipse`) are zero-cost type-level brands over plain tuples/numbers/objects; a Svelte/Canvas reimplementation can drop the brands and use raw `[number, number]`/`number` without behavioral change.
- `PRECISION` (from `./utils`, not in this cluster) is the universal tolerance used by `pointsEqual`, `isRightAngleRads`, `ellipseTouchesPoint`.
- Rotation convention (`point.ts` L136-L137) is standard mathematical CCW for positive radians in a y-down screen space (so visually CW). Match exactly for transform parity.
- `curveIntersectLineSegment` returns at most ONE intersection — a known approximation, important if a reimplementation needs all crossings.
- Arc-length functions rely on the n=24 Legendre-Gauss tables in `constants.ts`; reproduce those exact constants for length parity.
