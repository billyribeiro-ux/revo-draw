<script lang="ts">
	import { editor } from '$lib/canvas/editor.svelte.js';
	import { BACKGROUND_PICKS, PALETTE_GRID, STROKE_PICKS, TRANSPARENT } from '$lib/elements/palette.js';
	import { STROKE_STYLES, STROKE_WIDTHS, type StrokeStyle, type StrokeWidth } from '$lib/elements/types.js';

	const { scene, commands } = editor;

	// Show when there's a selection AND no gesture is in progress — style controls must not appear
	// or apply mid-draw (only once the drawing/drag has stopped).
	const sel = $derived(scene.selectedElements);
	// Hide while a gesture is active OR while a text element is being edited (the inline editor owns
	// the surface — style controls must not float over it).
	const show = $derived(sel.length > 0 && !editor.gestureActive && editor.editingTextId === null);
	// Representative element for showing the current value (last selected).
	const primary = $derived(sel.length > 0 ? sel[sel.length - 1] : null);

	let strokeOpen = $state(false);
	let bgOpen = $state(false);
	let panelEl = $state<HTMLDivElement | null>(null);

	function closePopovers(): void {
		strokeOpen = false;
		bgOpen = false;
	}
	// Mutually-exclusive popovers (Excalidraw's atomic openPopup: only one at a time).
	function toggleStroke(): void {
		const next = !strokeOpen;
		closePopovers();
		strokeOpen = next;
	}
	function toggleBg(): void {
		const next = !bgOpen;
		closePopovers();
		bgOpen = next;
	}

	// Close the open palette on outside-click or Escape (matches Excalidraw's pointerDownOutside /
	// Escape handling on its color Popover). A picked swatch already closes inline.
	$effect(() => {
		if (!strokeOpen && !bgOpen) return;
		// Read panelEl in the effect body so it is a tracked dependency — if bind:this reassigns it,
		// the effect re-runs and the listener closes over the current node (Svelte 5 only auto-tracks
		// reads in the effect body, not inside nested closures).
		const panel = panelEl;
		const onDown = (e: PointerEvent): void => {
			if (panel && e.target instanceof Node && !panel.contains(e.target)) closePopovers();
		};
		const onKey = (e: KeyboardEvent): void => {
			if (e.key === 'Escape') {
				closePopovers();
				e.stopPropagation();
			}
		};
		// Capture phase so we see the click before it lands on the canvas.
		window.addEventListener('pointerdown', onDown, true);
		window.addEventListener('keydown', onKey, true);
		return () => {
			window.removeEventListener('pointerdown', onDown, true);
			window.removeEventListener('keydown', onKey, true);
		};
	});

	// If the selection clears (panel hides), drop any open popover so it can't resurrect on reselect.
	$effect(() => {
		if (!show) closePopovers();
	});

	function setStroke(color: string): void {
		commands.setStyleOnSelection({ stroke: color }, 'Stroke color');
		editor.currentStyle = { ...editor.currentStyle, stroke: color };
		// Choosing a color always dismisses the expanded palette (Excalidraw closes its color popup
		// once a swatch is committed). Centralised here so every path — inline row, popover grid,
		// programmatic — closes consistently.
		closePopovers();
	}
	function setBg(color: string): void {
		commands.setStyleOnSelection({ fill: color }, 'Fill color');
		editor.currentStyle = { ...editor.currentStyle, fill: color };
		closePopovers();
	}
	function setWidth(w: StrokeWidth): void {
		commands.setStyleOnSelection({ strokeWidth: w }, 'Stroke width');
		editor.currentStyle = { ...editor.currentStyle, strokeWidth: w };
	}
	function setStyle(s: StrokeStyle): void {
		commands.setStyleOnSelection({ strokeStyle: s }, 'Stroke style');
		editor.currentStyle = { ...editor.currentStyle, strokeStyle: s };
	}
	function setOpacity(v: number): void {
		commands.setStyleOnSelection({ opacity: v }, 'Opacity');
		editor.currentStyle = { ...editor.currentStyle, opacity: v };
	}

	const curStroke = $derived(primary?.style?.stroke ?? '#1e1e1e');
	const curBg = $derived(primary?.style?.fill ?? TRANSPARENT);
	const curWidth = $derived<StrokeWidth>(primary?.style?.strokeWidth ?? 'bold');
	const curStyle = $derived<StrokeStyle>(primary?.style?.strokeStyle ?? 'solid');
	const curOpacity = $derived(primary?.style?.opacity ?? 1);

	// Inline glyphs: a horizontal bar whose thickness encodes width, and a line whose dash encodes style.
	const WIDTH_STROKE: Record<StrokeWidth, number> = { thin: 1.5, bold: 3, extra: 5 };
	const STYLE_DASH: Record<StrokeStyle, string> = { solid: '', dashed: '4 3', dotted: '1.5 3' };

	function isLight(hex: string | undefined): boolean {
		if (!hex) return false;
		const m = /^#?([0-9a-f]{6})$/i.exec(hex);
		if (!m || !m[1]) return false;
		const n = parseInt(m[1], 16);
		const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
		return 0.299 * r + 0.587 * g + 0.114 * b > 200;
	}
</script>

{#if show}
	<div class="style-panel" class:shifted={editor.layersOpen} role="group" aria-label="Style" bind:this={panelEl}>
		<!-- Stroke color -->
		<div class="row">
			<span class="row-label">Stroke</span>
			<div class="swatches">
				{#each STROKE_PICKS as c (c)}
					<button class="swatch" class:active={curStroke === c} class:bordered={isLight(c)} style:background={c} onclick={() => setStroke(c)} aria-label="Stroke {c}"></button>
				{/each}
				<div class="more">
					<button class="swatch current" class:bordered={isLight(curStroke)} style:background={curStroke} onclick={toggleStroke} aria-label="More stroke colors"></button>
					{#if strokeOpen}
						<div class="grid-pop">
							{#each PALETTE_GRID as row (row.name)}
								<div class="grid-row">
									{#each row.shades as c (c)}
										<button class="swatch sm" class:bordered={isLight(c)} style:background={c} onclick={() => { setStroke(c); strokeOpen = false; }} aria-label={c}></button>
									{/each}
								</div>
							{/each}
						</div>
					{/if}
				</div>
			</div>
		</div>

		<!-- Background / fill -->
		<div class="row">
			<span class="row-label">Fill</span>
			<div class="swatches">
				{#each BACKGROUND_PICKS as c (c)}
					<button class="swatch" class:active={curBg === c} class:transparent={c === TRANSPARENT} class:bordered={isLight(c)} style:background={c === TRANSPARENT ? 'transparent' : c} onclick={() => setBg(c)} aria-label="Fill {c}"></button>
				{/each}
				<div class="more">
					<button class="swatch current" class:transparent={curBg === TRANSPARENT} class:bordered={isLight(curBg)} style:background={curBg === TRANSPARENT ? 'transparent' : curBg} onclick={toggleBg} aria-label="More fill colors"></button>
					{#if bgOpen}
						<div class="grid-pop">
							<div class="grid-row">
								<button class="swatch sm transparent" onclick={() => { setBg(TRANSPARENT); bgOpen = false; }} aria-label="Transparent"></button>
							</div>
							{#each PALETTE_GRID as row (row.name)}
								<div class="grid-row">
									{#each row.shades as c (c)}
										<button class="swatch sm" class:bordered={isLight(c)} style:background={c} onclick={() => { setBg(c); bgOpen = false; }} aria-label={c}></button>
									{/each}
								</div>
							{/each}
						</div>
					{/if}
				</div>
			</div>
		</div>

		<div class="sep"></div>

		<!-- Stroke width -->
		<div class="row">
			<span class="row-label">Width</span>
			<div class="seg">
				{#each STROKE_WIDTHS as w (w)}
					<button class="seg-btn" class:active={curWidth === w} onclick={() => setWidth(w)} aria-label="Width {w}" aria-pressed={curWidth === w}>
						<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
							<line x1="3" y1="9" x2="15" y2="9" stroke="currentColor" stroke-width={WIDTH_STROKE[w]} stroke-linecap="round" />
						</svg>
					</button>
				{/each}
			</div>
		</div>

		<!-- Stroke style -->
		<div class="row">
			<span class="row-label">Line</span>
			<div class="seg">
				{#each STROKE_STYLES as s (s)}
					<button class="seg-btn" class:active={curStyle === s} onclick={() => setStyle(s)} aria-label="Line {s}" aria-pressed={curStyle === s}>
						<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
							<line x1="3" y1="9" x2="15" y2="9" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-dasharray={STYLE_DASH[s]} />
						</svg>
					</button>
				{/each}
			</div>
		</div>

		<div class="sep"></div>

		<!-- Opacity -->
		<div class="row">
			<span class="row-label">Opacity</span>
			<input
				name="opacity"
				class="opacity"
				type="range"
				min="0"
				max="1"
				step="0.05"
				value={curOpacity}
				oninput={(e) => setOpacity(+(e.currentTarget as HTMLInputElement).value)}
				aria-label="Opacity"
			/>
		</div>
	</div>
{/if}

<style>
	.style-panel {
		position: absolute;
		inset-block-start: var(--space-3);
		inset-inline-start: var(--space-3);
		z-index: 25;
		transition: inset-inline-start var(--dur-2) var(--ease);
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		padding: var(--space-3);
		inline-size: 240px;
		background: var(--surface);
		border: 1px solid var(--line-strong);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-lg);
		animation: pop var(--dur-2) var(--ease-out);
	}
	/* When the Layers dock is open on the left, slide the style panel clear of it. */
	.style-panel.shifted {
		inset-inline-start: calc(var(--panel-w) + var(--space-3));
	}
	@keyframes pop {
		from {
			opacity: 0;
			transform: translateY(-4px) scale(0.98);
		}
	}

	.row {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}
	.row-label {
		inline-size: 48px;
		flex-shrink: 0;
		font-size: var(--text-2xs);
		font-weight: 550;
		color: var(--ink-faint);
	}

	.swatches {
		display: flex;
		align-items: center;
		gap: 5px;
		min-inline-size: 0;
		flex: 1;
	}
	.swatch {
		inline-size: 20px;
		block-size: 20px;
		border-radius: var(--radius-sm);
		box-shadow: inset 0 0 0 1px oklch(0.2 0.02 264 / 0.12);
		transition: transform var(--dur-1) var(--ease);
		flex-shrink: 0;
	}
	.swatch:hover {
		transform: scale(1.12);
	}
	.swatch.bordered {
		box-shadow: inset 0 0 0 1px var(--line-strong);
	}
	.swatch.active {
		box-shadow:
			inset 0 0 0 1px oklch(1 0 0),
			0 0 0 2px var(--accent);
	}
	.swatch.transparent {
		background-image:
			linear-gradient(45deg, var(--line) 25%, transparent 25%),
			linear-gradient(-45deg, var(--line) 25%, transparent 25%),
			linear-gradient(45deg, transparent 75%, var(--line) 75%),
			linear-gradient(-45deg, transparent 75%, var(--line) 75%);
		background-size: 8px 8px;
		background-position: 0 0, 0 4px, 4px -4px, -4px 0;
		box-shadow: inset 0 0 0 1px var(--line-strong);
	}
	.more {
		position: relative;
		margin-inline-start: 2px;
		padding-inline-start: 5px;
		border-inline-start: 1px solid var(--line);
	}
	.swatch.current {
		inline-size: 22px;
		block-size: 22px;
	}
	.grid-pop {
		position: absolute;
		inset-block-start: calc(100% + 6px);
		/* Anchor to the trigger's RIGHT edge so the grid grows leftward and never overflows the
		   panel's right border (the trigger sits at the far-right of the row). */
		inset-inline-end: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 8px;
		inline-size: max-content;
		max-inline-size: 200px;
		background: var(--surface);
		border: 1px solid var(--line-strong);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-lg);
		z-index: 30;
	}
	.grid-row {
		display: flex;
		gap: 4px;
	}
	.swatch.sm {
		inline-size: 18px;
		block-size: 18px;
	}

	.seg {
		display: flex;
		gap: 2px;
		padding: 2px;
		background: var(--surface-2);
		border: 1px solid var(--line);
		border-radius: var(--radius-md);
	}
	.seg-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		inline-size: 28px;
		block-size: 24px;
		border-radius: var(--radius-sm);
		color: var(--ink-soft);
		transition: background var(--dur-1) var(--ease);
	}
	.seg-btn:hover {
		background: var(--surface);
		color: var(--ink);
	}
	.seg-btn.active {
		background: var(--accent);
		color: var(--accent-ink);
	}

	.sep {
		block-size: 1px;
		background: var(--line);
		margin-block: 1px;
	}

	.opacity {
		flex: 1;
		accent-color: var(--accent);
	}
</style>
