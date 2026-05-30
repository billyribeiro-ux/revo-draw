/**
 * Color palettes for the style panel — the quick-pick swatches and the full grid.
 *
 * Values mirror Excalidraw's Open Color–based palette (verified against
 * packages/common/src/colors.ts in the Excalidraw source) so the look is familiar and the
 * contrast is known-good. Stroke picks are saturated; background picks are pale tints.
 */

export const TRANSPARENT = 'transparent';

/** 5 quick stroke colors shown as the top row of swatches. */
export const STROKE_PICKS = ['#1e1e1e', '#e03131', '#2f9e44', '#1971c2', '#f08c00'] as const;

/** 5 quick background/fill colors (first is transparent = no fill). */
export const BACKGROUND_PICKS = ['transparent', '#ffc9c9', '#b2f2bb', '#a5d8ff', '#ffec99'] as const;

/** Canvas background quick picks. */
export const CANVAS_BACKGROUND_PICKS = ['#ffffff', '#f8f9fa', '#f5faff', '#fffce8', '#fdf8f6'] as const;

/**
 * Full palette grid: each row is one hue, light→dark. Used by the expanded color picker.
 * The first row is the neutral set (black/white/grays).
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
export const ALL_PALETTE_COLORS: string[] = [
	'#ffffff',
	...PALETTE_GRID.flatMap((row) => row.shades)
];
