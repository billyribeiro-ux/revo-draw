<script lang="ts">
	import { listEntries, removeEntry, type LibraryEntry } from '$lib/persistence/library-db.js';
	import PhIcon from './PhIcon.svelte';

	let {
		open,
		onClose,
		onOpenEntry
	}: { open: boolean; onClose: () => void; onOpenEntry: (entry: LibraryEntry) => void } = $props();

	let entries = $state<LibraryEntry[]>([]);
	let loading = $state(false);
	let error = $state<string | null>(null);

	$effect(() => {
		if (open) void refresh();
	});

	// Document-level Escape closes the dialog (Excalidraw LibraryMenu capture ESC handler).
	$effect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent): void => {
			if (e.key === 'Escape') onClose();
		};
		window.addEventListener('keydown', onKey, true);
		return () => window.removeEventListener('keydown', onKey, true);
	});

	async function refresh(): Promise<void> {
		loading = true;
		error = null;
		try {
			entries = await listEntries(200);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load library.';
		} finally {
			loading = false;
		}
	}

	async function remove(entry: LibraryEntry, e: MouseEvent): Promise<void> {
		e.stopPropagation();
		await removeEntry(entry.id);
		await refresh();
	}

	function fmtDate(iso: string | null): string {
		if (!iso) return '—';
		const d = new Date(iso);
		return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
	}
</script>

{#if open}
	<!-- Presentational overlay: click to dismiss. Keyboard dismissal is handled globally (Escape)
	     above, so the backdrop itself is not a focus target. -->
	<div class="backdrop" aria-hidden="true" onclick={onClose}></div>
	<div class="library" role="dialog" aria-modal="true" aria-label="Library">
		<header>
			<h2><PhIcon name="library" size={18} /> Library</h2>
			<button class="close" onclick={onClose} aria-label="Close"><PhIcon name="x" size={16} /></button>
		</header>
		<div class="body">
			{#if loading}
				<p class="msg loading"><span class="spinner" aria-hidden="true"></span> Loading library…</p>
			{:else if error}
				<p class="msg error">{error}</p>
			{:else if entries.length === 0}
				<div class="empty">
					<p class="empty__label">No saved documents yet</p>
					<p class="empty__hint">Save a layout to see it here.</p>
				</div>
			{:else}
				<ul class="list">
					{#each entries as entry (entry.id)}
						<li>
							<div
								class="entry"
								role="button"
								tabindex="0"
								onclick={() => onOpenEntry(entry)}
								onkeydown={(e) => {
									if (e.key === 'Enter' || e.key === ' ') {
										e.preventDefault();
										onOpenEntry(entry);
									}
								}}
							>
								<span class="thumb" aria-hidden="true">
									{#if entry.thumbnail}
										<img src={entry.thumbnail} alt="" />
									{:else}
										<PhIcon name="frame" size={20} />
									{/if}
								</span>
								<span class="meta">
									<span class="name">{entry.name}</span>
									<span class="path">{entry.filePath ?? 'unsaved'}</span>
									<span class="dates">Updated {fmtDate(entry.updatedAt)}</span>
								</span>
								<button class="del" title="Remove from library" onclick={(e) => remove(entry, e)}>
									<PhIcon name="trash" size={14} />
								</button>
							</div>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	</div>
{/if}

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		background: oklch(0.2 0.02 264 / 0.28);
		z-index: 40;
	}
	.library {
		position: fixed;
		inset-block-start: 50%;
		inset-inline-start: 50%;
		transform: translate(-50%, -50%);
		inline-size: min(680px, 92vw);
		block-size: min(600px, 86vh);
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
		justify-content: space-between;
		padding: var(--space-3) var(--space-4);
		border-block-end: 1px solid var(--line);
	}
	h2 {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--text-md);
		font-weight: 650;
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
	.body {
		flex: 1;
		overflow-y: auto;
	}
	.msg {
		padding: var(--space-6);
		text-align: center;
		color: var(--ink-faint);
	}
	.msg.error {
		color: var(--danger);
	}
	.msg.loading {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-2);
	}
	.spinner {
		display: inline-block;
		inline-size: 1em;
		block-size: 1em;
		border: 2px solid var(--line-strong);
		border-block-start-color: var(--accent);
		border-radius: 50%;
		animation: lib-spin 0.7s linear infinite;
	}
	@media (prefers-reduced-motion: reduce) {
		.spinner {
			animation: none;
		}
	}
	@keyframes lib-spin {
		to {
			transform: rotate(360deg);
		}
	}
	.empty {
		padding: var(--space-6);
		text-align: center;
	}
	.empty__label {
		font-size: var(--text-lg);
		font-weight: 700;
		color: var(--ink);
	}
	.empty__hint {
		margin-block-start: var(--space-1);
		color: var(--ink-faint);
	}
	.list {
		list-style: none;
		padding: var(--space-2);
	}
	.entry {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		inline-size: 100%;
		padding: var(--space-2);
		border-radius: var(--radius-md);
		text-align: start;
		&:hover {
			background: var(--surface-sunken);
		}
	}
	.thumb {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		inline-size: 48px;
		block-size: 36px;
		background: var(--surface-2);
		border: 1px solid var(--line);
		border-radius: var(--radius-sm);
		color: var(--ink-faint);
		overflow: hidden;
		flex-shrink: 0;
	}
	.thumb img {
		inline-size: 100%;
		block-size: 100%;
		object-fit: cover;
	}
	.meta {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 1px;
		min-inline-size: 0;
	}
	.name {
		font-size: var(--text-sm);
		font-weight: 550;
		color: var(--ink);
	}
	.path,
	.dates {
		font-size: var(--text-2xs);
		color: var(--ink-faint);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.del {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		inline-size: 28px;
		block-size: 28px;
		border-radius: var(--radius-sm);
		color: var(--ink-faint);
		&:hover {
			color: var(--danger);
			background: var(--surface);
		}
	}
</style>
