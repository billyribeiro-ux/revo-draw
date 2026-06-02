/**
 * Toolbar / action icons ported from Excalidraw's `components/icons.tsx`
 * (MIT-licensed) as raw, self-contained SVG markup strings.
 *
 * Each value is complete `<svg>…</svg>` markup using `currentColor` so the
 * icon inherits the surrounding text colour. Geometry (viewBox + paths /
 * primitives) and stroke attributes are copied faithfully from the source's
 * `createIcon(...)` definitions, including the per-icon `tablerIconProps` /
 * `modifiedTablerIconProps` defaults.
 *
 * Plain `.ts` string map — no JSX, no React.
 */

// 24x24 viewBox, strokeWidth 2 default (tablerIconProps)
const tabler =
	'aria-hidden="true" focusable="false" role="img" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';

// 20x20 viewBox, no default strokeWidth (modifiedTablerIconProps)
const tablerSmall =
	'aria-hidden="true" focusable="false" role="img" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"';

export const ICONS: Record<string, string> = {
	// SelectionIcon — { fill: "none", width: 22, height: 22, strokeWidth: 1.25 }
	selection: `<svg aria-hidden="true" focusable="false" role="img" viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M6 6l4.153 11.793a0.365 .365 0 0 0 .331 .207a0.366 .366 0 0 0 .332 -.207l2.184 -4.793l4.787 -1.994a0.355 .355 0 0 0 .213 -.323a0.355 .355 0 0 0 -.213 -.323l-11.787 -4.36z"/><path d="M13.5 13.5l4.5 4.5"/></svg>`,

	// RectangleIcon — tablerIconProps, inner group strokeWidth 1.5
	rectangle: `<svg ${tabler}><path stroke="none" d="M0 0h24v24H0z" fill="none"/><rect x="4" y="4" width="16" height="16" rx="2" stroke-width="1.5"/></svg>`,

	// EllipseIcon — tablerIconProps, inner group strokeWidth 1.5
	ellipse: `<svg ${tabler}><path stroke="none" d="M0 0h24v24H0z" fill="none"/><circle cx="12" cy="12" r="9" stroke-width="1.5"/></svg>`,

	// DiamondIcon — tablerIconProps, inner group strokeWidth 1.5
	diamond: `<svg ${tabler}><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path stroke-width="1.5" d="M10.5 20.4l-6.9 -6.9c-.781 -.781 -.781 -2.219 0 -3l6.9 -6.9c.781 -.781 2.219 -.781 3 0l6.9 6.9c.781 .781 .781 2.219 0 3l-6.9 6.9c-.781 .781 -2.219 .781 -3 0z"/></svg>`,

	// LineIcon — modifiedTablerIconProps, path strokeWidth 1.5
	line: `<svg ${tablerSmall}><path d="M4.167 10h11.666" stroke-width="1.5"/></svg>`,

	// ArrowIcon — tablerIconProps, inner group strokeWidth 1.5
	arrow: `<svg ${tabler}><g stroke-width="1.5"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><line x1="5" y1="12" x2="19" y2="12"/><line x1="15" y1="16" x2="19" y2="12"/><line x1="15" y1="8" x2="19" y2="12"/></g></svg>`,

	// TextIcon — tablerIconProps, inner group strokeWidth 1.5
	text: `<svg ${tabler}><g stroke-width="1.5"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><line x1="4" y1="20" x2="7" y2="20"/><line x1="14" y1="20" x2="21" y2="20"/><line x1="6.9" y1="15" x2="13.8" y2="15"/><line x1="10.2" y1="6.3" x2="16" y2="20"/><polyline points="5 20 11 4 13 4 20 20"/></g></svg>`,

	// FreedrawIcon — modifiedTablerIconProps, inner group strokeWidth 1.25
	freedraw: `<svg ${tablerSmall}><g stroke-width="1.25"><path clip-rule="evenodd" d="m7.643 15.69 7.774-7.773a2.357 2.357 0 1 0-3.334-3.334L4.31 12.357a3.333 3.333 0 0 0-.977 2.357v1.953h1.953c.884 0 1.732-.352 2.357-.977Z"/><path d="m11.25 5.417 3.333 3.333"/></g></svg>`,

	// ImageIcon — modifiedTablerIconProps, inner group strokeWidth 1.25
	image: `<svg ${tablerSmall}><g stroke-width="1.25"><path d="M12.5 6.667h.01"/><path d="M4.91 2.625h10.18a2.284 2.284 0 0 1 2.285 2.284v10.182a2.284 2.284 0 0 1-2.284 2.284H4.909a2.284 2.284 0 0 1-2.284-2.284V4.909a2.284 2.284 0 0 1 2.284-2.284Z"/><path d="m3.333 12.5 3.334-3.333c.773-.745 1.726-.745 2.5 0l4.166 4.166"/><path d="m11.667 11.667.833-.834c.774-.744 1.726-.744 2.5 0l1.667 1.667"/></g></svg>`,

	// EraserIcon — tablerIconProps, inner group strokeWidth 1.5
	eraser: `<svg ${tabler}><g stroke-width="1.5"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M19 20h-10.5l-4.21 -4.3a1 1 0 0 1 0 -1.41l10 -10a1 1 0 0 1 1.41 0l5 5a1 1 0 0 1 0 1.41l-9.2 9.3"/><path d="M18 13.3l-6.3 -6.3"/></g></svg>`,

	// handIcon — tablerIconProps, inner group strokeWidth 1.25
	hand: `<svg ${tabler}><g stroke-width="1.25"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M8 13v-7.5a1.5 1.5 0 0 1 3 0v6.5"/><path d="M11 5.5v-2a1.5 1.5 0 1 1 3 0v8.5"/><path d="M14 5.5a1.5 1.5 0 0 1 3 0v6.5"/><path d="M17 7.5a1.5 1.5 0 0 1 3 0v8.5a6 6 0 0 1 -6 6h-2h.208a6 6 0 0 1 -5.012 -2.7a69.74 69.74 0 0 1 -.196 -.3c-.312 -.479 -1.407 -2.388 -3.286 -5.728a1.5 1.5 0 0 1 .536 -2.022a1.867 1.867 0 0 1 2.28 .28l1.47 1.47"/></g></svg>`,

	// UndoIcon — modifiedTablerIconProps, path strokeWidth 1.25
	undo: `<svg ${tablerSmall}><path d="M7.5 10.833 4.167 7.5 7.5 4.167M4.167 7.5h9.166a3.333 3.333 0 0 1 0 6.667H12.5" stroke-width="1.25"/></svg>`,

	// RedoIcon — modifiedTablerIconProps, path strokeWidth 1.25
	redo: `<svg ${tablerSmall}><path d="M12.5 10.833 15.833 7.5 12.5 4.167M15.833 7.5H6.667a3.333 3.333 0 1 0 0 6.667H7.5" stroke-width="1.25"/></svg>`,

	// TrashIcon — modifiedTablerIconProps, path strokeWidth 1.25
	trash: `<svg ${tablerSmall}><path stroke-width="1.25" d="M3.333 5.833h13.334M8.333 9.167v5M11.667 9.167v5M4.167 5.833l.833 10c0 .92.746 1.667 1.667 1.667h6.666c.92 0 1.667-.746 1.667-1.667l.833-10M7.5 5.833v-2.5c0-.46.373-.833.833-.833h3.334c.46 0 .833.373.833.833v2.5"/></svg>`,

	// DuplicateIcon — modifiedTablerIconProps, inner group strokeWidth 1.25
	duplicate: `<svg ${tablerSmall}><g stroke-width="1.25"><path d="M14.375 6.458H8.958a2.5 2.5 0 0 0-2.5 2.5v5.417a2.5 2.5 0 0 0 2.5 2.5h5.417a2.5 2.5 0 0 0 2.5-2.5V8.958a2.5 2.5 0 0 0-2.5-2.5Z"/><path clip-rule="evenodd" d="M11.667 3.125c.517 0 .986.21 1.325.55.34.338.55.807.55 1.325v1.458H8.333c-.485 0-.927.185-1.26.487-.343.312-.57.75-.609 1.24l-.005 5.357H5a1.87 1.87 0 0 1-1.326-.55 1.87 1.87 0 0 1-.549-1.325V5c0-.518.21-.987.55-1.326.338-.34.807-.549 1.325-.549h6.667Z"/></g></svg>`,

	// MoonIcon — modifiedTablerIconProps, path (default strokeWidth)
	moon: `<svg ${tablerSmall}><path clip-rule="evenodd" d="M10 2.5h.328a6.25 6.25 0 0 0 6.6 10.372A7.5 7.5 0 1 1 10 2.493V2.5Z" stroke="currentColor"/></svg>`,

	// SunIcon — { ...modifiedTablerIconProps, strokeWidth: 1.5 }
	sun: `<svg aria-hidden="true" focusable="false" role="img" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><g stroke="currentColor" stroke-linejoin="round"><path d="M10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM10 4.167V2.5M14.167 5.833l1.166-1.166M15.833 10H17.5M14.167 14.167l1.166 1.166M10 15.833V17.5M5.833 14.167l-1.166 1.166M5 10H3.333M5.833 5.833 4.667 4.667"/></g></svg>`,
};
