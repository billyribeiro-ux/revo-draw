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

	let {
		onPickIcon,
		onAttachIcon
	}: { onPickIcon: () => void; onAttachIcon: () => void } = $props();

	const { scene, commands, camera } = editor;

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

	function geometryOrigin(target: Element): { x: number; y: number } {
		const parent = target.parentId ? scene.get(target.parentId) : null;
		if (parent) return { x: parent.x, y: parent.y };
		const elements = scene.ordered.filter((item) => !item.hidden);
		if (elements.length === 0) return { x: 0, y: 0 };
		return {
			x: Math.min(...elements.map((item) => item.x)),
			y: Math.min(...elements.map((item) => item.y))
		};
	}

	function displayX(target: Element): number {
		return target.x - geometryOrigin(target).x;
	}

	function displayY(target: Element): number {
		return target.y - geometryOrigin(target).y;
	}

	function patchDisplayX(target: Element, value: number): void {
		patch({ x: geometryOrigin(target).x + value }, 'Move');
	}

	function patchDisplayY(target: Element, value: number): void {
		patch({ y: geometryOrigin(target).y + value }, 'Move');
	}

	// ---- icon attachment ---------------------------------------------------------------------
	// `BaseElement.icon` is supported on every element type EXCEPT the standalone IconElement,
	// whose body IS the icon (changing the icon there uses `Change icon` via onPickIcon instead).

	function removeIcon(): void {
		if (!el) return;
		commands.patch(el.id, { icon: undefined } as Partial<Element>, 'Remove icon');
	}

	// ---- paste SVG modal ---------------------------------------------------------------------

	let svgModalOpen = $state(false);
	let svgMarkup = $state('');
	let svgError = $state<string | null>(null);
	let svgTextarea = $state<HTMLTextAreaElement>();

	function openSvgModal(): void {
		svgMarkup = '';
		svgError = null;
		svgModalOpen = true;
		queueMicrotask(() => svgTextarea?.focus());
	}
	function closeSvgModal(): void {
		svgModalOpen = false;
		svgError = null;
	}

	function sanitizeSvg(markup: string): { body: string; viewBox: string } | null {
		const doc = new DOMParser().parseFromString(markup, 'image/svg+xml');
		if (doc.querySelector('parsererror')) return null;
		const root = doc.querySelector('svg');
		if (!root) return null;
		// Strip <script> elements outright.
		for (const s of root.querySelectorAll('script')) s.remove();
		// Strip on* attributes and javascript: URLs anywhere in the subtree. The DOM Element type
		// shadows our `Element` import, so we use globalThis.Element to disambiguate.
		const walker = doc.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
		let node = walker.currentNode as globalThis.Element | null;
		while (node) {
			for (const attr of [...node.attributes]) {
				if (attr.name.toLowerCase().startsWith('on')) node.removeAttribute(attr.name);
				if (
					/^(href|xlink:href)$/i.test(attr.name) &&
					/^javascript:/i.test(attr.value)
				) {
					node.removeAttribute(attr.name);
				}
			}
			node = walker.nextNode() as globalThis.Element | null;
		}
		const viewBox = root.getAttribute('viewBox') ?? '0 0 100 100';
		return { body: root.innerHTML, viewBox };
	}

	function commitSvg(): void {
		const result = sanitizeSvg(svgMarkup);
		if (!result) {
			svgError = 'Invalid SVG markup';
			return;
		}
		const { body, viewBox } = result;
		if (el && el.type === 'svg') {
			commands.patch(el.id, { body, viewBox } as Partial<Element>, 'Edit SVG');
		} else {
			// No svg selected — create a fresh one at the viewport center.
			const center = camera.toWorld({
				x: camera.viewportWidth / 2,
				y: camera.viewportHeight / 2
			});
			const id = commands.createAt('svg', {
				x: center.x - 60,
				y: center.y - 60,
				width: 120,
				height: 120
			});
			commands.patch(id, { body, viewBox } as Partial<Element>, 'Paste SVG');
		}
		closeSvgModal();
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
			<button class="ghost-btn paste-svg" onclick={openSvgModal}>
				<PhIcon name="plus" size={14} /> Paste SVG markup…
			</button>
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
						<input name="rightpanel-f3" autocomplete="off" type="number" value={num(displayX(e))} oninput={(ev) => patchDisplayX(e, +(ev.currentTarget as HTMLInputElement).value)} />
					</label>
					<label class="field">
						<span class="label">Y</span>
						<input name="rightpanel-f4" autocomplete="off" type="number" value={num(displayY(e))} oninput={(ev) => patchDisplayY(e, +(ev.currentTarget as HTMLInputElement).value)} />
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
				{:else if e.type === 'svg'}
					<button class="ghost-btn" onclick={openSvgModal}>
						<PhIcon name="plus" size={14} /> Edit SVG markup…
					</button>
				{:else}
					<p class="hint">No extra content fields for this type.</p>
				{/if}
			</section>

			<!-- Icon attachment — every element type EXCEPT the standalone IconElement (whose body
			     IS the icon) can carry an embedded BaseElement.icon. -->
			{#if e.type !== 'icon'}
				<section class="field-group">
					<h3>Icon</h3>
					{#if e.icon}
						{@const ic = e.icon}
						<div class="icon-row">
							<span class="attached-glyph" aria-hidden="true">
								<!-- Trusted: svgPath comes from our bundled, first-party Phosphor set via the
								     IconPicker (or a drag from same), never from user input. -->
								<svg viewBox={ic.viewBox} width="18" height="18">
									<path d={ic.svgPath} fill="currentColor" />
								</svg>
							</span>
							<span class="icon-name">{ic.name}</span>
							<button class="ghost-btn remove" onclick={removeIcon} title="Remove icon" aria-label="Remove icon">
								<PhIcon name="x" size={12} />
							</button>
						</div>
					{:else}
						<button class="ghost-btn" onclick={onAttachIcon}>
							<PhIcon name="plus" size={14} /> Add icon
						</button>
					{/if}
				</section>
			{/if}

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

			<!-- Alignment (Excalidraw alignElements) — needs ≥2 selected. -->
			{#if sel.length >= 2}
				<section class="field-group">
					<h3>Align</h3>
					<div class="icon-grid">
						<button class="icon-btn" onclick={() => commands.align('x', 'start')} title="Align left" aria-label="Align left"><PhIcon name="align-left" size={16} /></button>
						<button class="icon-btn" onclick={() => commands.align('x', 'center')} title="Align center (horizontal)" aria-label="Align center horizontal"><PhIcon name="align-center-v" size={16} /></button>
						<button class="icon-btn" onclick={() => commands.align('x', 'end')} title="Align right" aria-label="Align right"><PhIcon name="align-right" size={16} /></button>
						<button class="icon-btn" onclick={() => commands.align('y', 'start')} title="Align top" aria-label="Align top"><PhIcon name="align-top" size={16} /></button>
						<button class="icon-btn" onclick={() => commands.align('y', 'center')} title="Align middle (vertical)" aria-label="Align middle vertical"><PhIcon name="align-center-h" size={16} /></button>
						<button class="icon-btn" onclick={() => commands.align('y', 'end')} title="Align bottom" aria-label="Align bottom"><PhIcon name="align-bottom" size={16} /></button>
					</div>
					{#if sel.length >= 3}
						<div class="btn-row">
							<button class="ghost-btn" onclick={() => commands.distribute('x')} title="Distribute horizontally"><PhIcon name="distribute-h" size={14} /> Distribute H</button>
							<button class="ghost-btn" onclick={() => commands.distribute('y')} title="Distribute vertically"><PhIcon name="distribute-v" size={14} /> Distribute V</button>
						</div>
					{/if}
				</section>
			{/if}

			<!-- Z-order + transform actions -->
			<section class="field-group">
				<h3>Arrange</h3>
				<div class="btn-row">
					<button class="ghost-btn" onclick={() => commands.bringToFront()} title="Bring to front"><PhIcon name="front" size={14} /> Front</button>
					<button class="ghost-btn" onclick={() => commands.sendToBack()} title="Send to back"><PhIcon name="back" size={14} /> Back</button>
				</div>
				<div class="btn-row">
					<button class="ghost-btn" onclick={() => commands.flip('x')} title="Flip horizontal (⇧H)"><PhIcon name="flip-h" size={14} /> Flip H</button>
					<button class="ghost-btn" onclick={() => commands.flip('y')} title="Flip vertical (⇧V)"><PhIcon name="flip-v" size={14} /> Flip V</button>
				</div>
				<div class="btn-row">
					<button class="ghost-btn" onclick={() => commands.toggleLockSelection()} title="Lock / unlock (⌘⇧L)">
						<PhIcon name={e.locked ? 'lock' : 'lock-open'} size={14} /> {e.locked ? 'Unlock' : 'Lock'}
					</button>
					<button class="ghost-btn" onclick={() => commands.duplicateSelection()} title="Duplicate (⌘D)"><PhIcon name="copy" size={14} /> Duplicate</button>
				</div>
				<div class="btn-row">
					<button class="ghost-btn danger" onclick={() => commands.deleteSelection()} title="Delete (⌫)"><PhIcon name="trash" size={14} /> Delete</button>
				</div>
			</section>
		</div>
	{/if}
</aside>

<svelte:window
	onkeydown={(e) => {
		if (svgModalOpen && e.key === 'Escape') closeSvgModal();
	}}
/>

{#if svgModalOpen}
	<div class="svg-backdrop" aria-hidden="true" onclick={closeSvgModal}></div>
	<div class="svg-modal" role="dialog" aria-modal="true" aria-label="Paste SVG markup">
		<header class="svg-head">
			<h3>Paste SVG markup</h3>
			<button class="close" onclick={closeSvgModal} aria-label="Close">
				<PhIcon name="x" size={16} />
			</button>
		</header>
		<textarea
			name="svg-modal-textarea"
			autocomplete="off"
			bind:this={svgTextarea}
			bind:value={svgMarkup}
			class="svg-textarea"
			placeholder="<svg viewBox=&quot;0 0 100 100&quot;>...</svg>"
			spellcheck="false"
		></textarea>
		{#if svgError}
			<p class="svg-error" role="alert">{svgError}</p>
		{/if}
		<footer class="svg-actions">
			<button class="ghost-btn" onclick={closeSvgModal}>Cancel</button>
			<button class="ghost-btn primary-btn" onclick={commitSvg}>Commit</button>
		</footer>
	</div>
{/if}

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

	.icon-grid {
		display: grid;
		grid-template-columns: repeat(6, 1fr);
		gap: var(--space-1);
	}
	.icon-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		block-size: 30px;
		color: var(--ink-soft);
		background: var(--surface-2);
		border: 1px solid var(--line-strong);
		border-radius: var(--radius-sm);
		transition:
			background var(--dur-1) var(--ease),
			color var(--dur-1) var(--ease);

		&:hover {
			background: var(--surface);
			color: var(--ink);
			box-shadow: var(--shadow-xs);
		}
		&:active {
			transform: translateY(0.5px);
		}
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

	.paste-svg {
		flex: 0 0 auto;
		margin-block-start: var(--space-3);
	}

	.attached-glyph {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		inline-size: 22px;
		block-size: 22px;
		color: var(--ink);
	}
	.attached-glyph :global(svg) {
		display: block;
	}
	.icon-row .remove {
		flex: 0 0 auto;
		padding: 4px 6px;
	}

	/* Paste-SVG modal */
	.svg-backdrop {
		position: fixed;
		inset: 0;
		background: oklch(0.2 0.02 264 / 0.28);
		z-index: 60;
	}
	.svg-modal {
		position: fixed;
		inset-block-start: 50%;
		inset-inline-start: 50%;
		transform: translate(-50%, -50%);
		inline-size: min(560px, 90vw);
		block-size: min(480px, 80vh);
		display: flex;
		flex-direction: column;
		background: var(--surface);
		border: 1px solid var(--line-strong);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-lg);
		z-index: 61;
		overflow: hidden;
	}
	.svg-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-3) var(--space-4);
		border-block-end: 1px solid var(--line);
	}
	.svg-head h3 {
		font-size: var(--text-sm);
		font-weight: 600;
		color: var(--ink);
		text-transform: none;
		letter-spacing: normal;
	}
	.svg-head .close {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		inline-size: 28px;
		block-size: 28px;
		border-radius: var(--radius-sm);
		color: var(--ink-soft);
		&:hover {
			background: var(--surface-sunken);
		}
	}
	.svg-textarea {
		flex: 1;
		margin: var(--space-3);
		padding: var(--space-3);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		line-height: 1.45;
		resize: none;
		border: 1px solid var(--line-strong);
		border-radius: var(--radius-sm);
		background: var(--surface-inset);
		color: var(--ink);
		outline: none;
		&:focus {
			border-color: var(--accent);
			box-shadow: var(--ring-accent);
		}
	}
	.svg-error {
		margin-inline: var(--space-3);
		padding: var(--space-2) var(--space-3);
		font-size: var(--text-xs);
		color: var(--danger);
		background: var(--danger-soft);
		border-radius: var(--radius-sm);
	}
	.svg-actions {
		display: flex;
		justify-content: flex-end;
		gap: var(--space-2);
		padding: var(--space-3) var(--space-4);
		border-block-start: 1px solid var(--line);
	}
	.svg-actions .ghost-btn {
		flex: 0 0 auto;
		padding: 7px 14px;
	}
	.svg-actions .primary-btn {
		color: var(--accent-ink);
		background: var(--accent);
		border-color: var(--accent);
		&:hover {
			background: var(--accent);
			color: var(--accent-ink);
		}
	}
</style>
