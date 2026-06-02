import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		// Tauri ships a static SPA: no Node server, no SSR at runtime.
		// adapter-static with a SPA fallback turns the build into a single index.html
		// that boots the client router. ssr=false + prerender=true is set in +layout.ts.
		adapter: adapter({
			fallback: 'index.html',
			precompress: false,
			strict: false
		}),
		alias: {
			$lib: 'src/lib',
			// Vendored Excalidraw monorepo packages — ported near-verbatim under src/lib/ so
			// cross-package imports (`@excalidraw/math`, `@excalidraw/element`, …) resolve
			// unchanged. Aliases feed both Vite/Rolldown and the generated tsconfig.
			'@excalidraw/math': 'src/lib/math',
			'@excalidraw/common': 'src/lib/common',
			'@excalidraw/element': 'src/lib/element',
			'@excalidraw/utils': 'src/lib/utils',
			'@excalidraw/fractional-indexing': 'src/lib/fractional-indexing',
			'@excalidraw/excalidraw': 'src/lib/excalidraw'
		}
	}
};

export default config;
