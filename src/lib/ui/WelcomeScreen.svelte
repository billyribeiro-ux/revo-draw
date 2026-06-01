<script lang="ts">
	import PhIcon from './PhIcon.svelte';

	// First-load welcome screen shown on an empty canvas — structured + styled to match Excalidraw's
	// WelcomeScreen (WelcomeScreen.Center + WelcomeScreen.Hints / WelcomeScreen.scss): a centered
	// logo + heading + menu, plus three hand-drawn dashed arrow hints pointing to the menu (top-left),
	// the toolbar (top-center, "Pick a tool…"), and the bottom island cluster ("Shortcuts & help").
	// The three arrow SVGs are Excalidraw's exact paths (icons.tsx WelcomeScreen*Arrow). Branding is
	// LayoutForge's own mark/wordmark — Excalidraw's logo/wordmark is its trademark and not reproduced.
	let {
		onOpen,
		onLibrary
	}: {
		onOpen: () => void;
		onLibrary: () => void;
	} = $props();
</script>

<div class="welcome" aria-hidden="false">
	<!-- Hint: menu (top-left, points up to the hamburger). Excalidraw WelcomeScreenMenuArrow (41x94). -->
	<div class="hint hint--menu">
		<svg width="41" height="94" viewBox="0 0 41 94" fill="none" aria-hidden="true">
			<path d="M38.5 83.5c-14-2-17.833-10.473-21-22.5C14.333 48.984 12 22 12 12.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
			<path fill-rule="evenodd" clip-rule="evenodd" d="m12.005 10.478 7.905 14.423L6 25.75l6.005-15.273Z" fill="currentColor" />
			<path d="M12.005 10.478c1.92 3.495 3.838 7 7.905 14.423m-7.905-14.423c3.11 5.683 6.23 11.368 7.905 14.423m0 0c-3.68.226-7.35.455-13.91.85m13.91-.85c-5.279.33-10.566.647-13.91.85m0 0c1.936-4.931 3.882-9.86 6.005-15.273M6 25.75c2.069-5.257 4.135-10.505 6.005-15.272" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
		</svg>
		<div class="hint__label">Export, preferences, and more…</div>
	</div>

	<!-- Hint: toolbar (top-center, points up). Excalidraw WelcomeScreenTopToolbarArrow (38x78). -->
	<div class="hint hint--toolbar">
		<div class="hint__label">Pick a tool &amp; start sketching!</div>
		<svg width="38" height="78" viewBox="0 0 38 78" fill="none" aria-hidden="true">
			<path d="M1 77c14-2 31.833-11.973 35-24 3.167-12.016-6-35-9.5-43.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
			<path fill-rule="evenodd" clip-rule="evenodd" d="m24.165 1.093-2.132 16.309 13.27-4.258-11.138-12.05Z" fill="currentColor" />
			<path d="M24.165 1.093c-.522 3.953-1.037 7.916-2.132 16.309m2.131-16.309c-.835 6.424-1.68 12.854-2.13 16.308m0 0c3.51-1.125 7.013-2.243 13.27-4.257m-13.27 4.257c5.038-1.608 10.08-3.232 13.27-4.257m0 0c-3.595-3.892-7.197-7.777-11.14-12.05m11.14 12.05c-3.837-4.148-7.667-8.287-11.14-12.05" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
		</svg>
	</div>

	<!-- Hint: help (bottom-left, above the zoom/undo island cluster). Excalidraw WelcomeScreenHelpArrow (85x71). -->
	<div class="hint hint--help">
		<div class="hint__label">Shortcuts &amp; help</div>
		<svg width="85" height="71" viewBox="0 0 85 71" fill="none" aria-hidden="true">
			<path d="M18.026 1.232c-5.268 13.125-5.548 33.555 3.285 42.311 8.823 8.75 33.31 12.304 42.422 13.523" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
			<path fill-rule="evenodd" clip-rule="evenodd" d="m72.181 59.247-13.058-10-2.948 13.62 16.006-3.62Z" fill="currentColor" />
			<path d="M72.181 59.247c-3.163-2.429-6.337-4.856-13.058-10m13.058 10c-5.145-3.936-10.292-7.882-13.058-10m0 0c-.78 3.603-1.563 7.196-2.948 13.62m2.948-13.62c-1.126 5.168-2.24 10.346-2.948 13.62m0 0c5.168-1.166 10.334-2.343 16.006-3.62m-16.006 3.62c5.51-1.248 11.01-2.495 16.006-3.62" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
		</svg>
	</div>

	<!-- Center: logo + heading + menu (Excalidraw WelcomeScreen.Center). -->
	<div class="center">
		<div class="logo">
			<span class="mark" aria-hidden="true">
				<span class="bar a"></span>
				<span class="bar b"></span>
				<span class="bar c"></span>
			</span>
			<span class="wordmark">LayoutForge</span>
		</div>
		<div class="heading">Sketch a UI layout. Export a spec.</div>
		<div class="menu">
			<button type="button" class="menu-item" onclick={onOpen}>
				<span class="menu-item__icon"><PhIcon name="open" size={16} /></span>
				<span class="menu-item__text">Open…</span>
				<span class="menu-item__shortcut">⌘O</span>
			</button>
			<button type="button" class="menu-item" onclick={onLibrary}>
				<span class="menu-item__icon"><PhIcon name="library" size={16} /></span>
				<span class="menu-item__text">Browse library…</span>
				<span class="menu-item__shortcut"></span>
			</button>
		</div>
	</div>
</div>

<style>
	/* Full-area decorative layer; only the menu buttons take pointer events (Excalidraw welcome-screen-decor). */
	.welcome {
		position: absolute;
		inset: 0;
		pointer-events: none;
		color: var(--ink-faint);
		font-family: var(--font-sans);
	}

	/* ---- Center (Excalidraw .welcome-screen-center) ---- */
	.center {
		position: absolute;
		inset: 1rem;
		display: flex;
		flex-direction: column;
		gap: 2rem;
		justify-content: center;
		align-items: center;
	}
	.logo {
		display: flex;
		align-items: center;
		column-gap: 0.75rem;
		font-size: 2.25rem;
	}
	.mark {
		display: grid;
		grid-template-columns: 9px 9px;
		grid-template-rows: 1fr 1fr;
		gap: 3px;
		inline-size: 30px;
		block-size: 30px;
	}
	.bar {
		border-radius: 3px;
		background: var(--accent);
	}
	.bar.a {
		grid-row: 1 / 3;
		background: var(--ink);
	}
	.bar.c {
		background: oklch(0.62 0.2 16);
	}
	.wordmark {
		font-weight: 600;
		letter-spacing: var(--tracking-tight);
		color: var(--ink);
	}
	.heading {
		font-size: 1.125rem;
		text-align: center;
		line-height: 1.35rem;
		color: var(--ink-soft);
	}
	.menu {
		display: flex;
		flex-direction: column;
		gap: 2px;
		align-items: center;
	}
	.menu-item {
		pointer-events: auto;
		inline-size: 100%;
		min-inline-size: 300px;
		max-inline-size: 400px;
		display: grid;
		grid-template-columns: 2rem 1fr 3rem;
		align-items: center;
		padding: 0.75rem;
		background: none;
		border: 1px solid transparent;
		border-radius: var(--radius-md);
		color: var(--ink-soft);
		font-size: var(--text-sm);
	}
	.menu-item:hover {
		background: var(--surface-2);
		color: var(--ink);
	}
	.menu-item__icon {
		display: inline-flex;
		inline-size: 1.25rem;
		block-size: 1.25rem;
	}
	.menu-item__text {
		text-align: start;
		margin-inline-end: auto;
	}
	.menu-item__shortcut {
		justify-self: end;
		color: var(--ink-faint);
		font-size: 0.75rem;
	}

	/* ---- Hints (Excalidraw .welcome-screen-decor-hint) ---- */
	.hint {
		position: absolute;
		display: flex;
		color: var(--ink-faint);
	}
	.hint__label {
		font-size: 1rem;
	}
	/* Below the top-left hamburger island, arrow rising to it. */
	.hint--menu {
		inset-block-start: 3.75rem;
		inset-inline-start: 1rem;
		inline-size: 320px;
		align-items: flex-end;
		gap: 0.5rem;
	}
	/* Below the top-center toolbar, arrow pointing up; label then arrow. */
	.hint--toolbar {
		inset-block-start: 3.75rem;
		inset-inline-start: 50%;
		transform: translateX(-50%);
		align-items: baseline;
	}
	.hint--toolbar .hint__label {
		inline-size: 120px;
		position: relative;
		inset-block-start: -0.5rem;
		text-align: end;
		margin-inline-end: 0.25rem;
	}
	/* Above the bottom-left zoom/undo island cluster. */
	.hint--help {
		inset-block-end: 4.25rem;
		inset-inline-start: 1.5rem;
		align-items: flex-start;
		gap: 0.25rem;
	}
	.hint--help svg {
		transform: scaleX(-1) rotate(80deg);
	}

	/* Excalidraw hides hints on short/narrow viewports so they never overlap content. */
	@media (max-height: 780px) {
		.hint {
			display: none;
		}
	}
	@media (max-width: 1024px) {
		.hint--help,
		.hint--menu {
			display: none;
		}
	}
	@media (max-height: 500px), (max-width: 320px) {
		.center {
			display: none;
		}
	}
</style>
