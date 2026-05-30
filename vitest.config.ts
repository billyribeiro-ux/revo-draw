import { defineConfig } from 'vitest/config';

// Pure-logic unit tests (export compiler determinism, geometry, snapping). These modules
// import no Svelte runtime, so a plain node environment with no SvelteKit plugin is correct
// and fast. Keeping this separate from vite.config.ts avoids loading the SvelteKit plugin.
export default defineConfig({
	test: {
		include: ['src/**/*.{test,spec}.ts'],
		// `.svelte.test.ts` files need the Svelte compiler (runes) — they run under
		// vitest-svelte.config.ts instead. Exclude them here so node doesn't choke on `$state`.
		exclude: ['src/**/*.svelte.{test,spec}.ts', 'node_modules/**'],
		environment: 'node'
	}
});
