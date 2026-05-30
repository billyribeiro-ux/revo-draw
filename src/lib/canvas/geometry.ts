/**
 * 2D geometry primitives: vectors, affine matrices, axis-aligned bounding boxes, and the
 * rotation math used by the camera, hit-testing, transform handles, and snapping.
 *
 * Hand-rolled per the hard rules (no graphics library). A 2D affine transform is stored as the
 * six numbers of the matrix
 *
 *     | a c e |
 *     | b d f |
 *     | 0 0 1 |
 *
 * matching the CanvasRenderingContext2D.setTransform(a, b, c, d, e, f) argument order, so a
 * camera matrix can be applied to the context directly with no conversion.
 */

export interface Vec2 {
	x: number;
	y: number;
}

export interface Matrix {
	a: number;
	b: number;
	c: number;
	d: number;
	e: number;
	f: number;
}

export interface BBox {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface Rect extends BBox {}

export const IDENTITY: Matrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

export function matrix(a: number, b: number, c: number, d: number, e: number, f: number): Matrix {
	return { a, b, c, d, e, f };
}

export function translation(tx: number, ty: number): Matrix {
	return { a: 1, b: 0, c: 0, d: 1, e: tx, f: ty };
}

export function scaling(sx: number, sy = sx): Matrix {
	return { a: sx, b: 0, c: 0, d: sy, e: 0, f: 0 };
}

export function rotationMatrix(theta: number): Matrix {
	const cos = Math.cos(theta);
	const sin = Math.sin(theta);
	return { a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 };
}

/** Compose two matrices: result applies `n` then `m` (i.e. m * n). */
export function multiply(m: Matrix, n: Matrix): Matrix {
	return {
		a: m.a * n.a + m.c * n.b,
		b: m.b * n.a + m.d * n.b,
		c: m.a * n.c + m.c * n.d,
		d: m.b * n.c + m.d * n.d,
		e: m.a * n.e + m.c * n.f + m.e,
		f: m.b * n.e + m.d * n.f + m.f
	};
}

/** Compose a list of matrices left-to-right (first applied last). */
export function compose(...ms: Matrix[]): Matrix {
	return ms.reduce((acc, m) => multiply(acc, m), IDENTITY);
}

export function invert(m: Matrix): Matrix {
	const det = m.a * m.d - m.b * m.c;
	if (det === 0) {
		// Singular matrix — should never happen for a camera transform (scale > 0).
		return IDENTITY;
	}
	const inv = 1 / det;
	return {
		a: m.d * inv,
		b: -m.b * inv,
		c: -m.c * inv,
		d: m.a * inv,
		e: (m.c * m.f - m.d * m.e) * inv,
		f: (m.b * m.e - m.a * m.f) * inv
	};
}

export function apply(m: Matrix, p: Vec2): Vec2 {
	return {
		x: m.a * p.x + m.c * p.y + m.e,
		y: m.b * p.x + m.d * p.y + m.f
	};
}

/** Apply only the linear (rotation+scale) part of a matrix to a vector (ignores translation). */
export function applyVector(m: Matrix, v: Vec2): Vec2 {
	return { x: m.a * v.x + m.c * v.y, y: m.b * v.x + m.d * v.y };
}

/** Uniform scale magnitude of a matrix (used to convert px thresholds across zoom). */
export function scaleOf(m: Matrix): number {
	return Math.sqrt(Math.abs(m.a * m.d - m.b * m.c));
}

// ---- Vectors -------------------------------------------------------------------------------

export function vec(x: number, y: number): Vec2 {
	return { x, y };
}
export function add(a: Vec2, b: Vec2): Vec2 {
	return { x: a.x + b.x, y: a.y + b.y };
}
export function sub(a: Vec2, b: Vec2): Vec2 {
	return { x: a.x - b.x, y: a.y - b.y };
}
export function scale(a: Vec2, s: number): Vec2 {
	return { x: a.x * s, y: a.y * s };
}
export function dot(a: Vec2, b: Vec2): number {
	return a.x * b.x + a.y * b.y;
}
export function length(a: Vec2): number {
	return Math.hypot(a.x, a.y);
}
export function distance(a: Vec2, b: Vec2): number {
	return Math.hypot(a.x - b.x, a.y - b.y);
}
export function rotate(p: Vec2, theta: number, origin: Vec2 = { x: 0, y: 0 }): Vec2 {
	const cos = Math.cos(theta);
	const sin = Math.sin(theta);
	const dx = p.x - origin.x;
	const dy = p.y - origin.y;
	return {
		x: origin.x + dx * cos - dy * sin,
		y: origin.y + dx * sin + dy * cos
	};
}

// ---- Boxes ---------------------------------------------------------------------------------

export function bboxCenter(b: BBox): Vec2 {
	return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

/** The four corners of a box, in TL, TR, BR, BL order. */
export function bboxCorners(b: BBox): [Vec2, Vec2, Vec2, Vec2] {
	return [
		{ x: b.x, y: b.y },
		{ x: b.x + b.width, y: b.y },
		{ x: b.x + b.width, y: b.y + b.height },
		{ x: b.x, y: b.y + b.height }
	];
}

/**
 * The four corners of a possibly-rotated box, rotated about its own center.
 * Returns world-space points in TL, TR, BR, BL (pre-rotation) order.
 */
export function orientedCorners(b: BBox, rotation: number): [Vec2, Vec2, Vec2, Vec2] {
	const c = bboxCenter(b);
	const corners = bboxCorners(b);
	return [
		rotate(corners[0], rotation, c),
		rotate(corners[1], rotation, c),
		rotate(corners[2], rotation, c),
		rotate(corners[3], rotation, c)
	];
}

export function pointInBBox(p: Vec2, b: BBox): boolean {
	return p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height;
}

/** Hit-test a point against a rotated box by un-rotating the point into the box's local frame. */
export function pointInOrientedBox(p: Vec2, b: BBox, rotation: number): boolean {
	if (rotation === 0) return pointInBBox(p, b);
	const c = bboxCenter(b);
	const local = rotate(p, -rotation, c);
	return pointInBBox(local, b);
}

export function bboxesIntersect(a: BBox, b: BBox): boolean {
	return !(
		a.x + a.width < b.x ||
		b.x + b.width < a.x ||
		a.y + a.height < b.y ||
		b.y + b.height < a.y
	);
}

/** Axis-aligned bounds enclosing a set of points. */
export function boundsOfPoints(points: readonly Vec2[]): BBox {
	if (points.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	for (const p of points) {
		if (p.x < minX) minX = p.x;
		if (p.y < minY) minY = p.y;
		if (p.x > maxX) maxX = p.x;
		if (p.y > maxY) maxY = p.y;
	}
	return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** Union of multiple boxes. */
export function unionBBox(boxes: readonly BBox[]): BBox {
	if (boxes.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	for (const b of boxes) {
		if (b.x < minX) minX = b.x;
		if (b.y < minY) minY = b.y;
		if (b.x + b.width > maxX) maxX = b.x + b.width;
		if (b.y + b.height > maxY) maxY = b.y + b.height;
	}
	return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** World-space AABB of a rotated box (its bounding box once rotation is applied). */
export function orientedBBox(b: BBox, rotation: number): BBox {
	if (rotation === 0) return { ...b };
	return boundsOfPoints(orientedCorners(b, rotation));
}

export function clamp(v: number, min: number, max: number): number {
	return v < min ? min : v > max ? max : v;
}

export function approxEqual(a: number, b: number, eps = 1e-6): boolean {
	return Math.abs(a - b) <= eps;
}
