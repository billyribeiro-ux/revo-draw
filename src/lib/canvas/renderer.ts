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
import { bboxCenter, orientedCorners, type BBox, type Matrix, type Vec2 } from './geometry.ts';
import type { Handle } from './hit-test.ts';
import type { SnapGuide } from './snapping.ts';
import type { Element, ElementId, ElementStyle, IconRef } from '../elements/types.ts';

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
	/** The infinite-canvas backdrop fill. Token-derived per shell (white for the Excalidraw web
	 * build, warm paper for the Tauri desktop build). */
	bgColor: string;
	/** Selection box + handle + marquee color. Token-derived per shell (#6965db on web). */
	selectionColor: string;
	/** Whether the editor is in dark or light surface — drives grid contrast. */
	gridColor: string;
	gridStrongColor: string;
	/** When false, the dot-grid is suppressed (Excalidraw gridMode off, ⌘'). */
	gridVisible: boolean;
}

const ACCENT = 'oklch(0.55 0.17 264)';
const GUIDE = 'oklch(0.62 0.23 16)';
const INK = 'oklch(0.24 0.014 264)';
const INK_SOFT = 'oklch(0.5 0.013 264)';
const INK_FAINT = 'oklch(0.7 0.01 264)';

/**
 * Resolve an icon glyph's ink color. An icon is a monochrome glyph: its visible color is its INK,
 * not a background fill. The Style panel's prominent "Stroke" swatch is what users reach for to
 * recolor line-art, and Excalidraw colors glyph-like elements (freedraw) by `strokeColor`. So the
 * order is stroke → fill → default INK: the Stroke control recolors an icon, while existing docs
 * (whose icon color lives in `fill`) and the per-type default fill keep rendering unchanged.
 */
export function iconInk(style: ElementStyle | undefined): string {
	return style?.stroke ?? style?.fill ?? INK;
}

export function render(input: RenderInput): void {
	const { ctx, dpr, cssWidth, cssHeight } = input;

	// Reset to device space and clear.
	ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
	ctx.clearRect(0, 0, cssWidth, cssHeight);

	// Backdrop (the infinite canvas surface). Token-derived per shell (white in the web build).
	ctx.fillStyle = input.bgColor;
	ctx.fillRect(0, 0, cssWidth, cssHeight);

	if (input.gridVisible) drawGrid(input);

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
		case 'svg':
			drawSvg(ctx, el, zoom);
			break;
		case 'checkbox':
			drawCheckbox(ctx, el, zoom);
			break;
		case 'radio':
			drawRadio(ctx, el, zoom);
			break;
		case 'toggle':
			drawToggle(ctx, el, zoom);
			break;
		case 'slider':
			drawSlider(ctx, el, zoom);
			break;
		case 'dropdown':
			drawDropdown(ctx, el, zoom);
			break;
		case 'stat-card':
			drawStatCard(ctx, el, zoom);
			break;
		case 'badge':
			drawBadge(ctx, el, zoom);
			break;
		case 'progress':
			drawProgress(ctx, el, zoom);
			break;
		case 'avatar':
			drawAvatar(ctx, el, zoom);
			break;
		case 'alert':
			drawAlert(ctx, el, zoom);
			break;
		case 'tooltip':
			drawTooltip(ctx, el, zoom);
			break;
		case 'breadcrumb':
			drawBreadcrumb(ctx, el, zoom);
			break;
		case 'pagination':
			drawPagination(ctx, el, zoom);
			break;
		case 'stepper':
			drawStepper(ctx, el, zoom);
			break;
		case 'accordion':
			drawAccordion(ctx, el, zoom);
			break;
		case 'section-header':
			drawSectionHeader(ctx, el, zoom);
			break;
		case 'hero':
			drawHero(ctx, el, zoom);
			break;
		case 'feature-grid':
			drawFeatureGrid(ctx, el, zoom);
			break;
		case 'testimonial':
			drawTestimonial(ctx, el, zoom);
			break;
		case 'cta-section':
			drawCtaSection(ctx, el, zoom);
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
	if (el.icon) {
		drawEmbeddedIcon(ctx, el.icon, el.x + 8 / zoom, el.y + 8 / zoom, 14 / zoom, zoom, INK_FAINT);
	}
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
	if (el.icon) {
		drawEmbeddedIcon(ctx, el.icon, el.x + 8 / zoom, el.y + 8 / zoom, 14 / zoom, zoom, INK_FAINT);
	}
}

function drawCard(ctx: CanvasRenderingContext2D, el: Element, zoom: number): void {
	ctx.save();
	ctx.shadowColor = 'oklch(0.2 0.02 264 / 0.06)';
	ctx.shadowBlur = 8 / zoom;
	ctx.shadowOffsetY = 2 / zoom;
	fillStroke(ctx, el, zoom, { fill: 'oklch(1 0 0)', stroke: 'oklch(0.9 0.005 264)', radius: 8 });
	ctx.restore();
	if (el.icon) {
		drawEmbeddedIcon(ctx, el.icon, el.x + 14 / zoom, el.y + 14 / zoom, 18 / zoom, zoom, INK);
	}
	if (el.label) {
		ctx.fillStyle = INK;
		ctx.font = `${600} ${13 / zoom}px var(--font-sans, sans-serif)`;
		ctx.textBaseline = 'top';
		ctx.textAlign = 'left';
		const labelX = el.icon ? el.x + 16 / zoom + 22 / zoom : el.x + 16 / zoom;
		ctx.fillText(el.label, labelX, el.y + 14 / zoom);
		// a faint value line beneath the title
		ctx.fillStyle = INK_FAINT;
		ctx.fillRect(el.x + 16 / zoom, el.y + 40 / zoom, Math.min(el.width - 32 / zoom, 80 / zoom), 18 / zoom);
	}
}

function drawNav(ctx: CanvasRenderingContext2D, el: Element, zoom: number): void {
	fillStroke(ctx, el, zoom, { fill: 'oklch(0.99 0.002 264)', stroke: 'oklch(0.9 0.005 264)', radius: el.style?.radius ?? 0 });
	// Brand dot (or embedded icon, when set) + a few nav pills.
	const cy = el.y + el.height / 2;
	if (el.icon) {
		drawEmbeddedIcon(
			ctx,
			el.icon,
			el.x + 14 / zoom - 8 / zoom,
			cy - 8 / zoom,
			16 / zoom,
			zoom,
			ACCENT
		);
	} else {
		ctx.fillStyle = ACCENT;
		ctx.beginPath();
		ctx.arc(el.x + 18 / zoom, cy, 5 / zoom, 0, Math.PI * 2);
		ctx.fill();
	}
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
		if (i === 0 && el.icon) {
			drawEmbeddedIcon(
				ctx,
				el.icon,
				el.x + pad + 4 / zoom - 7 / zoom,
				y - 7 / zoom,
				14 / zoom,
				zoom,
				INK_FAINT
			);
			ctx.fillStyle = INK_FAINT;
		} else {
			ctx.beginPath();
			ctx.arc(el.x + pad + 6 / zoom, y + 6 / zoom, 5 / zoom, 0, Math.PI * 2);
			ctx.fill();
		}
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
	const label = el.type === 'button' ? el.content : (el.label ?? 'Button');
	const textColor = variant === 'secondary' || variant === 'ghost' ? INK : 'oklch(0.99 0.01 256)';
	// Resolve embedded icon: prefer the unified BaseElement.icon; fall back to legacy
	// ButtonElement.iconName/iconSvgPath fields (synthesized into an IconRef on the fly).
	let buttonIcon: IconRef | null = el.icon ?? null;
	if (!buttonIcon && 'iconName' in el && el.iconName && 'iconSvgPath' in el && el.iconSvgPath) {
		buttonIcon = { name: el.iconName, svgPath: el.iconSvgPath, viewBox: '0 0 256 256' };
	}
	if (buttonIcon) {
		drawEmbeddedIcon(
			ctx,
			buttonIcon,
			el.x + 12 / zoom,
			el.y + el.height / 2 - 7 / zoom,
			14 / zoom,
			zoom,
			textColor
		);
	}
	ctx.fillStyle = textColor;
	ctx.font = `${el.style?.fontWeight ?? 550} ${(el.style?.fontSize ?? 13) / zoom}px var(--font-sans, sans-serif)`;
	ctx.textBaseline = 'middle';
	if (buttonIcon) {
		// Re-center the label inside the area right of the icon.
		const iconRight = 12 / zoom + 14 / zoom + 6 / zoom; // pad + icon + gap
		ctx.textAlign = 'center';
		ctx.fillText(label, el.x + iconRight + (el.width - iconRight) / 2, el.y + el.height / 2);
	} else {
		ctx.textAlign = 'center';
		ctx.fillText(label, el.x + el.width / 2, el.y + el.height / 2);
	}
}

function drawInput(ctx: CanvasRenderingContext2D, el: Element, zoom: number): void {
	fillStroke(ctx, el, zoom, { fill: 'oklch(1 0 0)', stroke: 'oklch(0.82 0.008 264)', radius: 6 });
	if (el.icon) {
		drawEmbeddedIcon(
			ctx,
			el.icon,
			el.x + 12 / zoom,
			el.y + el.height / 2 - 8 / zoom,
			16 / zoom,
			zoom,
			INK_FAINT
		);
	}
	const placeholder = 'placeholder' in el ? el.placeholder : undefined;
	ctx.fillStyle = INK_FAINT;
	ctx.font = `${400} ${13 / zoom}px var(--font-sans, sans-serif)`;
	ctx.textAlign = 'left';
	ctx.textBaseline = 'middle';
	const textX = el.icon ? el.x + 12 / zoom + 28 / zoom : el.x + 12 / zoom;
	ctx.fillText(placeholder ?? el.label ?? 'Input', textX, el.y + el.height / 2);
}

function drawText(ctx: CanvasRenderingContext2D, el: Element, zoom: number): void {
	const content = el.type === 'text' ? el.content : (el.label ?? 'Text');
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
	if (el.icon) {
		drawEmbeddedIcon(ctx, el.icon, el.x + 8 / zoom, el.y + 8 / zoom, 14 / zoom, zoom, INK_FAINT);
	}
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
	if (el.icon) {
		drawEmbeddedIcon(ctx, el.icon, el.x + 8 / zoom, el.y + 8 / zoom, 14 / zoom, zoom, INK_FAINT);
	}
}

function drawTable(ctx: CanvasRenderingContext2D, el: Element, zoom: number): void {
	fillStroke(ctx, el, zoom, { fill: 'oklch(1 0 0)', stroke: 'oklch(0.9 0.005 264)', radius: 6 });
	const cols = el.type === 'table' && el.columns ? el.columns.length : 3;
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
		const colName = el.type === 'table' && el.columns?.[c] ? el.columns[c]! : `Col ${c + 1}`;
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
	if (el.icon) {
		drawEmbeddedIcon(ctx, el.icon, el.x + 8 / zoom, el.y + 8 / zoom, 14 / zoom, zoom, INK_FAINT);
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
	if (el.icon) {
		drawEmbeddedIcon(ctx, el.icon, el.x + 8 / zoom, el.y + 8 / zoom, 14 / zoom, zoom, INK_FAINT);
	}
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
		if (i === 0 && el.icon) {
			drawEmbeddedIcon(
				ctx,
				el.icon,
				el.x + pad - 5 / zoom,
				y - 6 / zoom,
				12 / zoom,
				zoom,
				INK_FAINT
			);
		} else if (ordered) {
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
			if (el.icon) {
				drawEmbeddedIcon(
					ctx,
					el.icon,
					tx + 8 / zoom,
					el.y + tabH / 2 - 7 / zoom,
					14 / zoom,
					zoom,
					ACCENT
				);
			}
		} else {
			ctx.fillStyle = INK_FAINT;
		}
		const textX = i === 0 && el.icon ? tx + 12 / zoom + 18 / zoom : tx + 12 / zoom;
		ctx.fillText(t, textX, el.y + tabH / 2);
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
	if (el.icon) {
		drawEmbeddedIcon(ctx, el.icon, el.x + 22 / zoom, el.y + 18 / zoom, 16 / zoom, zoom, INK);
	}
	ctx.fillStyle = INK;
	ctx.font = `${640} ${15 / zoom}px var(--font-sans, sans-serif)`;
	ctx.textBaseline = 'top';
	ctx.textAlign = 'left';
	const titleX = el.icon ? el.x + 24 / zoom + 22 / zoom : el.x + 24 / zoom;
	ctx.fillText(title ?? 'Modal', titleX, el.y + 20 / zoom);
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
	ctx.fillStyle = iconInk(el.style);
	try {
		const path = new Path2D(el.svgPath);
		ctx.fill(path);
	} catch {
		// Malformed path data — skip silently rather than throw in the draw loop.
	}
	ctx.restore();
}

function drawSvg(ctx: CanvasRenderingContext2D, el: Element, zoom: number): void {
	if (!('body' in el)) return;
	const body = el.body;
	const viewBox = 'viewBox' in el ? el.viewBox : '0 0 100 100';
	if (!body || body.trim() === '') {
		// Empty SVG body — dashed placeholder rect with a centered "SVG" label.
		ctx.save();
		roundRect(ctx, el.x, el.y, el.width, el.height, 4);
		ctx.strokeStyle = 'oklch(0.8 0.01 264)';
		ctx.lineWidth = strokeWidthFor(zoom, 1);
		ctx.setLineDash([6 / zoom, 4 / zoom]);
		ctx.stroke();
		ctx.setLineDash([]);
		ctx.fillStyle = INK_FAINT;
		ctx.font = `${600} ${12 / zoom}px var(--font-sans, sans-serif)`;
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText('SVG', el.x + el.width / 2, el.y + el.height / 2);
		ctx.restore();
		return;
	}
	// Extract every <path d="..."> from the body and concatenate the `d` strings into one path.
	// The body has been sanitized at the input boundary (RightPanel paste handler) so what we
	// see here is safe to parse for raster purposes — we never inject it back into the DOM.
	const pathRe = /<path\b[^>]*\bd\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
	const dParts: string[] = [];
	let m: RegExpExecArray | null;
	while ((m = pathRe.exec(body)) !== null) {
		const d = m[1] ?? m[2];
		if (d) dParts.push(d);
	}
	if (dParts.length === 0) {
		// No <path d> data extractable — paint a placeholder so the user knows it's there.
		ctx.save();
		roundRect(ctx, el.x, el.y, el.width, el.height, 4);
		ctx.strokeStyle = 'oklch(0.8 0.01 264)';
		ctx.lineWidth = strokeWidthFor(zoom, 1);
		ctx.setLineDash([6 / zoom, 4 / zoom]);
		ctx.stroke();
		ctx.setLineDash([]);
		ctx.restore();
		return;
	}
	const vb = parseViewBox(viewBox);
	ctx.save();
	ctx.translate(el.x, el.y);
	ctx.scale(el.width / vb.w, el.height / vb.h);
	ctx.translate(-vb.x, -vb.y);
	ctx.fillStyle = el.style?.fill ?? INK;
	try {
		const path = new Path2D(dParts.join(' '));
		ctx.fill(path);
	} catch {
		// Malformed path data — skip silently rather than throw in the draw loop.
	}
	ctx.restore();
	if (el.icon) {
		drawEmbeddedIcon(ctx, el.icon, el.x + 8 / zoom, el.y + 8 / zoom, 14 / zoom, zoom, INK_FAINT);
	}
}

/** Paint an embedded icon ref at a world point. Used by every element type to render its
 * BaseElement.icon when present. Mirrors `drawIcon` but for the composable icon-as-property
 * case rather than a standalone IconElement. Below ~0.5 screen px the icon is skipped. */
function drawEmbeddedIcon(
	ctx: CanvasRenderingContext2D,
	icon: IconRef,
	x: number,
	y: number,
	size: number,
	zoom: number,
	color: string
): void {
	if (size * zoom < 0.5) return; // sub-pixel, skip
	const vb = parseViewBox(icon.viewBox);
	ctx.save();
	ctx.translate(x, y);
	ctx.scale(size / vb.w, size / vb.h);
	ctx.translate(-vb.x, -vb.y);
	ctx.fillStyle = color;
	try {
		const path = new Path2D(icon.svgPath);
		ctx.fill(path);
	} catch {
		// Malformed path data — skip silently.
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
	if (el.icon) {
		drawEmbeddedIcon(ctx, el.icon, el.x + 8 / zoom, el.y + 8 / zoom, 14 / zoom, zoom, INK_FAINT);
	}
}

// ---- new semantic primitives ------------------------------------------------------------------

const VARIANT_COLORS: Record<string, { fill: string; stroke: string; ink: string }> = {
	neutral: { fill: 'oklch(0.92 0.006 264)', stroke: 'oklch(0.78 0.01 264)', ink: 'oklch(0.3 0.014 264)' },
	info: { fill: 'oklch(0.93 0.05 230)', stroke: 'oklch(0.6 0.14 230)', ink: 'oklch(0.35 0.12 230)' },
	success: { fill: 'oklch(0.93 0.08 145)', stroke: 'oklch(0.55 0.16 145)', ink: 'oklch(0.32 0.14 145)' },
	warning: { fill: 'oklch(0.94 0.09 80)', stroke: 'oklch(0.65 0.15 80)', ink: 'oklch(0.4 0.13 80)' },
	danger: { fill: 'oklch(0.93 0.07 25)', stroke: 'oklch(0.6 0.2 25)', ink: 'oklch(0.4 0.18 25)' }
};

function drawCheckbox(ctx: CanvasRenderingContext2D, el: Element, zoom: number): void {
	const boxSize = Math.min(el.width, el.height, 18 / zoom * zoom); // clamp visual square to ~el size
	const box = Math.min(el.width, el.height);
	const checked = 'checked' in el ? el.checked : false;
	const labelText = 'labelText' in el ? el.labelText : undefined;
	const radius = el.style?.radius ?? 3;
	roundRect(ctx, el.x, el.y, box, box, radius / zoom);
	if (checked) {
		ctx.fillStyle = el.style?.fill && el.style.fill !== 'oklch(1 0 0)' ? el.style.fill : ACCENT;
		ctx.fill();
	} else if (hasFill(el.style?.fill)) {
		ctx.fillStyle = el.style.fill;
		ctx.fill();
	} else {
		ctx.fillStyle = 'oklch(1 0 0)';
		ctx.fill();
	}
	ctx.strokeStyle = hasFill(el.style?.stroke) ? el.style.stroke : 'oklch(0.7 0.01 264)';
	ctx.lineWidth = userStrokeWidth(el, zoom, 1);
	ctx.stroke();
	if (checked) {
		ctx.strokeStyle = 'oklch(0.99 0.01 256)';
		ctx.lineWidth = strokeWidthFor(zoom, 2);
		ctx.lineCap = 'round';
		ctx.lineJoin = 'round';
		ctx.beginPath();
		ctx.moveTo(el.x + box * 0.22, el.y + box * 0.52);
		ctx.lineTo(el.x + box * 0.44, el.y + box * 0.72);
		ctx.lineTo(el.x + box * 0.78, el.y + box * 0.3);
		ctx.stroke();
	}
	if (labelText) {
		ctx.fillStyle = INK;
		ctx.font = `${400} ${13 / zoom}px var(--font-sans, sans-serif)`;
		ctx.textBaseline = 'middle';
		ctx.textAlign = 'left';
		ctx.fillText(labelText, el.x + box + 8 / zoom, el.y + box / 2);
	}
	void boxSize;
}

function drawRadio(ctx: CanvasRenderingContext2D, el: Element, zoom: number): void {
	const box = Math.min(el.width, el.height);
	const selected = 'selected' in el ? el.selected : false;
	const labelText = 'labelText' in el ? el.labelText : undefined;
	const cx = el.x + box / 2;
	const cy = el.y + box / 2;
	const r = box / 2;
	ctx.beginPath();
	ctx.arc(cx, cy, r, 0, Math.PI * 2);
	ctx.fillStyle = hasFill(el.style?.fill) ? el.style.fill : 'oklch(1 0 0)';
	ctx.fill();
	ctx.strokeStyle = hasFill(el.style?.stroke) ? el.style.stroke : 'oklch(0.7 0.01 264)';
	ctx.lineWidth = userStrokeWidth(el, zoom, 1);
	ctx.stroke();
	if (selected) {
		ctx.beginPath();
		ctx.arc(cx, cy, r * 0.5, 0, Math.PI * 2);
		ctx.fillStyle = ACCENT;
		ctx.fill();
	}
	if (labelText) {
		ctx.fillStyle = INK;
		ctx.font = `${400} ${13 / zoom}px var(--font-sans, sans-serif)`;
		ctx.textBaseline = 'middle';
		ctx.textAlign = 'left';
		ctx.fillText(labelText, el.x + box + 8 / zoom, cy);
	}
}

function drawToggle(ctx: CanvasRenderingContext2D, el: Element, zoom: number): void {
	const on = 'on' in el ? el.on : false;
	const labelText = 'labelText' in el ? el.labelText : undefined;
	const w = el.width;
	const h = el.height;
	const r = h / 2;
	roundRect(ctx, el.x, el.y, w, h, r);
	ctx.fillStyle = on ? ACCENT : (hasFill(el.style?.fill) ? el.style.fill : 'oklch(0.85 0.008 264)');
	ctx.fill();
	const knobR = r - 2 / zoom;
	const knobX = on ? el.x + w - r : el.x + r;
	ctx.beginPath();
	ctx.arc(knobX, el.y + r, knobR, 0, Math.PI * 2);
	ctx.fillStyle = 'oklch(1 0 0)';
	ctx.fill();
	ctx.strokeStyle = 'oklch(0.7 0.01 264 / 0.3)';
	ctx.lineWidth = strokeWidthFor(zoom, 1);
	ctx.stroke();
	if (labelText) {
		ctx.fillStyle = INK;
		ctx.font = `${400} ${13 / zoom}px var(--font-sans, sans-serif)`;
		ctx.textBaseline = 'middle';
		ctx.textAlign = 'left';
		ctx.fillText(labelText, el.x + w + 8 / zoom, el.y + h / 2);
	}
}

function drawSlider(ctx: CanvasRenderingContext2D, el: Element, zoom: number): void {
	const value = 'value' in el && typeof el.value === 'number' ? el.value : 50;
	const min = 'min' in el && typeof el.min === 'number' ? el.min : 0;
	const max = 'max' in el && typeof el.max === 'number' ? el.max : 100;
	const range = Math.max(1, max - min);
	const t = Math.max(0, Math.min(1, (value - min) / range));
	const cy = el.y + el.height / 2;
	const trackH = 4 / zoom;
	// Track
	roundRect(ctx, el.x, cy - trackH / 2, el.width, trackH, trackH / 2);
	ctx.fillStyle = hasFill(el.style?.fill) ? el.style.fill : 'oklch(0.88 0.006 264)';
	ctx.fill();
	// Filled portion
	roundRect(ctx, el.x, cy - trackH / 2, el.width * t, trackH, trackH / 2);
	ctx.fillStyle = ACCENT;
	ctx.fill();
	// Thumb
	const thumbX = el.x + el.width * t;
	ctx.beginPath();
	ctx.arc(thumbX, cy, 8 / zoom, 0, Math.PI * 2);
	ctx.fillStyle = 'oklch(1 0 0)';
	ctx.fill();
	ctx.strokeStyle = ACCENT;
	ctx.lineWidth = strokeWidthFor(zoom, 1.5);
	ctx.stroke();
}

function drawDropdown(ctx: CanvasRenderingContext2D, el: Element, zoom: number): void {
	fillStroke(ctx, el, zoom, { fill: 'oklch(1 0 0)', stroke: 'oklch(0.82 0.008 264)', radius: 6 });
	const value = el.type === 'dropdown' ? el.value : undefined;
	const placeholder = el.type === 'dropdown' ? el.placeholder : undefined;
	const text = value ?? placeholder ?? 'Select…';
	if (el.icon) {
		drawEmbeddedIcon(ctx, el.icon, el.x + 12 / zoom, el.y + el.height / 2 - 8 / zoom, 16 / zoom, zoom, INK_FAINT);
	}
	ctx.fillStyle = value ? INK : INK_FAINT;
	ctx.font = `${400} ${13 / zoom}px var(--font-sans, sans-serif)`;
	ctx.textBaseline = 'middle';
	ctx.textAlign = 'left';
	const textX = el.icon ? el.x + 12 / zoom + 22 / zoom : el.x + 12 / zoom;
	ctx.fillText(text, textX, el.y + el.height / 2);
	// Caret
	const cx = el.x + el.width - 14 / zoom;
	const cy = el.y + el.height / 2;
	ctx.strokeStyle = INK_SOFT;
	ctx.lineWidth = strokeWidthFor(zoom, 1.5);
	ctx.lineCap = 'round';
	ctx.lineJoin = 'round';
	ctx.beginPath();
	ctx.moveTo(cx - 4 / zoom, cy - 2 / zoom);
	ctx.lineTo(cx, cy + 3 / zoom);
	ctx.lineTo(cx + 4 / zoom, cy - 2 / zoom);
	ctx.stroke();
}

function drawStatCard(ctx: CanvasRenderingContext2D, el: Element, zoom: number): void {
	ctx.save();
	ctx.shadowColor = 'oklch(0.2 0.02 264 / 0.06)';
	ctx.shadowBlur = 8 / zoom;
	ctx.shadowOffsetY = 2 / zoom;
	fillStroke(ctx, el, zoom, { fill: 'oklch(1 0 0)', stroke: 'oklch(0.9 0.005 264)', radius: 8 });
	ctx.restore();
	const pad = 16 / zoom;
	let yCursor = el.y + pad;
	if (el.icon) {
		drawEmbeddedIcon(ctx, el.icon, el.x + pad, yCursor, 18 / zoom, zoom, ACCENT);
	}
	// Label
	if (el.label) {
		ctx.fillStyle = INK_FAINT;
		ctx.font = `${500} ${12 / zoom}px var(--font-sans, sans-serif)`;
		ctx.textBaseline = 'top';
		ctx.textAlign = 'left';
		const labelY = el.icon ? yCursor + 24 / zoom : yCursor;
		ctx.fillText(el.label, el.x + pad, labelY);
		yCursor = labelY + 18 / zoom;
	} else {
		yCursor += el.icon ? 24 / zoom : 0;
	}
	// Value (big)
	const value = el.type === 'stat-card' ? el.value : undefined;
	if (value) {
		ctx.fillStyle = INK;
		ctx.font = `${680} ${24 / zoom}px var(--font-sans, sans-serif)`;
		ctx.textBaseline = 'top';
		ctx.textAlign = 'left';
		ctx.fillText(value, el.x + pad, yCursor);
	}
	// Trend + delta bottom-right
	const trend = el.type === 'stat-card' ? el.trend : undefined;
	const delta = el.type === 'stat-card' ? el.delta : undefined;
	if (delta) {
		const trendColor = trend === 'up' ? 'oklch(0.55 0.16 145)' : trend === 'down' ? 'oklch(0.6 0.2 25)' : INK_FAINT;
		ctx.fillStyle = trendColor;
		ctx.font = `${600} ${12 / zoom}px var(--font-sans, sans-serif)`;
		ctx.textBaseline = 'bottom';
		ctx.textAlign = 'right';
		const arrow = trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→';
		ctx.fillText(`${arrow} ${delta}`, el.x + el.width - pad, el.y + el.height - pad);
	}
}

function drawBadge(ctx: CanvasRenderingContext2D, el: Element, zoom: number): void {
	const variant = 'variant' in el && el.variant ? el.variant : 'neutral';
	const v = VARIANT_COLORS[variant] ?? VARIANT_COLORS.neutral!;
	const radius = el.style?.radius ?? el.height / 2;
	roundRect(ctx, el.x, el.y, el.width, el.height, radius);
	ctx.fillStyle = hasFill(el.style?.fill) ? el.style.fill : v.fill;
	ctx.fill();
	const content = 'content' in el ? el.content : (el.label ?? 'Badge');
	let textX = el.x + el.width / 2;
	let textAlign: CanvasTextAlign = 'center';
	if (el.icon) {
		const iconSize = el.height * 0.6;
		drawEmbeddedIcon(ctx, el.icon, el.x + 6 / zoom, el.y + (el.height - iconSize) / 2, iconSize, zoom, v.ink);
		textX = el.x + 6 / zoom + iconSize + 4 / zoom;
		textAlign = 'left';
	}
	ctx.fillStyle = v.ink;
	ctx.font = `${el.style?.fontWeight ?? 600} ${(el.style?.fontSize ?? 11) / zoom}px var(--font-sans, sans-serif)`;
	ctx.textBaseline = 'middle';
	ctx.textAlign = textAlign;
	ctx.fillText(content ?? 'Badge', textX, el.y + el.height / 2);
}

function drawProgress(ctx: CanvasRenderingContext2D, el: Element, zoom: number): void {
	const value = 'value' in el && typeof el.value === 'number' ? Math.max(0, Math.min(100, el.value)) : 60;
	const kind = 'kind' in el && el.kind ? el.kind : 'linear';
	const caption = 'caption' in el ? el.caption : undefined;
	if (kind === 'circular') {
		const cx = el.x + el.width / 2;
		const cy = el.y + el.height / 2;
		const r = Math.min(el.width, el.height) / 2 - 4 / zoom;
		ctx.strokeStyle = hasFill(el.style?.fill) ? el.style.fill : 'oklch(0.88 0.006 264)';
		ctx.lineWidth = strokeWidthFor(zoom, 4);
		ctx.lineCap = 'round';
		ctx.beginPath();
		ctx.arc(cx, cy, r, 0, Math.PI * 2);
		ctx.stroke();
		ctx.strokeStyle = ACCENT;
		ctx.beginPath();
		ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + (value / 100) * Math.PI * 2);
		ctx.stroke();
		ctx.fillStyle = INK;
		ctx.font = `${640} ${14 / zoom}px var(--font-sans, sans-serif)`;
		ctx.textBaseline = 'middle';
		ctx.textAlign = 'center';
		ctx.fillText(`${Math.round(value)}%`, cx, cy);
	} else {
		const trackH = Math.min(el.height, 16 / zoom * zoom);
		const h = caption ? Math.min(el.height * 0.5, 12 / zoom) : el.height;
		const radius = el.style?.radius ?? h / 2;
		roundRect(ctx, el.x, el.y, el.width, h, radius);
		ctx.fillStyle = hasFill(el.style?.fill) ? el.style.fill : 'oklch(0.88 0.006 264)';
		ctx.fill();
		roundRect(ctx, el.x, el.y, el.width * (value / 100), h, radius);
		ctx.fillStyle = ACCENT;
		ctx.fill();
		if (caption) {
			ctx.fillStyle = INK_SOFT;
			ctx.font = `${400} ${11 / zoom}px var(--font-sans, sans-serif)`;
			ctx.textBaseline = 'top';
			ctx.textAlign = 'left';
			ctx.fillText(caption, el.x, el.y + h + 4 / zoom);
		}
		void trackH;
	}
}

function drawAvatar(ctx: CanvasRenderingContext2D, el: Element, zoom: number): void {
	const shape = 'shape' in el && el.shape ? el.shape : 'circle';
	const initials = 'initials' in el ? el.initials : undefined;
	const fill = hasFill(el.style?.fill) ? el.style.fill : 'oklch(0.78 0.08 264)';
	if (shape === 'circle') {
		const cx = el.x + el.width / 2;
		const cy = el.y + el.height / 2;
		const r = Math.min(el.width, el.height) / 2;
		ctx.beginPath();
		ctx.arc(cx, cy, r, 0, Math.PI * 2);
		ctx.fillStyle = fill;
		ctx.fill();
	} else {
		const radius = el.style?.radius ?? 6;
		roundRect(ctx, el.x, el.y, el.width, el.height, radius);
		ctx.fillStyle = fill;
		ctx.fill();
	}
	if (el.icon) {
		const iconSize = Math.min(el.width, el.height) * 0.55;
		drawEmbeddedIcon(
			ctx,
			el.icon,
			el.x + (el.width - iconSize) / 2,
			el.y + (el.height - iconSize) / 2,
			iconSize,
			zoom,
			'oklch(0.99 0.01 256)'
		);
	} else if (initials) {
		ctx.fillStyle = 'oklch(0.99 0.01 256)';
		const fontSize = Math.min(el.width, el.height) * 0.4;
		ctx.font = `${el.style?.fontWeight ?? 600} ${fontSize}px var(--font-sans, sans-serif)`;
		ctx.textBaseline = 'middle';
		ctx.textAlign = 'center';
		ctx.fillText(initials, el.x + el.width / 2, el.y + el.height / 2);
	}
}

function drawAlert(ctx: CanvasRenderingContext2D, el: Element, zoom: number): void {
	const variant = 'variant' in el && el.variant ? el.variant : 'info';
	const v = VARIANT_COLORS[variant] ?? VARIANT_COLORS.info!;
	const radius = el.style?.radius ?? 8;
	roundRect(ctx, el.x, el.y, el.width, el.height, radius);
	ctx.fillStyle = hasFill(el.style?.fill) ? el.style.fill : v.fill;
	ctx.fill();
	ctx.strokeStyle = hasFill(el.style?.stroke) ? el.style.stroke : v.stroke;
	ctx.lineWidth = userStrokeWidth(el, zoom, 1);
	ctx.stroke();
	// Left accent strip
	ctx.fillStyle = v.stroke;
	ctx.fillRect(el.x, el.y, 4 / zoom, el.height);
	const pad = 16 / zoom;
	let textX = el.x + pad;
	if (el.icon) {
		drawEmbeddedIcon(ctx, el.icon, el.x + pad, el.y + el.height / 2 - 9 / zoom, 18 / zoom, zoom, v.stroke);
		textX = el.x + pad + 24 / zoom;
	}
	const content = 'content' in el ? el.content : (el.label ?? 'Alert message');
	ctx.fillStyle = v.ink;
	ctx.font = `${500} ${13 / zoom}px var(--font-sans, sans-serif)`;
	ctx.textBaseline = 'middle';
	ctx.textAlign = 'left';
	ctx.fillText(content ?? 'Alert', textX, el.y + el.height / 2);
}

function drawTooltip(ctx: CanvasRenderingContext2D, el: Element, zoom: number): void {
	const radius = el.style?.radius ?? 6;
	roundRect(ctx, el.x, el.y, el.width, el.height, radius);
	ctx.fillStyle = hasFill(el.style?.fill) ? el.style.fill : INK;
	ctx.fill();
	// Arrow below
	ctx.beginPath();
	ctx.moveTo(el.x + el.width / 2 - 5 / zoom, el.y + el.height);
	ctx.lineTo(el.x + el.width / 2 + 5 / zoom, el.y + el.height);
	ctx.lineTo(el.x + el.width / 2, el.y + el.height + 5 / zoom);
	ctx.closePath();
	ctx.fillStyle = hasFill(el.style?.fill) ? el.style.fill : INK;
	ctx.fill();
	const content = 'content' in el ? el.content : (el.label ?? 'Tooltip');
	ctx.fillStyle = 'oklch(0.99 0.01 256)';
	ctx.font = `${500} ${12 / zoom}px var(--font-sans, sans-serif)`;
	ctx.textBaseline = 'middle';
	ctx.textAlign = 'center';
	ctx.fillText(content ?? 'Tooltip', el.x + el.width / 2, el.y + el.height / 2);
}

function drawBreadcrumb(ctx: CanvasRenderingContext2D, el: Element, zoom: number): void {
	const items = 'items' in el && el.items ? el.items : ['Home', 'Section', 'Page'];
	const separator = 'separator' in el && el.separator ? el.separator : '/';
	const cy = el.y + el.height / 2;
	ctx.font = `${500} ${(el.style?.fontSize ?? 12) / zoom}px var(--font-sans, sans-serif)`;
	ctx.textBaseline = 'middle';
	ctx.textAlign = 'left';
	let x = el.x;
	items.forEach((item, i) => {
		const isLast = i === items.length - 1;
		ctx.fillStyle = isLast ? INK : INK_FAINT;
		ctx.fillText(item, x, cy);
		x += ctx.measureText(item).width + 8 / zoom;
		if (!isLast) {
			ctx.fillStyle = INK_FAINT;
			ctx.fillText(separator, x, cy);
			x += ctx.measureText(separator).width + 8 / zoom;
		}
	});
}

function drawPagination(ctx: CanvasRenderingContext2D, el: Element, zoom: number): void {
	const total = 'total' in el && typeof el.total === 'number' ? el.total : 5;
	const current = 'current' in el && typeof el.current === 'number' ? el.current : 1;
	const cy = el.y + el.height / 2;
	const btnSize = el.height;
	const gap = 4 / zoom;
	const maxButtons = Math.min(total, Math.floor((el.width - btnSize * 2 - gap * 2) / (btnSize + gap)));
	const totalW = btnSize * (maxButtons + 2) + gap * (maxButtons + 1);
	let x = el.x + (el.width - totalW) / 2;
	ctx.font = `${500} ${(el.style?.fontSize ?? 12) / zoom}px var(--font-sans, sans-serif)`;
	ctx.textBaseline = 'middle';
	ctx.textAlign = 'center';
	const drawBtn = (label: string, accent: boolean): void => {
		roundRect(ctx, x, el.y, btnSize, btnSize, 4 / zoom);
		if (accent) {
			ctx.fillStyle = ACCENT;
			ctx.fill();
			ctx.fillStyle = 'oklch(0.99 0.01 256)';
		} else {
			ctx.strokeStyle = 'oklch(0.86 0.006 264)';
			ctx.lineWidth = strokeWidthFor(zoom, 1);
			ctx.stroke();
			ctx.fillStyle = INK_SOFT;
		}
		ctx.fillText(label, x + btnSize / 2, cy);
		x += btnSize + gap;
	};
	drawBtn('‹', false);
	for (let i = 1; i <= maxButtons; i++) {
		drawBtn(String(i), i === current);
	}
	drawBtn('›', false);
}

function drawStepper(ctx: CanvasRenderingContext2D, el: Element, zoom: number): void {
	const steps = 'steps' in el && el.steps ? el.steps : ['One', 'Two', 'Three'];
	const current = 'current' in el && typeof el.current === 'number' ? el.current : 0;
	const orientation = 'orientation' in el && el.orientation ? el.orientation : 'horizontal';
	const circleR = 12 / zoom;
	ctx.font = `${600} ${(el.style?.fontSize ?? 12) / zoom}px var(--font-sans, sans-serif)`;
	ctx.textBaseline = 'middle';
	ctx.textAlign = 'center';
	if (orientation === 'horizontal') {
		const cy = el.y + circleR + 2 / zoom;
		const stepW = el.width / steps.length;
		steps.forEach((step, i) => {
			const cx = el.x + stepW * (i + 0.5);
			// Connector to next
			if (i < steps.length - 1) {
				ctx.strokeStyle = i < current ? ACCENT : 'oklch(0.86 0.006 264)';
				ctx.lineWidth = strokeWidthFor(zoom, 2);
				ctx.beginPath();
				ctx.moveTo(cx + circleR, cy);
				ctx.lineTo(cx + stepW - circleR, cy);
				ctx.stroke();
			}
			// Circle
			ctx.beginPath();
			ctx.arc(cx, cy, circleR, 0, Math.PI * 2);
			if (i <= current) {
				ctx.fillStyle = ACCENT;
				ctx.fill();
				ctx.fillStyle = 'oklch(0.99 0.01 256)';
			} else {
				ctx.fillStyle = 'oklch(1 0 0)';
				ctx.fill();
				ctx.strokeStyle = 'oklch(0.78 0.01 264)';
				ctx.lineWidth = strokeWidthFor(zoom, 1.5);
				ctx.stroke();
				ctx.fillStyle = INK_SOFT;
			}
			ctx.fillText(String(i + 1), cx, cy);
			// Label
			ctx.fillStyle = i === current ? INK : INK_FAINT;
			ctx.font = `${i === current ? 600 : 400} ${11 / zoom}px var(--font-sans, sans-serif)`;
			ctx.textBaseline = 'top';
			ctx.fillText(step, cx, cy + circleR + 4 / zoom);
			ctx.font = `${600} ${(el.style?.fontSize ?? 12) / zoom}px var(--font-sans, sans-serif)`;
			ctx.textBaseline = 'middle';
		});
	} else {
		const cx = el.x + circleR + 4 / zoom;
		const stepH = el.height / steps.length;
		steps.forEach((step, i) => {
			const cy = el.y + stepH * (i + 0.5);
			if (i < steps.length - 1) {
				ctx.strokeStyle = i < current ? ACCENT : 'oklch(0.86 0.006 264)';
				ctx.lineWidth = strokeWidthFor(zoom, 2);
				ctx.beginPath();
				ctx.moveTo(cx, cy + circleR);
				ctx.lineTo(cx, cy + stepH - circleR);
				ctx.stroke();
			}
			ctx.beginPath();
			ctx.arc(cx, cy, circleR, 0, Math.PI * 2);
			if (i <= current) {
				ctx.fillStyle = ACCENT;
				ctx.fill();
				ctx.fillStyle = 'oklch(0.99 0.01 256)';
			} else {
				ctx.fillStyle = 'oklch(1 0 0)';
				ctx.fill();
				ctx.strokeStyle = 'oklch(0.78 0.01 264)';
				ctx.lineWidth = strokeWidthFor(zoom, 1.5);
				ctx.stroke();
				ctx.fillStyle = INK_SOFT;
			}
			ctx.fillText(String(i + 1), cx, cy);
			ctx.fillStyle = i === current ? INK : INK_FAINT;
			ctx.font = `${i === current ? 600 : 400} ${12 / zoom}px var(--font-sans, sans-serif)`;
			ctx.textBaseline = 'middle';
			ctx.textAlign = 'left';
			ctx.fillText(step, cx + circleR + 8 / zoom, cy);
			ctx.font = `${600} ${(el.style?.fontSize ?? 12) / zoom}px var(--font-sans, sans-serif)`;
			ctx.textAlign = 'center';
		});
	}
}

function drawAccordion(ctx: CanvasRenderingContext2D, el: Element, zoom: number): void {
	const items = 'items' in el && el.items ? el.items : [];
	const openIndices = 'openIndices' in el && el.openIndices ? el.openIndices : [];
	fillStroke(ctx, el, zoom, { stroke: 'oklch(0.9 0.005 264)', radius: 6 });
	const titleBarH = 36 / zoom;
	const count = Math.max(1, items.length);
	const itemH = el.height / count;
	ctx.font = `${550} ${12 / zoom}px var(--font-sans, sans-serif)`;
	ctx.textBaseline = 'middle';
	ctx.textAlign = 'left';
	items.forEach((title, i) => {
		const ty = el.y + i * itemH;
		// Title bar
		ctx.fillStyle = openIndices.includes(i) ? 'oklch(0.96 0.005 264)' : 'oklch(0.985 0.003 264)';
		ctx.fillRect(el.x, ty, el.width, Math.min(titleBarH, itemH));
		ctx.strokeStyle = 'oklch(0.9 0.005 264)';
		ctx.lineWidth = strokeWidthFor(zoom, 1);
		if (i > 0) {
			ctx.beginPath();
			ctx.moveTo(el.x, ty);
			ctx.lineTo(el.x + el.width, ty);
			ctx.stroke();
		}
		// Chevron
		const chx = el.x + el.width - 16 / zoom;
		const chy = ty + Math.min(titleBarH, itemH) / 2;
		ctx.strokeStyle = INK_SOFT;
		ctx.lineWidth = strokeWidthFor(zoom, 1.5);
		ctx.lineCap = 'round';
		ctx.lineJoin = 'round';
		ctx.beginPath();
		if (openIndices.includes(i)) {
			ctx.moveTo(chx - 4 / zoom, chy + 2 / zoom);
			ctx.lineTo(chx, chy - 2 / zoom);
			ctx.lineTo(chx + 4 / zoom, chy + 2 / zoom);
		} else {
			ctx.moveTo(chx - 4 / zoom, chy - 2 / zoom);
			ctx.lineTo(chx, chy + 2 / zoom);
			ctx.lineTo(chx + 4 / zoom, chy - 2 / zoom);
		}
		ctx.stroke();
		ctx.fillStyle = INK;
		ctx.fillText(title, el.x + 14 / zoom, ty + Math.min(titleBarH, itemH) / 2);
	});
	if (el.icon) {
		drawEmbeddedIcon(ctx, el.icon, el.x + 8 / zoom, el.y + 8 / zoom, 14 / zoom, zoom, INK_FAINT);
	}
}

function drawSectionHeader(ctx: CanvasRenderingContext2D, el: Element, zoom: number): void {
	const eyebrow = 'eyebrow' in el ? el.eyebrow : undefined;
	const heading = 'heading' in el ? el.heading : (el.label ?? 'Heading');
	const subheading = 'subheading' in el ? el.subheading : undefined;
	let cy = el.y;
	if (eyebrow) {
		ctx.fillStyle = INK_FAINT;
		ctx.font = `${600} ${11 / zoom}px var(--font-sans, sans-serif)`;
		ctx.textBaseline = 'top';
		ctx.textAlign = 'left';
		ctx.fillText(eyebrow.toUpperCase(), el.x, cy);
		cy += 20 / zoom;
	}
	if (heading) {
		ctx.fillStyle = INK;
		ctx.font = `${680} ${22 / zoom}px var(--font-sans, sans-serif)`;
		ctx.textBaseline = 'top';
		ctx.textAlign = 'left';
		ctx.fillText(heading, el.x, cy);
		cy += 30 / zoom;
	}
	if (subheading) {
		ctx.fillStyle = INK_SOFT;
		ctx.font = `${400} ${14 / zoom}px var(--font-sans, sans-serif)`;
		ctx.textBaseline = 'top';
		ctx.textAlign = 'left';
		wrapText(ctx, subheading, el.x, cy, el.width, 14 / zoom * 1.4);
	}
	if (el.icon) {
		drawEmbeddedIcon(ctx, el.icon, el.x - 22 / zoom, el.y, 16 / zoom, zoom, ACCENT);
	}
}

function drawHero(ctx: CanvasRenderingContext2D, el: Element, zoom: number): void {
	fillStroke(ctx, el, zoom, { fill: 'oklch(0.97 0.005 264)', stroke: 'oklch(0.9 0.005 264)', radius: 12 });
	const heading = 'heading' in el ? el.heading : undefined;
	const subheading = 'subheading' in el ? el.subheading : undefined;
	const ctaLabel = 'ctaLabel' in el ? el.ctaLabel : undefined;
	const cx = el.x + el.width / 2;
	let cy = el.y + el.height / 2 - 40 / zoom;
	if (heading) {
		ctx.fillStyle = INK;
		ctx.font = `${700} ${36 / zoom}px var(--font-sans, sans-serif)`;
		ctx.textBaseline = 'middle';
		ctx.textAlign = 'center';
		ctx.fillText(heading, cx, cy);
		cy += 48 / zoom;
	}
	if (subheading) {
		ctx.fillStyle = INK_SOFT;
		ctx.font = `${400} ${16 / zoom}px var(--font-sans, sans-serif)`;
		ctx.textBaseline = 'middle';
		ctx.textAlign = 'center';
		ctx.fillText(subheading, cx, cy);
		cy += 36 / zoom;
	}
	if (ctaLabel) {
		const btnW = 140 / zoom;
		const btnH = 40 / zoom;
		roundRect(ctx, cx - btnW / 2, cy, btnW, btnH, 6 / zoom);
		ctx.fillStyle = ACCENT;
		ctx.fill();
		ctx.fillStyle = 'oklch(0.99 0.01 256)';
		ctx.font = `${600} ${13 / zoom}px var(--font-sans, sans-serif)`;
		ctx.textBaseline = 'middle';
		ctx.textAlign = 'center';
		ctx.fillText(ctaLabel, cx, cy + btnH / 2);
	}
	if (el.icon) {
		drawEmbeddedIcon(ctx, el.icon, el.x + 16 / zoom, el.y + 16 / zoom, 18 / zoom, zoom, INK_FAINT);
	}
}

function drawFeatureGrid(ctx: CanvasRenderingContext2D, el: Element, zoom: number): void {
	const columns = 'columns' in el && typeof el.columns === 'number' && el.columns > 0 ? el.columns : 3;
	const radius = el.style?.radius ?? 8;
	roundRect(ctx, el.x, el.y, el.width, el.height, radius);
	if (hasFill(el.style?.fill)) {
		ctx.fillStyle = el.style.fill;
		ctx.fill();
	}
	ctx.save();
	ctx.strokeStyle = hasFill(el.style?.stroke) ? el.style.stroke : 'oklch(0.9 0.005 264)';
	ctx.lineWidth = userStrokeWidth(el, zoom, 1);
	ctx.setLineDash([6 / zoom, 4 / zoom]);
	ctx.stroke();
	ctx.restore();
	// Grid lines (faint)
	const pad = 16 / zoom;
	const gap = 16 / zoom;
	const colW = (el.width - pad * 2 - gap * (columns - 1)) / columns;
	const rows = 2;
	const rowH = (el.height - pad * 2 - gap * (rows - 1)) / rows;
	ctx.strokeStyle = 'oklch(0.93 0.005 264)';
	ctx.lineWidth = strokeWidthFor(zoom, 1);
	for (let r = 0; r < rows; r++) {
		for (let c = 0; c < columns; c++) {
			const cx = el.x + pad + c * (colW + gap);
			const cy = el.y + pad + r * (rowH + gap);
			roundRect(ctx, cx, cy, colW, rowH, 6 / zoom);
			ctx.stroke();
		}
	}
	if (el.label) labelText(ctx, el, el.label, zoom);
	if (el.icon) {
		drawEmbeddedIcon(ctx, el.icon, el.x + 8 / zoom, el.y + 8 / zoom, 14 / zoom, zoom, INK_FAINT);
	}
}

function drawTestimonial(ctx: CanvasRenderingContext2D, el: Element, zoom: number): void {
	fillStroke(ctx, el, zoom, { fill: 'oklch(0.98 0.004 264)', stroke: 'oklch(0.9 0.005 264)', radius: 8 });
	const pad = 24 / zoom;
	// Quote glyph
	ctx.fillStyle = INK_FAINT;
	ctx.font = `${700} ${48 / zoom}px Georgia, serif`;
	ctx.textBaseline = 'top';
	ctx.textAlign = 'left';
	ctx.fillText('"', el.x + pad, el.y + pad - 16 / zoom);
	const quote = 'quote' in el ? el.quote : undefined;
	const attribution = 'attribution' in el ? el.attribution : undefined;
	if (quote) {
		ctx.fillStyle = INK;
		ctx.font = `${400} ${15 / zoom}px var(--font-sans, sans-serif)`;
		ctx.textBaseline = 'top';
		ctx.textAlign = 'left';
		wrapText(ctx, quote, el.x + pad, el.y + pad + 24 / zoom, el.width - pad * 2, 15 / zoom * 1.4);
	}
	if (attribution) {
		ctx.fillStyle = INK_FAINT;
		ctx.font = `${500} ${12 / zoom}px var(--font-sans, sans-serif)`;
		ctx.textBaseline = 'bottom';
		ctx.textAlign = 'left';
		ctx.fillText(`— ${attribution}`, el.x + pad, el.y + el.height - pad);
	}
	if (el.icon) {
		drawEmbeddedIcon(ctx, el.icon, el.x + el.width - pad - 18 / zoom, el.y + pad, 18 / zoom, zoom, ACCENT);
	}
}

function drawCtaSection(ctx: CanvasRenderingContext2D, el: Element, zoom: number): void {
	const radius = el.style?.radius ?? 12;
	roundRect(ctx, el.x, el.y, el.width, el.height, radius);
	ctx.fillStyle = hasFill(el.style?.fill) ? el.style.fill : ACCENT;
	ctx.fill();
	const heading = 'heading' in el ? el.heading : undefined;
	const subheading = 'subheading' in el ? el.subheading : undefined;
	const ctaLabel = 'ctaLabel' in el ? el.ctaLabel : undefined;
	const cx = el.x + el.width / 2;
	let cy = el.y + el.height / 2 - 30 / zoom;
	if (heading) {
		ctx.fillStyle = 'oklch(0.99 0.01 256)';
		ctx.font = `${680} ${24 / zoom}px var(--font-sans, sans-serif)`;
		ctx.textBaseline = 'middle';
		ctx.textAlign = 'center';
		ctx.fillText(heading, cx, cy);
		cy += 32 / zoom;
	}
	if (subheading) {
		ctx.fillStyle = 'oklch(0.95 0.02 256)';
		ctx.font = `${400} ${14 / zoom}px var(--font-sans, sans-serif)`;
		ctx.textBaseline = 'middle';
		ctx.textAlign = 'center';
		ctx.fillText(subheading, cx, cy);
		cy += 28 / zoom;
	}
	if (ctaLabel) {
		const btnW = 130 / zoom;
		const btnH = 36 / zoom;
		roundRect(ctx, cx - btnW / 2, cy, btnW, btnH, 6 / zoom);
		ctx.fillStyle = 'oklch(0.99 0.01 256)';
		ctx.fill();
		ctx.fillStyle = ACCENT;
		ctx.font = `${600} ${13 / zoom}px var(--font-sans, sans-serif)`;
		ctx.textBaseline = 'middle';
		ctx.textAlign = 'center';
		ctx.fillText(ctaLabel, cx, cy + btnH / 2);
	}
	if (el.icon) {
		drawEmbeddedIcon(ctx, el.icon, el.x + 16 / zoom, el.y + 16 / zoom, 18 / zoom, zoom, 'oklch(0.99 0.01 256)');
	}
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
	const SEL = input.selectionColor;

	// Per-element oriented outlines (thin accent) for every selected element. The outline is OUTSET
	// by a few screen px so it sits OUTSIDE the element's own border — otherwise it would paint over
	// the element's stroke and hide stroke-color changes while selected.
	ctx.strokeStyle = SEL;
	ctx.lineWidth = strokeWidthFor(zoom, 1);
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
			ctx.strokeStyle = SEL;
			ctx.lineWidth = strokeWidthFor(zoom, 1);
			ctx.setLineDash([2 / zoom]);
			ctx.strokeRect(b.x - pad, b.y - pad, b.width + pad * 2, b.height + pad * 2);
			ctx.setLineDash([]);
		}
	}

	// Connect the rotate handle to the frame's top edge with a short stalk.
	const rotateHandle = handles.find((h) => h.kind === 'rotate');
	const topMid = handles.find((h) => h.kind === 'n');
	if (rotateHandle && topMid) {
		ctx.strokeStyle = SEL;
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
			ctx.strokeStyle = SEL;
			ctx.lineWidth = strokeWidthFor(zoom, 1);
			ctx.stroke();
		} else {
			ctx.fillStyle = 'oklch(1 0 0)';
			ctx.strokeStyle = SEL;
			ctx.lineWidth = strokeWidthFor(zoom, 1);
			ctx.beginPath();
			ctx.roundRect(h.world.x - hs / 2, h.world.y - hs / 2, hs, hs, 2 / zoom);
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
	// Translucent fill in the shell's selection color (constant ~0.04 alpha via globalAlpha so the
	// same color works for both the oklch desktop accent and the hex web accent), matching
	// Excalidraw's faint blue marquee wash.
	ctx.save();
	ctx.globalAlpha = 0.04;
	ctx.fillStyle = input.selectionColor;
	ctx.fillRect(marquee.x, marquee.y, marquee.width, marquee.height);
	ctx.restore();
	ctx.strokeStyle = input.selectionColor;
	ctx.lineWidth = strokeWidthFor(zoom, 1);
	ctx.strokeRect(marquee.x, marquee.y, marquee.width, marquee.height);
}
