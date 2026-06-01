import { describe, expect, it } from 'vitest';
import { createElement } from './defaults.ts';
import type { SvgElement } from './types.ts';

/**
 * Phase F: SvgElement factory contract — `createElement('svg', init)` produces a fully-typed,
 * complete SvgElement (no partials enter the scene graph). Mirrors the discipline of
 * `uuid.test.ts` — direct import, no Tauri runtime needed.
 */

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('createElement("svg")', () => {
	it('produces a well-formed SvgElement with the supplied body + viewBox', () => {
		const init = {
			x: 10,
			y: 20,
			width: 100,
			height: 100,
			body: '<rect width="100" height="100" fill="red"/>',
			viewBox: '0 0 100 100'
		};
		const e = createElement('svg', init) as SvgElement;
		expect(e.type).toBe('svg');
		expect(e.x).toBe(10);
		expect(e.y).toBe(20);
		expect(e.width).toBe(100);
		expect(e.height).toBe(100);
		expect(e.body).toBe('<rect width="100" height="100" fill="red"/>');
		expect(e.viewBox).toBe('0 0 100 100');
		expect(e.parentId).toBeNull();
		expect(e.z).toBe(0);
		expect(e.rotation).toBe(0);
		expect(e.id).toMatch(UUID_V7);
	});

	it('falls back to safe defaults when no body/viewBox are supplied', () => {
		const e = createElement('svg', { x: 0, y: 0, width: 120, height: 120 }) as SvgElement;
		expect(e.type).toBe('svg');
		expect(e.body).toBe('');
		expect(e.viewBox).toBe('0 0 100 100');
		expect(e.width).toBe(120);
		expect(e.height).toBe(120);
	});
});
