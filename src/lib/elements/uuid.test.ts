import { describe, expect, it } from 'vitest';
import { uuidv7 } from './uuid.js';

/**
 * UUID v7 contract (RFC 9562): well-formed, version 7, variant 10xx, time-ordered, and — the fix
 * verified here — strictly MONOTONIC even for ids minted in the same millisecond (bulk
 * paste/duplicate/group-create).
 */
describe('uuidv7', () => {
	it('is well-formed with version 7 and variant 10xx', () => {
		const u = uuidv7();
		expect(u).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
	});

	it('generates 10000 unique ids', () => {
		const set = new Set<string>();
		for (let i = 0; i < 10000; i++) set.add(uuidv7());
		expect(set.size).toBe(10000);
	});

	it('is STRICTLY MONOTONIC across a tight burst (same-ms ordering preserved)', () => {
		const ids: string[] = [];
		for (let i = 0; i < 5000; i++) ids.push(uuidv7());
		// Lexicographic comparison of the hyphen-stripped hex is equivalent to byte order for v7,
		// because the timestamp + counter occupy the most-significant bytes.
		const keys = ids.map((u) => u.replace(/-/g, ''));
		for (let i = 1; i < keys.length; i++) {
			expect(keys[i]! > keys[i - 1]!).toBe(true);
		}
	});

	it('sorted order equals creation order', () => {
		const ids = Array.from({ length: 1000 }, () => uuidv7());
		const sorted = ids.slice().sort();
		expect(sorted).toEqual(ids);
	});
});
