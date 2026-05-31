/**
 * THE EXPORT COMPILER (§8) — the reason this tool exists.
 *
 * Compiles the scene graph into a structured Markdown *layout spec* designed to be pasted into
 * Claude Code as a brief for generating a SvelteKit 5 implementation. It is NOT a visual
 * description and NOT raw coordinates: geometry is translated into layout *intent* (flex
 * direction, grid columns, gaps, alignment, fixed vs. fluid sizing, relative order).
 *
 * DETERMINISM CONTRACT: the same document always yields byte-identical Markdown. We achieve this
 * by (1) ordering children by geometry (top-to-bottom, then left-to-right) with id as a final
 * tiebreaker, (2) never emitting timestamps, ids, or random values into the body, and (3) using
 * fixed, rounded numeric formatting. The determinism test in to-markdown.test.ts asserts this.
 *
 * INPUT: a pure `LayoutDocument` snapshot (no reactive proxies). The compiler does not read the
 * scene graph singleton, so it is trivially testable.
 */
import {
	isContainerType,
	type Element,
	type ElementId,
	type LayoutDocument,
	type LayoutIntent,
	type LayoutMode
} from '../elements/types.js';
import { defaultLabel } from '../elements/defaults.js';

interface Node {
	el: Element;
	children: Node[];
}

const INDENT = '  ';

export function compileToMarkdown(doc: LayoutDocument): string {
	const roots = buildForest(doc);
	const lines: string[] = [];

	lines.push(`# Layout Spec: ${doc.name}`);
	lines.push('');
	lines.push(
		`Source: LayoutForge (schema v${doc.schemaVersion}). Canvas ${round(doc.canvas.width)}×${round(
			doc.canvas.height
		)}.`
	);
	lines.push('');

	// Each top-level frame becomes a "Screen"; non-frame roots are grouped under a synthetic one.
	const frames = roots.filter((n) => n.el.type === 'frame');
	const looseRoots = roots.filter((n) => n.el.type !== 'frame');

	if (frames.length === 0 && looseRoots.length > 0) {
		emitScreen(lines, { el: syntheticFrame(doc), children: looseRoots }, doc);
	} else {
		for (const frame of frames) emitScreen(lines, frame, doc);
		if (looseRoots.length > 0) {
			lines.push('## Loose elements (not inside a frame)');
			lines.push('');
			for (const n of looseRoots) emitNode(lines, n, 0, doc, null);
			lines.push('');
		}
	}

	lines.push('---');
	lines.push('');
	lines.push(...implementationInstructions());

	// Normalize: collapse runs of blank lines to a single blank line, and end with exactly one
	// trailing newline. Both are part of the byte-stability contract.
	return (
		lines
			.join('\n')
			.replace(/\n{3,}/g, '\n\n')
			.replace(/\s+$/, '') + '\n'
	);
}

function syntheticFrame(doc: LayoutDocument): Element {
	return {
		id: '__synthetic_root__' as ElementId,
		type: 'frame',
		parentId: null,
		x: 0,
		y: 0,
		width: doc.canvas.width,
		height: doc.canvas.height,
		rotation: 0,
		z: 0,
		label: doc.name,
		layout: { mode: 'flex-col', gap: 0, padding: 0, responsive: 'reflow' }
	};
}

// ---- forest construction (deterministic ordering) -------------------------------------------

function buildForest(doc: LayoutDocument): Node[] {
	const elements = doc.elements;
	// Group by effective parent. An element is treated as a ROOT (parent = null) if its parentId is
	// null, references a missing element, or references a non-container — this makes orphaned or
	// malformed `parentId`s render at the top level rather than vanishing from the export.
	const byParent = new Map<ElementId | null, Element[]>();
	const effectiveParent = (el: Element): ElementId | null => {
		if (el.parentId === null) return null;
		const parent = elements[el.parentId];
		if (!parent || !isContainerType(parent.type)) return null;
		return el.parentId;
	};
	for (const el of Object.values(elements)) {
		const key = effectiveParent(el);
		const list = byParent.get(key) ?? [];
		list.push(el);
		byParent.set(key, list);
	}

	// `visited` guards against parent cycles in a corrupt document (would otherwise recurse forever).
	const visited = new Set<ElementId>();
	const build = (parentId: ElementId | null): Node[] => {
		const kids = (byParent.get(parentId) ?? []).slice().sort(geometricOrder);
		const nodes: Node[] = [];
		for (const el of kids) {
			if (visited.has(el.id)) continue; // cycle / duplicate guard
			visited.add(el.id);
			nodes.push({ el, children: isContainerType(el.type) ? build(el.id) : [] });
		}
		return nodes;
	};
	return build(null);
}

/**
 * Reading order: top-to-bottom in bands, then left-to-right within a band. Elements whose
 * vertical centers are within a tolerance are treated as the same row. `id` breaks ties so the
 * order is total and stable.
 */
function geometricOrder(a: Element, b: Element): number {
	const ROW_TOL = 12;
	const ay = a.y + a.height / 2;
	const by = b.y + b.height / 2;
	if (Math.abs(ay - by) > ROW_TOL) return ay - by;
	if (Math.abs(a.x - b.x) > 0.5) return a.x - b.x;
	return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

// ---- emission -------------------------------------------------------------------------------

function emitScreen(lines: string[], frame: Node, doc: LayoutDocument): void {
	const name = labelOf(frame.el);
	lines.push(`## Screen: ${name} (${round(frame.el.width)}×${round(frame.el.height)})`);
	const intent = resolveIntent(frame);
	lines.push(layoutSentence(intent, frame, true));
	lines.push('');
	for (const child of frame.children) emitNode(lines, child, 0, doc, frame);
	lines.push('');
}

function emitNode(
	lines: string[],
	node: Node,
	depth: number,
	doc: LayoutDocument,
	parent: Node | null
): void {
	const { el } = node;

	if (isContainerType(el.type) && depth === 0) {
		// Top-level regions inside a screen get an H3 heading + a layout line. The region's own
		// size within the screen is part of its descriptor; its flex behavior in the screen is
		// appended so the implementer knows fixed vs. grow.
		const sizing = parent ? childSizingHint(node, parent) : '';
		lines.push(`### ${labelOf(el)} — ${regionDescriptor(el, doc)}${sizing ? ` (${sizing})` : ''}`);
		const intent = resolveIntent(node);
		lines.push(layoutSentence(intent, node, false));
		for (const child of node.children) emitNode(lines, child, depth + 1, doc, node);
		lines.push('');
		return;
	}

	// Everything else is a bullet, nested by depth. Append the child's flex sizing intent so the
	// implementer doesn't have to guess grow vs. fixed vs. hug within its parent.
	const pad = INDENT.repeat(Math.max(0, depth));
	const sizing = parent ? childSizingHint(node, parent) : '';
	lines.push(`${pad}- ${leafDescriptor(el)}${sizing ? `  (${sizing})` : ''}`);

	if (isContainerType(el.type) && node.children.length > 0) {
		const intent = resolveIntent(node);
		const responsive = responsiveClause(intent);
		lines.push(`${pad}${INDENT}_Layout: ${layoutClause(intent)}.${responsive ? ` ${responsive}` : ''}_`);
		for (const child of node.children) emitNode(lines, child, depth + 1, doc, node);
	}
}

// ---- descriptors ----------------------------------------------------------------------------

function labelOf(el: Element): string {
	return (el.label && el.label.trim()) || defaultLabel(el.type);
}

/**
 * A child's sizing intent within its flex parent, so the implementer never has to guess whether
 * an item grows, is fixed, or hugs its content. Resolution order:
 *   1. explicit fixed sizing on the child's LayoutIntent → "fixed Npx"
 *   2. the child has equal main-axis share with siblings that together fill the parent → "flex 1"
 *   3. otherwise → "hug" (size to content)
 * Only meaningful when the parent is flex-row / flex-col; returns '' for flow/grid/absolute.
 */
function childSizingHint(node: Node, parent: Node): string {
	const parentIntent = resolveIntent(parent);
	const mode = parentIntent.mode;
	if (mode !== 'flex-row' && mode !== 'flex-col') return '';

	const el = node.el;
	const horizontal = mode === 'flex-row';
	const siblings = parent.children.map((c) => c.el);
	if (siblings.length === 0) return '';

	const mainSize = (e: Element): number => (horizontal ? e.width : e.height);
	const crossSize = (e: Element): number => (horizontal ? e.height : e.width);
	const padding = parentIntent.padding ?? 0;
	const gap = parentIntent.gap ?? 0;
	const parentMain = horizontal ? parent.el.width : parent.el.height;
	const parentCross = horizontal ? parent.el.height : parent.el.width;
	const availMain = parentMain - padding * 2 - gap * Math.max(0, siblings.length - 1);
	const availCross = parentCross - padding * 2;

	// ---- main-axis behavior (grow / fixed / hug) --------------------------------------------
	const explicitFixed = horizontal ? el.layout?.fixedWidth : el.layout?.fixedHeight;
	const sizes = siblings.map(mainSize);
	const total = sizes.reduce((a, b) => a + b, 0);
	const mean = total / siblings.length;
	const equalShare =
		mean > 0 && siblings.length > 1 && sizes.every((s) => Math.abs(s - mean) <= mean * 0.2);
	const collectivelyFill = availMain > 0 && total >= availMain * 0.82;

	let mainHint: string;
	if (explicitFixed != null) {
		mainHint = `fixed ${round(explicitFixed)}px`;
	} else if (equalShare && collectivelyFill) {
		mainHint = 'flex 1';
	} else if (
		// The single largest sibling that dominates the main axis is the growing one.
		siblings.length > 1 &&
		mainSize(el) === Math.max(...sizes) &&
		mainSize(el) >= mean * 1.5
	) {
		mainHint = 'flex 1 (fills remaining)';
	} else if (siblings.length === 1 && mainSize(el) >= availMain * 0.82) {
		mainHint = 'fills';
	} else {
		mainHint = 'hug';
	}

	// ---- cross-axis behavior (stretch full vs fixed) ----------------------------------------
	const stretches = availCross > 0 && crossSize(el) >= availCross * 0.9;
	const crossLabel = horizontal ? 'full height' : 'full width';
	const crossHint = stretches ? crossLabel : '';

	return [mainHint, crossHint].filter(Boolean).join(', ');
}

/** Short phrase describing a top-level region's role and sizing. */
function regionDescriptor(el: Element, doc: LayoutDocument): string {
	const parts: string[] = [el.type];
	const sizing = sizingDescriptor(el, doc);
	if (sizing) parts.push(sizing);
	if (el.type === 'sidebar') {
		const side = 'side' in el ? el.side : 'left';
		parts.push(side ?? 'left');
	}
	return parts.join(', ');
}

/** Fixed vs. fluid sizing inferred from layout intent + geometry relative to its parent. */
function sizingDescriptor(el: Element, doc: LayoutDocument): string {
	const fw = el.layout?.fixedWidth;
	const fh = el.layout?.fixedHeight;
	if (fw && fh) return `fixed ${round(fw)}×${round(fh)}px`;
	if (fw) return `fixed width ${round(fw)}px`;
	if (fh) return `fixed height ${round(fh)}px`;

	const parent = el.parentId ? doc.elements[el.parentId] : null;
	const containerW = parent ? parent.width : doc.canvas.width;
	const containerH = parent ? parent.height : doc.canvas.height;
	const fillsW = el.width >= containerW * 0.9;
	const fillsH = el.height >= containerH * 0.9;
	if (el.type === 'sidebar') return `fixed width ${round(el.width)}px`;
	if (fillsW && fillsH) return 'fills container';
	if (fillsW) return 'full width';
	if (fillsH) return 'full height';
	return 'fluid';
}

/** Bullet text for a leaf (or container header bullet) element. */
function leafDescriptor(el: Element): string {
	switch (el.type) {
		case 'text': {
			const role = 'textRole' in el ? el.textRole : 'body';
			const content = 'content' in el ? el.content : '';
			return `Text (${role ?? 'body'}): ${quote(content)}`;
		}
		case 'button': {
			const content = 'content' in el ? el.content : labelOf(el);
			const variant = 'variant' in el && el.variant ? el.variant : 'primary';
			const icon = 'iconName' in el && el.iconName ? `  [icon: ${el.iconName}]` : '';
			return `Button (${variant}): ${quote(content)}${icon}`;
		}
		case 'input': {
			const kind = 'inputKind' in el ? el.inputKind : 'text';
			const ph = 'placeholder' in el ? el.placeholder : undefined;
			const lbl = 'labelText' in el ? el.labelText : undefined;
			const bits = [`Input (${kind ?? 'text'})`];
			if (lbl) bits.push(`label ${quote(lbl)}`);
			if (ph) bits.push(`placeholder ${quote(ph)}`);
			return bits.join(', ');
		}
		case 'icon': {
			const name = 'iconName' in el ? el.iconName : 'ph:square';
			return `Icon [icon: ${name}]`;
		}
		case 'image': {
			const alt = 'alt' in el && el.alt ? `: ${quote(el.alt)}` : '';
			const ar = 'aspectRatio' in el && el.aspectRatio ? ` (aspect ${round(el.aspectRatio, 2)})` : '';
			return `Image${alt}${ar}`;
		}
		case 'table': {
			const cols = 'columns' in el && el.columns ? el.columns : [];
			const rows = 'rowCountHint' in el ? el.rowCountHint : undefined;
			const colStr = cols.length ? ` — columns: ${cols.map(quote).join(', ')}` : '';
			const rowStr = rows ? `, ~${rows} rows` : '';
			return `DataTable${colStr}${rowStr}`;
		}
		case 'chart': {
			const kind = 'chartKind' in el ? el.chartKind : 'line';
			const cap = 'caption' in el && el.caption ? `: ${quote(el.caption)}` : '';
			return `Chart: ${kind}${cap}`;
		}
		case 'list': {
			const ordered = 'ordered' in el ? el.ordered : false;
			const n = 'itemCountHint' in el ? el.itemCountHint : undefined;
			return `${ordered ? 'Ordered list' : 'List'}${n ? ` (~${n} items)` : ''}`;
		}
		case 'tabs': {
			const tabs = 'tabs' in el && el.tabs ? el.tabs : [];
			return `Tabs: ${tabs.map(quote).join(', ')}`;
		}
		case 'modal': {
			const title = 'title' in el && el.title ? el.title : labelOf(el);
			return `Modal: ${quote(title)}`;
		}
		case 'nav': {
			const o = 'orientation' in el ? el.orientation : 'horizontal';
			return `Nav (${o ?? 'horizontal'})`;
		}
		case 'sidebar': {
			const side = 'side' in el ? el.side : 'left';
			return `Sidebar (${side ?? 'left'})`;
		}
		case 'divider': {
			const o = 'orientation' in el ? el.orientation : 'horizontal';
			return `Divider (${o ?? 'horizontal'})`;
		}
		case 'card':
			return `Card: ${quote(labelOf(el))}`;
		case 'container':
			return `Container${el.label ? `: ${quote(el.label)}` : ''}`;
		case 'frame':
			return `Frame: ${quote(labelOf(el))}`;
		default:
			return labelOf(el);
	}
}

// ---- layout intent inference ----------------------------------------------------------------

/**
 * Resolve the effective layout intent for a node: use the explicit `LayoutIntent` if present,
 * otherwise infer one from the geometric arrangement of its children.
 */
function resolveIntent(node: Node): LayoutIntent {
	if (node.el.layout) {
		// Fill in mode if children imply something more specific than the stored generic 'flow'.
		if (node.el.layout.mode === 'flow' && node.children.length > 1) {
			return { ...node.el.layout, mode: inferMode(node) };
		}
		return node.el.layout;
	}
	return {
		mode: node.children.length > 0 ? inferMode(node) : 'flow',
		gap: inferGap(node),
		responsive: 'reflow'
	};
}

/** Infer flex/grid direction from child arrangement. */
function inferMode(node: Node): LayoutMode {
	const kids = node.children.map((c) => c.el);
	if (kids.length <= 1) return 'flex-col';

	// Are children primarily in a single row (similar y) or a single column (similar x)?
	const ys = kids.map((k) => k.y + k.height / 2);
	const xs = kids.map((k) => k.x + k.width / 2);
	const ySpread = spread(ys);
	const xSpread = spread(xs);

	// Grid heuristic: multiple rows AND multiple columns of comparably-sized children.
	const rows = clusterCount(kids.map((k) => k.y + k.height / 2), 14);
	const cols = clusterCount(kids.map((k) => k.x + k.width / 2), 14);
	if (rows >= 2 && cols >= 2 && kids.length >= 4 && similarSizes(kids)) {
		return 'grid';
	}

	if (xSpread > ySpread * 1.3) return 'flex-row';
	if (ySpread > xSpread * 1.3) return 'flex-col';
	// Ambiguous: default to column (vertical stacking reads best for dashboards).
	return 'flex-col';
}

function inferGap(node: Node): number {
	const kids = node.children.map((c) => c.el).slice().sort((a, b) => a.y - b.y || a.x - b.x);
	if (kids.length < 2) return 0;
	const gaps: number[] = [];
	for (let i = 1; i < kids.length; i++) {
		const prev = kids[i - 1]!;
		const cur = kids[i]!;
		const vGap = cur.y - (prev.y + prev.height);
		const hGap = cur.x - (prev.x + prev.width);
		const g = Math.max(0, Math.min(Math.abs(vGap), Math.abs(hGap)));
		if (Number.isFinite(g)) gaps.push(g);
	}
	if (gaps.length === 0) return 0;
	const median = gaps.slice().sort((a, b) => a - b)[Math.floor(gaps.length / 2)] ?? 0;
	return round(median);
}

function inferGridCols(node: Node): number {
	return clusterCount(node.children.map((c) => c.el.x + c.el.width / 2), 14);
}

function spread(values: number[]): number {
	if (values.length === 0) return 0;
	return Math.max(...values) - Math.min(...values);
}

/** Count distinct clusters along a 1D axis (rows or columns) within a tolerance. */
function clusterCount(values: number[], tol: number): number {
	const sorted = values.slice().sort((a, b) => a - b);
	let clusters = 0;
	let last = -Infinity;
	for (const v of sorted) {
		if (v - last > tol) {
			clusters++;
			last = v;
		}
	}
	return clusters;
}

function similarSizes(kids: Element[]): boolean {
	if (kids.length < 2) return true;
	const ws = kids.map((k) => k.width);
	const hs = kids.map((k) => k.height);
	return spread(ws) <= avg(ws) * 0.4 && spread(hs) <= avg(hs) * 0.6;
}

function avg(values: number[]): number {
	return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

// ---- layout sentences -----------------------------------------------------------------------

function layoutSentence(intent: LayoutIntent, node: Node, isScreen: boolean): string {
	const clause = layoutClause(intent, node);
	const responsive = responsiveClause(intent);
	const head = isScreen ? 'Layout' : 'Layout';
	return `${head}: ${clause}.${responsive ? ` ${responsive}` : ''}`;
}

function layoutClause(intent: LayoutIntent, node?: Node): string {
	const parts: string[] = [];
	switch (intent.mode) {
		case 'flex-row':
			parts.push('flex-row');
			break;
		case 'flex-col':
			parts.push('flex-col');
			break;
		case 'grid': {
			const cols = intent.gridCols ?? (node ? inferGridCols(node) : 2);
			parts.push(`grid, ${cols} columns`);
			break;
		}
		case 'absolute':
			parts.push('absolute positioning');
			break;
		case 'flow':
		default:
			parts.push('flow');
			break;
	}
	if (intent.gap !== undefined) parts.push(`gap ${round(intent.gap)}`);
	if (intent.padding !== undefined && intent.padding > 0) parts.push(`padding ${round(intent.padding)}`);
	if (intent.justify) parts.push(`justify ${intent.justify}`);
	if (intent.align) parts.push(`align ${intent.align}`);
	return parts.join(', ');
}

function responsiveClause(intent: LayoutIntent): string {
	const r = intent.responsive;
	if (!r || r === 'none') return '';
	const map: Record<string, string> = {
		stack: 'Responsive: stack on narrow.',
		reflow: 'Responsive: reflow.',
		hide: 'Responsive: hide on narrow.',
		scroll: 'Responsive: scroll on overflow.'
	};
	return map[r] ?? '';
}

// ---- instruction block ----------------------------------------------------------------------

function implementationInstructions(): string[] {
	return [
		'## Implementation instructions for Claude Code',
		'',
		'Implement this layout as a SvelteKit 2 + Svelte 5 (runes-only) page.',
		'',
		'- TypeScript strict. pnpm. Phosphor icons via `unplugin-icons` (`~icons/ph/...`). Never Lucide.',
		'- Use `$state`, `$derived`, `$effect`, `$props` only — no legacy stores, no `export let`, no `$:`.',
		'- Semantic HTML: use `<nav>`, `<aside>`, `<main>`, `<header>`, `<section>`, `<table>`, `<button>`,',
		'  `<input>`, headings (`<h1>`–`<h3>`), and lists where the spec indicates those roles.',
		'- CSS with `@layer` cascade, logical properties (`inline-size`, `block-size`, `padding-inline`,',
		'  `margin-block`, etc.), native CSS nesting, and OKLCH color tokens defined in `:root`.',
		'- Translate each "Layout:" line into the corresponding flexbox/grid declarations',
		'  (`display: flex; flex-direction: …; gap: …; justify-content: …; align-items: …` or',
		'  `display: grid; grid-template-columns: repeat(N, 1fr)`).',
		'- Honor every "Responsive:" directive using container queries or media queries:',
		'  `stack` → switch to a single column; `reflow` → wrap/relayout; `hide` → `display: none` at',
		'  narrow widths; `scroll` → `overflow: auto`.',
		'- Re-import each named icon exactly (e.g. `import House from "~icons/ph/house"`).',
		'- Extract components when content reuses or coheres (cards, nav items), not by line count.',
		'- No placeholder code, no TODOs — deliver full, working implementations.'
	];
}

// ---- formatting helpers (determinism) -------------------------------------------------------

function round(n: number, dp = 0): number {
	const f = Math.pow(10, dp);
	return Math.round(n * f) / f;
}

function quote(s: string): string {
	const trimmed = s.replace(/\s+/g, ' ').trim();
	return `"${trimmed.replace(/"/g, '\\"')}"`;
}
