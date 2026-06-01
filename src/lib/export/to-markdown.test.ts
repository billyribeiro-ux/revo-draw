import { describe, expect, it } from 'vitest';
import { compileToMarkdown } from './to-markdown.ts';
import type { Element, ElementId, LayoutDocument } from '../elements/types.ts';

/**
 * Fixture: a 2-column dashboard (sidebar + main) matching the §8 illustrative example, built by
 * hand with stable ids so the output is reproducible. The test asserts byte-stable, semantic,
 * hierarchical Markdown — and that compiling twice yields identical bytes.
 */

function el(partial: Partial<Element> & Pick<Element, 'id' | 'type'>): Element {
	return {
		parentId: null,
		x: 0,
		y: 0,
		width: 100,
		height: 100,
		rotation: 0,
		z: 0,
		...partial
	} as Element;
}

function fixture(): LayoutDocument {
	const elements: Record<ElementId, Element> = {};
	const add = (e: Element): void => {
		elements[e.id] = e;
	};

	// Screen frame
	add(
		el({
			id: 'frame1',
			type: 'frame',
			label: 'Dashboard',
			x: 0,
			y: 0,
			width: 1440,
			height: 900,
			layout: { mode: 'flex-row', gap: 0, padding: 0, responsive: 'reflow' }
		})
	);

	// Sidebar
	add(
		el({
			id: 'sidebar1',
			type: 'sidebar',
			label: 'Sidebar',
			parentId: 'frame1',
			x: 0,
			y: 0,
			width: 240,
			height: 900,
			z: 0,
			layout: { mode: 'flex-col', gap: 8, padding: 16, fixedWidth: 240, responsive: 'none' }
		})
	);
	add(
		el({
			id: 'navbtn1',
			type: 'button',
			parentId: 'sidebar1',
			x: 16,
			y: 16,
			width: 200,
			height: 40,
			z: 0,
			content: 'Overview',
			variant: 'ghost',
			iconName: 'ph:house'
		} as Partial<Element> & Pick<Element, 'id' | 'type'>)
	);
	add(
		el({
			id: 'navbtn2',
			type: 'button',
			parentId: 'sidebar1',
			x: 16,
			y: 64,
			width: 200,
			height: 40,
			z: 1,
			content: 'Reports',
			variant: 'ghost',
			iconName: 'ph:chart-bar'
		} as Partial<Element> & Pick<Element, 'id' | 'type'>)
	);
	add(
		el({
			id: 'navbtn3',
			type: 'button',
			parentId: 'sidebar1',
			x: 16,
			y: 112,
			width: 200,
			height: 40,
			z: 2,
			content: 'Settings',
			variant: 'ghost',
			iconName: 'ph:gear'
		} as Partial<Element> & Pick<Element, 'id' | 'type'>)
	);

	// Main column
	add(
		el({
			id: 'main1',
			type: 'container',
			label: 'Main',
			parentId: 'frame1',
			x: 240,
			y: 0,
			width: 1200,
			height: 900,
			z: 1,
			layout: { mode: 'flex-col', gap: 24, padding: 32, responsive: 'reflow' }
		})
	);
	// Stats row of three cards
	add(
		el({
			id: 'cardRev',
			type: 'card',
			label: 'Revenue',
			parentId: 'main1',
			x: 272,
			y: 100,
			width: 360,
			height: 140,
			z: 0
		})
	);
	add(
		el({
			id: 'cardUsers',
			type: 'card',
			label: 'Users',
			parentId: 'main1',
			x: 656,
			y: 100,
			width: 360,
			height: 140,
			z: 1
		})
	);
	add(
		el({
			id: 'cardChurn',
			type: 'card',
			label: 'Churn',
			parentId: 'main1',
			x: 1040,
			y: 100,
			width: 360,
			height: 140,
			z: 2
		})
	);
	// Chart region below
	add(
		el({
			id: 'chart1',
			type: 'chart',
			label: 'Trend',
			parentId: 'main1',
			x: 272,
			y: 280,
			width: 1128,
			height: 360,
			z: 3,
			chartKind: 'line'
		} as Partial<Element> & Pick<Element, 'id' | 'type'>)
	);

	return {
		schemaVersion: 1,
		id: 'doc-fixed-id',
		name: 'Acme Dashboard',
		createdAt: '2026-01-01T00:00:00.000Z',
		updatedAt: '2026-01-02T00:00:00.000Z',
		canvas: { width: 1440, height: 900, background: 'oklch(0.955 0.004 110)' },
		elements,
		rootOrder: ['frame1']
	};
}

const EXPECTED = `# Layout Spec: Acme Dashboard

Source: LayoutForge (schema v1). Canvas 1440×900.

## Screen: Dashboard (1440×900)
Layout: flex-row, gap 0. Responsive: reflow.

### Sidebar — sidebar, fixed width 240px, left (fixed 240px, full height)
Layout: flex-col, gap 8, padding 16.
  - Button (ghost): "Overview"  [icon: ph:house]  (hug, full width)
    Icon: ph:house
  - Button (ghost): "Reports"  [icon: ph:chart-bar]  (hug, full width)
    Icon: ph:chart-bar
  - Button (ghost): "Settings"  [icon: ph:gear]  (hug, full width)
    Icon: ph:gear

### Main — container, full height (flex 1 (fills remaining), full height)
Layout: flex-col, gap 24, padding 32. Responsive: reflow.
  - Card: "Revenue"  (hug)
  - Card: "Users"  (hug)
  - Card: "Churn"  (hug)
  - Chart: line  (flex 1 (fills remaining), full width)

---

## Implementation instructions for Claude Code

Implement this layout as a SvelteKit 2 + Svelte 5 (runes-only) page.

- TypeScript strict. pnpm. Phosphor icons via \`unplugin-icons\` (\`~icons/ph/...\`). Never Lucide.
- Use \`$state\`, \`$derived\`, \`$effect\`, \`$props\` only — no legacy stores, no \`export let\`, no \`$:\`.
- Semantic HTML: use \`<nav>\`, \`<aside>\`, \`<main>\`, \`<header>\`, \`<section>\`, \`<table>\`, \`<button>\`,
  \`<input>\`, headings (\`<h1>\`–\`<h3>\`), and lists where the spec indicates those roles.
- CSS with \`@layer\` cascade, logical properties (\`inline-size\`, \`block-size\`, \`padding-inline\`,
  \`margin-block\`, etc.), native CSS nesting, and OKLCH color tokens defined in \`:root\`.
- Translate each "Layout:" line into the corresponding flexbox/grid declarations
  (\`display: flex; flex-direction: …; gap: …; justify-content: …; align-items: …\` or
  \`display: grid; grid-template-columns: repeat(N, 1fr)\`).
- Honor every "Responsive:" directive using container queries or media queries:
  \`stack\` → switch to a single column; \`reflow\` → wrap/relayout; \`hide\` → \`display: none\` at
  narrow widths; \`scroll\` → \`overflow: auto\`.
- Re-import each named icon exactly (e.g. \`import House from "~icons/ph/house"\`).
- Extract components when content reuses or coheres (cards, nav items), not by line count.
- No placeholder code, no TODOs — deliver full, working implementations.
`;

describe('compileToMarkdown', () => {
	it('produces the expected semantic, hierarchical spec for a 2-column dashboard', () => {
		const md = compileToMarkdown(fixture());
		expect(md).toBe(EXPECTED);
	});

	it('is deterministic: compiling the same document twice is byte-identical', () => {
		const a = compileToMarkdown(fixture());
		const b = compileToMarkdown(fixture());
		expect(a).toBe(b);
	});

	it('contains no timestamps or ids from the document body', () => {
		const md = compileToMarkdown(fixture());
		expect(md).not.toContain('2026-01-01');
		expect(md).not.toContain('doc-fixed-id');
		expect(md).not.toContain('frame1');
	});

	it('is independent of element insertion order (stable sort, not Map order)', () => {
		const a = fixture();
		// Rebuild the same document with element keys inserted in reverse order.
		const reversed: Record<ElementId, Element> = {};
		for (const id of Object.keys(a.elements).reverse()) {
			const e = a.elements[id];
			if (e) reversed[id] = e;
		}
		const b: LayoutDocument = { ...a, elements: reversed };
		expect(compileToMarkdown(b)).toBe(compileToMarkdown(a));
	});
});

// ---- hierarchy integrity: 4 levels deep, mixed layout modes -------------------------------

function deepFixture(): LayoutDocument {
	const elements: Record<ElementId, Element> = {};
	const add = (e: Element): void => {
		elements[e.id] = e;
	};
	add(el({ id: 'L0', type: 'frame', label: 'Screen', width: 1200, height: 800, layout: { mode: 'flex-col', gap: 0 } }));
	add(el({ id: 'L1', type: 'container', label: 'Level 1', parentId: 'L0', x: 0, y: 0, width: 1200, height: 800, layout: { mode: 'flex-row', gap: 12, padding: 16 } }));
	add(el({ id: 'L2', type: 'card', label: 'Level 2', parentId: 'L1', x: 20, y: 20, width: 560, height: 600, layout: { mode: 'flex-col', gap: 8, padding: 12 } }));
	add(el({ id: 'L3', type: 'list', label: 'Level 3', parentId: 'L2', x: 40, y: 40, width: 480, height: 400, layout: { mode: 'grid', gap: 6, gridCols: 3 } }));
	add(el({ id: 'L4a', type: 'text', content: 'Leaf A', parentId: 'L3', x: 50, y: 50, width: 120, height: 24, z: 0 } as Partial<Element> & Pick<Element, 'id' | 'type'>));
	add(el({ id: 'L4b', type: 'text', content: 'Leaf B', parentId: 'L3', x: 200, y: 50, width: 120, height: 24, z: 1 } as Partial<Element> & Pick<Element, 'id' | 'type'>));
	return {
		schemaVersion: 1,
		id: 'deep',
		name: 'Deep',
		createdAt: '2026-01-01T00:00:00.000Z',
		updatedAt: '2026-01-01T00:00:00.000Z',
		canvas: { width: 1200, height: 800, background: '#fff' },
		elements,
		rootOrder: ['L0']
	};
}

describe('hierarchy integrity', () => {
	it('round-trips 4 levels of nesting with mixed layout modes', () => {
		const md = compileToMarkdown(deepFixture());
		// Each level present, deepening indentation, mixed modes surfaced.
		expect(md).toContain('## Screen: Screen');
		expect(md).toContain('### Level 1 — container');
		expect(md).toContain('flex-row');
		expect(md).toContain('Card: "Level 2"');
		expect(md).toContain('flex-col');
		expect(md).toContain('grid, 3 columns');
		expect(md).toContain('Text (body): "Leaf A"');
		expect(md).toContain('Text (body): "Leaf B"');
		// Deepest leaves are indented further than the level-2 bullet.
		const leafLine = md.split('\n').find((l) => l.includes('Leaf A')) ?? '';
		const cardLine = md.split('\n').find((l) => l.includes('Level 2')) ?? '';
		expect(leafLine.search(/\S/)).toBeGreaterThan(cardLine.search(/\S/));
	});

	it('is deterministic for the deep fixture', () => {
		expect(compileToMarkdown(deepFixture())).toBe(compileToMarkdown(deepFixture()));
	});
});

// ---- geometry -> intent inference ----------------------------------------------------------

function bareContainer(children: { x: number; y: number; w: number; h: number }[]): LayoutDocument {
	const elements: Record<ElementId, Element> = {};
	// Container with NO explicit layout — forces geometric inference.
	elements['c'] = el({ id: 'c', type: 'container', label: 'Region', x: 0, y: 0, width: 1000, height: 600 });
	children.forEach((c, i) => {
		elements[`k${i}`] = el({ id: `k${i}`, type: 'card', label: `K${i}`, parentId: 'c', x: c.x, y: c.y, width: c.w, height: c.h, z: i });
	});
	return {
		schemaVersion: 1,
		id: 'infer',
		name: 'Infer',
		createdAt: '2026-01-01T00:00:00.000Z',
		updatedAt: '2026-01-01T00:00:00.000Z',
		canvas: { width: 1000, height: 600, background: '#fff' },
		elements,
		rootOrder: ['c']
	};
}

describe('geometry -> intent inference (no explicit LayoutIntent)', () => {
	it('infers flex-row for a horizontal stat-card row', () => {
		const md = compileToMarkdown(
			bareContainer([
				{ x: 0, y: 100, w: 200, h: 120 },
				{ x: 220, y: 100, w: 200, h: 120 },
				{ x: 440, y: 100, w: 200, h: 120 }
			])
		);
		expect(md).toMatch(/Region.*\n.*flex-row/);
	});

	it('infers flex-col for a vertical stack', () => {
		const md = compileToMarkdown(
			bareContainer([
				{ x: 0, y: 0, w: 300, h: 80 },
				{ x: 0, y: 100, w: 300, h: 80 },
				{ x: 0, y: 200, w: 300, h: 80 }
			])
		);
		expect(md).toMatch(/Region.*\n.*flex-col/);
	});

	it('infers a grid for a 2x2 matrix of similar cards', () => {
		const md = compileToMarkdown(
			bareContainer([
				{ x: 0, y: 0, w: 200, h: 150 },
				{ x: 220, y: 0, w: 200, h: 150 },
				{ x: 0, y: 170, w: 200, h: 150 },
				{ x: 220, y: 170, w: 200, h: 150 }
			])
		);
		expect(md).toMatch(/grid, 2 columns/);
	});
});

// ---- failure modes: none may throw --------------------------------------------------------

describe('failure modes produce sane output, never throw', () => {
	function doc(elements: Record<ElementId, Element>, rootOrder: ElementId[]): LayoutDocument {
		return {
			schemaVersion: 1,
			id: 'edge',
			name: 'Edge',
			createdAt: '2026-01-01T00:00:00.000Z',
			updatedAt: '2026-01-01T00:00:00.000Z',
			canvas: { width: 800, height: 600, background: '#fff' },
			elements,
			rootOrder
		};
	}

	it('empty document', () => {
		const md = compileToMarkdown(doc({}, []));
		expect(md).toContain('# Layout Spec: Edge');
		expect(md).toContain('Implementation instructions');
	});

	it('single element', () => {
		const md = compileToMarkdown(doc({ a: el({ id: 'a', type: 'text', content: 'Solo' } as Partial<Element> & Pick<Element, 'id' | 'type'>) }, ['a']));
		expect(md).toContain('"Solo"');
	});

	it('orphaned parentId renders the element at root rather than dropping it', () => {
		const orphan = el({ id: 'o', type: 'card', label: 'Orphan', parentId: 'ghost' } as Partial<Element> & Pick<Element, 'id' | 'type'>);
		const md = compileToMarkdown(doc({ o: orphan }, []));
		expect(md).toContain('Orphan');
	});

	it('parent cycle does not infinite-loop', () => {
		const a = el({ id: 'a', type: 'container', label: 'A', parentId: 'b' });
		const b = el({ id: 'b', type: 'container', label: 'B', parentId: 'a' });
		expect(() => compileToMarkdown(doc({ a, b }, []))).not.toThrow();
	});

	it('zero-size, rotated, and out-of-bounds elements', () => {
		const zero = el({ id: 'z', type: 'divider', x: 0, y: 0, width: 0, height: 0 } as Partial<Element> & Pick<Element, 'id' | 'type'>);
		const rot = el({ id: 'r', type: 'card', label: 'Rot', x: 100, y: 100, width: 80, height: 80, rotation: 0.7 });
		const oob = el({ id: 'oob', type: 'text', content: 'Far', x: 99999, y: -5000, width: 50, height: 20 } as Partial<Element> & Pick<Element, 'id' | 'type'>);
		expect(() => compileToMarkdown(doc({ z: zero, r: rot, oob }, ['z', 'r', 'oob']))).not.toThrow();
		const md = compileToMarkdown(doc({ z: zero, r: rot, oob }, ['z', 'r', 'oob']));
		expect(md).toContain('Rot');
		expect(md).toContain('Far');
	});
});
