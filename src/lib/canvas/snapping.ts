/**
 * Alignment guides + snap resolution.
 *
 * While moving or resizing, we compare the candidate box's edges and center against the same
 * features of every other (non-selected) element, plus the canvas/frame. When a feature is within
 * the snap threshold (measured in SCREEN px, converted to world via the camera zoom so the feel is
 * zoom-independent) we snap to it and emit a guide line to draw.
 *
 * Equal-spacing detection: when the candidate sits between two neighbors with near-equal gaps, we
 * surface a "distribute" guide and snap to make the gaps exactly equal. This is what makes spacing
 * feel deliberate rather than approximate.
 *
 * The whole pass is pure: (candidate box, other boxes, threshold) -> (snapped delta, guides).
 * Holding the bypass modifier (alt) simply skips calling this.
 */
import type { BBox } from './geometry.js';

export interface SnapGuide {
	/** Orientation of the guide line. */
	axis: 'x' | 'y';
	/** World coordinate of the line (its x if axis==='x', its y if axis==='y'). */
	position: number;
	/** World-space extent [start, end] along the perpendicular axis, for drawing a tidy segment. */
	from: number;
	to: number;
	/** Whether this guide represents equal-spacing distribution rather than edge/center align. */
	kind: 'align' | 'distribute';
}

export interface SnapResult {
	/** Adjusted top-left so the candidate aligns to the nearest snap target. */
	x: number;
	y: number;
	guides: SnapGuide[];
}

interface Candidate {
	x: number;
	y: number;
	width: number;
	height: number;
}

/** The snappable feature lines of a box along one axis. */
function xFeatures(b: BBox): number[] {
	return [b.x, b.x + b.width / 2, b.x + b.width];
}
function yFeatures(b: BBox): number[] {
	return [b.y, b.y + b.height / 2, b.y + b.height];
}

export interface SnapConfig {
	/** Snap threshold in WORLD units (caller converts screen px via camera zoom). */
	thresholdWorld: number;
	/** Spacing-equality tolerance in world units. */
	spacingToleranceWorld: number;
}

/**
 * Resolve snapping for a candidate box against a set of static boxes.
 * Returns the adjusted top-left position and the guides to render.
 */
export function resolveSnap(
	candidate: Candidate,
	others: readonly BBox[],
	config: SnapConfig
): SnapResult {
	const t = config.thresholdWorld;
	const cand: BBox = candidate;

	const candX = xFeatures(cand);
	const candY = yFeatures(cand);

	let bestDX = Infinity;
	let bestDY = Infinity;
	let snapX: number | null = null;
	let snapY: number | null = null;
	const guides: SnapGuide[] = [];

	for (const o of others) {
		const ox = xFeatures(o);
		const oy = yFeatures(o);

		// X-axis alignment: any candidate vertical edge/center to any other's.
		for (const cf of candX) {
			for (const of of ox) {
				const d = of - cf;
				if (Math.abs(d) < Math.abs(bestDX) && Math.abs(d) <= t) {
					bestDX = d;
					snapX = of;
				}
			}
		}
		// Y-axis alignment.
		for (const cf of candY) {
			for (const of of oy) {
				const d = of - cf;
				if (Math.abs(d) < Math.abs(bestDY) && Math.abs(d) <= t) {
					bestDY = d;
					snapY = of;
				}
			}
		}
	}

	let resultX = cand.x;
	let resultY = cand.y;

	if (snapX !== null && Number.isFinite(bestDX)) {
		resultX = cand.x + bestDX;
		// Build a vertical guide spanning candidate + all aligned others.
		const aligned = others.filter((o) => xFeatures(o).some((f) => Math.abs(f - snapX!) < 0.5));
		const ys = [resultY, resultY + cand.height, ...aligned.flatMap((o) => [o.y, o.y + o.height])];
		guides.push({
			axis: 'x',
			position: snapX,
			from: Math.min(...ys),
			to: Math.max(...ys),
			kind: 'align'
		});
	}
	if (snapY !== null && Number.isFinite(bestDY)) {
		resultY = cand.y + bestDY;
		const aligned = others.filter((o) => yFeatures(o).some((f) => Math.abs(f - snapY!) < 0.5));
		const xs = [resultX, resultX + cand.width, ...aligned.flatMap((o) => [o.x, o.x + o.width])];
		guides.push({
			axis: 'y',
			position: snapY,
			from: Math.min(...xs),
			to: Math.max(...xs),
			kind: 'align'
		});
	}

	// Equal-spacing detection along X: find a left and right neighbor and equalize gaps.
	const spacing = detectEqualSpacing(
		{ ...cand, x: resultX, y: resultY },
		others,
		config.spacingToleranceWorld
	);
	if (spacing) {
		resultX = spacing.x ?? resultX;
		resultY = spacing.y ?? resultY;
		guides.push(...spacing.guides);
	}

	return { x: resultX, y: resultY, guides };
}

interface SpacingResult {
	x: number | null;
	y: number | null;
	guides: SnapGuide[];
}

/**
 * Detect that the candidate sits between two neighbors with near-equal gaps on an axis, and
 * compute the position that makes them exactly equal. Handles horizontal and vertical rows.
 */
function detectEqualSpacing(cand: BBox, others: readonly BBox[], tol: number): SpacingResult | null {
	const guides: SnapGuide[] = [];
	let outX: number | null = null;
	let outY: number | null = null;

	// Horizontal: neighbors overlapping in Y, one to the left, one to the right.
	const yOverlap = others.filter(
		(o) => o.y < cand.y + cand.height && o.y + o.height > cand.y
	);
	const leftN = yOverlap
		.filter((o) => o.x + o.width <= cand.x + 1)
		.sort((a, b) => b.x + b.width - (a.x + a.width))[0];
	const rightN = yOverlap
		.filter((o) => o.x >= cand.x + cand.width - 1)
		.sort((a, b) => a.x - b.x)[0];
	if (leftN && rightN) {
		const gapL = cand.x - (leftN.x + leftN.width);
		const gapR = rightN.x - (cand.x + cand.width);
		if (Math.abs(gapL - gapR) <= tol * 2) {
			const total = rightN.x - (leftN.x + leftN.width) - cand.width;
			const equal = total / 2;
			outX = leftN.x + leftN.width + equal;
			const midY = cand.y + cand.height / 2;
			guides.push(
				{ axis: 'y', position: midY, from: leftN.x + leftN.width, to: cand.x, kind: 'distribute' },
				{ axis: 'y', position: midY, from: cand.x + cand.width, to: rightN.x, kind: 'distribute' }
			);
		}
	}

	// Vertical: neighbors overlapping in X, one above, one below.
	const xOverlap = others.filter((o) => o.x < cand.x + cand.width && o.x + o.width > cand.x);
	const topN = xOverlap
		.filter((o) => o.y + o.height <= cand.y + 1)
		.sort((a, b) => b.y + b.height - (a.y + a.height))[0];
	const botN = xOverlap
		.filter((o) => o.y >= cand.y + cand.height - 1)
		.sort((a, b) => a.y - b.y)[0];
	if (topN && botN) {
		const gapT = cand.y - (topN.y + topN.height);
		const gapB = botN.y - (cand.y + cand.height);
		if (Math.abs(gapT - gapB) <= tol * 2) {
			const total = botN.y - (topN.y + topN.height) - cand.height;
			const equal = total / 2;
			outY = topN.y + topN.height + equal;
			const midX = cand.x + cand.width / 2;
			guides.push(
				{ axis: 'x', position: midX, from: topN.y + topN.height, to: cand.y, kind: 'distribute' },
				{ axis: 'x', position: midX, from: cand.y + cand.height, to: botN.y, kind: 'distribute' }
			);
		}
	}

	if (outX === null && outY === null && guides.length === 0) return null;
	return { x: outX, y: outY, guides };
}
