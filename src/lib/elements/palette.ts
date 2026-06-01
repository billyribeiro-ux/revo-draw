/**
 * Color palettes for the style panel — the quick-pick swatches and the full picker box.
 *
 * Values are Excalidraw's exact Open-Color palette, verified against
 * `excalidraw-master/packages/common/src/colors.ts`. The picker box mirrors Excalidraw's
 * ColorPicker structure: a 5-column grid of named base colors + a 5-swatch shade row, so the look
 * and arrangement match the original (not just the hex values).
 */

export const TRANSPARENT = 'transparent';

/** 5 quick stroke colors (Excalidraw `DEFAULT_ELEMENT_STROKE_PICKS`): black + red/green/blue/yellow[4]. */
export const STROKE_PICKS = ['#1e1e1e', '#e03131', '#2f9e44', '#1971c2', '#f08c00'] as const;

/** 5 quick fill colors (Excalidraw `DEFAULT_ELEMENT_BACKGROUND_PICKS`): transparent + red/green/blue/yellow[1]. */
export const BACKGROUND_PICKS = ['transparent', '#ffc9c9', '#b2f2bb', '#a5d8ff', '#ffec99'] as const;

/** Canvas background quick picks (Excalidraw `DEFAULT_CANVAS_BACKGROUND_PICKS`). */
export const CANVAS_BACKGROUND_PICKS = ['#ffffff', '#f8f9fa', '#f5faff', '#fffce8', '#fdf8f6'] as const;

/** A named palette color is either a single color or a 5-shade tuple (light→dark, indexes 0..4). */
export type PaletteEntry = string | readonly [string, string, string, string, string];

/**
 * Excalidraw's `COLOR_PALETTE` (open-color, weights 50/200/400/600/800). Tuples are light→dark.
 * Identical hex values to the source so swatches are pixel-for-pixel the same.
 */
export const COLOR_PALETTE: Record<string, PaletteEntry> = {
	transparent: 'transparent',
	black: '#1e1e1e',
	white: '#ffffff',
	gray: ['#f8f9fa', '#e9ecef', '#ced4da', '#868e96', '#343a40'],
	red: ['#fff5f5', '#ffc9c9', '#ff8787', '#fa5252', '#e03131'],
	pink: ['#fff0f6', '#fcc2d7', '#f783ac', '#e64980', '#c2255c'],
	grape: ['#f8f0fc', '#eebefa', '#da77f2', '#be4bdb', '#9c36b5'],
	violet: ['#f3f0ff', '#d0bfff', '#9775fa', '#7950f2', '#6741d9'],
	blue: ['#e7f5ff', '#a5d8ff', '#4dabf7', '#228be6', '#1971c2'],
	cyan: ['#e3fafc', '#99e9f2', '#3bc9db', '#15aabf', '#0c8599'],
	teal: ['#e6fcf5', '#96f2d7', '#38d9a9', '#12b886', '#099268'],
	green: ['#ebfbee', '#b2f2bb', '#69db7c', '#40c057', '#2f9e44'],
	yellow: ['#fff9db', '#ffec99', '#ffd43b', '#fab005', '#f08c00'],
	orange: ['#fff4e6', '#ffd8a8', '#ffa94d', '#fd7e14', '#e8590c'],
	// radix bronze shades [3,5,7,9,11]
	bronze: ['#f8f1ee', '#eaddd7', '#d2bab0', '#a18072', '#846358']
};

/**
 * Order of the 15 swatches in the picker's base grid (Excalidraw
 * `DEFAULT_ELEMENT_STROKE_COLOR_PALETTE`: transparent/white/gray/black/bronze, then the common
 * element shades). Laid out 5 per row → 3 rows.
 */
export const PICKER_ORDER = [
	'transparent',
	'white',
	'gray',
	'black',
	'bronze',
	'cyan',
	'blue',
	'violet',
	'grape',
	'pink',
	'green',
	'teal',
	'yellow',
	'orange',
	'red'
] as const;

/** Excalidraw default shade indexes: stroke = 4 (600 weight), background = 1 (200 weight). */
export const STROKE_DEFAULT_SHADE = 4;
export const BG_DEFAULT_SHADE = 1;

/** The 5 shades of a named color, or null if it's a single (non-shaded) color. */
export function shadesOf(name: string): readonly string[] | null {
	const v = COLOR_PALETTE[name];
	return v === undefined || typeof v === 'string' ? null : v;
}

/** The representative color for a base-grid cell at the given shade (single colors ignore shade). */
export function baseColorAt(name: string, shade: number): string {
	const v = COLOR_PALETTE[name];
	if (v === undefined) return 'transparent';
	if (typeof v === 'string') return v;
	return v[Math.max(0, Math.min(4, shade))] ?? v[4];
}

/** Locate a color in the palette → its family name + shade index (shade -1 for single colors). */
export function findColorPosition(color: string | undefined): { name: string; shade: number } | null {
	if (!color) return null;
	const c = color.toLowerCase();
	for (const [name, val] of Object.entries(COLOR_PALETTE)) {
		if (typeof val === 'string') {
			if (val.toLowerCase() === c) return { name, shade: -1 };
		} else {
			const i = val.findIndex((s) => s.toLowerCase() === c);
			if (i >= 0) return { name, shade: i };
		}
	}
	return null;
}

/** Validate a user-typed hex string (#rgb / #rrggbb / #rrggbbaa), returning a normalized #hex or null. */
export function normalizeHex(input: string): string | null {
	const v = input.trim().replace(/^#/, '').toLowerCase();
	if (/^[0-9a-f]{3}$/.test(v) || /^[0-9a-f]{6}$/.test(v) || /^[0-9a-f]{8}$/.test(v)) {
		return `#${v}`;
	}
	return null;
}

/**
 * Full palette grid kept for any legacy callers / matching helpers (one row per hue, light→dark).
 */
export const PALETTE_GRID: { name: string; shades: string[] }[] = [
	{ name: 'gray', shades: ['#1e1e1e', '#343a40', '#868e96', '#ced4da', '#f1f3f5'] },
	{ name: 'red', shades: ['#e03131', '#fa5252', '#ff8787', '#ffc9c9', '#fff5f5'] },
	{ name: 'pink', shades: ['#c2255c', '#e64980', '#f783ac', '#fcc2d7', '#fff0f6'] },
	{ name: 'violet', shades: ['#6741d9', '#7950f2', '#9775fa', '#d0bfff', '#f3f0ff'] },
	{ name: 'blue', shades: ['#1971c2', '#228be6', '#4dabf7', '#a5d8ff', '#e7f5ff'] },
	{ name: 'cyan', shades: ['#0c8599', '#15aabf', '#3bc9db', '#99e9f2', '#e3fafc'] },
	{ name: 'teal', shades: ['#099268', '#12b886', '#38d9a9', '#96f2d7', '#e6fcf5'] },
	{ name: 'green', shades: ['#2f9e44', '#40c057', '#69db7c', '#b2f2bb', '#ebfbee'] },
	{ name: 'yellow', shades: ['#f08c00', '#fab005', '#ffd43b', '#ffec99', '#fff9db'] },
	{ name: 'orange', shades: ['#e8590c', '#fd7e14', '#ffa94d', '#ffd8a8', '#fff4e6'] }
];

/** All distinct swatch colors flattened (for matching / "is this a known color"). */
export const ALL_PALETTE_COLORS: string[] = ['#ffffff', ...PALETTE_GRID.flatMap((row) => row.shades)];
