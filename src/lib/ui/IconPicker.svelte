<script lang="ts">
	import {
		combinePaths,
		iconCount,
		iconToSvgString,
		resolveIcon,
		searchIcons
	} from '$lib/icons/offline-iconify.js';
	import PhIcon from './PhIcon.svelte';

	let {
		open,
		onClose,
		onSelect
	}: {
		open: boolean;
		onClose: () => void;
		onSelect: (icon: { name: string; svgPath: string; viewBox: string; body: string }) => void;
	} = $props();

	let query = $state('');
	let searchEl = $state<HTMLInputElement>();
	let results = $state<string[]>([]);
	let total = $state(0);
	// Rendered preview SVG strings keyed by short name (filled lazily as results arrive).
	let previews = $state<Record<string, string>>({});

	// Load the set (lazy, offline) and run the search whenever the query changes while open.
	$effect(() => {
		const q = query;
		if (!open) return;
		void (async () => {
			total = await iconCount();
			const names = await searchIcons(q, 240);
			results = names;
			const map: Record<string, string> = {};
			for (const name of names) {
				const icon = await resolveIcon(name);
				if (icon) map[name] = iconToSvgString(icon, 22);
			}
			previews = map;
		})();
	});

	async function choose(name: string): Promise<void> {
		const icon = await resolveIcon(name);
		if (!icon) return;
		onSelect({
			name: icon.name,
			svgPath: combinePaths(icon.body),
			viewBox: icon.viewBox,
			body: icon.body
		});
	}

	$effect(() => {
		if (open) queueMicrotask(() => searchEl?.focus());
	});
</script>

{#if open}
	<div
		class="backdrop"
		role="button"
		tabindex="-1"
		aria-label="Close icon picker"
		onclick={onClose}
		onkeydown={(e) => {
			if (e.key === 'Escape') onClose();
		}}
	></div>
	<div class="picker" role="dialog" aria-modal="true" aria-label="Icon picker">
		<header>
			<div class="search">
				<PhIcon name="search" size={15} />
				<input name="iconpicker-f1" autocomplete="off"
					bind:this={searchEl}
					bind:value={query}
					type="search"
					placeholder="Search {total} Phosphor icons…"
					onkeydown={(e) => {
						if (e.key === 'Escape') onClose();
					}}
				/>
			</div>
			<button class="close" onclick={onClose} aria-label="Close"><PhIcon name="x" size={16} /></button>
		</header>

		<div class="grid">
			{#each results as name (name)}
				<button class="icon-cell" title={`ph:${name}`} onclick={() => choose(name)}>
					<!-- Trusted SVG: built by iconToSvgString from the bundled, first-party Phosphor set.
					     No user input reaches this string, so {@html} carries no XSS exposure here. -->
					<span class="glyph">{@html previews[name] ?? ''}</span>
					<span class="cap">{name}</span>
				</button>
			{:else}
				<p class="none">No icons match “{query}”.</p>
			{/each}
		</div>
		<footer>Offline · bundled set · click to place</footer>
	</div>
{/if}

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		background: oklch(0.2 0.02 264 / 0.28);
		z-index: 40;
	}
	.picker {
		position: fixed;
		inset-block-start: 50%;
		inset-inline-start: 50%;
		transform: translate(-50%, -50%);
		inline-size: min(640px, 90vw);
		block-size: min(560px, 84vh);
		display: flex;
		flex-direction: column;
		background: var(--surface);
		border: 1px solid var(--line-strong);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-lg);
		z-index: 41;
		overflow: hidden;
	}
	header {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-3);
		border-block-end: 1px solid var(--line);
	}
	.search {
		flex: 1;
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding-inline: var(--space-2);
		background: var(--surface-2);
		border: 1px solid var(--line);
		border-radius: var(--radius-md);
		color: var(--ink-faint);

		&:focus-within {
			border-color: var(--accent);
		}
	}
	.search input {
		flex: 1;
		border: none;
		background: none;
		padding-block: 8px;
		font-size: var(--text-sm);
		color: var(--ink);
		outline: none;
	}
	.close {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		inline-size: 32px;
		block-size: 32px;
		border-radius: var(--radius-sm);
		color: var(--ink-soft);
		&:hover {
			background: var(--surface-sunken);
		}
	}
	.grid {
		flex: 1;
		overflow-y: auto;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(76px, 1fr));
		gap: var(--space-1);
		padding: var(--space-3);
		align-content: start;
	}
	.icon-cell {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		padding: var(--space-2) 4px;
		border-radius: var(--radius-md);
		color: var(--ink-soft);

		&:hover {
			background: var(--surface-sunken);
			color: var(--ink);
		}
	}
	.glyph {
		font-size: 22px;
		line-height: 0;
		color: var(--ink);
	}
	.glyph :global(svg) {
		display: block;
	}
	.cap {
		font-size: 9px;
		color: var(--ink-faint);
		max-inline-size: 70px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.none {
		grid-column: 1 / -1;
		padding: var(--space-5);
		text-align: center;
		color: var(--ink-faint);
		font-size: var(--text-sm);
	}
	footer {
		padding: var(--space-2) var(--space-3);
		font-size: var(--text-2xs);
		color: var(--ink-faint);
		border-block-start: 1px solid var(--line);
		text-align: center;
	}
</style>
