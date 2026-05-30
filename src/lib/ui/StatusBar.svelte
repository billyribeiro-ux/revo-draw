<script lang="ts">
	import { editor } from '$lib/canvas/editor.svelte.js';

	const { scene, camera } = editor;

	const elementCount = $derived(Object.keys(scene.doc.elements).length);
	const selCount = $derived(scene.selection.size);
	const cx = $derived(Math.round(editor.cursorWorld.x));
	const cy = $derived(Math.round(editor.cursorWorld.y));
</script>

<footer class="statusbar">
	<div class="left">
		<span class="stat">{elementCount} {elementCount === 1 ? 'element' : 'elements'}</span>
		{#if selCount > 0}
			<span class="dot">·</span>
			<span class="stat accent">{selCount} selected</span>
		{/if}
	</div>

	<div class="right">
		{#if editor.snapBypass}
			<span class="badge">snap off</span>
		{/if}
		<span class="stat mono">x {cx}　y {cy}</span>
		<span class="dot">·</span>
		<span class="stat mono">{Math.round(camera.zoom * 100)}%</span>
	</div>
</footer>

<style>
	.statusbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		block-size: var(--statusbar-h);
		padding-inline: var(--space-3);
		background: var(--surface);
		border-block-start: 1px solid var(--line);
		font-size: var(--text-2xs);
		color: var(--ink-faint);
		user-select: none;
	}
	.left,
	.right {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}
	.stat {
		white-space: nowrap;
	}
	.accent {
		color: var(--accent);
		font-weight: 550;
	}
	.mono {
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
	}
	.dot {
		color: var(--ink-ghost);
	}
	.badge {
		padding: 1px 7px;
		border-radius: var(--radius-pill);
		background: var(--warn);
		color: oklch(0.25 0.05 75);
		font-weight: 600;
		letter-spacing: var(--tracking-wide);
		text-transform: uppercase;
		font-size: 9px;
	}
</style>
