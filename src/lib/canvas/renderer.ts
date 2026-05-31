/**
 * Canvas 2D renderer: a pure function of (document + camera + overlay) -> pixels.
 *
 * It never mutates app state and never touches the DOM beyond the single <canvas> it's given.
 * The host calls `render()` only when something changed (dirty flag), not on a constant rAF loop.
 * Device-pixel-ratio is handled by scaling the backing store; all drawing is in CSS px space with
 * the camera's world->screen matrix applied, so text re-rasterizes crisply at every zoom level.
 *
 * Visual language: restrained, editorial. Thin hairlines, generous whitespace, a single accent.
 * Each semantic type has a distinct, legible treatment (a placeholder glyph or skeleton) so the
 * wireframe reads at a glance without being skeuomorphic.
 */
import { bboxCenter, orientedCorners, type BBox, type Matrix, type Vec2 } from './geometry.js';
import type { Handle } from './hit-test.js';
import type { SnapGuide } from './snapping.js';
import type { Element, ElementId } from '../elements/types.js';

export interface RenderInput {
	ctx: CanvasRenderingContext2D;
	dpr: number;
	cssWidth: number;
	cssHeight: number;
	worldToScreen: Matrix;
	zoom: number;
	canvas: { width: number; height: number; background: string };
	/** Elements in paint order (root..front). */
	ordered: readonly Element[];
	selection: ReadonlySet<ElementId>;
	selectionBounds: BBox | null;
	/** The active transform handles (oriented for a single rotated element; AABB otherwise). */
	handles: readonly Handle[];
	/** The sole selected element, when exactly one is selected (drives rotated outline). */
	soleSelected: Element | null;
	/** Overlay: live marquee rect (world), or null. */
	marquee: BBox | null;
	/** Overlay: active alignment guides (world). */
	guides: readonly SnapGuide[];
	/** Overlay: id being hovered for reparent drop target, or null. */
	dropTargetId: ElementId | null;
	/** World offset of the rotate handle above the selection (screen px / zoom). */
	rotateHandleOffsetWorld: number;
	/** Handle hit radius in world units (for sizing handle squares). */
	handleSizeWorld: number;
	/** Whether the editor is in dark or light surface — drives grid contrast. */
	gridColor: string;
	gridStrongColor: string;
}

const ACCENT = 'oklch(0.55 0.17 264)';
const GUIDE = 'oklch(0.62 0.23 16)';
const INK = 'oklch(0.24 0.014 264)';
const INK_SOFT = 'oklch(0.5 0.013 264)';
const INK_FAINT = 'oklch(0.7 0.01 264)';

export function render(input: RenderInput): void {
	const { ctx, dpr, cssWidth, cssHeight } = input;

	// Reset to device space and clear.
	ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
	ctx.clearRect(0, 0, cssWidth, cssHeight);

	// Backdrop (the infinite canvas surface).
	ctx.fillStyle = 'oklch(0.955 0.004 110)';
	ctx.fillRect(0, 0, cssWidth, cssHeight);

	drawGrid(input);

	// Apply camera: subsequent draws use world coordinates. Compose DPR * worldToScreen.
	const m = input.worldToScreen;
	ctx.setTransform(dpr * m.a, dpr * m.b, dpr * m.c, dpr * m.d, dpr * m.e, dpr * m.f);

	for (const el of input.ordered) {
		if (el.hidden) continue;
		drawElement(ctx, el, input.zoom);
	}

	// Drop-target highlight.
	if (input.dropTargetId) {
		const target = input.ordered.find((e) => e.id === input.dropTargetId);
		if (target) drawDropTarget(ctx, target, input.zoom);
	}

	drawSelection(input);
	drawGuides(input);
	drawMarquee(input);
}

// ---- grid ------------------------------------------------------------------------------------

function drawGrid(input: RenderInput): void {
	const { ctx, cssWidth, cssHeight, worldToScreen, zoom, dpr } = input;
	// Choose a world grid step that stays visually ~16–48 px on screen across zoom levels.
	const baseStep = 16;
	let step = baseStep;
	while (step * zoom < 14) step *= 2;
	while (step * zoom > 48) step /= 2;

	const screenStep = step * zoom;
	if (screenStep < 4) return; // too dense to be useful

	// Top-left world point visible.
	const inv = worldToScreen;
	const originScreenX = inv.e % screenStep;
	const originScreenY = inv.f % screenStep;

	ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
	ctx.lineWidth = 1;

	// Dots at grid intersections — quiet, editorial.
	ctx.fillStyle = input.gridColor;
	const r = zoom > 1.5 ? 1.1 : 0.9;
	for (let x = originScreenX; x < cssWidth; x += screenStep) {
		for (let y = originScreenY; y < cssHeight; y += screenStep) {
			ctx.beginPath();
			ctx.arc(x, y, r, 0, Math.PI * 2);
			ctx.fill();
		}
	}

	// Stronger dots every 8 steps (a soft major grid).
	const major = screenStep * 8;
	const majX = inv.e % major;
	const majY = inv.f % major;
	ctx.fillStyle = input.gridStrongColor;
	for (let x = majX; x < cssWidth; x += major) {
		for (let y = majY; y < cssHeight; y += major) {
			ctx.beginPath();
			ctx.arc(x, y, r + 0.7, 0, Math.PI * 2);
			ctx.fill();
		}
	}
}

// ---- elements --------------------------------------------------------------------------------

function strokeWidthFor(zoom: number, base = 1): number {
	// Keep hairlines crisp and constant in screen space regardless of zoom.
	return base / zoom;
}

function drawElement(ctx: CanvasRenderingContext2D, el: Element, zoom: number): void {
	ctx.save();
	const c = bboxCenter(el);
	if (el.rotation !== 0) {
		ctx.translate(c.x, c.y);
		ctx.rotate(el.rotation);
		ctx.translate(-c.x, -c.y);
	}
	ctx.globalAlpha = el.style?.opacity ?? 1;

	switch (el.type) {
		case 'frame':
			drawFrame(ctx, el, zoom);
			break;
		case 'container':
			drawContainer(ctx, el, zoom);
			break;
		case 'card':
			drawCard(ctx, el, zoom);
			break;
		case 'nav':
			drawNav(ctx, el, zoom);
			break;
		case 'sidebar':
			drawSidebar(ctx, el, zoom);
			break;
		case 'button':
			drawButton(ctx, el, zoom);
			break;
		case 'input':
			drawInput(ctx, el, zoom);
			break;
		case 'text':
			drawText(ctx, el, zoom);
			break;
		case 'image':
			drawImage(ctx, el, zoom);
			break;
		case 'table':
			drawTable(ctx, el, zoom);
			break;
		case 'chart':
			drawChart(ctx, el, zoom);
			break;
		case 'list':
			drawList(ctx, el, zoom);
			break;
		case 'tabs':
			drawTabs(ctx, el, zoom);
			break;
		case 'modal':
			drawModal(ctx, el, zoom);
			break;
		case 'icon':
			drawIcon(ctx, el, zoom);
			break;
		case 'divider':
			drawDivider(ctx, el, zoom);
			break;
	}
	ctx.restore();
}

function roundRect(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	w: number,
	h: number,
	r: number
): void {
	const rr = Math.max(0, Math.min(r, Math.min(w, h) / 2));
	ctx.beginPath();
	ctx.roundRect(x, y, w, h, rr);
}

/** Resolve the user-chosen stroke weight bucket (thin/bold/extra → 1/2/4 px), else a base. */
function userStrokeWidth(el: Element, zoom: number, fallbackBase = 1): number {
	const bucket = el.style?.strokeWidth;
	const px = bucket === 'thin' ? 1 : bucket === 'extra' ? 4 : bucket === 'bold' ? 2 : fallbackBase;
	return strokeWidthFor(zoom, px);
}

/** Apply the element's stroke-style dash pattern to the context (scaled to stay constant on screen). */
function applyDash(ctx: CanvasRenderingContext2D, el: Element, zoom: number): void {
	const widthPx = el.style?.strokeWidth === 'thin' ? 1 : el.style?.strokeWidth === 'extra' ? 4 : 2;
	switch (el.style?.strokeStyle) {
		case 'dashed':
			ctx.setLineDash([(8 / zoom), (8 + widthPx) / zoom]);
			break;
		case 'dotted':
			ctx.setLineDash([1.5 / zoom, (6 + widthPx) / zoom]);
			break;
		default:
			ctx.setLineDash([]);
	}
}

/** Is a fill color meaningfully present (not undefined/transparent)? */
function hasFill(color: string | undefined): color is string {
	return !!color && color !== 'transparent' && !/\/\s*0\s*\)$/.test(color);
}

function fillStroke(
	ctx: CanvasRenderingContext2D,
	el: Element,
	zoom: number,
	defaults: { fill?: string; stroke?: string; radius?: number; strokeBase?: number }
): void {
	const radius = el.style?.radius ?? defaults.radius ?? 0;
	roundRect(ctx, el.x, el.y, el.width, el.height, radius);

	const fill = el.style?.fill ?? defaults.fill;
	if (hasFill(fill)) {
		ctx.fillStyle = fill;
		ctx.fill();
	}

	const stroke = el.style?.stroke ?? defaults.stroke;
	if (hasFill(stroke)) {
		ctx.save();
		ctx.strokeStyle = stroke;
		ctx.lineWidth = userStrokeWidth(el, zoom, defaults.strokeBase ?? 1);
		applyDash(ctx, el, zoom);
		ctx.stroke();
		ctx.restore();
	}
}

function labelText(ctx: CanvasRenderingContext2D, el: Element, text: string, zoom: number): void {
	ctx.fillStyle = INK_FAINT;
	ctx.font = `${500} ${11 / zoom}px var(--font-sans, sans-serif)`;
	ctx.textBaseline = 'top';
	ctx.textAlign = 'left';
	ctx.fillText(text, el.x + 8 / zoom, el.y + 6 / zoom);
}

function drawFrame(ctx: CanvasRenderingContext2D, el: Element, zoom: number): void {
	// Frame: paper with a soft drop shadow and a title tab above it.
	ctx.save();
	ctx.shadowColor = 'oklch(0.2 0.02 264 / 0.12)';
	ctx.shadowBlur = 18 / zoom;
	ctx.shadowOffsetY = 6 / zoom;
	fillStroke(ctx, el, zoom, { fill: 'oklch(1 0 0)', stroke: 'oklch(0.86 0.006 264)', radius: 8 });
	ctx.restore();
	// Title tab
	ctx.fillStyle = INK_SOFT;
	ctx.font = `${600} ${12 / zoom}px var(--font-sans, sans-serif)`;
	ctx.textBaseline = 'bottom';
	ctx.textAlign = 'left';
	ctx.fillText(el.label ?? 'Frame', el.x, el.y - 8 / zoom);
}

function drawContainer(ctx: CanvasRenderingContext2D, el: Element, zoom: number): void {
	const radius = el.style?.radius ?? 6;
	roundRect(ctx, el.x, el.y, el.width, el.height, radius);
	const fill = el.style?.fill;
	if (hasFill(fill)) {
		ctx.fillStyle = fill;
		ctx.fill();
	}
	ctx.save();
	ctx.strokeStyle = hasFill(el.style?.stroke) ? el.style.stroke : 'oklch(0.8 0.01 264)';
	ctx.lineWidth = userStrokeWidth(el, zoom, 1);
	// A container is a layout region: default to a dashed outline, but honor an explicit choice.
	if (el.style?.strokeStyle && el.style.strokeStyle !== 'solid') applyDash(ctx, el, zoom);
	else if (el.style?.strokeStyle === 'solid') ctx.setLineDash([]);
	else ctx.setLineDash([6 / zoom, 4 / zoom]);
	ctx.stroke();
	ctx.restore();
	if (el.label) labelText(ctx, el, el.label, zoom);
}

function drawCard(ctx: CanvasRenderingContext2D, el: Element, zoom: number): void {
	ctx.save();
	ctx.shadowColor = 'oklch(0.2 0.02 264 / 0.06)';
	ctx.shadowBlur = 8 / zoom;
	ctx.shadowOffsetY = 2 / zoom;
	fillStroke(ctx, el, zoom, { fill: 'oklch(1 0 0)', stroke: 'oklch(0.9 0.005 264)', radius: 8 });
	ctx.restore();
	if (el.label) {
		ctx.fillStyle = INK;
		ctx.font = `${600} ${13 / zoom}px var(--font-sans, sans-serif)`;
		ctx.textBaseline = 'top';
		ctx.textAlign = 'left';
		ctx.fillText(el.label, el.x + 16 / zoom, el.y + 14 / zoom);
		// a faint value line beneath the title
		ctx.fillStyle = INK_FAINT;
		ctx.fillRect(el.x + 16 / zoom, el.y + 40 / zoom, Math.min(el.width - 32 / zoom, 80 / zoom), 18 / zoom);
	}
}

function drawNav(ctx: CanvasRenderingContext2D, el: Element, zoom: number): void {
	fillStroke(ctx, el, zoom, { fill: 'oklch(0.99 0.002 264)', stroke: 'oklch(0.9 0.005 264)', radius: el.style?.radius ?? 0 });
	// Brand dot + a few nav pills.
	const cy = el.y + el.height / 2;
	ctx.fillStyle = ACCENT;
	ctx.beginPath();
	ctx.arc(el.x + 18 / zoom, cy, 5 / zoom, 0, Math.PI * 2);
	ctx.fill();
	ctx.fillStyle = INK_FAINT;
	let px = el.x + el.width - 60 / zoom;
	for (let i = 0; i < 3; i++) {
		roundRect(ctx, px - i * 56 / zoom, cy - 6 / zoom, 44 / zoom, 12 / zoom, 6 / zoom);
		ctx.fill();
	}
}

function drawSidebar(ctx: CanvasRenderingContext2D, el: Element, zoom: number): void {
	fillStroke(ctx, el, zoom, { fill: 'oklch(0.965 0.004 110)', stroke: 'oklch(0.9 0.005 264)', radius: el.style?.radius ?? 0 });
	// Stacked nav items.
	ctx.fillStyle = INK_FAINT;
	const pad = 16 / zoom;
	for (let i = 0; i < 5; i++) {
		const y = el.y + pad + i * 34 / zoom;
		if (y > el.y + el.height - 20 / zoom) break;
		ctx.beginPath();
		ctx.arc(el.x + pad + 6 / zoom, y + 6 / zoom, 5 / zoom, 0, Math.PI * 2);
		ctx.fill();
		roundRect(ctx, el.x + pad + 22 / zoom, y, Math.min(el.width - pad * 2 - 22 / zoom, 120 / zoom), 12 / zoom, 6 / zoom);
		ctx.fill();
	}
}

function drawButton(ctx: CanvasRenderingContext2D, el: Element, zoom: number): void {
	const variant = 'variant' in el ? el.variant : 'primary';
	const fills: Record<string, string> = {
		primary: 'oklch(0.55 0.17 264)',
		secondary: 'oklch(0.92 0.02 256)',
		ghost: 'oklch(1 0 0 / 0)',
		danger: 'oklch(0.58 0.2 25)'
	};
	const fill = el.style?.fill ?? fills[variant ?? 'primary'] ?? fills.primary;
	const radius = el.style?.radius ?? 6;
	roundRect(ctx, el.x, el.y, el.width, el.height, radius);
	ctx.fillStyle = fill ?? fills.primary!;
	ctx.fill();
	if (variant === 'ghost' || variant === 'secondary') {
		ctx.strokeStyle = 'oklch(0.8 0.02 256)';
		ctx.lineWidth = strokeWidthFor(zoom, 1);
		ctx.stroke();
	}
	const label = 'content' in el ? el.content : (el.label ?? 'Button');
	ctx.fillStyle = variant === 'secondary' || variant === 'ghost' ? INK : 'oklch(0.99 0.01 256)';
	ctx.font = `${el.style?.fontWeight ?? 550} ${(el.style?.fontSize ?? 13) / zoom}px var(--font-sans, sans-serif)`;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillText(label, el.x + el.width / 2, el.y + el.height / 2);
}

function drawInput(ctx: CanvasRenderingContext2D, el: Element, zoom: number): void {
	fillStroke(ctx, el, zoom, { fill: 'oklch(1 0 0)', stroke: 'oklch(0.82 0.008 264)', radius: 6 });
	const placeholder = 'placeholder' in el ? el.placeholder : undefined;
	ctx.fillStyle = INK_FAINT;
	ctx.font = `${400} ${13 / zoom}px var(--font-sans, sans-serif)`;
	ctx.textAlign = 'left';
	ctx.textBaseline = 'middle';
	ctx.fillText(placeholder ?? el.label ?? 'Input', el.x + 12 / zoom, el.y + el.height / 2);
}

function drawText(ctx: CanvasRenderingContext2D, el: Element, zoom: number): void {
	const content = 'content' in el ? el.content : (el.label ?? 'Text');
	const role = 'textRole' in el ? el.textRole : 'body';
	const sizes: Record<string, number> = { h1: 28, h2: 22, h3: 18, body: 15, caption: 12, label: 12 };
	const weights: Record<string, number> = { h1: 680, h2: 640, h3: 600, body: 400, caption: 400, label: 600 };
	const size = (el.style?.fontSize ?? sizes[role ?? 'body'] ?? 15) / zoom;
	const weight = el.style?.fontWeight ?? weights[role ?? 'body'] ?? 400;
	ctx.fillStyle = el.style?.fill ?? INK;
	ctx.font = `${weight} ${size}px var(--font-sans, sans-serif)`;
	const align = 'textAlign' in el ? el.textAlign : 'start';
	ctx.textAlign = align === 'center' ? 'center' : align === 'end' ? 'right' : 'left';
	ctx.textBaseline = 'top';
	const tx = align === 'center' ? el.x + el.width / 2 : align === 'end' ? el.x + el.width : el.x;
	wrapText(ctx, content, tx, el.y, el.width, size * 1.35);
}

function wrapText(
	ctx: CanvasRenderingContext2D,
	text: string,
	x: number,
	y: number,
	maxWidth: number,
	lineHeight: number
): void {
	const words = text.split(/\s+/);
	let line = '';
	let cy = y;
	for (const word of words) {
		const test = line ? line + ' ' + word : word;
		if (ctx.measureText(test).width > maxWidth && line) {
			ctx.fillText(line, x, cy);
			line = word;
			cy += lineHeight;
		} else {
			line = test;
		}
	}
	if (line) ctx.fillText(line, x, cy);
}

function drawImage(ctx: CanvasRenderingContext2D, el: Element, zoom: number): void {
	fillStroke(ctx, el, zoom, { fill: 'oklch(0.93 0.006 264)', stroke: 'oklch(0.86 0.006 264)', radius: 6 });
	// Mountains-and-sun placeholder glyph (the universal "image" mark).
	ctx.strokeStyle = INK_FAINT;
	ctx.lineWidth = strokeWidthFor(zoom, 1.5);
	const pad = Math.min(el.width, el.height) * 0.22;
	ctx.beginPath();
	ctx.arc(el.x + el.width * 0.32, el.y + pad + 4 / zoom, Math.min(el.width, el.height) * 0.08, 0, Math.PI * 2);
	ctx.stroke();
	ctx.beginPath();
	ctx.moveTo(el.x + pad, el.y + el.height - pad);
	ctx.lineTo(el.x + el.width * 0.42, el.y + el.height * 0.52);
	ctx.lineTo(el.x + el.width * 0.6, el.y + el.height - pad * 1.4);
	ctx.lineTo(el.x + el.width * 0.74, el.y + el.height * 0.62);
	ctx.lineTo(el.x + el.width - pad, el.y + el.height - pad);
	ctx.stroke();
}

function drawTable(ctx: CanvasRenderingContext2D, el: Element, zoom: number): void {
	fillStroke(ctx, el, zoom, { fill: 'oklch(1 0 0)', stroke: 'oklch(0.9 0.005 264)', radius: 6 });
	const cols = 'columns' in el && el.columns ? el.columns.length : 3;
	const headerH = 28 / zoom;
	// Header band
	roundRect(ctx, el.x, el.y, el.width, headerH, el.style?.radius ?? 6);
	ctx.fillStyle = 'oklch(0.965 0.004 110)';
	ctx.fill();
	ctx.strokeStyle = 'oklch(0.9 0.005 264)';
	ctx.lineWidth = strokeWidthFor(zoom, 1);
	// Column separators + header labels
	const colW = el.width / cols;
	ctx.fillStyle = INK_SOFT;
	ctx.font = `${600} ${11 / zoom}px var(--font-sans, sans-serif)`;
	ctx.textBaseline = 'middle';
	ctx.textAlign = 'left';
	for (let c = 0; c < cols; c++) {
		const cx = el.x + c * colW;
		if (c > 0) {
			ctx.beginPath();
			ctx.moveTo(cx, el.y);
			ctx.lineTo(cx, el.y + el.height);
			ctx.stroke();
		}
		const colName = 'columns' in el && el.columns?.[c] ? el.columns[c]! : `Col ${c + 1}`;
		ctx.fillText(colName, cx + 8 / zoom, el.y + headerH / 2);
	}
	// Row separators
	const rows = 'rowCountHint' in el && el.rowCountHint ? el.rowCountHint : 5;
	const rowH = (el.height - headerH) / Math.max(1, rows);
	ctx.strokeStyle = 'oklch(0.93 0.005 264)';
	for (let r = 1; r <= rows; r++) {
		const ry = el.y + headerH + r * rowH;
		if (ry > el.y + el.height - 0.5) break;
		ctx.beginPath();
		ctx.moveTo(el.x, ry);
		ctx.lineTo(el.x + el.width, ry);
		ctx.stroke();
	}
}

function drawChart(ctx: CanvasRenderingContext2D, el: Element, zoom: number): void {
	fillStroke(ctx, el, zoom, { fill: 'oklch(1 0 0)', stroke: 'oklch(0.9 0.005 264)', radius: 6 });
	const kind = 'chartKind' in el ? el.chartKind : 'line';
	const pad = 16 / zoom;
	const ix = el.x + pad;
	const iy = el.y + pad;
	const iw = el.width - pad * 2;
	const ih = el.height - pad * 2;
	ctx.save();
	ctx.strokeStyle = 'oklch(0.88 0.006 264)';
	ctx.lineWidth = strokeWidthFor(zoom, 1);
	// axes
	ctx.beginPath();
	ctx.moveTo(ix, iy);
	ctx.lineTo(ix, iy + ih);
	ctx.lineTo(ix + iw, iy + ih);
	ctx.stroke();
	ctx.strokeStyle = ACCENT;
	ctx.fillStyle = 'oklch(0.55 0.17 264 / 0.16)';
	ctx.lineWidth = strokeWidthFor(zoom, 1.5);
	if (kind === 'bar') {
		const n = 6;
		const bw = (iw / n) * 0.6;
		for (let i = 0; i < n; i++) {
			const h = ih * (0.3 + 0.6 * Math.abs(Math.sin(i * 1.2)));
			const bx = ix + (iw / n) * i + (iw / n - bw) / 2;
			ctx.fillStyle = ACCENT;
			ctx.fillRect(bx, iy + ih - h, bw, h);
		}
	} else if (kind === 'pie' || kind === 'donut') {
		const cx = ix + iw / 2;
		const cy = iy + ih / 2;
		const r = Math.min(iw, ih) / 2;
		const slices = [0.4, 0.3, 0.2, 0.1];
		let a0 = -Math.PI / 2;
		const cols = ['oklch(0.55 0.17 264)', 'oklch(0.68 0.13 200)', 'oklch(0.74 0.15 75)', 'oklch(0.62 0.2 16)'];
		slices.forEach((s, i) => {
			const a1 = a0 + s * Math.PI * 2;
			ctx.beginPath();
			ctx.moveTo(cx, cy);
			ctx.arc(cx, cy, r, a0, a1);
			ctx.closePath();
			ctx.fillStyle = cols[i] ?? ACCENT;
			ctx.fill();
			a0 = a1;
		});
		if (kind === 'donut') {
			ctx.beginPath();
			ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2);
			ctx.fillStyle = 'oklch(1 0 0)';
			ctx.fill();
		}
	} else {
		// line / area / scatter
		const pts: Vec2[] = [];
		const n = 7;
		for (let i = 0; i < n; i++) {
			pts.push({
				x: ix + (iw / (n - 1)) * i,
				y: iy + ih - ih * (0.25 + 0.55 * Math.abs(Math.sin(i * 0.9 + 0.5)))
			});
		}
		if (kind === 'area') {
			ctx.beginPath();
			ctx.moveTo(pts[0]!.x, iy + ih);
			for (const p of pts) ctx.lineTo(p.x, p.y);
			ctx.lineTo(pts[pts.length - 1]!.x, iy + ih);
			ctx.closePath();
			ctx.fillStyle = 'oklch(0.55 0.17 264 / 0.14)';
			ctx.fill();
		}
		if (kind === 'scatter') {
			ctx.fillStyle = ACCENT;
			for (const p of pts) {
				ctx.beginPath();
				ctx.arc(p.x, p.y, 3 / zoom, 0, Math.PI * 2);
				ctx.fill();
			}
		} else {
			ctx.beginPath();
			pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
			ctx.strokeStyle = ACCENT;
			ctx.stroke();
		}
	}
	ctx.restore();
}

function drawList(ctx: CanvasRenderingContext2D, el: Element, zoom: number): void {
	fillStroke(ctx, el, zoom, { stroke: 'oklch(0.9 0.005 264)', radius: 6 });
	const n = 'itemCountHint' in el && el.itemCountHint ? el.itemCountHint : 4;
	const ordered = 'ordered' in el ? el.ordered : false;
	const pad = 12 / zoom;
	const rowH = Math.min(28 / zoom, (el.height - pad * 2) / Math.max(1, n));
	ctx.fillStyle = INK_FAINT;
	ctx.font = `${400} ${12 / zoom}px var(--font-sans, sans-serif)`;
	ctx.textBaseline = 'middle';
	ctx.textAlign = 'left';
	for (let i = 0; i < n; i++) {
		const y = el.y + pad + i * rowH + rowH / 2;
		if (y > el.y + el.height - pad) break;
		if (ordered) {
			ctx.fillText(`${i + 1}.`, el.x + pad, y);
		} else {
			ctx.beginPath();
			ctx.arc(el.x + pad + 3 / zoom, y, 2.5 / zoom, 0, Math.PI * 2);
			ctx.fill();
		}
		ctx.fillStyle = 'oklch(0.86 0.006 264)';
		roundRect(ctx, el.x + pad + 18 / zoom, y - 5 / zoom, el.width - pad * 2 - 18 / zoom, 10 / zoom, 5 / zoom);
		ctx.fill();
		ctx.fillStyle = INK_FAINT;
	}
}

function drawTabs(ctx: CanvasRenderingContext2D, el: Element, zoom: number): void {
	const tabs = 'tabs' in el && el.tabs ? el.tabs : ['Tab 1', 'Tab 2'];
	const tabH = 32 / zoom;
	// Tab bar
	ctx.fillStyle = INK_SOFT;
	ctx.font = `${550} ${12 / zoom}px var(--font-sans, sans-serif)`;
	ctx.textBaseline = 'middle';
	ctx.textAlign = 'left';
	let tx = el.x;
	tabs.forEach((t, i) => {
		const w = Math.max(ctx.measureText(t).width + 24 / zoom, 56 / zoom);
		if (i === 0) {
			ctx.strokeStyle = ACCENT;
			ctx.lineWidth = strokeWidthFor(zoom, 2);
			ctx.beginPath();
			ctx.moveTo(tx, el.y + tabH);
			ctx.lineTo(tx + w, el.y + tabH);
			ctx.stroke();
			ctx.fillStyle = ACCENT;
		} else {
			ctx.fillStyle = INK_FAINT;
		}
		ctx.fillText(t, tx + 12 / zoom, el.y + tabH / 2);
		tx += w;
	});
	// Panel
	ctx.strokeStyle = 'oklch(0.9 0.005 264)';
	ctx.lineWidth = strokeWidthFor(zoom, 1);
	roundRect(ctx, el.x, el.y + tabH, el.width, el.height - tabH, el.style?.radius ?? 6);
	ctx.stroke();
}

function drawModal(ctx: CanvasRenderingContext2D, el: Element, zoom: number): void {
	ctx.save();
	ctx.shadowColor = 'oklch(0.2 0.02 264 / 0.18)';
	ctx.shadowBlur = 24 / zoom;
	ctx.shadowOffsetY = 8 / zoom;
	fillStroke(ctx, el, zoom, { fill: 'oklch(1 0 0)', stroke: 'oklch(0.86 0.006 264)', radius: 10 });
	ctx.restore();
	const title = 'title' in el ? el.title : (el.label ?? 'Modal');
	ctx.fillStyle = INK;
	ctx.font = `${640} ${15 / zoom}px var(--font-sans, sans-serif)`;
	ctx.textBaseline = 'top';
	ctx.textAlign = 'left';
	ctx.fillText(title ?? 'Modal', el.x + 24 / zoom, el.y + 20 / zoom);
	// close glyph
	ctx.strokeStyle = INK_FAINT;
	ctx.lineWidth = strokeWidthFor(zoom, 1.5);
	const cxx = el.x + el.width - 24 / zoom;
	const cyy = el.y + 26 / zoom;
	const s = 5 / zoom;
	ctx.beginPath();
	ctx.moveTo(cxx - s, cyy - s);
	ctx.lineTo(cxx + s, cyy + s);
	ctx.moveTo(cxx + s, cyy - s);
	ctx.lineTo(cxx - s, cyy + s);
	ctx.stroke();
}

function drawIcon(ctx: CanvasRenderingContext2D, el: Element, zoom: number): void {
	if (!('svgPath' in el) || !el.svgPath) {
		// Empty icon placeholder.
		fillStroke(ctx, el, zoom, { stroke: 'oklch(0.8 0.01 264)', radius: 4 });
		return;
	}
	const vb = parseViewBox('viewBox' in el ? el.viewBox : '0 0 256 256');
	ctx.save();
	ctx.translate(el.x, el.y);
	ctx.scale(el.width / vb.w, el.height / vb.h);
	ctx.translate(-vb.x, -vb.y);
	ctx.fillStyle = el.style?.fill ?? INK;
	try {
		const path = new Path2D(el.svgPath);
		ctx.fill(path);
	} catch {
		// Malformed path data — skip silently rather than throw in the draw loop.
	}
	ctx.restore();
}

function parseViewBox(vb: string): { x: number; y: number; w: number; h: number } {
	const parts = vb.trim().split(/\s+/).map(Number);
	if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) {
		return { x: parts[0]!, y: parts[1]!, w: parts[2]!, h: parts[3]! };
	}
	return { x: 0, y: 0, w: 256, h: 256 };
}

function drawDivider(ctx: CanvasRenderingContext2D, el: Element, zoom: number): void {
	ctx.strokeStyle = el.style?.stroke ?? 'oklch(0.84 0.008 264)';
	// Thickness comes from the chosen stroke-weight bucket (thin/bold/extra → 1/2/4 px), kept crisp
	// in screen space — exactly like every other shape. It is NEVER derived from the bbox size; a
	// divider is a 1-D line, so its cross-axis extent is just hit-area, not visual weight.
	ctx.lineWidth = userStrokeWidth(el, zoom, 1.5);
	applyDash(ctx, el, zoom);
	ctx.lineCap = 'round';
	// Orientation: explicit if set, else inferred from the longer axis (a vertical box is a vertical
	// line). This makes a divider drawn by dragging downward render vertically.
	const orientation =
		'orientation' in el && el.orientation ? el.orientation : el.height > el.width ? 'vertical' : 'horizontal';
	ctx.beginPath();
	if (orientation === 'vertical') {
		const cx = el.x + el.width / 2;
		ctx.moveTo(cx, el.y);
		ctx.lineTo(cx, el.y + el.height);
	} else {
		const cy = el.y + el.height / 2;
		ctx.moveTo(el.x, cy);
		ctx.lineTo(el.x + el.width, cy);
	}
	ctx.stroke();
	ctx.setLineDash([]);
}

// ---- overlays --------------------------------------------------------------------------------

function drawDropTarget(ctx: CanvasRenderingContext2D, el: Element, zoom: number): void {
	ctx.save();
	const c = bboxCenter(el);
	if (el.rotation !== 0) {
		ctx.translate(c.x, c.y);
		ctx.rotate(el.rotation);
		ctx.translate(-c.x, -c.y);
	}
	roundRect(ctx, el.x, el.y, el.width, el.height, el.style?.radius ?? 6);
	ctx.fillStyle = 'oklch(0.55 0.17 264 / 0.09)';
	ctx.fill();
	ctx.strokeStyle = ACCENT;
	ctx.lineWidth = strokeWidthFor(zoom, 2);
	ctx.setLineDash([4 / zoom, 3 / zoom]);
	ctx.stroke();
	ctx.setLineDash([]);
	ctx.restore();
}

function drawSelection(input: RenderInput): void {
	const { ctx, zoom, selection, ordered, soleSelected } = input;
	if (selection.size === 0) return;

	// Per-element oriented outlines (thin accent) for every selected element. The outline is OUTSET
	// by a few screen px so it sits OUTSIDE the element's own border — otherwise it would paint over
	// the element's stroke and hide stroke-color changes while selected.
	ctx.strokeStyle = ACCENT;
	ctx.lineWidth = strokeWidthFor(zoom, 1.5);
	const pad = 3 / zoom; // outset in world units, constant on screen
	for (const el of ordered) {
		if (!selection.has(el.id)) continue;
		const grown = {
			x: el.x - pad,
			y: el.y - pad,
			width: el.width + pad * 2,
			height: el.height + pad * 2
		};
		const corners = orientedCorners(grown, el.rotation);
		ctx.beginPath();
		corners.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
		ctx.closePath();
		ctx.stroke();
	}

	// The transform frame: for a single element, the (possibly rotated) box; for a multi-select,
	// the axis-aligned union bounds. A faint frame plus the handle set passed in by the editor.
	const handles = input.handles;
	if (handles.length === 0) return;

	// For a single element the outset per-element outline above already IS the frame. Only draw the
	// union-bounds rectangle for a multi-selection, and outset it so it never paints over borders.
	if (!soleSelected) {
		const b = input.selectionBounds;
		if (b) {
			ctx.strokeStyle = ACCENT;
			ctx.lineWidth = strokeWidthFor(zoom, 1);
			ctx.strokeRect(b.x - pad, b.y - pad, b.width + pad * 2, b.height + pad * 2);
		}
	}

	// Connect the rotate handle to the frame's top edge with a short stalk.
	const rotateHandle = handles.find((h) => h.kind === 'rotate');
	const topMid = handles.find((h) => h.kind === 'n');
	if (rotateHandle && topMid) {
		ctx.strokeStyle = ACCENT;
		ctx.lineWidth = strokeWidthFor(zoom, 1);
		ctx.beginPath();
		ctx.moveTo(topMid.world.x, topMid.world.y);
		ctx.lineTo(rotateHandle.world.x, rotateHandle.world.y);
		ctx.stroke();
	}

	const hs = input.handleSizeWorld;
	for (const h of handles) {
		if (h.kind === 'rotate') {
			ctx.beginPath();
			ctx.arc(h.world.x, h.world.y, hs * 0.62, 0, Math.PI * 2);
			ctx.fillStyle = 'oklch(1 0 0)';
			ctx.fill();
			ctx.strokeStyle = ACCENT;
			ctx.lineWidth = strokeWidthFor(zoom, 1.25);
			ctx.stroke();
		} else {
			ctx.fillStyle = 'oklch(1 0 0)';
			ctx.strokeStyle = ACCENT;
			ctx.lineWidth = strokeWidthFor(zoom, 1.25);
			ctx.beginPath();
			ctx.rect(h.world.x - hs / 2, h.world.y - hs / 2, hs, hs);
			ctx.fill();
			ctx.stroke();
		}
	}
}

function drawGuides(input: RenderInput): void {
	const { ctx, zoom, guides } = input;
	if (guides.length === 0) return;
	ctx.save();
	ctx.strokeStyle = GUIDE;
	ctx.lineWidth = strokeWidthFor(zoom, 1);
	for (const g of guides) {
		ctx.beginPath();
		if (g.axis === 'x') {
			ctx.moveTo(g.position, g.from);
			ctx.lineTo(g.position, g.to);
		} else {
			ctx.moveTo(g.from, g.position);
			ctx.lineTo(g.to, g.position);
		}
		if (g.kind === 'distribute') ctx.setLineDash([3 / zoom, 3 / zoom]);
		else ctx.setLineDash([]);
		ctx.stroke();
		// end caps
		const cap = 3 / zoom;
		ctx.setLineDash([]);
		if (g.axis === 'x') {
			ctx.beginPath();
			ctx.moveTo(g.position - cap, g.from);
			ctx.lineTo(g.position + cap, g.from);
			ctx.moveTo(g.position - cap, g.to);
			ctx.lineTo(g.position + cap, g.to);
			ctx.stroke();
		} else {
			ctx.beginPath();
			ctx.moveTo(g.from, g.position - cap);
			ctx.lineTo(g.from, g.position + cap);
			ctx.moveTo(g.to, g.position - cap);
			ctx.lineTo(g.to, g.position + cap);
			ctx.stroke();
		}
	}
	ctx.restore();
}

function drawMarquee(input: RenderInput): void {
	const { ctx, zoom, marquee } = input;
	if (!marquee) return;
	ctx.fillStyle = 'oklch(0.55 0.17 264 / 0.09)';
	ctx.strokeStyle = ACCENT;
	ctx.lineWidth = strokeWidthFor(zoom, 1);
	ctx.fillRect(marquee.x, marquee.y, marquee.width, marquee.height);
	ctx.strokeRect(marquee.x, marquee.y, marquee.width, marquee.height);
}
