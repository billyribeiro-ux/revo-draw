import { describe, expect, it } from 'vitest';
import {
	atomicWrite,
	isLayoutDocument,
	serializeDocument,
	type AtomicFs
} from './document-file.js';
import { migrateDocument } from './migrate.js';
import { createBlankDocument, createElement } from '../elements/defaults.js';
import type { Element, ElementId, LayoutDocument } from '../elements/types.js';

/**
 * §14.4 persistence integrity, proven without a Tauri runtime by injecting an in-memory fs into
 * the pure {@link atomicWrite} and exercising the pure validation/migration/serialize paths.
 */

/** An in-memory filesystem that can be told to make `rename` throw, simulating a crash. */
function fakeFs(initial: Record<string, string> = {}): {
	fs: AtomicFs;
	files: Record<string, string>;
	failRename: { value: boolean };
} {
	const files: Record<string, string> = { ...initial };
	const failRename = { value: false };
	const fs: AtomicFs = {
		writeText: async (p, d) => {
			files[p] = d;
		},
		rename: async (from, to) => {
			if (failRename.value) throw new Error('simulated crash during rename');
			if (!(from in files)) throw new Error('missing temp');
			files[to] = files[from]!;
			delete files[from];
		},
		remove: async (p) => {
			delete files[p];
		}
	};
	return { fs, files, failRename };
}

describe('§14.4 atomic autosave', () => {
	it('writes temp then renames over target (target ends up with new data, temp gone)', async () => {
		const { fs, files } = fakeFs({ 'current.lfdoc': 'OLD' });
		await atomicWrite(fs, 'current.lfdoc.tmp', 'current.lfdoc', 'NEW');
		expect(files['current.lfdoc']).toBe('NEW');
		expect('current.lfdoc.tmp' in files).toBe(false);
	});

	it('a crash during rename leaves the previously-saved file intact and parseable', async () => {
		const prior = serializeDocument(createBlankDocument('Prior'));
		const { fs, files, failRename } = fakeFs({ 'current.lfdoc': prior });
		failRename.value = true; // simulate power loss at every rename attempt
		await expect(atomicWrite(fs, 'current.lfdoc.tmp', 'current.lfdoc', 'NEW DATA')).rejects.toThrow();
		// The old target is untouched and still a valid document.
		expect(files['current.lfdoc']).toBe(prior);
		expect(isLayoutDocument(JSON.parse(files['current.lfdoc']!))).toBe(true);
	});

	it('rejects-rename-onto-existing platform: backup path promotes new data and keeps target present', async () => {
		const prior = serializeDocument(createBlankDocument('Prior'));
		// Fake where the FIRST rename onto an existing file fails, but moving aside works.
		const files: Record<string, string> = { 'current.lfdoc': prior };
		const fs: AtomicFs = {
			writeText: async (p, d) => {
				files[p] = d;
			},
			rename: async (from, to) => {
				if (to in files) throw new Error('rename onto existing not permitted');
				files[to] = files[from]!;
				delete files[from];
			},
			remove: async (p) => {
				delete files[p];
			}
		};
		await atomicWrite(fs, 'current.lfdoc.tmp', 'current.lfdoc', 'NEW DATA');
		expect(files['current.lfdoc']).toBe('NEW DATA'); // promoted
		expect('current.lfdoc.tmp' in files).toBe(false); // temp consumed
		expect('current.lfdoc.bak' in files).toBe(false); // backup cleaned up
	});
});

describe('§14.4 validated load', () => {
	it('(a) a valid .lfdoc loads', () => {
		const doc = createBlankDocument('Valid');
		const parsed = JSON.parse(serializeDocument(doc));
		const migrated = migrateDocument(parsed);
		expect(migrated).not.toBeNull();
		expect(isLayoutDocument(migrated)).toBe(true);
	});

	it('(b) wrong/missing schemaVersion is rejected without crashing', () => {
		const noVersion = { id: 'x', name: 'n', elements: {}, rootOrder: [], canvas: {} };
		expect(migrateDocument(noVersion)).toBeNull();
		const futureVersion = { ...createBlankDocument('F'), schemaVersion: 999 };
		expect(migrateDocument(futureVersion)).toBeNull();
	});

	it('(c) structurally malformed payloads are rejected without crashing', () => {
		expect(migrateDocument(null)).toBeNull();
		expect(migrateDocument('not an object')).toBeNull();
		expect(migrateDocument(42)).toBeNull();
		// Valid-looking but not a document (no schemaVersion number)
		expect(migrateDocument({ schemaVersion: 'one' })).toBeNull();
		// isLayoutDocument rejects an orphaned/partial shape
		expect(isLayoutDocument({ schemaVersion: 1, id: 'x' })).toBe(false);
	});
});

describe('§14.4 lossless round-trip', () => {
	function complexDoc(): LayoutDocument {
		const elements: Record<ElementId, Element> = {};
		const add = (e: Element): void => {
			elements[e.id] = e;
		};
		// 4 nesting levels + a rotated element + an icon + several semantic types.
		const frame = createElement('frame', { x: 0, y: 0, label: 'Screen' });
		add(frame as Element);
		const container = createElement('container', { x: 20, y: 20, parentId: frame.id, label: 'L1' });
		add(container as Element);
		const card = createElement('card', { x: 40, y: 40, parentId: container.id, label: 'L2' });
		add(card as Element);
		const list = createElement('list', { x: 60, y: 60, parentId: card.id, label: 'L3' });
		add(list as Element);
		const text = createElement('text', { x: 80, y: 80, parentId: list.id });
		add(text as Element);
		const rotated = createElement('image', { x: 300, y: 300, parentId: frame.id });
		rotated.rotation = 0.7853981633974483;
		add(rotated as Element);
		const icon = createElement('icon', { x: 400, y: 400, parentId: frame.id });
		icon.iconName = 'ph:chart-bar';
		icon.svgPath = 'M10 10 H 90 V 90 H 10 Z';
		icon.viewBox = '0 0 256 256';
		add(icon as Element);
		for (const t of ['button', 'input', 'table', 'chart', 'nav', 'sidebar', 'tabs', 'modal', 'divider'] as const) {
			const e = createElement(t, { x: 500, y: 100, parentId: frame.id });
			add(e as Element);
		}
		return {
			schemaVersion: 1,
			id: 'roundtrip',
			name: 'Round Trip',
			createdAt: '2026-01-01T00:00:00.000Z',
			updatedAt: '2026-01-01T00:00:00.000Z',
			canvas: { width: 1440, height: 900, background: 'oklch(0.95 0 0)' },
			elements,
			rootOrder: [frame.id]
		};
	}

	it('save -> load deep-equals the in-memory document', () => {
		const doc = complexDoc();
		const onDisk = serializeDocument(doc);
		const loaded = migrateDocument(JSON.parse(onDisk));
		expect(loaded).not.toBeNull();
		expect(isLayoutDocument(loaded)).toBe(true);
		expect(loaded).toEqual(doc);
	});

	it('re-serializing the loaded document is byte-identical (stable on disk)', () => {
		const doc = complexDoc();
		const a = serializeDocument(doc);
		const loaded = migrateDocument(JSON.parse(a)) as LayoutDocument;
		const b = serializeDocument(loaded);
		expect(b).toBe(a);
	});
});
