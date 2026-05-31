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
	divider: { width: 240, height: 1 }
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
		divider: 'Divider'
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
 * Build a complete element of the given semantic type. Geometry comes from `init`; everything
 * else falls back to type defaults. The result is a valid member of the discriminated union.
 */
export function createElement<T extends SemanticType>(
	type: T,
	init: CreateElementInit
): ElementByType[T] {
	const size = DEFAULT_SIZE[type];
	const layout = isContainerType(type) ? defaultLayout(type) : undefined;
	const style = defaultStyle(type);

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
		...typeSpecificDefaults(type)
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
