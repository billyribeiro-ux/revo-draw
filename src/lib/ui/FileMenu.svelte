<script lang="ts">
	import PhIcon from './PhIcon.svelte';
	import type { ExportFormat } from '$lib/persistence/document-file.js';

	let {
		docName,
		dirty,
		onNew,
		onOpen,
		onSave,
		onSaveAs,
		onImport,
		onExport,
		onLibrary,
		compact = false
	}: {
		docName: string;
		dirty: boolean;
		onNew: () => void;
		onOpen: () => void;
		onSave: () => void;
		onSaveAs: () => void;
		onImport: () => void;
		onExport: (format: ExportFormat) => void;
		onLibrary: () => void;
		/** Web/Excalidraw shell: render the trigger as a hamburger icon button, not a doc-name chip. */
		compact?: boolean;
	} = $props();

	let menuOpen = $state(false);
	let exportOpen = $state(false);
	let root = $state<HTMLDivElement>();
	let trigger = $state<HTMLButtonElement>();
	let menuEl = $state<HTMLDivElement>();
	let submenuEl = $state<HTMLDivElement>();

	function close(): void {
		menuOpen = false;
		exportOpen = false;
	}
	function run(fn: () => void): void {
		close();
		fn();
	}

	function menuItems(scope: HTMLElement | undefined): HTMLElement[] {
		if (!scope) return [];
		return Array.from(scope.querySelectorAll<HTMLElement>('[role="menuitem"], .sub-trigger'));
	}

	function moveFocus(scope: HTMLElement | undefined, delta: 1 | -1): void {
		const items = menuItems(scope);
		if (items.length === 0) return;
		const current = items.indexOf(document.activeElement as HTMLElement);
		const next = (current + delta + items.length) % items.length;
		items[next]?.focus();
	}

	function focusEdge(scope: HTMLElement | undefined, edge: 'first' | 'last'): void {
		const items = menuItems(scope);
		if (items.length === 0) return;
		items[edge === 'first' ? 0 : items.length - 1]?.focus();
	}

	function onMenuKeydown(e: KeyboardEvent): void {
		switch (e.key) {
			case 'Escape':
				e.preventDefault();
				close();
				trigger?.focus();
				break;
			case 'ArrowDown':
				e.preventDefault();
				moveFocus(menuEl, 1);
				break;
			case 'ArrowUp':
				e.preventDefault();
				moveFocus(menuEl, -1);
				break;
			case 'Home':
				e.preventDefault();
				focusEdge(menuEl, 'first');
				break;
			case 'End':
				e.preventDefault();
				focusEdge(menuEl, 'last');
				break;
		}
	}

	function onSubTriggerKeydown(e: KeyboardEvent): void {
		if (e.key === 'ArrowRight' || e.key === 'Enter') {
			e.preventDefault();
			e.stopPropagation();
			exportOpen = true;
			requestAnimationFrame(() => focusEdge(submenuEl, 'first'));
		} else if (e.key === 'ArrowLeft') {
			e.preventDefault();
			e.stopPropagation();
			exportOpen = false;
		}
	}

	function onSubmenuKeydown(e: KeyboardEvent): void {
		switch (e.key) {
			case 'Escape':
				e.preventDefault();
				e.stopPropagation();
				close();
				trigger?.focus();
				break;
			case 'ArrowLeft':
				e.preventDefault();
				e.stopPropagation();
				exportOpen = false;
				break;
			case 'ArrowDown':
				e.preventDefault();
				e.stopPropagation();
				moveFocus(submenuEl, 1);
				break;
			case 'ArrowUp':
				e.preventDefault();
				e.stopPropagation();
				moveFocus(submenuEl, -1);
				break;
			case 'Home':
				e.preventDefault();
				e.stopPropagation();
				focusEdge(submenuEl, 'first');
				break;
			case 'End':
				e.preventDefault();
				e.stopPropagation();
				focusEdge(submenuEl, 'last');
				break;
		}
	}

	const exports: { format: ExportFormat; label: string; hint: string }[] = [
		{ format: 'md', label: 'Markdown spec', hint: 'for Claude Code' },
		{ format: 'lfdoc', label: 'LayoutForge', hint: '.lfdoc' },
		{ format: 'json', label: 'JSON', hint: '.json' },
		{ format: 'svg', label: 'SVG snapshot', hint: '.svg' },
		{ format: 'png', label: 'PNG image', hint: '.png' }
	];
</script>

<svelte:window
	onclick={(e) => {
		if (root && !root.contains(e.target as Node)) close();
	}}
/>

<div class="file-menu" bind:this={root}>
	<button
		class="brand"
		class:open={menuOpen}
		class:compact
		bind:this={trigger}
		onclick={() => (menuOpen = !menuOpen)}
		aria-haspopup="menu"
		aria-expanded={menuOpen}
		aria-label="Menu"
		title="Menu"
	>
		{#if compact}
			<PhIcon name="nav" size={18} />
			{#if dirty}<span class="dot corner" title="Unsaved changes" aria-label="Unsaved changes"></span>{/if}
		{:else}
			<span class="logo" aria-hidden="true">
				<span class="bar a"></span>
				<span class="bar b"></span>
				<span class="bar c"></span>
			</span>
			<span class="names">
				<span class="doc">{docName}</span>
			</span>
			{#if dirty}<span class="dot" title="Unsaved changes" aria-label="Unsaved changes"></span>{/if}
			<span class="caret"><PhIcon name="caret-down" size={11} /></span>
		{/if}
	</button>

	{#if menuOpen}
		<div class="menu" role="menu" tabindex={-1} bind:this={menuEl} onkeydown={onMenuKeydown}>
			<button role="menuitem" onclick={() => run(onNew)}><PhIcon name="file-new" size={15} /> <span>New</span> <kbd>⌘N</kbd></button>
			<button role="menuitem" onclick={() => run(onOpen)}><PhIcon name="open" size={15} /> <span>Open…</span> <kbd>⌘O</kbd></button>
			<button role="menuitem" onclick={() => run(onLibrary)}><PhIcon name="library" size={15} /> <span>Library…</span></button>
			<div class="sep"></div>
			<button role="menuitem" disabled={!dirty} onclick={() => run(onSave)}><PhIcon name="save" size={15} /> <span>Save</span> <kbd>⌘S</kbd></button>
			<button role="menuitem" onclick={() => run(onSaveAs)}><PhIcon name="save" size={15} /> <span>Save As…</span> <kbd>⇧⌘S</kbd></button>
			<button role="menuitem" onclick={() => run(onImport)}><PhIcon name="open" size={15} /> <span>Import…</span></button>
			<div class="sep"></div>
			<div class="sub">
				<button
					class="sub-trigger"
					class:expanded={exportOpen}
					onclick={() => (exportOpen = !exportOpen)}
					onpointerenter={() => (exportOpen = true)}
					onkeydown={onSubTriggerKeydown}
					aria-haspopup="menu"
					aria-expanded={exportOpen}
				>
					<PhIcon name="export" size={15} /> <span>Export</span>
					<span class="grow"></span>
					<span class="submenu-trigger-icon"><PhIcon name="caret-right" size={11} /></span>
				</button>
				{#if exportOpen}
					<div class="submenu" role="menu" tabindex={-1} bind:this={submenuEl} onkeydown={onSubmenuKeydown}>
						{#each exports as ex (ex.format)}
							<button role="menuitem" onclick={() => run(() => onExport(ex.format))}>
								<span>{ex.label}</span>
								<span class="hint">{ex.hint}</span>
							</button>
						{/each}
					</div>
				{/if}
			</div>
		</div>
	{/if}
</div>

<style>
	.file-menu {
		position: relative;
		-webkit-app-region: no-drag;
	}

	.brand {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		block-size: 28px;
		padding-inline: 8px 6px;
		border-radius: var(--radius-md);
		transition: background var(--dur-1) var(--ease);

		&:hover,
		&.open {
			background: var(--surface-sunken);
		}
	}

	/* Web/Excalidraw shell: a square hamburger icon button filling the menu Island. */
	.brand.compact {
		position: relative;
		justify-content: center;
		gap: 0;
		padding: 0;
		inline-size: 2.25rem;
		block-size: 2.25rem;
		border-radius: var(--radius-lg);
		color: var(--ink);
	}
	.brand.compact:hover,
	.brand.compact.open {
		background: var(--surface-2);
	}
	.dot.corner {
		position: absolute;
		inset-block-start: 7px;
		inset-inline-end: 7px;
	}

	.logo {
		display: grid;
		grid-template-columns: 4px 4px;
		grid-template-rows: 1fr 1fr;
		gap: 1.5px;
		inline-size: 14px;
		block-size: 14px;
	}
	.bar {
		border-radius: 1.5px;
		background: var(--accent);
	}
	.bar.a {
		grid-row: 1 / 3;
		background: var(--ink);
	}
	.bar.b {
		background: var(--accent);
	}
	.bar.c {
		background: oklch(0.62 0.2 16);
	}

	.names {
		display: flex;
		align-items: baseline;
		gap: 6px;
		min-inline-size: 0;
	}
	.doc {
		font-size: var(--text-sm);
		font-weight: 560;
		color: var(--ink);
		letter-spacing: var(--tracking-tight);
		max-inline-size: 220px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.dot {
		inline-size: 5px;
		block-size: 5px;
		border-radius: 50%;
		background: var(--accent);
		flex-shrink: 0;
	}
	.caret {
		display: inline-flex;
		color: var(--ink-faint);
	}

	.menu {
		position: absolute;
		inset-block-start: calc(100% + 7px);
		inset-inline-start: 0;
		min-inline-size: 232px;
		max-inline-size: 20rem;
		background: var(--surface);
		border: 1px solid var(--line-strong);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-lg);
		padding: 8px;
		display: flex;
		flex-direction: column;
		gap: 1px;
		z-index: 60;
		animation: pop var(--dur-2) var(--ease-out);
	}
	@keyframes pop {
		from {
			opacity: 0;
			transform: translateY(-4px) scale(0.98);
		}
	}

	.menu button,
	.sub-trigger {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		inline-size: 100%;
		block-size: 2rem;
		padding-inline: 0.5rem;
		padding-block: 0;
		font-size: var(--text-sm);
		color: var(--ink);
		border-radius: var(--radius-sm);
		text-align: start;

		& > span:first-of-type {
			flex: 1;
		}
		&:hover {
			background: var(--surface-sunken);
		}
		&:active {
			background: var(--surface-sunken);
			box-shadow: 0 0 0 1px var(--accent);
		}
		&[disabled] {
			cursor: not-allowed;
			opacity: 0.5;
			pointer-events: none;
		}
	}

	kbd {
		font-family: var(--font-mono);
		font-size: var(--text-2xs);
		color: var(--ink-faint);
	}
	.hint {
		font-size: var(--text-2xs);
		color: var(--ink-faint);
		font-family: var(--font-mono);
	}

	.sep {
		block-size: 1px;
		background: var(--line);
		margin: 5px 4px;
	}
	.sub {
		position: relative;
	}
	.sub-trigger.expanded {
		background: var(--surface-sunken);
	}
	.submenu-trigger-icon {
		display: inline-flex;
		opacity: 0.5;
	}
	.grow {
		flex: 1;
	}
	.submenu {
		position: absolute;
		inset-block-start: -5px;
		inset-inline-start: calc(100% + 4px);
		min-inline-size: 220px;
		max-inline-size: 20rem;
		background: var(--surface);
		border: 1px solid var(--line-strong);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-lg);
		padding: 8px;
		display: flex;
		flex-direction: column;
		gap: 1px;
		animation: pop var(--dur-2) var(--ease-out);
	}
</style>
