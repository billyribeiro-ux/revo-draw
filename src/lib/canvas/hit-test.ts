/**
 * Hit-testing the scene graph in WORLD coordinates.
 *
 * Pointer positions arrive as world points (the camera converts them once). We never hit-test in
 * screen space, so results are identical at any pan/zoom. Topmost-first ordering matches the
 * paint order (later in `ordered` = drawn on top = hit first).
 */
import {
	bboxCenter,
	bboxContains,
	orientedBBox,
	orientedCorners,
	pointInOrientedBox,
	rotate,
	type BBox,
	type Vec2
} from './geometry.ts';
import type { Element, ElementId } from '../elements/types.ts';

export type HandleKind =
	| 'nw'
	| 'n'
	| 'ne'
	| 'e'
	| 'se'
	| 's'
	| 'sw'
	| 'w'
	| 'rotate';

export interface Handle {
	kind: HandleKind;
	/** Position in world coordinates (handle centers track the selection box). */
	world: Vec2;
}

/** The eight resize handles + one rotate handle for a selection box (axis-aligned in world). */
export function selectionHandles(bounds: BBox, rotateOffsetWorld: number, marginWorld = 0): Handle[] {
	// Inflate the box by `marginWorld` so handles sit OUTSIDE the selection, leaving the whole body
	// free to drag (Excalidraw places handles outside the box via `dashedLineMargin + handleMargin`,
	// transformHandles.ts:158). Without this, a small element's handles cover its body and every
	// off-centre click resizes instead of moves.
	const m = marginWorld;
	const x = bounds.x - m;
	const y = bounds.y - m;
	const w = bounds.width + m * 2;
	const h = bounds.height + m * 2;
	const cx = x + w / 2;
	const cy = y + h / 2;
	return [
		{ kind: 'nw', world: { x, y } },
		{ kind: 'n', world: { x: cx, y } },
		{ kind: 'ne', world: { x: x + w, y } },
		{ kind: 'e', world: { x: x + w, y: cy } },
		{ kind: 'se', world: { x: x + w, y: y + h } },
		{ kind: 's', world: { x: cx, y: y + h } },
		{ kind: 'sw', world: { x, y: y + h } },
		{ kind: 'w', world: { x, y: cy } },
		{ kind: 'rotate', world: { x: cx, y: y - rotateOffsetWorld } }
	];
}

/**
 * Handles for a single element, placed on its ROTATED box (rotated about the element's center),
 * so resize/rotate affordances sit on the visual outline of a rotated element. The rotate handle
 * is offset perpendicular to the top edge. Handle `kind`s name the LOCAL (pre-rotation) corner.
 */
export function orientedHandles(
	el: BBox,
	rotation: number,
	rotateOffsetWorld: number,
	marginWorld = 0
): Handle[] {
	const c = bboxCenter(el);
	const place = (lx: number, ly: number): Vec2 => rotate({ x: lx, y: ly }, rotation, c);
	// Inflate by `marginWorld` so handles sit OUTSIDE the element, keeping the body free to drag
	// (matches Excalidraw, transformHandles.ts:158). The center is unchanged (symmetric inflate),
	// so rotation about `c` is unaffected.
	const m = marginWorld;
	const x = el.x - m;
	const y = el.y - m;
	const w = el.width + m * 2;
	const h = el.height + m * 2;
	const cx = x + w / 2;
	const cy = y + h / 2;
	return [
		{ kind: 'nw', world: place(x, y) },
		{ kind: 'n', world: place(cx, y) },
		{ kind: 'ne', world: place(x + w, y) },
		{ kind: 'e', world: place(x + w, cy) },
		{ kind: 'se', world: place(x + w, y + h) },
		{ kind: 's', world: place(cx, y + h) },
		{ kind: 'sw', world: place(x, y + h) },
		{ kind: 'w', world: place(x, cy) },
		{ kind: 'rotate', world: place(cx, y - rotateOffsetWorld) }
	];
}

/** Find the handle whose center is within `radiusWorld` of the world point, if any. */
export function hitHandle(handles: Handle[], world: Vec2, radiusWorld: number): Handle | null {
	let best: Handle | null = null;
	let bestDist = radiusWorld;
	for (const h of handles) {
		const d = Math.hypot(h.world.x - world.x, h.world.y - world.y);
		if (d <= bestDist) {
			bestDist = d;
			best = h;
		}
	}
	return best;
}

/**
 * Topmost element under a world point. `ordered` is the depth-first paint order (root..front).
 * We iterate back-to-front so the visually-top element wins.
 */
export function hitTestPoint(ordered: readonly Element[], world: Vec2): Element | null {
	for (let i = ordered.length - 1; i >= 0; i--) {
		const el = ordered[i];
		if (!el || el.hidden || el.locked) continue;
		if (pointInOrientedBox(world, el, el.rotation)) return el;
	}
	return null;
}

/**
 * All elements whose oriented AABB is FULLY CONTAINED within the marquee rect (world space).
 * Matches Excalidraw's default "contain" selection mode (`selection.ts:219`): the marquee must
 * envelop the element for it to be selected. Returns ids in paint order.
 */
export function hitTestMarquee(ordered: readonly Element[], marquee: BBox): ElementId[] {
	const out: ElementId[] = [];
	for (const el of ordered) {
		if (el.hidden || el.locked) continue;
		const box = orientedBBox(el, el.rotation);
		if (bboxContains(marquee, box)) out.push(el.id);
	}
	return out;
}

/** Normalize a drag from start->current into a positive-area marquee rect. */
export function marqueeRect(start: Vec2, current: Vec2): BBox {
	return {
		x: Math.min(start.x, current.x),
		y: Math.min(start.y, current.y),
		width: Math.abs(current.x - start.x),
		height: Math.abs(current.y - start.y)
	};
}

/** Whether a world point lies inside an element's oriented box (used for drag-start tests). */
export function pointInElement(el: Element, world: Vec2): boolean {
	return pointInOrientedBox(world, el, el.rotation);
}

/** Oriented corner polygon of an element (for drawing rotated selection outlines). */
export function elementCorners(el: Element): [Vec2, Vec2, Vec2, Vec2] {
	return orientedCorners(el, el.rotation);
}
