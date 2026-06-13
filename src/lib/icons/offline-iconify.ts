/**
 * Offline Phosphor icon loading via a locally-bundled Iconify JSON set.
 *
 * The entire `@iconify-json/ph` set ships inside the app bundle (no network, ever). To keep the
 * editor's first paint fast, the ~1MB icon JSON is loaded with a DYNAMIC import — Rolldown emits
 * it as a separate chunk that is fetched from local disk only when the icon picker first opens or
 * an icon is placed. It is still fully offline (bundled, no CDN). Once loaded it's cached for the
 * session.
 *
 * Placing an icon stores its Iconify name (`ph:<name>`) plus the raw SVG body, so the document
 * renders offline and the export can re-import the exact icon.
 */
import { getIconData, iconToSVG } from '@iconify/utils';

// Derive the icon-set type from getIconData's parameter (the @iconify/types name isn't re-exported).
type IconifyIconSet = Parameters<typeof getIconData>[0];

let setPromise: Promise<IconifyIconSet> | null = null;
let cached: IconifyIconSet | null = null;

/** Load (and cache) the bundled Phosphor set from its own chunk. Offline — no network. */
export async function loadIconSet(): Promise<IconifyIconSet> {
	if (cached) return cached;
	if (!setPromise) {
		setPromise = import('@iconify-json/ph/icons.json').then((m) => {
			cached = (m.default ?? m) as unknown as IconifyIconSet;
			return cached;
		});
	}
	return setPromise;
}

/** Whether the set is already resident (synchronous resolve is then possible). */
export function isLoaded(): boolean {
	return cached !== null;
}

export interface ResolvedIcon {
	name: string; // "ph:chart-bar"
	body: string; // inner SVG markup, currentColor fills
	viewBox: string; // e.g. "0 0 256 256"
	primaryPath: string; // first path's `d`, for fast Canvas Path2D
}

export async function allIconNames(): Promise<string[]> {
	const set = await loadIconSet();
	return Object.keys(set.icons).sort();
}

export async function iconCount(): Promise<number> {
	const set = await loadIconSet();
	return Object.keys(set.icons).length;
}

/** Resolve an icon by short ("house") or qualified ("ph:house") name. Requires the set loaded. */
export async function resolveIcon(name: string): Promise<ResolvedIcon | null> {
	const set = await loadIconSet();
	return resolveFrom(set, name);
}

function resolveFrom(set: IconifyIconSet, name: string): ResolvedIcon | null {
	const short = name.startsWith('ph:') ? name.slice(3) : name;
	const data = getIconData(set, short);
	if (!data) return null;
	const rendered = iconToSVG(data, { height: 'none' });
	const vb =
		rendered.attributes.viewBox ?? `0 0 ${data.width ?? 256} ${data.height ?? 256}`;
	return {
		name: `ph:${short}`,
		body: rendered.body,
		viewBox: vb,
		primaryPath: extractPrimaryPath(rendered.body)
	};
}

export function iconToSvgString(icon: ResolvedIcon, size = 24, color = 'currentColor'): string {
	// Phosphor/Iconify bodies paint with `fill="currentColor"`, which ignores the root `fill`
	// attribute and resolves to the CSS `color`. So set BOTH: `style="color"` recolours the
	// currentColor paths, and `fill` covers any path that specifies an explicit fill.
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${icon.viewBox}" fill="${color}" style="color:${color}">${icon.body}</svg>`;
}

/** Search the set; resolves to short names ranked by relevance, up to `limit`. */
export async function searchIcons(query: string, limit = 200): Promise<string[]> {
	const names = await allIconNames();
	const q = query.trim().toLowerCase();
	if (!q) return names.slice(0, limit);
	const tokens = q.split(/\s+/);
	const scored: { name: string; score: number }[] = [];
	for (const name of names) {
		const score = scoreMatch(name, tokens, q);
		if (score > 0) scored.push({ name, score });
	}
	scored.sort((a, b) => b.score - a.score || (a.name < b.name ? -1 : 1));
	return scored.slice(0, limit).map((s) => s.name);
}

function scoreMatch(name: string, tokens: string[], rawQuery: string): number {
	let score = 0;
	if (name === rawQuery) score += 100;
	if (name.startsWith(rawQuery)) score += 40;
	for (const t of tokens) {
		if (!name.includes(t)) return 0;
		if (name.split('-').includes(t)) score += 10;
		else score += 4;
	}
	score += Math.max(0, 12 - name.length / 3);
	return score;
}

function extractPrimaryPath(body: string): string {
	const match = body.match(/<path[^>]*\sd="([^"]+)"/);
	return match?.[1] ?? '';
}

/** Concatenate every path `d` in a body into one path string (multi-path icons → one Path2D). */
export function combinePaths(body: string): string {
	const matches = [...body.matchAll(/<path[^>]*\sd="([^"]+)"/g)];
	return matches.map((m) => m[1]).join(' ');
}
