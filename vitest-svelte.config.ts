import { svelte, vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';

import { excalidrawAliases } from './vitest.aliases.ts';

/**
 * Vitest config for tests that exercise rune-bearing modules (`.svelte.ts`). These must be
 * compiled by the Svelte plugin so `$state`/`$derived`/`$effect` are defined — the plain-node
 * config (vitest.config.ts) cannot transform them. Test files use the `*.svelte.test.ts`
 * suffix so the compiler treats them as rune-capable. The history/scene logic is pure data —
 * no DOM — so a node environment is sufficient (crypto.getRandomValues is a node global).
 */
export default defineConfig({
	plugins: [
		svelte({
			preprocess: vitePreprocess(),
			compilerOptions: { dev: true }
		})
	],
	resolve: {
		conditions: ['browser'],
		alias: excalidrawAliases
	},
	test: {
		include: ['src/**/*.svelte.test.ts'],
		environment: 'node',
		setupFiles: ['./vitest.setup.ts']
	}
});
