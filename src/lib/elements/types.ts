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
	'divider',
	'svg', // a placed arbitrary SVG body (sanitized inner markup, rendered via Path2D)
	// Form controls
	'checkbox',
	'radio',
	'toggle',
	'slider',
	'dropdown',
	// Data display
	'stat-card',
	'badge',
	'progress',
	'avatar',
	// Feedback + Nav
	'alert',
	'tooltip',
	'breadcrumb',
	'pagination',
	'stepper',
	'accordion',
	// Layout + Marketing
	'section-header',
	'hero',
	'feature-grid',
	'testimonial',
	'cta-section'
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
	'modal',
	'accordion',
	'hero',
	'feature-grid',
	'testimonial',
	'cta-section'
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

/** Visual stroke weight options (px), mirroring Excalidraw's thin/bold/extra-bold. */
export type StrokeWidth = 'thin' | 'bold' | 'extra';
export const STROKE_WIDTHS = ['thin', 'bold', 'extra'] as const;
export const STROKE_WIDTH_PX: Record<StrokeWidth, number> = { thin: 1, bold: 2, extra: 4 };

/** Line dash style. */
export type StrokeStyle = 'solid' | 'dashed' | 'dotted';
export const STROKE_STYLES = ['solid', 'dashed', 'dotted'] as const;

/** Background fill treatment. */
export type FillStyle = 'solid' | 'hachure' | 'cross-hatch';
export const FILL_STYLES = ['solid', 'hachure', 'cross-hatch'] as const;

/**
 * Reference to a single icon. Stored inline so the document is fully offline-round-trippable —
 * `name` is the Iconify ph:... id (so Claude Code can re-import the exact icon in generated code),
 * and `svgPath` + `viewBox` carry the raster body so the renderer doesn't need to re-resolve from
 * the icon set at paint time. Used in two places: as a property of any element (BaseElement.icon)
 * and as the body of the standalone IconElement. The svg element type uses a richer body field.
 */
export interface IconRef {
	name: string; // e.g. "ph:trending-up"
	svgPath: string; // concatenated `d` of every <path> in the body
	viewBox: string; // e.g. "0 0 256 256"
}

export interface ElementStyle {
	/** Fill / background color. CSS color string; `'transparent'` or undefined = no fill. */
	fill?: string;
	/** Stroke (border) color. CSS color string. */
	stroke?: string;
	/** Stroke weight bucket; resolves to px via STROKE_WIDTH_PX. */
	strokeWidth?: StrokeWidth;
	/** Stroke dash style. */
	strokeStyle?: StrokeStyle;
	/** Background fill treatment (solid vs hatched). */
	fillStyle?: FillStyle;
	/** Corner radius in px. */
	radius?: number;
	fontSize?: number;
	fontWeight?: number;
	/** Opacity 0..1. */
	opacity?: number;
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
	/** Optional hyperlink (Excalidraw `actionLink.tsx`, ⌘K). Emitted by the export compiler as
	 * `<a href="...">` wrapping the element's semantic output. */
	url?: string;
	/**
	 * Optional embedded icon. Every element type can carry one — the renderer paints it in the
	 * natural slot for that type (card header, input leading edge, nav brand, sidebar/list/tab
	 * item, modal title). For elements with no natural slot (frame, container, divider) the icon
	 * is rendered as a small top-left badge. The Markdown export emits `Icon: ph:<name>` so
	 * Claude Code can import the exact icon in the generated SvelteKit code.
	 */
	icon?: IconRef;
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
	/**
	 * @deprecated since icons unified onto `BaseElement.icon`. Old documents that stored the
	 * leading icon as `iconName`/`iconSvgPath` are still readable; new code reads/writes `icon`.
	 * The export compiler migrates either shape into the unified form.
	 */
	iconName?: string;
	/** @deprecated see `iconName`. */
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

/**
 * Arbitrary SVG body, pasted by the user. The body is the sanitized INNER markup (between
 * `<svg>...</svg>`), with `<script>`, event handlers, and `javascript:` URLs stripped at the
 * input boundary (RightPanel paste handler). The renderer extracts `<path d>` data and rasters
 * via Path2D, so what reaches storage is always safe to paint.
 */
export interface SvgElement extends BaseElement {
	type: 'svg';
	/** Sanitized inner SVG markup (between <svg>...</svg>). */
	body: string;
	/** Source viewBox (auto-extracted from the pasted markup; falls back to "0 0 100 100"). */
	viewBox: string;
}

// ---- Form controls ----------------------------------------------------------------------------

export interface CheckboxElement extends BaseElement {
	type: 'checkbox';
	checked?: boolean;
	labelText?: string;
}

export interface RadioElement extends BaseElement {
	type: 'radio';
	selected?: boolean;
	labelText?: string;
	groupName?: string;
}

export interface ToggleElement extends BaseElement {
	type: 'toggle';
	on?: boolean;
	labelText?: string;
}

export interface SliderElement extends BaseElement {
	type: 'slider';
	value?: number;
	min?: number;
	max?: number;
}

/**
 * Form `<select>` / dropdown picker. Named `dropdown` (not `select`) to avoid colliding with the
 * cursor tool slug `'select'` in `editor.svelte.ts:Tool`. The Markdown export still surfaces it
 * as a `<select>` in the generated SvelteKit code.
 */
export interface DropdownElement extends BaseElement {
	type: 'dropdown';
	options?: string[];
	value?: string;
	placeholder?: string;
}

// ---- Data display -----------------------------------------------------------------------------

export interface StatCardElement extends BaseElement {
	type: 'stat-card';
	value?: string;
	delta?: string;
	trend?: 'up' | 'down' | 'flat';
}

export interface BadgeElement extends BaseElement {
	type: 'badge';
	content?: string;
	variant?: 'neutral' | 'success' | 'warning' | 'danger' | 'info';
}

export interface ProgressElement extends BaseElement {
	type: 'progress';
	value?: number;
	kind?: 'linear' | 'circular';
	caption?: string;
}

export interface AvatarElement extends BaseElement {
	type: 'avatar';
	initials?: string;
	imageSrc?: string;
	shape?: 'circle' | 'square';
}

// ---- Feedback + Nav ---------------------------------------------------------------------------

export interface AlertElement extends BaseElement {
	type: 'alert';
	content?: string;
	variant?: 'info' | 'success' | 'warning' | 'danger';
}

export interface TooltipElement extends BaseElement {
	type: 'tooltip';
	content?: string;
}

export interface BreadcrumbElement extends BaseElement {
	type: 'breadcrumb';
	items?: string[];
	separator?: string;
}

export interface PaginationElement extends BaseElement {
	type: 'pagination';
	total?: number;
	current?: number;
}

export interface StepperElement extends BaseElement {
	type: 'stepper';
	steps?: string[];
	current?: number;
	orientation?: 'horizontal' | 'vertical';
}

export interface AccordionElement extends BaseElement {
	type: 'accordion';
	items?: string[];
	openIndices?: number[];
	layout?: LayoutIntent;
}

// ---- Layout + Marketing -----------------------------------------------------------------------

export interface SectionHeaderElement extends BaseElement {
	type: 'section-header';
	eyebrow?: string;
	heading?: string;
	subheading?: string;
}

export interface HeroElement extends BaseElement {
	type: 'hero';
	heading?: string;
	subheading?: string;
	ctaLabel?: string;
	layout?: LayoutIntent;
}

export interface FeatureGridElement extends BaseElement {
	type: 'feature-grid';
	columns?: number;
	layout?: LayoutIntent;
}

export interface TestimonialElement extends BaseElement {
	type: 'testimonial';
	quote?: string;
	attribution?: string;
	layout?: LayoutIntent;
}

export interface CtaSectionElement extends BaseElement {
	type: 'cta-section';
	heading?: string;
	subheading?: string;
	ctaLabel?: string;
	layout?: LayoutIntent;
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
	| DividerElement
	| SvgElement
	| CheckboxElement
	| RadioElement
	| ToggleElement
	| SliderElement
	| DropdownElement
	| StatCardElement
	| BadgeElement
	| ProgressElement
	| AvatarElement
	| AlertElement
	| TooltipElement
	| BreadcrumbElement
	| PaginationElement
	| StepperElement
	| AccordionElement
	| SectionHeaderElement
	| HeroElement
	| FeatureGridElement
	| TestimonialElement
	| CtaSectionElement;

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
	svg: SvgElement;
	checkbox: CheckboxElement;
	radio: RadioElement;
	toggle: ToggleElement;
	slider: SliderElement;
	dropdown: DropdownElement;
	'stat-card': StatCardElement;
	badge: BadgeElement;
	progress: ProgressElement;
	avatar: AvatarElement;
	alert: AlertElement;
	tooltip: TooltipElement;
	breadcrumb: BreadcrumbElement;
	pagination: PaginationElement;
	stepper: StepperElement;
	accordion: AccordionElement;
	'section-header': SectionHeaderElement;
	hero: HeroElement;
	'feature-grid': FeatureGridElement;
	testimonial: TestimonialElement;
	'cta-section': CtaSectionElement;
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
