/**
 * The camera owns the pan/zoom transform and is the ONLY place world<->screen math happens.
 *
 * Model: the world->screen transform is `translate(panX, panY) * scale(zoom)`. A world point
 * `w` maps to screen `s = zoom * w + pan`. Screen back to world is `w = (s - pan) / zoom`.
 * We expose a `Matrix` so the renderer can hand it straight to `ctx.setTransform`, and the
 * inverse for hit-testing pointer positions.
 *
 * State lives in Svelte 5 runes (this is a `.svelte.ts` module). The class instance is exported
 * so its `$state` fields stay reactive across modules (we never reassign the instance).
 */
import {
	apply,
	invert,
	multiply,
	scaling,
	translation,
	type BBox,
	type Matrix,
	type Vec2
} from './geometry.ts';

export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 8;

export class Camera {
	/** Screen-space translation (pixels) applied after scaling. */
	panX = $state(0);
	panY = $state(0);
	/** Uniform zoom factor. */
	zoom = $state(1);

	/** Current viewport size in CSS pixels (set by the canvas host on resize). */
	viewportWidth = $state(1);
	viewportHeight = $state(1);

	/** World -> screen transform, ready for ctx.setTransform(a,b,c,d,e,f). */
	readonly worldToScreen: Matrix = $derived(
		multiply(translation(this.panX, this.panY), scaling(this.zoom))
	);

	readonly screenToWorld: Matrix = $derived(invert(this.worldToScreen));

	/** Convert a screen-space point (CSS px relative to canvas top-left) to world coordinates. */
	toWorld(p: Vec2): Vec2 {
		return apply(this.screenToWorld, p);
	}

	/** Convert a world-space point to screen coordinates (CSS px). */
	toScreen(p: Vec2): Vec2 {
		return apply(this.worldToScreen, p);
	}

	/** Convert a screen-space distance (px) to a world-space distance. */
	screenDistanceToWorld(d: number): number {
		return d / this.zoom;
	}

	setViewport(width: number, height: number): void {
		this.viewportWidth = width;
		this.viewportHeight = height;
	}

	/** Pan by a screen-space delta (e.g. from a drag or trackpad). */
	panBy(dxScreen: number, dyScreen: number): void {
		this.panX += dxScreen;
		this.panY += dyScreen;
	}

	/**
	 * Zoom while keeping the world point under `anchorScreen` fixed on screen — the natural
	 * behavior for ctrl-scroll / pinch zoom centered on the cursor.
	 */
	zoomTo(nextZoom: number, anchorScreen: Vec2): void {
		const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZoom));
		// World point currently under the anchor.
		const worldAnchor = this.toWorld(anchorScreen);
		this.zoom = clamped;
		// Re-derive pan so worldAnchor stays under anchorScreen: screen = zoom*world + pan.
		this.panX = anchorScreen.x - clamped * worldAnchor.x;
		this.panY = anchorScreen.y - clamped * worldAnchor.y;
	}

	/** Multiply current zoom by a factor, anchored at a screen point. */
	zoomBy(factor: number, anchorScreen: Vec2): void {
		this.zoomTo(this.zoom * factor, anchorScreen);
	}

	/** Reset to 100% centered on the world origin region. */
	reset(): void {
		this.zoom = 1;
		this.panX = 0;
		this.panY = 0;
	}

	/** Fit the given world-space bounds into the viewport with padding (CSS px). */
	fit(bounds: BBox, padding = 64): void {
		if (bounds.width <= 0 || bounds.height <= 0) {
			this.reset();
			return;
		}
		const availW = Math.max(1, this.viewportWidth - padding * 2);
		const availH = Math.max(1, this.viewportHeight - padding * 2);
		const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.min(availW / bounds.width, availH / bounds.height)));
		this.zoom = z;
		// Center the bounds in the viewport.
		const cx = bounds.x + bounds.width / 2;
		const cy = bounds.y + bounds.height / 2;
		this.panX = this.viewportWidth / 2 - z * cx;
		this.panY = this.viewportHeight / 2 - z * cy;
	}

	/** Center the viewport on a world point without changing zoom. */
	centerOn(world: Vec2): void {
		this.panX = this.viewportWidth / 2 - this.zoom * world.x;
		this.panY = this.viewportHeight / 2 - this.zoom * world.y;
	}
}
