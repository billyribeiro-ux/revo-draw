<script lang="ts">
	import type { Snippet } from 'svelte';
	import { editor } from '$lib/canvas/editor.svelte.js';
	import PhIcon from './PhIcon.svelte';

	let { brand, onExport }: { brand: Snippet; onExport: () => void } = $props();

	const zoomPct = $derived(editor.zoomPercent);
	let zoomInput = $state('');
	let editingZoom = $state(false);

	function commitZoom(): void {
		const v = parseInt(zoomInput, 10);
		if (Number.isFinite(v) && v > 0) editor.setZoomPercent(v);
		editingZoom = false;
	}
</script>

<header class="titlebar">
	<!-- Reserved gutter so content never sits under the macOS traffic-light controls. -->
	<div class="gutter"></div>

	<div class="brand-slot">
		{@render brand()}
	</div>

	<div class="drag-fill"></div>

	<div class="cluster">
		<div class="seg">
			<button
				class="icon-btn"
				title="Undo  ⌘Z"
				disabled={!editor.history.canUndo}
				onclick={() => editor.history.undo()}
				aria-label="Undo"
			>
				<PhIcon name="undo" size={16} />
			</button>
			<button
				class="icon-btn"
				title="Redo  ⇧⌘Z"
				disabled={!editor.history.canRedo}
				onclick={() => editor.history.redo()}
				aria-label="Redo"
			>
				<PhIcon name="redo" size={16} />
			</button>
		</div>

		<div class="seg zoom-seg">
			<button class="icon-btn" title="Zoom out  ⌘−" onclick={() => editor.zoomOut()} aria-label="Zoom out">
				<PhIcon name="zoom-out" size={16} />
			</button>
			{#if editingZoom}
				<input
					class="zoom-input"
					value={zoomInput}
					oninput={(e) => (zoomInput = (e.currentTarget as HTMLInputElement).value)}
					onblur={commitZoom}
					onkeydown={(e) => {
						if (e.key === 'Enter') commitZoom();
						if (e.key === 'Escape') editingZoom = false;
					}}
				/>
			{:else}
				<button
					class="zoom-label"
					title="Click to set zoom · ⌘0 to reset"
					onclick={() => {
						zoomInput = String(zoomPct);
						editingZoom = true;
					}}
				>
					{zoomPct}%
				</button>
			{/if}
			<button class="icon-btn" title="Zoom in  ⌘+" onclick={() => editor.zoomIn()} aria-label="Zoom in">
				<PhIcon name="zoom-in" size={16} />
			</button>
			<button class="icon-btn" title="Zoom to fit  ⇧1" onclick={() => editor.zoomToFit()} aria-label="Zoom to fit">
				<PhIcon name="fit" size={16} />
			</button>
		</div>

		<button class="export-btn" title="Export Markdown spec for Claude Code" onclick={onExport}>
			<PhIcon name="export" size={15} />
			<span>Export</span>
		</button>
	</div>
</header>

<style>
	.titlebar {
		display: flex;
		align-items: center;
		block-size: var(--titlebar-h);
		padding-inline-end: var(--space-3);
		background: var(--surface);
		border-block-end: 1px solid var(--line);
		-webkit-app-region: drag;
		user-select: none;
		gap: var(--space-2);
	}

	.gutter {
		inline-size: var(--traffic-gutter);
		flex-shrink: 0;
	}

	.brand-slot,
	.cluster {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		-webkit-app-region: no-drag;
	}

	.drag-fill {
		flex: 1;
		align-self: stretch;
	}

	.seg {
		display: flex;
		align-items: center;
		gap: 2px;
		padding: 2px;
		background: var(--surface-2);
		border: 1px solid var(--line);
		border-radius: var(--radius-md);
	}

	.icon-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		inline-size: 28px;
		block-size: 26px;
		border-radius: var(--radius-sm);
		color: var(--ink-soft);
		transition:
			background var(--dur-1) var(--ease),
			color var(--dur-1) var(--ease);

		&:hover:not(:disabled) {
			background: var(--surface);
			color: var(--ink);
			box-shadow: var(--shadow-xs);
		}
		&:active:not(:disabled) {
			transform: translateY(0.5px);
		}
		&:disabled {
			opacity: 0.3;
			cursor: default;
		}
	}

	.zoom-label,
	.zoom-input {
		min-inline-size: 50px;
		block-size: 26px;
		padding-inline: var(--space-2);
		font-size: var(--text-xs);
		font-variant-numeric: tabular-nums;
		color: var(--ink-soft);
		border-radius: var(--radius-sm);
		text-align: center;
	}
	.zoom-label:hover {
		background: var(--surface);
		color: var(--ink);
	}
	.zoom-input {
		inline-size: 50px;
		border: 1px solid var(--accent);
		background: var(--surface);
		color: var(--ink);
		outline: none;
	}

	.export-btn {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		block-size: 30px;
		padding-inline: var(--space-3);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: var(--tracking-tight);
		color: var(--accent-ink);
		background: var(--accent);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-xs);
		transition:
			background var(--dur-1) var(--ease),
			transform var(--dur-1) var(--ease);

		&:hover {
			background: var(--accent-hover);
		}
		&:active {
			transform: translateY(0.5px);
		}
	}
</style>
