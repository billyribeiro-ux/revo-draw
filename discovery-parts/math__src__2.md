## Cluster: math__src__2

### packages/math/src/vector.ts

A hand-rolled 2D vector math module operating on `Vector` values represented as tuples `[number, number]` (imported as a type from `./types`, alongside `GlobalPoint` and `LocalPoint`). All functions are pure (no side effects) and return freshly allocated tuples; there is no mutation in place. This is foundational geometry used throughout the element/collision/binding code, so exact numerical behavior matters for any parity reimplementation.

- `vector(x: number, y: number, originX: number = 0, originY: number = 0): Vector` — L10-L17. Constructs a vector as `[x - originX, y - originY]`, cast to `Vector`. The optional origin parameters let callers build a vector relative to an origin point in one call; with the defaults (0,0) it is just `[x, y]`. Pure; returns a new tuple. This is the primitive constructor that several other functions delegate to (`vectorScale`, `vectorNormalize`, `vectorNormal`).

- `vectorFromPoint<Point extends GlobalPoint | LocalPoint>(p: Point, origin: Point = [0, 0] as Point, threshold?: number, defaultValue: Vector = [0, 1] as Vector): Vector` — L28-L41. Turns a point into a displacement vector from `origin` by computing `vector(p[0] - origin[0], p[1] - origin[1])`. Note the subtraction is done twice in effect: it pre-subtracts the origin and then calls `vector()` with default (0,0) origin, so the result is `[p[0]-origin[0], p[1]-origin[1]]`. If a `threshold` is supplied and the vector's squared magnitude is below `threshold * threshold` (i.e. it is shorter than `threshold`), it returns `defaultValue` (default `[0, 1]`, a unit "down" vector) instead — used to treat near-zero-length vectors as a stable fallback direction. Generic over point type so it preserves Global vs Local coordinate-space typing. Invariant: comparison uses squared magnitude vs squared threshold to avoid a sqrt. Note `threshold` is truthy-checked, so a threshold of `0` is ignored.

- `vectorCross(a: Vector, b: Vector): number` — L51-L53. 2D cross product (z-component of the 3D cross / directed/signed area of the parallelogram): `a[0] * b[1] - b[0] * a[1]`. Sign indicates orientation (CW vs CCW) of `b` relative to `a`; zero means collinear. Pure scalar return.

- `vectorDot(a: Vector, b: Vector): number` (implicit return type) — L63-L65. Dot product `a[0]*b[0] + a[1]*b[1]`. Used for projection/angle/perpendicularity tests. Pure scalar return; return type is inferred (not written).

- `isVector(v: unknown): v is Vector` — L73-L82. Type guard: returns true only if `v` is an array of length 2 whose both elements are `number` and not `NaN`. Note: it does NOT reject `Infinity`/`-Infinity` (only `isNaN` checks), so infinite components pass the guard. Pure predicate, no side effects.

- `vectorAdd(a: Readonly<Vector>, b: Readonly<Vector>): Vector` — L91-L93. Component-wise addition `[a[0]+b[0], a[1]+b[1]]`. Accepts `Readonly<Vector>` inputs (does not mutate args), returns a new `Vector`.

- `vectorSubtract(start: Readonly<Vector>, end: Readonly<Vector>): Vector` — L102-L107. Component-wise subtraction `[start[0]-end[0], start[1]-end[1]]`. NOTE the parameter naming is counter-intuitive: it computes `start - end` (not `end - start`), and the doc-comment is a copy-paste leftover that incorrectly says "Add two vectors". Parity reimplementations should mirror the actual `start - end` math, not the comment. Accepts `Readonly<Vector>`, returns new tuple.

- `vectorScale(v: Vector, scalar: number): Vector` — L116-L118. Scales each component by `scalar` via `vector(v[0]*scalar, v[1]*scalar)`. Pure; returns new tuple.

- `vectorMagnitudeSq(v: Vector): number` (implicit return type) — L127-L129. Squared magnitude `v[0]*v[0] + v[1]*v[1]`. Performance note: provided specifically so magnitude comparisons can avoid an expensive `Math.sqrt`; used internally by `vectorFromPoint` (threshold check) and `vectorMagnitude`.

- `vectorMagnitude(v: Vector): number` (implicit return type) — L137-L139. Euclidean length `Math.sqrt(vectorMagnitudeSq(v))`. Pure scalar return.

- `vectorNormalize(v: Vector): Vector` (exported `const` arrow function) — L147-L155. Returns the unit vector in the direction of `v` by dividing each component by `vectorMagnitude(v)`. Guards against division by zero: if magnitude is exactly `0` it returns the zero vector `vector(0, 0)` (i.e. `[0,0]`) rather than producing `NaN`/`Infinity`. Pure; returns new tuple.

- `vectorNormal(v: Vector): Vector` (exported `const` arrow function) — L160. Right-hand normal (perpendicular): `vector(v[1], -v[0])`, i.e. rotate the vector 90° clockwise in standard screen coordinates (y-down). Does NOT normalize to unit length — magnitude is preserved. Pure one-liner; returns new tuple. Coordinate-space caveat for parity: in a y-down canvas space `[v[1], -v[0]]` is the clockwise-rotated perpendicular; verify rotation direction against the consuming code.
