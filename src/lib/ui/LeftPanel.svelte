<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity';
	import { editor } from '$lib/canvas/editor.svelte.js';
	import { isContainerType, type Element, type ElementId } from '$lib/elements/types.js';
	import { defaultLabel } from '$lib/elements/defaults.js';
	import PhIcon from './PhIcon.svelte';

	const { scene, commands } = editor;

	// Collapsed container ids in the tree.
	const collapsed = new SvelteSet<ElementId>();
	let dragId = $state<ElementId | null>(null);
	let dropId = $state<ElementId | null>(null);

	interface Row {
		el: Element;
		depth: number;
	}

	// Flatten the hierarchy into display rows (root order → DFS), respecting collapse state.
	const rows = $derived.by<Row[]>(() => {
		const out: Row[] = [];
		const visit = (id: ElementId, depth: number): void => {
			const el = scene.get(id);
			if (!el) return;
			out.push({ el, depth });
			if (isContainerType(el.type) && !collapsed.has(id)) {
				for (const child of scene.childOrderOf(id)) visit(child, depth + 1);
			}
		};
		for (const id of scene.childOrderOf(null)) visit(id, 0);
		return out;
	});

	function toggleCollapse(id: ElementId): void {
		if (collapsed.has(id)) collapsed.delete(id);
		else collapsed.add(id);
	}

	function rowLabel(el: Element): string {
		return (el.label && el.label.trim()) || defaultLabel(el.type);
	}

	function selectRow(el: Element, e: MouseEvent): void {
		if (e.shiftKey) scene.toggleSelection(el.id);
		else scene.selectOne(el.id);
	}

	function onDragStart(id: ElementId): void {
		dragId = id;
	}
	function onDragOver(e: DragEvent, el: Element): void {
		if (!dragId || dragId === el.id) return;
		// Only containers are valid drop targets, and not into own descendants.
		if (!isContainerType(el.type)) return;
		if (scene.isAncestor(dragId, el.id)) return;
		e.preventDefault();
		dropId = el.id;
	}
	function onDrop(): void {
		if (dragId && dropId && dragId !== dropId) {
			commands.reparent(dragId, dropId);
		}
		dragId = null;
		dropId = null;
	}
	function onDropToRoot(): void {
		if (dragId) commands.reparent(dragId, null);
		dragId = null;
		dropId = null;
	}

	function toggleVisible(el: Element): void {
		commands.patch(el.id, { hidden: !el.hidden }, el.hidden ? 'Show' : 'Hide');
	}
	function toggleLocked(el: Element): void {
		commands.patch(el.id, { locked: !el.locked }, el.locked ? 'Unlock' : 'Lock');
	}
</script>

<aside class="left-panel">
	<header class="panel-head">
		<span class="title">Layers</span>
		<span class="count">{rows.length}</span>
	</header>
	<div
		class="tree"
		role="tree"
		tabindex="-1"
		ondragover={(e) => {
			if (dragId) e.preventDefault();
		}}
		ondrop={onDropToRoot}
	>
		{#each rows as row (row.el.id)}
			{@const el = row.el}
			<div
				class="row"
				class:selected={scene.isSelected(el.id)}
				class:drop={dropId === el.id}
				role="treeitem"
				aria-selected={scene.isSelected(el.id)}
				tabindex="-1"
				style:padding-inline-start="{8 + row.depth * 14}px"
				draggable="true"
				ondragstart={() => onDragStart(el.id)}
				ondragover={(e) => onDragOver(e, el)}
				ondrop={(e) => {
					e.stopPropagation();
					onDrop();
				}}
				ondragend={() => {
					dragId = null;
					dropId = null;
				}}
				onclick={(e) => selectRow(el, e)}
				onkeydown={(e) => {
					if (e.key === 'Enter') scene.selectOne(el.id);
				}}
			>
				{#if isContainerType(el.type) && scene.childOrderOf(el.id).length > 0}
					<button
						class="twisty"
						onclick={(e) => {
							e.stopPropagation();
							toggleCollapse(el.id);
						}}
						aria-label={collapsed.has(el.id) ? 'Expand' : 'Collapse'}
					>
						<PhIcon name={collapsed.has(el.id) ? 'caret-right' : 'caret-down'} size={12} />
					</button>
				{:else}
					<span class="twisty placeholder"></span>
				{/if}

				<span class="kind"><PhIcon name={el.type} size={15} /></span>
				<span class="name" title={rowLabel(el)}>{rowLabel(el)}</span>

				<span class="row-actions">
					<button
						class="rowbtn"
						title={el.hidden ? 'Show' : 'Hide'}
						onclick={(e) => {
							e.stopPropagation();
							toggleVisible(el);
						}}
					>
						<PhIcon name={el.hidden ? 'eye-slash' : 'eye'} size={13} />
					</button>
					<button
						class="rowbtn"
						title={el.locked ? 'Unlock' : 'Lock'}
						onclick={(e) => {
							e.stopPropagation();
							toggleLocked(el);
						}}
					>
						<PhIcon name={el.locked ? 'lock' : 'lock-open'} size={13} />
					</button>
				</span>
			</div>
		{/each}

		{#if rows.length === 0}
			<p class="empty">No elements yet. Pick a tool and draw on the canvas.</p>
		{/if}
	</div>
</aside>

<style>
	.left-panel {
		display: flex;
		flex-direction: column;
		inline-size: var(--panel-w);
		background: var(--surface);
		border-inline-end: 1px solid var(--line);
		overflow: hidden;
	}

	.panel-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-3) var(--space-4);
		border-block-end: 1px solid var(--line);
	}
	.panel-head .title {
		font-size: var(--text-2xs);
		font-weight: 650;
		letter-spacing: var(--tracking-caps);
		text-transform: uppercase;
		color: var(--ink-faint);
	}
	.panel-head .count {
		font-size: var(--text-2xs);
		font-variant-numeric: tabular-nums;
		color: var(--ink-faint);
		background: var(--surface-sunken);
		padding: 1px 7px;
		border-radius: var(--radius-pill);
	}

	.tree {
		flex: 1;
		overflow-y: auto;
		padding-block: var(--space-1);
		min-block-size: 80px;
	}

	.row {
		display: flex;
		align-items: center;
		gap: 4px;
		block-size: 28px;
		padding-inline-end: var(--space-2);
		font-size: var(--text-sm);
		color: var(--ink-soft);
		cursor: default;
		border-radius: var(--radius-sm);
		margin-inline: 4px;

		&:hover {
			background: var(--surface-sunken);
		}
		&.selected {
			background: var(--accent-soft);
			color: var(--ink);
		}
		&.drop {
			outline: 1.5px solid var(--accent);
			outline-offset: -1.5px;
		}
	}

	.twisty {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		inline-size: 16px;
		block-size: 16px;
		color: var(--ink-faint);
		flex-shrink: 0;
	}
	.twisty.placeholder {
		visibility: hidden;
	}

	.kind {
		color: var(--ink-faint);
		flex-shrink: 0;
	}

	.name {
		flex: 1;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.row-actions {
		display: flex;
		gap: 1px;
		opacity: 0;
	}
	.row:hover .row-actions,
	.row.selected .row-actions {
		opacity: 1;
	}

	.rowbtn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		inline-size: 20px;
		block-size: 20px;
		color: var(--ink-faint);
		border-radius: var(--radius-sm);
		&:hover {
			background: var(--surface);
			color: var(--ink);
		}
	}

	.empty {
		padding: var(--space-4);
		font-size: var(--text-xs);
		color: var(--ink-faint);
		line-height: 1.5;
	}
</style>
