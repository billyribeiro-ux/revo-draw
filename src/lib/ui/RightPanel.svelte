<script lang="ts">
	import { editor } from '$lib/canvas/editor.svelte.js';
	import {
		ALIGNMENTS,
		CHART_KINDS,
		isContainerType,
		LAYOUT_MODES,
		RESPONSIVE_INTENTS,
		SEMANTIC_TYPES,
		TEXT_ROLES,
		type Element,
		type LayoutIntent,
		type SemanticType
	} from '$lib/elements/types.js';
	import PhIcon from './PhIcon.svelte';

	let { onPickIcon }: { onPickIcon: () => void } = $props();

	const { scene, commands } = editor;

	// The single "primary" selected element drives the inspector (last in selection order).
	const sel = $derived(scene.selectedElements);
	const el = $derived<Element | null>(sel.length > 0 ? (sel[sel.length - 1] ?? null) : null);

	function patch(p: Partial<Element>, label?: string): void {
		if (el) commands.patch(el.id, p, label);
	}
	function patchLayout(p: Partial<LayoutIntent>): void {
		if (el) commands.patchLayout(el.id, p);
	}
	function num(v: number): number {
		return Math.round(v * 100) / 100;
	}
</script>

<aside class="right-panel">
	<header class="panel-head">
		<span class="title">Inspector</span>
		{#if el}<span class="badge">{el.type}</span>{/if}
	</header>

	{#if !el}
		<div class="empty">
			<div class="empty-mark" aria-hidden="true"><PhIcon name="select" size={22} /></div>
			<p class="empty-title">Nothing selected</p>
			<p class="empty-body">
				Select an element to edit its semantic type, label, layout intent, sizing, and style. The
				richer you tag elements, the better the exported Markdown spec.
			</p>
		</div>
	{:else}
		{@const e = el}
		<div class="scroll">
			<!-- Semantic type -->
			<section class="field-group">
				<label class="field">
					<span class="label">Type</span>
					<div class="select-wrap">
						<select name="rightpanel-f1" autocomplete="off"
							value={e.type}
							onchange={(ev) =>
								commands.changeType(e.id, (ev.currentTarget as HTMLSelectElement).value as SemanticType)}
						>
							{#each SEMANTIC_TYPES as t (t)}
								<option value={t}>{t}</option>
							{/each}
						</select>
					</div>
				</label>

				<label class="field">
					<span class="label">Label</span>
					<input name="rightpanel-f2" autocomplete="off"
						type="text"
						placeholder="e.g. Revenue card"
						value={e.label ?? ''}
						oninput={(ev) => patch({ label: (ev.currentTarget as HTMLInputElement).value }, 'Edit label')}
					/>
				</label>
			</section>

			<!-- Geometry -->
			<section class="field-group">
				<h3>Geometry</h3>
				<div class="grid-2">
					<label class="field">
						<span class="label">X</span>
						<input name="rightpanel-f3" autocomplete="off" type="number" value={num(e.x)} oninput={(ev) => patch({ x: +(ev.currentTarget as HTMLInputElement).value }, 'Move')} />
					</label>
					<label class="field">
						<span class="label">Y</span>
						<input name="rightpanel-f4" autocomplete="off" type="number" value={num(e.y)} oninput={(ev) => patch({ y: +(ev.currentTarget as HTMLInputElement).value }, 'Move')} />
					</label>
					<label class="field">
						<span class="label">W</span>
						<input name="rightpanel-f5" autocomplete="off" type="number" min="1" value={num(e.width)} oninput={(ev) => patch({ width: Math.max(1, +(ev.currentTarget as HTMLInputElement).value) }, 'Resize')} />
					</label>
					<label class="field">
						<span class="label">H</span>
						<input name="rightpanel-f6" autocomplete="off" type="number" min="1" value={num(e.height)} oninput={(ev) => patch({ height: Math.max(1, +(ev.currentTarget as HTMLInputElement).value) }, 'Resize')} />
					</label>
					<label class="field">
						<span class="label">Rotation°</span>
						<input name="rightpanel-f7" autocomplete="off"
							type="number"
							value={num((e.rotation * 180) / Math.PI)}
							oninput={(ev) => patch({ rotation: (+(ev.currentTarget as HTMLInputElement).value * Math.PI) / 180 }, 'Rotate')}
						/>
					</label>
				</div>
			</section>

			<!-- Layout intent (containers) -->
			{#if isContainerType(e.type)}
				{@const ly = e.layout ?? { mode: 'flow' }}
				<section class="field-group">
					<h3>Layout intent</h3>
					<label class="field">
						<span class="label">Mode</span>
						<div class="select-wrap">
							<select name="rightpanel-f8" autocomplete="off" value={ly.mode} onchange={(ev) => patchLayout({ mode: (ev.currentTarget as HTMLSelectElement).value as LayoutIntent['mode'] })}>
								{#each LAYOUT_MODES as m (m)}
									<option value={m}>{m}</option>
								{/each}
							</select>
						</div>
					</label>
					<div class="grid-2">
						<label class="field">
							<span class="label">Gap</span>
							<input name="rightpanel-f9" autocomplete="off" type="number" min="0" value={ly.gap ?? 0} oninput={(ev) => patchLayout({ gap: +(ev.currentTarget as HTMLInputElement).value })} />
						</label>
						<label class="field">
							<span class="label">Padding</span>
							<input name="rightpanel-f10" autocomplete="off" type="number" min="0" value={ly.padding ?? 0} oninput={(ev) => patchLayout({ padding: +(ev.currentTarget as HTMLInputElement).value })} />
						</label>
					</div>
					{#if ly.mode === 'grid'}
						<label class="field">
							<span class="label">Grid columns</span>
							<input name="rightpanel-f11" autocomplete="off" type="number" min="1" value={ly.gridCols ?? 2} oninput={(ev) => patchLayout({ gridCols: Math.max(1, +(ev.currentTarget as HTMLInputElement).value) })} />
						</label>
					{/if}
					<div class="grid-2">
						<label class="field">
							<span class="label">Justify</span>
							<div class="select-wrap">
								<select name="rightpanel-f12" autocomplete="off" value={ly.justify ?? ''} onchange={(ev) => patchLayout({ justify: ((ev.currentTarget as HTMLSelectElement).value || undefined) as LayoutIntent['justify'] })}>
									<option value="">—</option>
									{#each ALIGNMENTS as a (a)}<option value={a}>{a}</option>{/each}
								</select>
							</div>
						</label>
						<label class="field">
							<span class="label">Align</span>
							<div class="select-wrap">
								<select name="rightpanel-f13" autocomplete="off" value={ly.align ?? ''} onchange={(ev) => patchLayout({ align: ((ev.currentTarget as HTMLSelectElement).value || undefined) as LayoutIntent['align'] })}>
									<option value="">—</option>
									{#each ALIGNMENTS as a (a)}<option value={a}>{a}</option>{/each}
								</select>
							</div>
						</label>
					</div>
					<label class="field">
						<span class="label">Responsive</span>
						<div class="select-wrap">
							<select name="rightpanel-f14" autocomplete="off" value={ly.responsive ?? 'none'} onchange={(ev) => patchLayout({ responsive: (ev.currentTarget as HTMLSelectElement).value as LayoutIntent['responsive'] })}>
								{#each RESPONSIVE_INTENTS as r (r)}<option value={r}>{r}</option>{/each}
							</select>
						</div>
					</label>
					<div class="grid-2">
						<label class="field">
							<span class="label">Fixed W</span>
							<input name="rightpanel-f15" autocomplete="off" type="number" min="0" placeholder="auto" value={ly.fixedWidth ?? ''} oninput={(ev) => patchLayout({ fixedWidth: (ev.currentTarget as HTMLInputElement).value ? +(ev.currentTarget as HTMLInputElement).value : undefined })} />
						</label>
						<label class="field">
							<span class="label">Fixed H</span>
							<input name="rightpanel-f16" autocomplete="off" type="number" min="0" placeholder="auto" value={ly.fixedHeight ?? ''} oninput={(ev) => patchLayout({ fixedHeight: (ev.currentTarget as HTMLInputElement).value ? +(ev.currentTarget as HTMLInputElement).value : undefined })} />
						</label>
					</div>
				</section>
			{/if}

			<!-- Per-type semantic props -->
			<section class="field-group">
				<h3>Content</h3>
				{#if e.type === 'text'}
					<label class="field">
						<span class="label">Text</span>
						<textarea name="rightpanel-f17" autocomplete="off" rows="2" value={e.content} oninput={(ev) => patch({ content: (ev.currentTarget as HTMLTextAreaElement).value }, 'Edit text')}></textarea>
					</label>
					<label class="field">
						<span class="label">Role</span>
						<div class="select-wrap">
							<select name="rightpanel-f18" autocomplete="off" value={e.textRole ?? 'body'} onchange={(ev) => patch({ textRole: (ev.currentTarget as HTMLSelectElement).value as typeof e.textRole }, 'Edit text role')}>
								{#each TEXT_ROLES as r (r)}<option value={r}>{r}</option>{/each}
							</select>
						</div>
					</label>
				{:else if e.type === 'button'}
					<label class="field">
						<span class="label">Caption</span>
						<input name="rightpanel-f19" autocomplete="off" type="text" value={e.content} oninput={(ev) => patch({ content: (ev.currentTarget as HTMLInputElement).value }, 'Edit button')} />
					</label>
					<label class="field">
						<span class="label">Variant</span>
						<div class="select-wrap">
							<select name="rightpanel-f20" autocomplete="off" value={e.variant ?? 'primary'} onchange={(ev) => patch({ variant: (ev.currentTarget as HTMLSelectElement).value as typeof e.variant }, 'Edit variant')}>
								<option value="primary">primary</option>
								<option value="secondary">secondary</option>
								<option value="ghost">ghost</option>
								<option value="danger">danger</option>
							</select>
						</div>
					</label>
				{:else if e.type === 'input'}
					<label class="field">
						<span class="label">Placeholder</span>
						<input name="rightpanel-f21" autocomplete="off" type="text" value={e.placeholder ?? ''} oninput={(ev) => patch({ placeholder: (ev.currentTarget as HTMLInputElement).value }, 'Edit input')} />
					</label>
					<label class="field">
						<span class="label">Kind</span>
						<div class="select-wrap">
							<select name="rightpanel-f22" autocomplete="off" value={e.inputKind ?? 'text'} onchange={(ev) => patch({ inputKind: (ev.currentTarget as HTMLSelectElement).value as typeof e.inputKind }, 'Edit input kind')}>
								<option value="text">text</option>
								<option value="email">email</option>
								<option value="password">password</option>
								<option value="search">search</option>
								<option value="number">number</option>
								<option value="textarea">textarea</option>
								<option value="select">select</option>
							</select>
						</div>
					</label>
				{:else if e.type === 'chart'}
					<label class="field">
						<span class="label">Chart kind</span>
						<div class="select-wrap">
							<select name="rightpanel-f23" autocomplete="off" value={e.chartKind} onchange={(ev) => patch({ chartKind: (ev.currentTarget as HTMLSelectElement).value as typeof e.chartKind }, 'Edit chart')}>
								{#each CHART_KINDS as c (c)}<option value={c}>{c}</option>{/each}
							</select>
						</div>
					</label>
				{:else if e.type === 'table'}
					<label class="field">
						<span class="label">Columns (comma-separated)</span>
						<input name="rightpanel-f24" autocomplete="off"
							type="text"
							value={(e.columns ?? []).join(', ')}
							oninput={(ev) => patch({ columns: (ev.currentTarget as HTMLInputElement).value.split(',').map((s) => s.trim()).filter(Boolean) }, 'Edit columns')}
						/>
					</label>
					<label class="field">
						<span class="label">Row count hint</span>
						<input name="rightpanel-f25" autocomplete="off" type="number" min="0" value={e.rowCountHint ?? 0} oninput={(ev) => patch({ rowCountHint: +(ev.currentTarget as HTMLInputElement).value }, 'Edit rows')} />
					</label>
				{:else if e.type === 'tabs'}
					<label class="field">
						<span class="label">Tabs (comma-separated)</span>
						<input name="rightpanel-f26" autocomplete="off" type="text" value={(e.tabs ?? []).join(', ')} oninput={(ev) => patch({ tabs: (ev.currentTarget as HTMLInputElement).value.split(',').map((s) => s.trim()).filter(Boolean) }, 'Edit tabs')} />
					</label>
				{:else if e.type === 'icon'}
					<div class="icon-row">
						<span class="icon-name">{e.iconName}</span>
						<button class="ghost-btn" onclick={onPickIcon}>
							<PhIcon name="search" size={14} /> Change
						</button>
					</div>
				{:else if e.type === 'image'}
					<label class="field">
						<span class="label">Alt text</span>
						<input name="rightpanel-f27" autocomplete="off" type="text" value={e.alt ?? ''} oninput={(ev) => patch({ alt: (ev.currentTarget as HTMLInputElement).value }, 'Edit alt')} />
					</label>
				{:else}
					<p class="hint">No extra content fields for this type.</p>
				{/if}
			</section>

			<!-- Style hints -->
			<section class="field-group">
				<h3>Style</h3>
				<div class="grid-2">
					<label class="field">
						<span class="label">Fill</span>
						<input name="rightpanel-f28" autocomplete="off" type="text" placeholder="oklch / #hex" value={e.style?.fill ?? ''} oninput={(ev) => patch({ style: { ...e.style, fill: (ev.currentTarget as HTMLInputElement).value || undefined } }, 'Edit style')} />
					</label>
					<label class="field">
						<span class="label">Stroke</span>
						<input name="rightpanel-f29" autocomplete="off" type="text" placeholder="oklch / #hex" value={e.style?.stroke ?? ''} oninput={(ev) => patch({ style: { ...e.style, stroke: (ev.currentTarget as HTMLInputElement).value || undefined } }, 'Edit style')} />
					</label>
					<label class="field">
						<span class="label">Radius</span>
						<input name="rightpanel-f30" autocomplete="off" type="number" min="0" value={e.style?.radius ?? 0} oninput={(ev) => patch({ style: { ...e.style, radius: +(ev.currentTarget as HTMLInputElement).value } }, 'Edit style')} />
					</label>
					<label class="field">
						<span class="label">Opacity</span>
						<input name="rightpanel-f31" autocomplete="off" type="number" min="0" max="1" step="0.05" value={e.style?.opacity ?? 1} oninput={(ev) => patch({ style: { ...e.style, opacity: +(ev.currentTarget as HTMLInputElement).value } }, 'Edit style')} />
					</label>
				</div>
			</section>

			<!-- Z-order actions -->
			<section class="field-group">
				<h3>Arrange</h3>
				<div class="btn-row">
					<button class="ghost-btn" onclick={() => commands.bringToFront()} title="Bring to front"><PhIcon name="front" size={14} /> Front</button>
					<button class="ghost-btn" onclick={() => commands.sendToBack()} title="Send to back"><PhIcon name="back" size={14} /> Back</button>
				</div>
				<div class="btn-row">
					<button class="ghost-btn" onclick={() => commands.duplicateSelection()} title="Duplicate (⌘D)"><PhIcon name="copy" size={14} /> Duplicate</button>
					<button class="ghost-btn danger" onclick={() => commands.deleteSelection()} title="Delete (⌫)"><PhIcon name="trash" size={14} /> Delete</button>
				</div>
			</section>
		</div>
	{/if}
</aside>

<style>
	.right-panel {
		display: flex;
		flex-direction: column;
		inline-size: var(--panel-w);
		background: var(--surface);
		border-inline-start: 1px solid var(--line);
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
	.panel-head .badge {
		font-size: var(--text-2xs);
		font-weight: 600;
		color: var(--accent);
		background: var(--accent-soft);
		padding: 2px 8px;
		border-radius: var(--radius-pill);
		text-transform: capitalize;
	}

	.empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-7) var(--space-5);
		text-align: center;
	}
	.empty-mark {
		display: grid;
		place-items: center;
		inline-size: 44px;
		block-size: 44px;
		border-radius: var(--radius-lg);
		background: var(--surface-sunken);
		color: var(--ink-ghost);
		margin-block-end: var(--space-1);
	}
	.empty-title {
		font-size: var(--text-sm);
		font-weight: 600;
		color: var(--ink-soft);
	}
	.empty-body {
		font-size: var(--text-xs);
		color: var(--ink-faint);
		line-height: 1.55;
	}
	.hint {
		font-size: var(--text-xs);
		color: var(--ink-faint);
		line-height: 1.5;
	}

	.scroll {
		flex: 1;
		overflow-y: auto;
		overscroll-behavior: contain;
	}

	.field-group {
		padding: var(--space-4);
		border-block-end: 1px solid var(--line);
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	h3 {
		font-size: var(--text-2xs);
		font-weight: 650;
		letter-spacing: var(--tracking-caps);
		text-transform: uppercase;
		color: var(--ink-faint);
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.label {
		font-size: var(--text-2xs);
		font-weight: 500;
		color: var(--ink-soft);
	}

	.grid-2 {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--space-2);
	}

	input,
	textarea,
	select {
		inline-size: 100%;
		padding: 6px 9px;
		font-size: var(--text-xs);
		background: var(--surface-inset);
		border: 1px solid var(--line-strong);
		border-radius: var(--radius-sm);
		color: var(--ink);
		transition:
			border-color var(--dur-1) var(--ease),
			box-shadow var(--dur-1) var(--ease);

		&:hover {
			border-color: var(--ink-ghost);
		}
		&:focus {
			border-color: var(--accent);
			background: var(--surface);
			box-shadow: var(--ring-accent);
			outline: none;
		}
	}
	textarea {
		resize: vertical;
		font-family: var(--font-sans);
		line-height: 1.45;
	}

	.select-wrap {
		position: relative;
	}
	.select-wrap::after {
		content: '';
		position: absolute;
		inset-inline-end: 10px;
		inset-block-start: 50%;
		inline-size: 6px;
		block-size: 6px;
		border-inline-end: 1.5px solid var(--ink-faint);
		border-block-end: 1.5px solid var(--ink-faint);
		transform: translateY(-65%) rotate(45deg);
		pointer-events: none;
	}
	.select-wrap select {
		appearance: none;
		cursor: pointer;
		padding-inline-end: 26px;
	}

	.icon-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
	}
	.icon-name {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--ink-soft);
	}

	.btn-row {
		display: flex;
		gap: var(--space-2);
	}

	.ghost-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		flex: 1;
		padding: 7px 8px;
		font-size: var(--text-xs);
		font-weight: 500;
		color: var(--ink-soft);
		background: var(--surface-2);
		border: 1px solid var(--line-strong);
		border-radius: var(--radius-sm);
		transition:
			background var(--dur-1) var(--ease),
			color var(--dur-1) var(--ease),
			border-color var(--dur-1) var(--ease);

		&:hover {
			background: var(--surface);
			color: var(--ink);
			box-shadow: var(--shadow-xs);
		}
		&:active {
			transform: translateY(0.5px);
		}
		&.danger:hover {
			color: var(--danger);
			border-color: var(--danger);
			background: var(--danger-soft);
		}
	}
</style>
