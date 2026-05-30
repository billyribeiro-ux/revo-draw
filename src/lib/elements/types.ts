/**
 * The single source of truth for the document model.
 *
 * This schema is what gets serialized to `.lfdoc` on disk AND what the export compiler
 * (`export/to-markdown.ts`) reads. It is deliberately semantic: every element carries a
 * `SemanticType` and an optional `LayoutIntent` so the exporter can describe *intent*, not
 * pixels. Geometry is stored in world coordinates.
 *
 * Public-facing IDs are UUID v7 strings (time-sortable, no raw integer PKs in the file).
 */

export type ElementId = string; // uuid v7

export const SEMANTIC_TYPES = [
	'frame', // a page/screen boundary or a sub-region container
	'container', // generic layout container (maps to a div with layout intent)
	'card',
	'nav', // top nav / app bar
	'sidebar',
	'button',
	'input',
	'text', // heading or body text region
	'image',
	'table', // data table region
	'chart', // chart/graph region
	'list',
	'tabs',
	'modal',
	'icon', // a placed Iconify icon (carries icon name + path data)
	'divider'
] as const;
export type SemanticType = (typeof SEMANTIC_TYPES)[number];

/** Semantic types that act as layout containers (can hold children, carry LayoutIntent). */
export const CONTAINER_TYPES = [
	'frame',
	'container',
	'card',
	'nav',
	'sidebar',
	'list',
	'tabs',
	'modal'
] as const satisfies readonly SemanticType[];
export type ContainerType = (typeof CONTAINER_TYPES)[number];

export function isContainerType(type: SemanticType): type is ContainerType {
	return (CONTAINER_TYPES as readonly SemanticType[]).includes(type);
}

export type LayoutMode = 'flow' | 'flex-row' | 'flex-col' | 'grid' | 'absolute';
export const LAYOUT_MODES = ['flow', 'flex-row', 'flex-col', 'grid', 'absolute'] as const;

export type Align = 'start' | 'center' | 'end' | 'stretch' | 'space-between';
export const ALIGNMENTS = ['start', 'center', 'end', 'stretch', 'space-between'] as const;

export type ResponsiveIntent = 'stack' | 'reflow' | 'hide' | 'scroll' | 'none';
export const RESPONSIVE_INTENTS = ['stack', 'reflow', 'hide', 'scroll', 'none'] as const;

export interface LayoutIntent {
	mode: LayoutMode;
	gap?: number; // px
	padding?: number; // px (uniform)
	justify?: Align; // main-axis distribution
	align?: Align; // cross-axis alignment
	gridCols?: number; // when mode === 'grid'
	/** How this region should behave at narrower widths. */
	responsive?: ResponsiveIntent;
	/** Fixed sizing hints that matter for layout (e.g. sidebar width). */
	fixedWidth?: number;
	fixedHeight?: number;
}

export interface ElementStyle {
	fill?: string; // OKLCH string preferred
	stroke?: string;
	radius?: number;
	fontSize?: number;
	fontWeight?: number;
	opacity?: number; // 0..1
}

export interface BaseElement {
	id: ElementId;
	type: SemanticType;
	parentId: ElementId | null;
	// geometry in WORLD coordinates
	x: number;
	y: number;
	width: number;
	height: number;
	rotation: number; // radians
	z: number; // stacking order within parent
	label?: string; // human label, e.g. "Revenue card", surfaced in export
	layout?: LayoutIntent; // present on containers/frames/etc.
	style?: ElementStyle;
	/** When true, the element is locked from selection/transform in the editor. */
	locked?: boolean;
	/** When false, the element is hidden in the canvas (still exported unless filtered). */
	hidden?: boolean;
}

/** A page/screen boundary or sub-region container. */
export interface FrameElement extends BaseElement {
	type: 'frame';
	layout?: LayoutIntent;
}

/** Generic layout container. */
export interface ContainerElement extends BaseElement {
	type: 'container';
	layout?: LayoutIntent;
}

export interface CardElement extends BaseElement {
	type: 'card';
	layout?: LayoutIntent;
}

export interface NavElement extends BaseElement {
	type: 'nav';
	orientation?: 'horizontal' | 'vertical';
	layout?: LayoutIntent;
}

export interface SidebarElement extends BaseElement {
	type: 'sidebar';
	side?: 'left' | 'right';
	layout?: LayoutIntent;
}

export interface ButtonElement extends BaseElement {
	type: 'button';
	content: string;
	variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
	/** Optional leading icon (Iconify name + raw path so it round-trips offline). */
	iconName?: string;
	iconSvgPath?: string;
}

export interface InputElement extends BaseElement {
	type: 'input';
	placeholder?: string;
	inputKind?: 'text' | 'email' | 'password' | 'search' | 'number' | 'textarea' | 'select';
	labelText?: string;
}

export type TextRole = 'h1' | 'h2' | 'h3' | 'body' | 'caption' | 'label';
export const TEXT_ROLES = ['h1', 'h2', 'h3', 'body', 'caption', 'label'] as const;

export interface TextElement extends BaseElement {
	type: 'text';
	content: string;
	textRole?: TextRole;
	textAlign?: 'start' | 'center' | 'end';
}

export interface ImageElement extends BaseElement {
	type: 'image';
	alt?: string;
	/** Optional aspect-ratio hint for layout (width / height). */
	aspectRatio?: number;
	fit?: 'cover' | 'contain';
}

export interface TableElement extends BaseElement {
	type: 'table';
	columns?: string[];
	rowCountHint?: number;
}

export type ChartKind = 'line' | 'bar' | 'area' | 'pie' | 'scatter' | 'donut';
export const CHART_KINDS = ['line', 'bar', 'area', 'pie', 'scatter', 'donut'] as const;

export interface ChartElement extends BaseElement {
	type: 'chart';
	chartKind: ChartKind;
	caption?: string;
}

export interface ListElement extends BaseElement {
	type: 'list';
	ordered?: boolean;
	itemCountHint?: number;
	layout?: LayoutIntent;
}

export interface TabsElement extends BaseElement {
	type: 'tabs';
	tabs?: string[];
	layout?: LayoutIntent;
}

export interface ModalElement extends BaseElement {
	type: 'modal';
	title?: string;
	layout?: LayoutIntent;
}

export interface IconElement extends BaseElement {
	type: 'icon';
	iconName: string; // e.g. "ph:chart-bar" — so Claude Code can re-import it
	svgPath: string; // raw inner SVG markup, so it survives in the file & renders offline
	viewBox: string; // viewBox of the source icon, e.g. "0 0 256 256"
}

export interface DividerElement extends BaseElement {
	type: 'divider';
	orientation?: 'horizontal' | 'vertical';
}

/** Discriminated union of every semantic element. */
export type Element =
	| FrameElement
	| ContainerElement
	| CardElement
	| NavElement
	| SidebarElement
	| ButtonElement
	| InputElement
	| TextElement
	| ImageElement
	| TableElement
	| ChartElement
	| ListElement
	| TabsElement
	| ModalElement
	| IconElement
	| DividerElement;

/** Map from SemanticType to its concrete element interface, for precise typing. */
export interface ElementByType {
	frame: FrameElement;
	container: ContainerElement;
	card: CardElement;
	nav: NavElement;
	sidebar: SidebarElement;
	button: ButtonElement;
	input: InputElement;
	text: TextElement;
	image: ImageElement;
	table: TableElement;
	chart: ChartElement;
	list: ListElement;
	tabs: TabsElement;
	modal: ModalElement;
	icon: IconElement;
	divider: DividerElement;
}

export const SCHEMA_VERSION = 1 as const;

export interface LayoutDocument {
	schemaVersion: typeof SCHEMA_VERSION; // version from day one; never reuse a version number
	id: string; // uuid v7
	name: string;
	createdAt: string; // ISO 8601
	updatedAt: string; // ISO 8601
	canvas: { width: number; height: number; background: string };
	elements: Record<ElementId, Element>;
	rootOrder: ElementId[]; // top-level element order
}

/** A serialized clipboard payload (subtree of elements, ids will be regenerated on paste). */
export interface ClipboardPayload {
	kind: 'layoutforge/elements';
	elements: Element[];
}
