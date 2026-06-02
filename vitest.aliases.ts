import { resolve } from 'node:path';

// The vendored Excalidraw packages resolve via `@excalidraw/*` path aliases in svelte.config.js
// (which feeds Vite + tsconfig for the app build). The standalone vitest configs don't load the
// SvelteKit plugin, so they need the same aliases declared here. @rollup/plugin-alias matches a
// string `find` against an exact import or any `find/...` subpath, so one entry per package covers
// both barrel and subpath imports (e.g. `@excalidraw/element` and `@excalidraw/element/types`).
const pkg = (name: string) => resolve(import.meta.dirname, 'src/lib', name);

export const excalidrawAliases = [
	// SvelteKit's `$lib` (provided by the plugin in the app build; declared here for tests).
	{ find: '$lib', replacement: pkg('') },
	{ find: '@excalidraw/math', replacement: pkg('math') },
	{ find: '@excalidraw/common', replacement: pkg('common') },
	{ find: '@excalidraw/element', replacement: pkg('element') },
	{ find: '@excalidraw/utils', replacement: pkg('utils') },
	{ find: '@excalidraw/fractional-indexing', replacement: pkg('fractional-indexing') },
	{ find: '@excalidraw/excalidraw', replacement: pkg('excalidraw') }
];
