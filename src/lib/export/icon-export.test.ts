import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { compileToMarkdown } from './to-markdown.ts';
import { compileToSvg } from './to-svg.ts';
import type { Element, ElementId, IconRef, LayoutDocument } from '../elements/types.ts';

/**
 * Phase F: icon emission + SvgElement emission, byte-stable. These fixtures intentionally use
 * fixed ids and timestamps so the export compiler's determinism contract carries through to
 * the new icon/svg surfaces. Modelled after `to-markdown.test.ts`.
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

const ICON: IconRef = {
	name: 'ph:trending-up',
	svgPath: 'M0 0L1 1',
	viewBox: '0 0 256 256'
};

function iconedDoc(): LayoutDocument {
	const elements: Record<ElementId, Element> = {};
	const add = (e: Element): void => {
		elements[e.id] = e;
	};
	add(
		el({
			id: 'card1',
			type: 'card',
			label: 'Revenue',
			x: 0,
			y: 0,
			width: 280,
			height: 160,
			icon: { ...ICON }
		} as Partial<Element> & Pick<Element, 'id' | 'type'>)
	);
	add(
		el({
			id: 'nav1',
			type: 'nav',
			label: 'Top nav',
			x: 0,
			y: 200,
			width: 1440,
			height: 56,
			icon: { ...ICON }
		} as Partial<Element> & Pick<Element, 'id' | 'type'>)
	);
	add(
		el({
			id: 'input1',
			type: 'input',
			x: 0,
			y: 300,
			width: 220,
			height: 40,
			placeholder: 'Search',
			inputKind: 'search',
			icon: { ...ICON }
		} as Partial<Element> & Pick<Element, 'id' | 'type'>)
	);
	return {
		schemaVersion: 1,
		id: 'doc-icon-fixture',
		name: 'Iconed',
		createdAt: '2026-01-01T00:00:00.000Z',
		updatedAt: '2026-01-02T00:00:00.000Z',
		canvas: { width: 1440, height: 900, background: 'oklch(0.955 0.004 110)' },
		elements,
		rootOrder: ['card1', 'nav1', 'input1']
	};
}

function noIconDoc(): LayoutDocument {
	const elements: Record<ElementId, Element> = {};
	elements['c'] = el({
		id: 'c',
		type: 'card',
		label: 'Plain',
		x: 0,
		y: 0,
		width: 280,
		height: 160
	});
	return {
		schemaVersion: 1,
		id: 'doc-plain',
		name: 'Plain',
		createdAt: '2026-01-01T00:00:00.000Z',
		updatedAt: '2026-01-01T00:00:00.000Z',
		canvas: { width: 1440, height: 900, background: '#fff' },
		elements,
		rootOrder: ['c']
	};
}

function svgDoc(): LayoutDocument {
	const elements: Record<ElementId, Element> = {};
	elements['s'] = el({
		id: 's',
		type: 'svg',
		label: 'Logo',
		x: 0,
		y: 0,
		width: 100,
		height: 80,
		body: '<rect/>',
		viewBox: '0 0 50 50'
	} as Partial<Element> & Pick<Element, 'id' | 'type'>);
	return {
		schemaVersion: 1,
		id: 'doc-svg',
		name: 'Svg',
		createdAt: '2026-01-01T00:00:00.000Z',
		updatedAt: '2026-01-01T00:00:00.000Z',
		canvas: { width: 1440, height: 900, background: '#fff' },
		elements,
		rootOrder: ['s']
	};
}

function sha(s: string): string {
	return createHash('sha256').update(s, 'utf8').digest('hex');
}

describe('Phase F: icon export emission', () => {
	it('is byte-stable across two runs (sha256 match)', () => {
		const a = compileToMarkdown(iconedDoc());
		const b = compileToMarkdown(iconedDoc());
		expect(sha(a)).toBe(sha(b));
		expect(a).toBe(b);
	});

	it('emits the literal "Icon: ph:trending-up" line for elements that carry an icon', () => {
		const md = compileToMarkdown(iconedDoc());
		expect(md).toMatch(/Icon: ph:trending-up/);
	});

	it('produces no "Icon:" line for elements that have no icon', () => {
		const md = compileToMarkdown(noIconDoc());
		expect(md).not.toMatch(/^Icon:/m);
		expect(md).not.toMatch(/Icon: ph:/);
	});

	it('emits an SvgElement form referencing the source viewBox', () => {
		const md = compileToMarkdown(svgDoc());
		expect(md).toMatch(/SvgElement/);
		expect(md).toContain('0 0 50 50');
	});
});

describe('SVG export resilience (per-element isolation, parity with staticSvgScene try/catch)', () => {
	// A doc with one healthy element and one malformed element whose renderEl throws
	// (a text node with no content → esc(undefined) throws). The export must skip the bad
	// node and still emit the good one, rather than aborting the whole SVG.
	function mixedDoc(): LayoutDocument {
		const elements: Record<ElementId, Element> = {};
		elements['good'] = el({ id: 'good', type: 'card', label: 'OK', x: 0, y: 0, width: 200, height: 120 });
		elements['bad'] = el({ id: 'bad', type: 'text', x: 0, y: 200, width: 100, height: 40 } as Partial<Element> &
			Pick<Element, 'id' | 'type'>);
		// Force the malformed state: a text element with undefined content.
		(elements['bad'] as { content?: string }).content = undefined;
		return {
			schemaVersion: 1,
			id: 'doc-mixed',
			name: 'Mixed',
			createdAt: '2026-01-01T00:00:00.000Z',
			updatedAt: '2026-01-01T00:00:00.000Z',
			canvas: { width: 800, height: 600, background: '#fff' },
			elements,
			rootOrder: ['good', 'bad']
		};
	}

	it('does not throw when one element is malformed', () => {
		expect(() => compileToSvg(mixedDoc())).not.toThrow();
	});

	it('still emits the healthy element and a well-formed <svg> wrapper', () => {
		const svg = compileToSvg(mixedDoc());
		expect(svg.startsWith('<svg')).toBe(true);
		expect(svg.trimEnd().endsWith('</svg>')).toBe(true);
		// The good card's rect (width 200) is present — proving the healthy element rendered even
		// though a later element threw. (The malformed text node is silently dropped.)
		expect(svg).toContain('width="200"');
	});
});
