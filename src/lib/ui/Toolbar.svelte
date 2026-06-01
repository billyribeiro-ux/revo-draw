<script lang="ts">
	import { editor, type Tool } from '$lib/canvas/editor.svelte.js';
	import PhIcon from './PhIcon.svelte';

	let { onIconTool }: { onIconTool: () => void } = $props();

	interface ToolDef {
		tool: Tool;
		label: string;
		/** Phosphor icon slug to render. Defaults to `tool` if omitted. */
		icon?: string;
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

	// Phase E: the 20 new semantic types live in a "More elements" popover, grouped by category
	// so the toolbar doesn't degrade into a 40-button wall. The popover opens on click and stays
	// open until the user picks a tool or clicks outside.
	interface MoreGroup {
		heading: string;
		tools: ToolDef[];
	}
	const moreGroups: MoreGroup[] = [
		{
			heading: 'Form',
			tools: [
				{ tool: 'checkbox' as Tool, label: 'Checkbox', icon: 'checkbox' },
				{ tool: 'radio' as Tool, label: 'Radio', icon: 'radio' },
				{ tool: 'toggle' as Tool, label: 'Toggle', icon: 'toggle' },
				{ tool: 'slider' as Tool, label: 'Slider', icon: 'slider' },
				{ tool: 'dropdown' as Tool, label: 'Dropdown', icon: 'select-input' }
			]
		},
		{
			heading: 'Data',
			tools: [
				{ tool: 'stat-card' as Tool, label: 'Stat card', icon: 'stat-card' },
				{ tool: 'badge' as Tool, label: 'Badge', icon: 'badge' },
				{ tool: 'progress' as Tool, label: 'Progress', icon: 'progress' },
				{ tool: 'avatar' as Tool, label: 'Avatar', icon: 'avatar' }
			]
		},
		{
			heading: 'Feedback & Nav',
			tools: [
				{ tool: 'alert' as Tool, label: 'Alert', icon: 'alert' },
				{ tool: 'tooltip' as Tool, label: 'Tooltip', icon: 'tooltip' },
				{ tool: 'breadcrumb' as Tool, label: 'Breadcrumb', icon: 'breadcrumb' },
				{ tool: 'pagination' as Tool, label: 'Pagination', icon: 'pagination' },
				{ tool: 'stepper' as Tool, label: 'Stepper', icon: 'stepper' },
				{ tool: 'accordion' as Tool, label: 'Accordion', icon: 'accordion' }
			]
		},
		{
			heading: 'Layout & Marketing',
			tools: [
				{ tool: 'section-header' as Tool, label: 'Section header', icon: 'section-header' },
				{ tool: 'hero' as Tool, label: 'Hero', icon: 'hero' },
				{ tool: 'feature-grid' as Tool, label: 'Feature grid', icon: 'feature-grid' },
				{ tool: 'testimonial' as Tool, label: 'Testimonial', icon: 'testimonial' },
				{ tool: 'cta-section' as Tool, label: 'CTA section', icon: 'cta-section' }
			]
		}
	];

	// Flat lookup so the "More" trigger can render the active tool's own icon when the user has
	// selected one of the popover tools (better than always showing the generic plus).
	const morePool: Set<string> = new Set(
		moreGroups.flatMap((g) => g.tools.map((t) => t.tool))
	);

	let moreOpen = $state(false);
	let moreRef: HTMLDivElement | null = $state(null);

	function pick(tool: Tool): void {
		if (tool === 'icon') {
			onIconTool();
			return;
		}
		editor.setTool(tool);
	}

	function pickMore(tool: Tool): void {
		moreOpen = false;
		editor.setTool(tool);
	}

	function toggleMore(): void {
		moreOpen = !moreOpen;
	}

	function handleDocClick(event: MouseEvent): void {
		if (!moreOpen) return;
		const target = event.target as Node | null;
		if (moreRef && target && !moreRef.contains(target)) moreOpen = false;
	}

	function handleKey(event: KeyboardEvent): void {
		if (moreOpen && event.key === 'Escape') {
			moreOpen = false;
		}
	}

	const moreActive = $derived(morePool.has(editor.tool));
</script>

<svelte:window onclick={handleDocClick} onkeydown={handleKey} />

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
						<PhIcon name={t.icon ?? t.tool} size={18} />
						{#if t.key}<kbd class="kb" aria-hidden="true">{t.key}</kbd>{/if}
						<span class="tip">
							{t.label}{#if t.key}<kbd>{t.key}</kbd>{/if}
						</span>
					</button>
				{/each}
			</div>
		{/each}

		<span class="divider" aria-hidden="true"></span>
		<div class="grp more-wrap" bind:this={moreRef}>
			<button
				class="tool"
				class:active={moreOpen || moreActive}
				aria-pressed={moreOpen}
				aria-haspopup="menu"
				aria-expanded={moreOpen}
				aria-label="More elements"
				onclick={(e) => {
					e.stopPropagation();
					toggleMore();
				}}
			>
				<PhIcon name="plus" size={18} />
				<span class="tip">More elements</span>
			</button>
			{#if moreOpen}
				<div class="more-popover" role="menu" aria-label="More elements">
					{#each moreGroups as g (g.heading)}
						<div class="more-group">
							<div class="more-heading">{g.heading}</div>
							<div class="more-grid">
								{#each g.tools as t (t.tool)}
									<button
										class="more-item"
										class:active={editor.tool === t.tool}
										aria-pressed={editor.tool === t.tool}
										onclick={() => pickMore(t.tool)}
									>
										<PhIcon name={t.icon ?? t.tool} size={16} />
										<span class="more-label">{t.label}</span>
									</button>
								{/each}
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>

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

		<span class="divider" aria-hidden="true"></span>
		<div class="grp">
			<button
				class="tool"
				class:active={editor.layersOpen}
				aria-pressed={editor.layersOpen}
				aria-label="Toggle Layers panel"
				onclick={() => editor.toggleLayers()}
			>
				<PhIcon name="list" size={17} />
				<span class="tip">Layers</span>
			</button>
			<button
				class="tool"
				class:active={editor.inspectorPinned}
				aria-pressed={editor.inspectorPinned}
				aria-label="Toggle Inspector panel"
				onclick={() => editor.toggleInspector()}
			>
				<PhIcon name="sidebar" size={17} />
				<span class="tip">Inspector</span>
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

	/* Always-visible keybinding badge in the tool's corner (Excalidraw .ToolIcon__keybinding:
	   bottom:2px right:3px, 0.625rem, gray-40). Only rendered for tools that have a shortcut. */
	.kb {
		position: absolute;
		inset-block-end: 2px;
		inset-inline-end: 3px;
		font-family: var(--font-sans);
		font-size: 0.625rem;
		line-height: 1;
		color: var(--ink-faint);
		pointer-events: none;
	}
	.tool.active .kb {
		color: currentColor;
		opacity: 0.7;
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

	/* "More elements" popover — opens below the trigger button, contains the 20 Phase-E types
	   grouped by category. Closed by default; pickMore() / outside-click / Escape close it. */
	.more-wrap {
		position: relative;
	}

	.more-popover {
		position: absolute;
		inset-block-start: calc(100% + 8px);
		inset-inline-end: 0;
		z-index: 60;
		display: flex;
		flex-direction: column;
		gap: 10px;
		min-inline-size: 280px;
		padding: 10px;
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-md);
	}

	.more-group {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.more-heading {
		font-size: var(--text-2xs);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--ink-soft);
		padding-inline: 2px;
	}

	.more-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 4px;
	}

	.more-item {
		display: inline-flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 4px;
		padding: 8px 4px;
		border-radius: var(--radius-md);
		color: var(--ink-soft);
		background: var(--surface-2);
		border: 1px solid transparent;
		transition:
			background var(--dur-1) var(--ease),
			color var(--dur-1) var(--ease),
			border-color var(--dur-1) var(--ease);

		&:hover {
			background: var(--surface);
			color: var(--ink);
			border-color: var(--line);
		}
		&.active {
			background: var(--accent);
			color: var(--accent-ink);
		}
	}

	.more-label {
		font-size: 10px;
		line-height: 1;
		font-weight: 500;
		text-align: center;
	}

	/* ---- WEB SHELL (Excalidraw parity) ------------------------------------------------------- */
	/* The toolbar is a floating, content-width white Island (not a full-width rail). Tool buttons
	   are 2.25rem (Excalidraw --lg-button-size) and the SELECTED state is the light lavender
	   container (#e0dfff) with a dark indigo icon — matching Excalidraw, not a solid indigo fill. */
	:global(.x-web) .toolrail {
		block-size: auto;
		padding-inline: 0;
		background: transparent;
		border-block-end: none;
	}
	:global(.x-web) .palette {
		background: var(--surface);
		border: none;
		box-shadow: var(--shadow-island);
		padding: 4px;
		gap: 0;
		overflow: visible;
	}
	:global(.x-web) .tool {
		inline-size: 2.25rem;
		block-size: 2.25rem;
		border-radius: var(--radius-lg);
		color: var(--ink);
	}
	:global(.x-web) .tool:hover {
		background: var(--surface-2);
		color: var(--ink);
		box-shadow: none;
	}
	:global(.x-web) .tool.active {
		background: var(--accent-soft);
		color: var(--accent-on-container);
		box-shadow: none;
	}
	:global(.x-web) .more-item.active {
		background: var(--accent-soft);
		color: var(--accent-on-container);
	}

	/* On a narrow viewport the Island would overflow the screen — let the palette scroll
	   horizontally (Excalidraw's mobile toolbar behavior) instead of clipping off-screen. */
	@media (max-width: 820px) {
		:global(.x-web) .palette {
			overflow-x: auto;
			max-inline-size: 100%;
		}
	}
</style>
