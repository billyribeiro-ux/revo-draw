import { describe, expect, it } from 'vitest';
import { createElement } from './defaults.ts';
import {
	SEMANTIC_TYPES,
	isContainerType,
	type AlertElement,
	type BadgeElement,
	type IconRef,
	type SemanticType,
	type SliderElement,
	type StatCardElement
} from './types.ts';

/**
 * Phase E — vocabulary expansion. The 20 new semantic types must round-trip through the
 * `createElement` factory (no partials enter the scene graph), be flagged correctly for
 * container-ness, and accept overrides via the `init` partial just like the legacy types.
 *
 * This mirrors `svg-element.test.ts` / `uuid.test.ts`: pure node-env tests, direct imports, no
 * Tauri runtime needed. Determinism of the Markdown export for these types is asserted by the
 * CDP probe (`scripts/probe-phase-e.mjs`) and by the existing `to-markdown.test.ts` fixture.
 */

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const NEW_CONTAINER_TYPES = [
	'accordion',
	'hero',
	'feature-grid',
	'testimonial',
	'cta-section'
] as const satisfies readonly SemanticType[];

describe('createElement — every SemanticType produces a well-formed element', () => {
	it.each(SEMANTIC_TYPES)('createElement(%s, {x:10,y:20}) is well-formed', (type) => {
		const result = createElement(type, { x: 10, y: 20 });
		expect(result.type).toBe(type);
		expect(typeof result.id).toBe('string');
		expect(result.id).toMatch(UUID_V7);
		expect(result.parentId).toBeNull();
		expect(result.x).toBe(10);
		expect(result.y).toBe(20);
		expect(result.width).toBeGreaterThan(0);
		expect(result.height).toBeGreaterThan(0);
		expect(result.rotation).toBe(0);
		expect(result.z).toBe(0);
	});
});

describe('isContainerType — new container types are flagged', () => {
	it.each(NEW_CONTAINER_TYPES)('isContainerType(%s) === true', (type) => {
		expect(isContainerType(type)).toBe(true);
	});

	it('non-container Phase E types are NOT flagged as containers', () => {
		const leaves: SemanticType[] = [
			'checkbox',
			'radio',
			'toggle',
			'slider',
			'dropdown',
			'stat-card',
			'badge',
			'progress',
			'avatar',
			'alert',
			'tooltip',
			'breadcrumb',
			'pagination',
			'stepper',
			'section-header'
		];
		for (const t of leaves) {
			expect(isContainerType(t)).toBe(false);
		}
	});
});

describe('Phase E — unified icon field round-trips', () => {
	const icon: IconRef = {
		name: 'ph:trending-up',
		svgPath: 'M0 0',
		viewBox: '0 0 256 256'
	};

	it('stat-card accepts an icon via init and preserves it', () => {
		const el = createElement('stat-card', { x: 0, y: 0, icon }) as StatCardElement;
		expect(el.icon).toBeDefined();
		expect(el.icon?.name).toBe('ph:trending-up');
		expect(el.icon?.svgPath).toBe('M0 0');
		expect(el.icon?.viewBox).toBe('0 0 256 256');
	});

	it('alert accepts an icon via init and preserves it', () => {
		const el = createElement('alert', { x: 0, y: 0, icon }) as AlertElement;
		expect(el.icon?.name).toBe('ph:trending-up');
	});

	it('badge accepts an icon via init and preserves it', () => {
		const el = createElement('badge', { x: 0, y: 0, icon }) as BadgeElement;
		expect(el.icon?.name).toBe('ph:trending-up');
	});
});

describe('Phase E — type-specific init overrides flow through', () => {
	it('slider value override is preserved', () => {
		const el = createElement('slider', { x: 0, y: 0, value: 73 }) as SliderElement;
		expect(el.value).toBe(73);
	});

	it('stat-card value/delta/trend overrides are preserved', () => {
		const el = createElement('stat-card', {
			x: 0,
			y: 0,
			value: '$42.5M',
			delta: '+12%',
			trend: 'up'
		}) as StatCardElement;
		expect(el.value).toBe('$42.5M');
		expect(el.delta).toBe('+12%');
		expect(el.trend).toBe('up');
	});

	it('alert content + variant overrides are preserved', () => {
		const el = createElement('alert', {
			x: 0,
			y: 0,
			content: 'Disk almost full',
			variant: 'warning'
		}) as AlertElement;
		expect(el.content).toBe('Disk almost full');
		expect(el.variant).toBe('warning');
	});

	it('hero heading override is preserved', () => {
		const el = createElement('hero', {
			x: 0,
			y: 0,
			heading: 'Welcome',
			subheading: 'Build faster',
			ctaLabel: 'Get started'
		});
		expect(el.heading).toBe('Welcome');
		expect(el.subheading).toBe('Build faster');
		expect(el.ctaLabel).toBe('Get started');
	});

	it('feature-grid columns override is preserved', () => {
		const el = createElement('feature-grid', { x: 0, y: 0, columns: 4 });
		expect(el.columns).toBe(4);
	});
});

describe('Phase E — container types receive a default layout intent', () => {
	it.each(NEW_CONTAINER_TYPES)('createElement(%s) yields a layout intent', (type) => {
		const el = createElement(type, { x: 0, y: 0 });
		expect(el.layout).toBeDefined();
		expect(typeof el.layout?.mode).toBe('string');
	});
});
