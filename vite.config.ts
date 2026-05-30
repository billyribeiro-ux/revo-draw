import { sveltekit } from '@sveltejs/kit/vite';
import Icons from 'unplugin-icons/vite';
import { defineConfig } from 'vite';

// Vite 8 uses Rolldown as its single bundler. The SvelteKit plugin and unplugin-icons
// are both Rolldown-compatible (verified against vite-plugin-svelte@7 / unplugin-icons@23).
const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
	plugins: [
		sveltekit(),
		// Build-time inlined Phosphor SVGs imported as `~icons/ph/<name>` Svelte components.
		// No runtime CDN fetch — the app is fully offline inside Tauri.
		Icons({ compiler: 'svelte' })
	],

	// Tauri expects a fixed dev port and ignores src-tauri while watching.
	clearScreen: false,
	server: {
		port: 1420,
		strictPort: true,
		host: host || false,
		hmr: host
			? {
					protocol: 'ws',
					host,
					port: 1421
				}
			: undefined,
		watch: {
			ignored: ['**/src-tauri/**']
		}
	}
});
