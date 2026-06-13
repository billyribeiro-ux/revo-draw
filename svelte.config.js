import adapter from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		// Vercel hosts the web app. Runtime rendering stays disabled; ssr=false +
		// prerender=true is set in +layout.ts so routes build as a client-rendered shell.
		adapter: adapter(),
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
