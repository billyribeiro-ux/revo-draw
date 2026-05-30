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
			$lib: 'src/lib'
		}
	}
};

export default config;
