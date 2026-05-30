<script lang="ts">
	import { editor } from '$lib/canvas/editor.svelte.js';
	import { render } from '$lib/canvas/renderer.js';
	import type { Vec2 } from '$lib/canvas/geometry.js';

	const { scene, camera } = editor;

	let host = $state<HTMLDivElement>();
	let canvasEl = $state<HTMLCanvasElement>();
	let dpr = $state(1);
	let cursor = $state('default');

	// Re-render whenever anything visual changes. Reading these reactive values inside the effect
	// registers them as dependencies, so the draw is dirty-flag driven (no constant rAF loop).
	$effect(() => {
		const cv = canvasEl;
		if (!cv) return;
		const ctx = cv.getContext('2d');
		if (!ctx) return;

		// Touch every reactive dependency so the effect re-runs on any change.
		void scene.revision;
		void scene.selection;
		void camera.worldToScreen;
		void editor.marquee;
		void editor.guides;
		void editor.dropTargetId;
		void dpr;

		const cssW = camera.viewportWidth;
		const cssH = camera.viewportHeight;
		render({
			ctx,
			dpr,
			cssWidth: cssW,
			cssHeight: cssH,
			worldToScreen: camera.worldToScreen,
			zoom: camera.zoom,
			canvas: scene.doc.canvas,
			ordered: scene.ordered,
			selection: scene.selection,
			selectionBounds: scene.selectionBounds,
			handles: editor.currentHandles(),
			soleSelected: editor.soleSelected,
			marquee: editor.marquee,
			guides: editor.guides,
			dropTargetId: editor.dropTargetId,
			rotateHandleOffsetWorld: editor.rotateOffsetWorld,
			handleSizeWorld: editor.handleSizeWorld,
			gridColor: 'oklch(0.88 0.006 264)',
			gridStrongColor: 'oklch(0.8 0.01 264)'
		});
	});

	let viewportReady = $state(false);

	// Size the backing store to the device pixel ratio for crisp rendering.
	function resize(): void {
		const el = host;
		const cv = canvasEl;
		if (!el || !cv) return;
		const rect = el.getBoundingClientRect();
		if (rect.width < 1 || rect.height < 1) return; // not laid out yet — don't fit a 1×1 viewport
		dpr = window.devicePixelRatio || 1;
		camera.setViewport(rect.width, rect.height);
		cv.width = Math.round(rect.width * dpr);
		cv.height = Math.round(rect.height * dpr);
		cv.style.width = `${rect.width}px`;
		cv.style.height = `${rect.height}px`;
		// Fit the document ONCE, only after we have a real viewport — otherwise zoom-to-fit would
		// divide by a 1×1 viewport and produce a wildly off camera (the "everything is off" bug).
		if (!viewportReady) {
			viewportReady = true;
			editor.zoomToFit();
		}
	}

	$effect(() => {
		resize();
		const ro = new ResizeObserver(() => resize());
		if (host) ro.observe(host);
		return () => ro.disconnect();
	});

	// Attach canvas input listeners imperatively rather than via Svelte's delegated `on*`
	// attributes. The delegated path was not reliably invoking our handlers for synthesized/native
	// pointer events on the canvas; direct addEventListener guarantees delivery and lets us mark
	// `wheel` as non-passive so we can preventDefault the page from scrolling/zooming.
	$effect(() => {
		const cv = canvasEl;
		if (!cv) return;
		cv.addEventListener('pointerdown', onPointerDown);
		cv.addEventListener('pointermove', onPointerMove);
		cv.addEventListener('pointerup', onPointerUp);
		cv.addEventListener('pointercancel', onPointerUp);
		cv.addEventListener('dblclick', onDoubleClick);
		cv.addEventListener('wheel', onWheel, { passive: false });
		return () => {
			cv.removeEventListener('pointerdown', onPointerDown);
			cv.removeEventListener('pointermove', onPointerMove);
			cv.removeEventListener('pointerup', onPointerUp);
			cv.removeEventListener('pointercancel', onPointerUp);
			cv.removeEventListener('dblclick', onDoubleClick);
			cv.removeEventListener('wheel', onWheel);
		};
	});

	function localPoint(e: PointerEvent | WheelEvent | MouseEvent): Vec2 {
		const rect = canvasEl?.getBoundingClientRect();
		return { x: e.clientX - (rect?.left ?? 0), y: e.clientY - (rect?.top ?? 0) };
	}

	let spaceDown = $state(false);

	function onPointerDown(e: PointerEvent): void {
		if (e.button !== 0 && e.button !== 1) return;
		(e.target as Element).setPointerCapture?.(e.pointerId);
		editor.pointerDown(localPoint(e), {
			shift: e.shiftKey,
			alt: e.altKey,
			space: spaceDown,
			middle: e.button === 1
		});
		// Focus the canvas for keyboard shortcuts — but NOT when a text edit just opened, or we'd
		// steal focus from (and blur-commit) the inline text editor that pointerDown just started.
		if (editor.editingTextId === null) canvasEl?.focus();
		cursor = editor.cursorFor(localPoint(e));
	}

	// During an active gesture, coalesce pointer moves to one per animation frame (matching
	// Excalidraw's throttleRAF). This caps gesture math at the display refresh rate so rapid
	// pointer streams stay smooth instead of doing redundant work between paints.
	let rafId: number | null = null;
	let pendingMove: { x: number; y: number; alt: boolean } | null = null;
	function flushMove(): void {
		rafId = null;
		const m = pendingMove;
		pendingMove = null;
		if (m) editor.pointerMove({ x: m.x, y: m.y }, { alt: m.alt });
	}

	function onPointerMove(e: PointerEvent): void {
		const p = localPoint(e);
		if (editor.isInteracting) {
			pendingMove = { x: p.x, y: p.y, alt: e.altKey };
			if (rafId === null) rafId = requestAnimationFrame(flushMove);
		} else {
			cursor = editor.cursorFor(p);
		}
	}

	function onPointerUp(e: PointerEvent): void {
		// Apply any pending (RAF-throttled) move so the gesture ends at the true final position.
		if (rafId !== null) {
			cancelAnimationFrame(rafId);
			rafId = null;
		}
		if (pendingMove) flushMove();
		const wasCreating = editor.tool !== 'select';
		editor.pointerUp();
		if (wasCreating) editor.finishCreate();
		cursor = editor.cursorFor(localPoint(e));
	}

	function onDoubleClick(e: MouseEvent): void {
		editor.doubleClick(localPoint(e));
	}

	function onWheel(e: WheelEvent): void {
		e.preventDefault();
		// ctrlKey is set for pinch-zoom gestures on macOS trackpads and for ctrl+scroll.
		editor.wheel(localPoint(e), e.deltaY, e.ctrlKey || e.metaKey);
	}

	// ---- text-edit overlay -------------------------------------------------------------------

	let textValue = $state('');
	let textArea = $state<HTMLTextAreaElement>();

	const editingRect = $derived.by(() => {
		const id = editor.editingTextId;
		if (!id) return null;
		return editor.screenRectOf(id);
	});

	let textFocused = $state(false);

	$effect(() => {
		const id = editor.editingTextId;
		if (id) {
			const el = scene.get(id);
			textValue = el && el.type === 'text' ? el.content : '';
			textFocused = false;
			// Focus on the next frame so the textarea is mounted and laid out first.
			requestAnimationFrame(() => {
				textArea?.focus();
				textArea?.select();
			});
		}
	});

	function commitText(): void {
		// Ignore a blur that happens before the textarea was ever focused — otherwise opening the
		// editor and immediately losing focus (e.g. canvas focus race) would commit an empty string
		// and discard a brand-new text box before the user can type.
		if (!textFocused) return;
		const id = editor.editingTextId;
		if (id) editor.commitTextEdit(id, textValue);
	}

	function onTextKeydown(e: KeyboardEvent): void {
		if (e.key === 'Escape') {
			e.preventDefault();
			editor.cancelTextEdit();
		} else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
			e.preventDefault();
			commitText();
		}
		e.stopPropagation();
	}
</script>

<div class="canvas-host" bind:this={host}>
	<!-- Input listeners are attached imperatively in an $effect (see script) for reliable delivery. -->
	<canvas bind:this={canvasEl} tabindex="0" style:cursor></canvas>

	{#if editor.editingTextId && editingRect}
		{@const r = editingRect}
		<textarea name="canvas-f1" autocomplete="off"
			bind:this={textArea}
			bind:value={textValue}
			class="text-overlay"
			style:left="{r.left}px"
			style:top="{r.top}px"
			style:width="{r.width}px"
			style:height="{r.height}px"
			style:transform="rotate({r.rotation}rad)"
			style:font-size="{15 * camera.zoom}px"
			onfocus={() => (textFocused = true)}
			onblur={commitText}
			onkeydown={onTextKeydown}
		></textarea>
	{/if}
</div>

<svelte:window
	onkeydown={(e) => {
		if (e.key === ' ') spaceDown = true;
		editor.spaceHeld = spaceDown;
	}}
	onkeyup={(e) => {
		if (e.key === ' ') spaceDown = false;
		editor.spaceHeld = spaceDown;
	}}
/>

<style>
	.canvas-host {
		position: relative;
		inline-size: 100%;
		block-size: 100%;
		overflow: hidden;
		background: var(--canvas-bg);
	}

	canvas {
		display: block;
		inline-size: 100%;
		block-size: 100%;
		outline: none;
		touch-action: none;
	}

	.text-overlay {
		position: absolute;
		transform-origin: top left;
		margin: 0;
		padding: 0;
		border: 1px solid var(--accent);
		background: var(--surface);
		color: var(--ink);
		font-family: var(--font-sans);
		line-height: 1.35;
		resize: none;
		outline: none;
		box-shadow: var(--shadow-sm);
	}
</style>
