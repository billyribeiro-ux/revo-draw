<script lang="ts">
	import { editor, type Tool } from '$lib/canvas/editor.svelte.js';
	import PhIcon from './PhIcon.svelte';

	let { onIconTool }: { onIconTool: () => void } = $props();

	interface ToolDef {
		tool: Tool;
		label: string;
		key?: string;
	}
	// Tools grouped by role, separated visually. Keyboard hints shown where bound.
	const groups: ToolDef[][] = [
		[
			{ tool: 'select', label: 'Select', key: 'V' },
			{ tool: 'hand', label: 'Pan', key: 'H' }
		],
		[
			{ tool: 'frame', label: 'Frame', key: 'F' },
			{ tool: 'container', label: 'Container', key: 'C' },
			{ tool: 'card', label: 'Card' }
		],
		[
			{ tool: 'nav', label: 'Nav bar' },
			{ tool: 'sidebar', label: 'Sidebar' },
			{ tool: 'tabs', label: 'Tabs' },
			{ tool: 'modal', label: 'Modal' }
		],
		[
			{ tool: 'text', label: 'Text', key: 'T' },
			{ tool: 'button', label: 'Button', key: 'B' },
			{ tool: 'input', label: 'Input' },
			{ tool: 'image', label: 'Image' },
			{ tool: 'icon', label: 'Icon' }
		],
		[
			{ tool: 'table', label: 'Table' },
			{ tool: 'chart', label: 'Chart' },
			{ tool: 'list', label: 'List' }
		],
		[{ tool: 'divider', label: 'Divider' }]
	];

	function pick(tool: Tool): void {
		if (tool === 'icon') {
			onIconTool();
			return;
		}
		editor.setTool(tool);
	}
</script>

<div class="toolrail">
	<div class="palette" role="toolbar" aria-label="Tools">
		{#each groups as group, gi (gi)}
			{#if gi > 0}<span class="divider" aria-hidden="true"></span>{/if}
			<div class="grp">
				{#each group as t (t.tool)}
					<button
						class="tool"
						class:active={editor.tool === t.tool}
						aria-pressed={editor.tool === t.tool}
						aria-label={t.label}
						onclick={() => pick(t.tool)}
					>
						<PhIcon name={t.tool} size={18} />
						<span class="tip">
							{t.label}{#if t.key}<kbd>{t.key}</kbd>{/if}
						</span>
					</button>
				{/each}
			</div>
		{/each}

		<span class="divider" aria-hidden="true"></span>
		<div class="grp">
			<button
				class="tool"
				class:active={editor.toolLocked}
				aria-pressed={editor.toolLocked}
				aria-label="Keep tool active after drawing"
				onclick={() => editor.toggleToolLock()}
			>
				<PhIcon name={editor.toolLocked ? 'lock' : 'lock-open'} size={17} />
				<span class="tip">
					{editor.toolLocked ? 'Tool locked — stays active' : 'Lock tool active'}
				</span>
			</button>
		</div>
	</div>
</div>

<style>
	.toolrail {
		display: flex;
		align-items: center;
		justify-content: center;
		block-size: var(--toolrail-h);
		padding-inline: var(--space-3);
		background: var(--surface);
		border-block-end: 1px solid var(--line);
		user-select: none;
	}

	.palette {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 4px;
		background: var(--surface-2);
		border: 1px solid var(--line);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-xs);
		max-inline-size: 100%;
		overflow-x: auto;
		scrollbar-width: none;
	}
	.palette::-webkit-scrollbar {
		display: none;
	}

	.grp {
		display: flex;
		align-items: center;
		gap: 2px;
	}

	.divider {
		inline-size: 1px;
		block-size: 20px;
		background: var(--line-strong);
		margin-inline: 4px;
		flex-shrink: 0;
	}

	.tool {
		position: relative;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		inline-size: 32px;
		block-size: 32px;
		border-radius: var(--radius-md);
		color: var(--ink-soft);
		transition:
			background var(--dur-1) var(--ease),
			color var(--dur-1) var(--ease),
			transform var(--dur-1) var(--ease);

		&:hover {
			background: var(--surface);
			color: var(--ink);
			box-shadow: var(--shadow-xs);
		}
		&:active {
			transform: scale(0.94);
		}
	}

	.tool.active {
		background: var(--accent);
		color: var(--accent-ink);
		box-shadow: var(--shadow-sm);
	}

	/* Custom tooltip — appears below the tool on hover. */
	.tip {
		position: absolute;
		inset-block-start: calc(100% + 8px);
		inset-inline-start: 50%;
		transform: translateX(-50%) translateY(-3px);
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 4px 8px;
		white-space: nowrap;
		font-size: var(--text-2xs);
		font-weight: 500;
		color: var(--surface);
		background: var(--ink);
		border-radius: var(--radius-sm);
		box-shadow: var(--shadow-md);
		opacity: 0;
		pointer-events: none;
		transition:
			opacity var(--dur-1) var(--ease),
			transform var(--dur-2) var(--ease-out);
		z-index: 40;
	}
	.tool:hover .tip {
		opacity: 1;
		transform: translateX(-50%) translateY(0);
		transition-delay: 0.35s;
	}
	.tip kbd {
		font-family: var(--font-mono);
		font-size: 10px;
		padding: 1px 4px;
		border-radius: 3px;
		background: oklch(1 0 0 / 0.16);
		color: oklch(1 0 0 / 0.85);
	}
</style>
