/**
 * Document format migration seam.
 *
 * `.lfdoc` files carry a `schemaVersion`. This function upgrades an older payload to the current
 * `SCHEMA_VERSION` so that future format changes never strand old files. It is FORWARD-ONLY:
 * each version's migration is added once and never mutated. Today there is only v1, so this is a
 * pass-through validator — but the seam exists now so v2+ have a defined place to live.
 *
 * Contract: takes an arbitrary parsed value, returns a current-version document, or `null` if the
 * payload is not a recognizable/upgradable LayoutForge document (caller then rejects it cleanly
 * rather than crashing).
 */
import { SCHEMA_VERSION } from '../elements/types.js';
import type { LayoutDocument } from '../elements/types.js';

/** Per-version upgrade steps. Each migrates version N -> N+1. Append new steps; never edit old. */
const STEPS: Record<number, (doc: Record<string, unknown>) => Record<string, unknown>> = {
	// Example for the future:
	// 1: (doc) => ({ ...doc, schemaVersion: 2, /* add new fields with safe defaults */ })
};

export function migrateDocument(value: unknown): LayoutDocument | null {
	if (typeof value !== 'object' || value === null) return null;
	let doc = value as Record<string, unknown>;

	let version = typeof doc.schemaVersion === 'number' ? doc.schemaVersion : NaN;
	if (!Number.isFinite(version)) return null;
	if (version > SCHEMA_VERSION) return null; // file is newer than this app understands

	// Apply each forward step until we reach the current version.
	let guard = 0;
	while (version < SCHEMA_VERSION) {
		const step = STEPS[version];
		if (!step) return null; // missing migration path
		doc = step(doc);
		const next = typeof doc.schemaVersion === 'number' ? doc.schemaVersion : NaN;
		if (!Number.isFinite(next) || next <= version) return null; // misbehaving step
		version = next;
		if (++guard > 64) return null; // defensive: never loop forever
	}

	return doc as unknown as LayoutDocument;
}
