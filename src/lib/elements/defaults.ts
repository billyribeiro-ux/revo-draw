/**
 * Default geometry, style, and semantic props per SemanticType.
 *
 * `createElement(type, partial)` is the single factory used by tools, paste, and tests.
 * It produces a fully-typed, complete element — no partially-initialized objects ever enter
 * the scene graph. Defaults are chosen so a freshly-dropped element looks intentional.
 */
import { uuidv7 } from './uuid.ts';
import {
	isContainerType,
	type ElementByType,
	type ElementId,
	type ElementStyle,
	type LayoutIntent,
	type SemanticType
} from './types.ts';

/** Default on-canvas size (world px) per semantic type. */
const DEFAULT_SIZE: Record<SemanticType, { width: number; height: number }> = {
	frame: { width: 1440, height: 900 },
	container: { width: 320, height: 200 },
	card: { width: 280, height: 160 },
	nav: { width: 1440, height: 56 },
	sidebar: { width: 240, height: 720 },
	button: { width: 120, height: 40 },
	input: { width: 220, height: 40 },
	text: { width: 240, height: 32 },
	image: { width: 240, height: 160 },
	table: { width: 480, height: 280 },
	chart: { width: 360, height: 240 },
	list: { width: 280, height: 240 },
	tabs: { width: 400, height: 240 },
	modal: { width: 480, height: 320 },
	icon: { width: 32, height: 32 },
	divider: { width: 240, height: 1 },
	svg: { width: 120, height: 120 },
	checkbox: { width: 18, height: 18 },
	radio: { width: 18, height: 18 },
	toggle: { width: 36, height: 20 },
	slider: { width: 160, height: 20 },
	dropdown: { width: 200, height: 36 },
	'stat-card': { width: 200, height: 120 },
	badge: { width: 64, height: 22 },
	progress: { width: 200, height: 16 },
	avatar: { width: 40, height: 40 },
	alert: { width: 360, height: 64 },
	tooltip: { width: 120, height: 32 },
	breadcrumb: { width: 320, height: 24 },
	pagination: { width: 240, height: 32 },
	stepper: { width: 360, height: 48 },
	accordion: { width: 320, height: 200 },
	'section-header': { width: 480, height: 96 },
	hero: { width: 960, height: 400 },
	'feature-grid': { width: 720, height: 360 },
	testimonial: { width: 480, height: 200 },
	'cta-section': { width: 720, height: 220 }
};

/** Default layout intent for container-like types. */
function defaultLayout(type: SemanticType): LayoutIntent | undefined {
	switch (type) {
		case 'frame':
			return { mode: 'flex-row', gap: 0, padding: 0, responsive: 'reflow' };
		case 'container':
			return { mode: 'flex-col', gap: 12, padding: 16, responsive: 'reflow' };
		case 'card':
			return { mode: 'flex-col', gap: 8, padding: 16, responsive: 'none' };
		case 'nav':
			return {
				mode: 'flex-row',
				gap: 16,
				padding: 12,
				justify: 'space-between',
				align: 'center',
				responsive: 'reflow'
			};
		case 'sidebar':
			return {
				mode: 'flex-col',
				gap: 8,
				padding: 16,
				fixedWidth: 240,
				responsive: 'none'
			};
		case 'list':
			return { mode: 'flex-col', gap: 4, padding: 8, responsive: 'scroll' };
		case 'tabs':
			return { mode: 'flex-col', gap: 8, padding: 0, responsive: 'reflow' };
		case 'modal':
			return { mode: 'flex-col', gap: 16, padding: 24, responsive: 'none' };
		case 'accordion':
			return { mode: 'flex-col', gap: 0, padding: 0, responsive: 'reflow' };
		case 'hero':
			return {
				mode: 'flex-col',
				justify: 'center',
				align: 'center',
				gap: 16,
				padding: 64,
				responsive: 'stack'
			};
		case 'feature-grid':
			return { mode: 'grid', gridCols: 3, gap: 16, padding: 16, responsive: 'reflow' };
		case 'testimonial':
			return { mode: 'flex-col', gap: 12, padding: 24, responsive: 'none' };
		case 'cta-section':
			return {
				mode: 'flex-col',
				justify: 'center',
				align: 'center',
				gap: 12,
				padding: 32,
				responsive: 'stack'
			};
		default:
			return undefined;
	}
}

/** Default style per type — restrained, editorial. Colors are OKLCH strings. */
/** Base style every element starts with (Excalidraw-aligned), merged under per-type visuals. */
const BASE_STYLE: ElementStyle = {
	strokeWidth: 'bold',
	strokeStyle: 'solid',
	fillStyle: 'solid',
	opacity: 1
};

function defaultStyle(type: SemanticType): ElementStyle {
	return { ...BASE_STYLE, ...(perTypeStyle(type) ?? {}) };
}

function perTypeStyle(type: SemanticType): ElementStyle | undefined {
	switch (type) {
		case 'frame':
			return { fill: 'oklch(1 0 0)', stroke: 'oklch(0.82 0.008 264)', radius: 8 };
		case 'container':
			return { stroke: 'oklch(0.86 0.006 264)', radius: 6 };
		case 'card':
			return { fill: 'oklch(1 0 0)', stroke: 'oklch(0.9 0.005 264)', radius: 8 };
		case 'nav':
			return { fill: 'oklch(0.98 0.003 264)', stroke: 'oklch(0.9 0.005 264)' };
		case 'sidebar':
			return { fill: 'oklch(0.965 0.004 110)', stroke: 'oklch(0.9 0.005 264)' };
		case 'button':
			return { fill: 'oklch(0.58 0.16 256)', radius: 6, fontSize: 13, fontWeight: 550 };
		case 'input':
			return { fill: 'oklch(1 0 0)', stroke: 'oklch(0.82 0.008 264)', radius: 6 };
		case 'text':
			return { fontSize: 15, fontWeight: 400 };
		case 'image':
			return { fill: 'oklch(0.92 0.006 264)', radius: 6 };
		case 'table':
			return { fill: 'oklch(1 0 0)', stroke: 'oklch(0.9 0.005 264)', radius: 6 };
		case 'chart':
			return { fill: 'oklch(1 0 0)', stroke: 'oklch(0.9 0.005 264)', radius: 6 };
		case 'list':
			return { stroke: 'oklch(0.9 0.005 264)', radius: 6 };
		case 'tabs':
			return { radius: 6 };
		case 'modal':
			return { fill: 'oklch(1 0 0)', stroke: 'oklch(0.86 0.006 264)', radius: 10 };
		case 'icon':
			return { fill: 'oklch(0.22 0.012 264)' };
		case 'divider':
			return { stroke: 'oklch(0.86 0.006 264)' };
		case 'svg':
			return { fill: 'oklch(0.22 0.012 264)' };
		case 'checkbox':
			return { fill: 'oklch(1 0 0)', stroke: 'oklch(0.7 0.01 264)', radius: 3 };
		case 'radio':
			return { fill: 'oklch(1 0 0)', stroke: 'oklch(0.7 0.01 264)' };
		case 'toggle':
			return { fill: 'oklch(0.88 0.006 264)', radius: 10 };
		case 'slider':
			return { fill: 'oklch(0.88 0.006 264)' };
		case 'dropdown':
			return { fill: 'oklch(1 0 0)', stroke: 'oklch(0.82 0.008 264)', radius: 6 };
		case 'stat-card':
			return { fill: 'oklch(1 0 0)', stroke: 'oklch(0.9 0.005 264)', radius: 8 };
		case 'badge':
			return { fill: 'oklch(0.92 0.02 256)', radius: 11, fontSize: 11, fontWeight: 600 };
		case 'progress':
			return { fill: 'oklch(0.88 0.006 264)', radius: 8 };
		case 'avatar':
			return { fill: 'oklch(0.78 0.08 264)', fontSize: 14, fontWeight: 600 };
		case 'alert':
			return { fill: 'oklch(0.96 0.03 230)', stroke: 'oklch(0.7 0.12 230)', radius: 8 };
		case 'tooltip':
			return { fill: 'oklch(0.24 0.014 264)', radius: 6 };
		case 'breadcrumb':
			return { fontSize: 12 };
		case 'pagination':
			return { fontSize: 12 };
		case 'stepper':
			return { fontSize: 12 };
		case 'accordion':
			return { stroke: 'oklch(0.9 0.005 264)', radius: 6 };
		case 'section-header':
			return {};
		case 'hero':
			return { fill: 'oklch(0.97 0.005 264)', stroke: 'oklch(0.9 0.005 264)', radius: 12 };
		case 'feature-grid':
			return { stroke: 'oklch(0.9 0.005 264)', radius: 8 };
		case 'testimonial':
			return { fill: 'oklch(0.98 0.004 264)', stroke: 'oklch(0.9 0.005 264)', radius: 8 };
		case 'cta-section':
			return { fill: 'oklch(0.55 0.17 264)', radius: 12 };
		default:
			return undefined;
	}
}

/** Default human label per type (used in export when the user hasn't named the element). */
export function defaultLabel(type: SemanticType): string {
	const map: Record<SemanticType, string> = {
		frame: 'Frame',
		container: 'Container',
		card: 'Card',
		nav: 'Nav',
		sidebar: 'Sidebar',
		button: 'Button',
		input: 'Input',
		text: 'Text',
		image: 'Image',
		table: 'Table',
		chart: 'Chart',
		list: 'List',
		tabs: 'Tabs',
		modal: 'Modal',
		icon: 'Icon',
		divider: 'Divider',
		svg: 'SVG',
		checkbox: 'Checkbox',
		radio: 'Radio',
		toggle: 'Toggle',
		slider: 'Slider',
		dropdown: 'Dropdown',
		'stat-card': 'Stat',
		badge: 'Badge',
		progress: 'Progress',
		avatar: 'Avatar',
		alert: 'Alert',
		tooltip: 'Tooltip',
		breadcrumb: 'Breadcrumb',
		pagination: 'Pagination',
		stepper: 'Stepper',
		accordion: 'Accordion',
		'section-header': 'Section header',
		hero: 'Hero',
		'feature-grid': 'Feature grid',
		testimonial: 'Testimonial',
		'cta-section': 'CTA section'
	};
	return map[type];
}

/** Per-type extra fields needed to satisfy each concrete interface. */
function typeSpecificDefaults(type: SemanticType): Record<string, unknown> {
	switch (type) {
		case 'button':
			return { content: 'Button', variant: 'primary' };
		case 'input':
			return { placeholder: 'Placeholder', inputKind: 'text' };
		case 'text':
			return { content: 'Text', textRole: 'body', textAlign: 'start' };
		case 'image':
			return { fit: 'cover' };
		case 'table':
			return { columns: ['Column', 'Column', 'Column'], rowCountHint: 5 };
		case 'chart':
			return { chartKind: 'line' };
		case 'list':
			return { ordered: false, itemCountHint: 4 };
		case 'tabs':
			return { tabs: ['Tab 1', 'Tab 2'] };
		case 'modal':
			return { title: 'Modal title' };
		case 'nav':
			return { orientation: 'horizontal' };
		case 'sidebar':
			return { side: 'left' };
		case 'divider':
			return { orientation: 'horizontal' };
		case 'icon':
			// Placed icons must supply iconName/svgPath/viewBox explicitly via the picker;
			// these are safe placeholders so the factory never yields an invalid element.
			return { iconName: 'ph:square', svgPath: '', viewBox: '0 0 256 256' };
		case 'svg':
			// SVG bodies are supplied via the paste flow (RightPanel). The factory yields an
			// empty body + the universal default viewBox so the placeholder paints sanely.
			return { body: '', viewBox: '0 0 100 100' };
		case 'checkbox':
			return { checked: false };
		case 'radio':
			return { selected: false };
		case 'toggle':
			return { on: false };
		case 'slider':
			return { value: 50, min: 0, max: 100 };
		case 'dropdown':
			return { options: ['Option 1', 'Option 2', 'Option 3'], placeholder: 'Select…' };
		case 'stat-card':
			return { value: '1,234', delta: '+12%', trend: 'up' };
		case 'badge':
			return { content: 'Badge', variant: 'neutral' };
		case 'progress':
			return { value: 60, kind: 'linear' };
		case 'avatar':
			return { initials: 'AB', shape: 'circle' };
		case 'alert':
			return { content: 'Alert message', variant: 'info' };
		case 'tooltip':
			return { content: 'Tooltip' };
		case 'breadcrumb':
			return { items: ['Home', 'Section', 'Page'], separator: '/' };
		case 'pagination':
			return { total: 5, current: 1 };
		case 'stepper':
			return { steps: ['One', 'Two', 'Three'], current: 0, orientation: 'horizontal' };
		case 'accordion':
			return { items: ['Section 1', 'Section 2', 'Section 3'], openIndices: [0] };
		case 'section-header':
			return {
				eyebrow: 'EYEBROW',
				heading: 'Section heading',
				subheading: 'A short description that supports the heading.'
			};
		case 'hero':
			return {
				heading: 'Hero heading',
				subheading: 'A subheading that explains what this product does.',
				ctaLabel: 'Get started'
			};
		case 'feature-grid':
			return { columns: 3 };
		case 'testimonial':
			return { quote: 'This product changed the way we work.', attribution: 'Jane Doe, CEO' };
		case 'cta-section':
			return {
				heading: 'Ready to start?',
				subheading: 'Join thousands of teams already shipping faster.',
				ctaLabel: 'Sign up'
			};
		default:
			return {};
	}
}

export interface CreateElementInit {
	x: number;
	y: number;
	width?: number;
	height?: number;
	parentId?: ElementId | null;
	z?: number;
	label?: string;
}

/**
 * Build a complete element of the given semantic type. Geometry comes from `init`; type-specific
 * fields can ALSO be supplied via `init` (as `Partial<ElementByType[T]>` overrides) so callers
 * like the drag-from-icon-picker and the paste-SVG modal can construct a complete element in a
 * single transaction rather than create-then-patch (which would produce two undo entries). What
 * is not supplied falls back to type defaults. The result is a valid member of the discriminated
 * union. The `id`/`type`/`rotation` fields are NEVER overridable via init; everything else can be.
 */
export function createElement<T extends SemanticType>(
	type: T,
	init: CreateElementInit & Partial<ElementByType[T]>
): ElementByType[T] {
	const size = DEFAULT_SIZE[type];
	const layout = isContainerType(type) ? defaultLayout(type) : undefined;
	const style = defaultStyle(type);

	// Strip the base-geometry fields from `init` so the spread of type-specific overrides at the
	// end of `base` can't clobber them with a wrong value (e.g. `init.x` already lives in `x`).
	// `id`/`type`/`rotation` are likewise immutable from init.
	const {
		x: _x,
		y: _y,
		width: _w,
		height: _h,
		parentId: _p,
		z: _z,
		label: _l,
		// strip immutables in case a caller accidentally passes them via the partial
		id: _id,
		type: _t,
		rotation: _r,
		...typeOverrides
	} = init as CreateElementInit & Partial<ElementByType[T]> & { id?: unknown; type?: unknown; rotation?: unknown };
	void _x; void _y; void _w; void _h; void _p; void _z; void _l; void _id; void _t; void _r;

	const base = {
		id: uuidv7(),
		type,
		parentId: init.parentId ?? null,
		x: init.x,
		y: init.y,
		width: init.width ?? size.width,
		height: init.height ?? size.height,
		rotation: 0,
		z: init.z ?? 0,
		label: init.label,
		...(layout ? { layout } : {}),
		...(style ? { style } : {}),
		...typeSpecificDefaults(type),
		// Type-specific overrides last so callers can supply e.g. {body, viewBox} for an svg.
		...typeOverrides
	};

	// The construction above is exhaustively driven by `type`, so the object satisfies the
	// corresponding concrete interface. The discriminant `type` narrows it for consumers.
	return base as unknown as ElementByType[T];
}

/** Create a blank document — a truly empty canvas, ready to draw on. */
export function createBlankDocument(name = 'Untitled'): import('./types.ts').LayoutDocument {
	const now = new Date().toISOString();
	const doc: import('./types.ts').LayoutDocument = {
		schemaVersion: 1,
		id: uuidv7(),
		name,
		createdAt: now,
		updatedAt: now,
		canvas: { width: 1440, height: 900, background: 'oklch(0.955 0.004 110)' },
		elements: {},
		rootOrder: []
	};
	return doc;
}
