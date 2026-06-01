<script module lang="ts">
	/** One row of the canvas context menu. Mirrors Excalidraw's ContextMenuItem (action | separator). */
	export type CtxItem =
		| { kind: 'separator' }
		| {
				kind: 'item';
				label: string;
				shortcut?: string;
				danger?: boolean;
				disabled?: boolean;
				run: () => void;
		  };
</script>

<script lang="ts">
	// Right-click context menu, structured + styled to match Excalidraw's ContextMenu.tsx /
	// ContextMenu.scss: a <ul class="context-menu"> of <button> rows with a label + shortcut kbd,
	// <hr> separators (leading/trailing/adjacent collapsed), clamped into the viewport.
	let {
		open,
		x,
		y,
		items,
		onClose
	}: {
		open: boolean;
		x: number;
		y: number;
		items: CtxItem[];
		onClose: () => void;
	} = $props();

	let menuEl = $state<HTMLUListElement>();
	let measured = $state<{ w: number; h: number } | null>(null);

	// Measure the menu once mounted so we can clamp it into the viewport.
	$effect(() => {
		if (!open) {
			measured = null;
			return;
		}
		const el = menuEl;
		if (el) {
			const r = el.getBoundingClientRect();
			measured = { w: r.width, h: r.height };
		}
	});

	// Position at the cursor, clamped so the menu never spills off-screen (Excalidraw Popover
	// `fitInViewport`). Derived from the props + measured size, so it tracks the cursor with no flash.
	const pos = $derived.by(() => {
		let nx = x;
		let ny = y;
		if (measured) {
			if (x + measured.w > window.innerWidth - 4) nx = Math.max(4, window.innerWidth - measured.w - 4);
			if (y + measured.h > window.innerHeight - 4) ny = Math.max(4, window.innerHeight - measured.h - 4);
		}
		return { x: nx, y: ny };
	});

	// Dismiss on outside pointer-down, Escape, scroll/zoom, or window blur (Excalidraw onCloseRequest).
	$effect(() => {
		if (!open) return;
		const onDown = (e: PointerEvent): void => {
			if (menuEl && e.target instanceof Node && !menuEl.contains(e.target)) onClose();
		};
		const onKey = (e: KeyboardEvent): void => {
			if (e.key === 'Escape') {
				e.stopPropagation();
				onClose();
			}
		};
		const dismiss = (): void => onClose();
		window.addEventListener('pointerdown', onDown, true);
		window.addEventListener('keydown', onKey, true);
		window.addEventListener('wheel', dismiss, { passive: true });
		window.addEventListener('blur', dismiss);
		return () => {
			window.removeEventListener('pointerdown', onDown, true);
			window.removeEventListener('keydown', onKey, true);
			window.removeEventListener('wheel', dismiss);
			window.removeEventListener('blur', dismiss);
		};
	});

	// Collapse leading/trailing/adjacent separators (Excalidraw's filteredItems logic).
	const visible = $derived.by(() => {
		const out: CtxItem[] = [];
		for (const it of items) {
			if (it.kind === 'separator' && (out.length === 0 || out[out.length - 1]?.kind === 'separator')) {
				continue;
			}
			out.push(it);
		}
		while (out.length > 0 && out[out.length - 1]?.kind === 'separator') out.pop();
		return out;
	});

	function choose(it: Extract<CtxItem, { kind: 'item' }>): void {
		if (it.disabled) return;
		onClose();
		it.run();
	}
</script>

{#if open}
	<ul
		bind:this={menuEl}
		class="context-menu"
		style:left="{pos.x}px"
		style:top="{pos.y}px"
		role="menu"
		tabindex="-1"
		oncontextmenu={(e) => e.preventDefault()}
	>
		{#each visible as it, i (i)}
			{#if it.kind === 'separator'}
				<hr class="sep" />
			{:else}
				<li role="none">
					<button
						type="button"
						role="menuitem"
						class="item"
						class:danger={it.danger}
						disabled={it.disabled}
						onclick={() => choose(it)}
					>
						<span class="label">{it.label}</span>
						{#if it.shortcut}<kbd class="shortcut">{it.shortcut}</kbd>{/if}
					</button>
				</li>
			{/if}
		{/each}
	</ul>
{/if}

<style>
	.context-menu {
		position: fixed;
		z-index: 100;
		margin: 0;
		padding: 0.5rem 0;
		list-style: none;
		user-select: none;
		cursor: default;
		min-inline-size: 9.5rem;
		background: var(--surface);
		border: 1px solid var(--line-strong);
		border-radius: 4px;
		box-shadow: 0 3px 10px oklch(0 0 0 / 0.2);
	}
	.item {
		display: grid;
		grid-template-columns: 1fr auto;
		align-items: center;
		gap: 20px;
		inline-size: 100%;
		margin: 0;
		padding: 0.25rem 1rem 0.25rem 1.25rem;
		text-align: start;
		white-space: nowrap;
		background: transparent;
		border: 0;
		border-radius: 0;
		color: var(--ink);
		font-family: inherit;
		font-size: var(--text-sm);
	}
	.item:hover:not(:disabled) {
		background: var(--accent);
		color: var(--accent-ink);
	}
	.item:disabled {
		opacity: 0.4;
	}
	.item.danger {
		color: oklch(0.55 0.2 25);
	}
	.item.danger:hover:not(:disabled) {
		background: oklch(0.55 0.2 25);
		color: oklch(0.99 0 0);
	}
	.label {
		justify-self: start;
	}
	.shortcut {
		justify-self: end;
		opacity: 0.6;
		font-family: inherit;
		font-size: 0.7rem;
	}
	.sep {
		border: none;
		border-top: 1px solid var(--line);
		margin: 0;
	}
</style>
