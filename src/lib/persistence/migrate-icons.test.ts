import { describe, expect, it } from 'vitest';
import { migrateDocument } from './migrate.ts';
import { createBlankDocument, createElement } from '../elements/defaults.ts';
import type { ButtonElement, CardElement, Element, LayoutDocument } from '../elements/types.ts';

/**
 * Phase F: legacy-icon normalization. `migrateDocument` hoists any pre-existing
 * `iconName`+`iconSvgPath` pair (originally only on ButtonElement) onto the unified
 * `BaseElement.icon` field. The normalization must be:
 *  - correct (right viewBox, right round-trip),
 *  - idempotent (re-running on an already-migrated doc is a no-op), and
 *  - inert on docs that have nothing to migrate.
 */

function docWith(elements: Element[]): LayoutDocument {
	const map: Record<string, Element> = {};
	for (const e of elements) map[e.id] = e;
	const blank = createBlankDocument('M');
	return {
		...blank,
		// fixed timestamps so the document is stable across the two test calls
		id: 'mig-doc',
		createdAt: '2026-01-01T00:00:00.000Z',
		updatedAt: '2026-01-01T00:00:00.000Z',
		elements: map,
		rootOrder: elements.filter((e) => e.parentId === null).map((e) => e.id)
	};
}

describe('Phase F: legacy icon normalization in migrateDocument', () => {
	it('hoists a legacy iconName+iconSvgPath pair onto BaseElement.icon', () => {
		const button = createElement('button', { x: 0, y: 0, width: 120, height: 40 });
		(button as ButtonElement).iconName = 'ph:house';
		(button as ButtonElement).iconSvgPath = 'M10 10 H 90 V 90 H 10 Z';
		// Ensure the unified field is NOT pre-set, so migration has work to do.
		delete (button as { icon?: unknown }).icon;

		const before = docWith([button as Element]);
		// Round-trip through JSON to simulate reading from disk.
		const onDisk = JSON.parse(JSON.stringify(before)) as unknown;
		const migrated = migrateDocument(onDisk);
		expect(migrated).not.toBeNull();
		const out = migrated!.elements[button.id] as ButtonElement;
		expect(out.icon).toEqual({
			name: 'ph:house',
			svgPath: 'M10 10 H 90 V 90 H 10 Z',
			viewBox: '0 0 256 256'
		});
	});

	it('is idempotent: re-running on an already-migrated doc leaves icon unchanged', () => {
		const button = createElement('button', { x: 0, y: 0, width: 120, height: 40 });
		(button as ButtonElement & { icon: { name: string; svgPath: string; viewBox: string } }).icon = {
			name: 'ph:gear',
			svgPath: 'M1 2',
			viewBox: '0 0 256 256'
		};
		// Legacy fields also present but should NOT overwrite the existing unified icon.
		(button as ButtonElement).iconName = 'ph:WRONG';
		(button as ButtonElement).iconSvgPath = 'WRONG';

		const before = docWith([button as Element]);
		const onDisk = JSON.parse(JSON.stringify(before)) as unknown;
		const preMigrationIcon = JSON.parse(
			JSON.stringify((before.elements[button.id] as ButtonElement).icon)
		);

		const migrated = migrateDocument(onDisk);
		expect(migrated).not.toBeNull();
		const out = migrated!.elements[button.id] as ButtonElement;
		expect(out.icon).toEqual(preMigrationIcon);

		// Re-running the migration must be a no-op as well.
		const again = migrateDocument(JSON.parse(JSON.stringify(migrated)));
		expect(again).not.toBeNull();
		const out2 = again!.elements[button.id] as ButtonElement;
		expect(out2.icon).toEqual(preMigrationIcon);
	});

	it('leaves a document with no buttons / no icons structurally unchanged', () => {
		const card = createElement('card', { x: 0, y: 0, width: 280, height: 160 }) as CardElement;
		const before = docWith([card as Element]);
		const onDisk = JSON.parse(JSON.stringify(before)) as unknown;
		const migrated = migrateDocument(onDisk);
		expect(migrated).not.toBeNull();
		// Deep equality with the pre-migration snapshot — nothing added, nothing removed.
		expect(migrated).toEqual(JSON.parse(JSON.stringify(before)));
	});
});
