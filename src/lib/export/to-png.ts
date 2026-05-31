/**
 * Raster export + thumbnail generation.
 *
 * Renders the scene graph to an offscreen 2D canvas using the same `render()` function as the
 * live editor, framed to the content bounds, and returns PNG bytes (for file export) or a small
 * base64 data URL (for the library thumbnail). No DOM mutation beyond the throwaway canvas.
 */
import { render } from '../canvas/renderer.ts';
import { multiply, scaling, translation, unionBBox, orientedBBox, type BBox } from '../canvas/geometry.ts';
import { isContainerType, type LayoutDocument } from '../elements/types.ts';

function contentBounds(doc: LayoutDocument): BBox {
	const boxes = Object.values(doc.elements).map((el) => orientedBBox(el, el.rotation));
	if (boxes.length === 0) return { x: 0, y: 0, width: doc.canvas.width, height: doc.canvas.height };
	return unionBBox(boxes);
}

interface RasterOptions {
	padding?: number;
	maxDimension?: number;
	scale?: number;
}

function rasterize(doc: LayoutDocument, opts: RasterOptions): HTMLCanvasElement {
	const padding = opts.padding ?? 40;
	const bounds = contentBounds(doc);
	const worldW = bounds.width + padding * 2;
	const worldH = bounds.height + padding * 2;

	let scale = opts.scale ?? 2;
	if (opts.maxDimension) {
		const fit = opts.maxDimension / Math.max(worldW, worldH);
		scale = Math.min(scale, fit);
	}

	const cssW = Math.max(1, Math.round(worldW));
	const cssH = Math.max(1, Math.round(worldH));

	const canvas = document.createElement('canvas');
	canvas.width = Math.max(1, Math.round(cssW * scale));
	canvas.height = Math.max(1, Math.round(cssH * scale));
	const ctx = canvas.getContext('2d');
	if (!ctx) return canvas;

	// World->screen: shift content into the padded frame (no zoom; dpr carries the scale).
	const worldToScreen = multiply(translation(-bounds.x + padding, -bounds.y + padding), scaling(1));

	render({
		ctx,
		dpr: scale,
		cssWidth: cssW,
		cssHeight: cssH,
		worldToScreen,
		zoom: 1,
		canvas: doc.canvas,
		ordered: orderedFor(doc),
		selection: new Set(),
		selectionBounds: null,
		handles: [],
		soleSelected: null,
		marquee: null,
		guides: [],
		dropTargetId: null,
		rotateHandleOffsetWorld: 0,
		handleSizeWorld: 0,
		gridColor: 'oklch(0.92 0.004 264 / 0)',
		gridStrongColor: 'oklch(0.92 0.004 264 / 0)'
	});

	return canvas;
}

function orderedFor(doc: LayoutDocument): import('../elements/types.ts').Element[] {
	const byParent = new Map<string | null, import('../elements/types.ts').Element[]>();
	for (const el of Object.values(doc.elements)) {
		const list = byParent.get(el.parentId) ?? [];
		list.push(el);
		byParent.set(el.parentId, list);
	}
	const out: import('../elements/types.ts').Element[] = [];
	const visit = (parentId: string | null): void => {
		const kids = (byParent.get(parentId) ?? [])
			.slice()
			.sort((a, b) => a.z - b.z || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
		for (const el of kids) {
			out.push(el);
			// Only containers parent children; recursing into leaves is wasteful and, with malformed
			// data, could double-paint. Matches to-svg.ts paint-order traversal.
			if (isContainerType(el.type)) visit(el.id);
		}
	};
	visit(null);
	return out;
}

/** PNG bytes for the full document at 2× scale. */
export async function exportPng(doc: LayoutDocument): Promise<Uint8Array> {
	const canvas = rasterize(doc, { scale: 2, maxDimension: 4096 });
	const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
	if (!blob) return new Uint8Array();
	return new Uint8Array(await blob.arrayBuffer());
}

/** A small base64 PNG data URL for the library thumbnail. */
export async function makeThumbnail(doc: LayoutDocument, maxDimension = 360): Promise<string> {
	const canvas = rasterize(doc, { scale: 1, maxDimension });
	return await new Promise<string>((resolve) => {
		const blob = canvas.toDataURL('image/png');
		resolve(blob);
	});
}
