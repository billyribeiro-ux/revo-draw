<script lang="ts">
	import { editor, type Tool } from '$lib/canvas/editor.svelte.js';
	import { createBlankDocument } from '$lib/elements/defaults.js';
	import { compileToMarkdown } from '$lib/export/to-markdown.js';
	import { compileToSvg } from '$lib/export/to-svg.js';
	import { exportPng, makeThumbnail } from '$lib/export/to-png.js';
	import {
		Autosave,
		exportDocument,
		openDocument,
		openDocumentAtPath,
		readAutosave,
		saveDocument,
		saveDocumentAs,
		type ExportFormat
	} from '$lib/persistence/document-file.js';
	import type { LibraryEntry } from '$lib/persistence/library-db.js';
	import { readClipboard, writeClipboard } from '$lib/persistence/clipboard.js';

	import TitleBar from '$lib/ui/TitleBar.svelte';
	import Toolbar from '$lib/ui/Toolbar.svelte';
	import LeftPanel from '$lib/ui/LeftPanel.svelte';
	import RightPanel from '$lib/ui/RightPanel.svelte';
	import Canvas from '$lib/ui/Canvas.svelte';
	import StylePanel from '$lib/ui/StylePanel.svelte';
	import StatusBar from '$lib/ui/StatusBar.svelte';
	import FileMenu from '$lib/ui/FileMenu.svelte';
	import IconPicker from '$lib/ui/IconPicker.svelte';
	import LibraryView from '$lib/ui/LibraryView.svelte';
	import PhIcon from '$lib/ui/PhIcon.svelte';
	import WelcomeScreen from '$lib/ui/WelcomeScreen.svelte';
	import { isWeb, shellClass } from '$lib/platform.js';

	const { scene, commands, history } = editor;

	// Bottom-left footer state (web shell) — mirrors Excalidraw's zoom + undo/redo island cluster.
	const zoomPct = $derived(editor.zoomPercent);

	// Inspector visibility — Excalidraw's `showSelectedShapeActions` rule: mount the properties panel
	// only when something is selected (or a drawing tool is active), plus the user's explicit pin.
	// It is NOT a permanent column; the canvas owns the viewport on a blank load.
	const showInspector = $derived(
		editor.inspectorPinned || scene.selectedElements.length > 0 || editor.tool !== 'select'
	);

	// First-load welcome screen (Excalidraw `showWelcomeScreen` = empty canvas). Shown until the doc
	// has at least one element; suppressed while a tool is mid-use so it doesn't flash during create.
	const showWelcome = $derived(scene.ordered.length === 0 && editor.tool === 'select');

	let currentPath = $state<string | null>(null);
	// In-memory style clipboard for copy/paste styles (⌘⌥C / ⌘⌥V), Excalidraw copyStyles/pasteStyles.
	let styleClipboard: import('$lib/elements/types.js').ElementStyle | null = null;
	let iconPickerOpen = $state(false);
	let libraryOpen = $state(false);
	let restorePromptOpen = $state(false);
	let toast = $state<string | null>(null);
	// Tracks WHY the icon picker is open. 'place' = toolbar Icon tool (sets pendingIcon, switches
	// to icon tool). 'replace' = inspector Change-icon on the selected IconElement. 'attach' =
	// inspector Add-icon on ANY selected element (sets BaseElement.icon).
	let iconMode = $state<'place' | 'replace' | 'attach'>('place');

	const autosave = new Autosave(() => $state.snapshot(scene.doc), 1500);

	// Schedule an autosave whenever the document changes.
	$effect(() => {
		void scene.revision;
		autosave.schedule();
	});

	$effect(() => {
		return () => autosave.dispose();
	});

	// On launch, offer to restore an autosaved session if present.
	$effect(() => {
		void (async () => {
			const saved = await readAutosave();
			if (saved && saved.id !== scene.doc.id) {
				restorePromptOpen = true;
				pendingRestore = saved;
			}
		})();
	});

	let pendingRestore = $state<import('$lib/elements/types.js').LayoutDocument | null>(null);

	function showToast(msg: string): void {
		toast = msg;
		setTimeout(() => (toast = null), 2600);
	}

	function acceptRestore(): void {
		if (pendingRestore) {
			scene.replaceDocument(pendingRestore, { keepDirty: true });
			history.reset(pendingRestore);
		}
		restorePromptOpen = false;
		pendingRestore = null;
	}
	function declineRestore(): void {
		restorePromptOpen = false;
		pendingRestore = null;
	}

	// ---- file ops ----------------------------------------------------------------------------

	function newDocument(): void {
		const doc = createBlankDocument('Untitled');
		scene.replaceDocument(doc);
		history.reset(doc);
		currentPath = null;
		editor.zoomToFit();
	}

	async function thumb(): Promise<string | null> {
		try {
			return await makeThumbnail($state.snapshot(scene.doc));
		} catch {
			return null;
		}
	}

	async function save(): Promise<void> {
		try {
			const res = await saveDocument($state.snapshot(scene.doc), currentPath, await thumb());
			if (res) {
				currentPath = res.path;
				scene.dirty = false;
				showToast(`Saved ${res.name}`);
			}
		} catch (e) {
			showToast(e instanceof Error ? e.message : 'Save failed');
		}
	}

	async function saveAs(): Promise<void> {
		try {
			const res = await saveDocumentAs($state.snapshot(scene.doc), await thumb());
			if (res) {
				currentPath = res.path;
				scene.dirty = false;
				showToast(`Saved ${res.name}`);
			}
		} catch (e) {
			showToast(e instanceof Error ? e.message : 'Save failed');
		}
	}

	async function openFile(): Promise<void> {
		try {
			const res = await openDocument();
			if (res) {
				scene.replaceDocument(res.doc);
				history.reset(res.doc);
				currentPath = res.path;
				editor.zoomToFit();
				showToast(`Opened ${res.name}`);
			}
		} catch (e) {
			showToast(e instanceof Error ? e.message : 'Open failed');
		}
	}

	async function openEntry(entry: LibraryEntry): Promise<void> {
		libraryOpen = false;
		if (!entry.filePath) {
			showToast('This entry has no file on disk.');
			return;
		}
		try {
			const res = await openDocumentAtPath(entry.filePath);
			if (res) {
				scene.replaceDocument(res.doc);
				history.reset(res.doc);
				currentPath = res.path;
				editor.zoomToFit();
				showToast(`Opened ${res.name}`);
			}
		} catch (e) {
			showToast(e instanceof Error ? e.message : 'Open failed');
		}
	}

	async function doExport(format: ExportFormat): Promise<void> {
		try {
			const doc = $state.snapshot(scene.doc);
			const payload: { markdown?: string; svg?: string; png?: Uint8Array } = {};
			if (format === 'md') payload.markdown = compileToMarkdown(doc);
			if (format === 'svg') payload.svg = compileToSvg(doc);
			if (format === 'png') payload.png = await exportPng(doc);
			const path = await exportDocument(doc, format, payload);
			if (path) showToast(`Exported ${format.toUpperCase()}`);
		} catch (e) {
			showToast(e instanceof Error ? e.message : 'Export failed');
		}
	}

	// ---- icon picker -------------------------------------------------------------------------

	function openIconToolPicker(): void {
		iconMode = 'place';
		iconPickerOpen = true;
	}
	function openIconReplace(): void {
		iconMode = 'replace';
		iconPickerOpen = true;
	}
	function openIconAttachPicker(): void {
		iconMode = 'attach';
		iconPickerOpen = true;
	}
	function onIconSelected(icon: { name: string; svgPath: string; viewBox: string }): void {
		iconPickerOpen = false;
		if (iconMode === 'place') {
			editor.pendingIcon = icon;
			editor.setTool('icon');
		} else if (iconMode === 'replace') {
			// Replace the icon body on the selected standalone IconElement.
			const sel = scene.selectedElements;
			const target = sel.find((s) => s.type === 'icon');
			if (target) {
				commands.patch(
					target.id,
					{ iconName: icon.name, svgPath: icon.svgPath, viewBox: icon.viewBox } as Partial<
						import('$lib/elements/types.js').Element
					>,
					'Change icon'
				);
			}
		} else {
			// 'attach' — set the BaseElement.icon on every selected element. Works across mixed
			// selections; standalone IconElements are skipped (their body is the icon, not a slot).
			const ref = { name: icon.name, svgPath: icon.svgPath, viewBox: icon.viewBox };
			for (const id of scene.selection) {
				const el = scene.get(id);
				if (!el || el.type === 'icon') continue;
				commands.patch(
					id,
					{ icon: ref } as Partial<import('$lib/elements/types.js').Element>,
					'Attach icon'
				);
			}
		}
	}

	// Canvas dispatches `lf-icon-attached` after a successful drag-drop attach/place so the picker
	// (if it was open during the drag) closes automatically.
	$effect(() => {
		const handler = (): void => {
			iconPickerOpen = false;
		};
		window.addEventListener('lf-icon-attached', handler);
		return () => window.removeEventListener('lf-icon-attached', handler);
	});

	// ---- keyboard ----------------------------------------------------------------------------

	function isTypingTarget(t: EventTarget | null): boolean {
		const el = t as HTMLElement | null;
		if (!el) return false;
		const tag = el.tagName;
		return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
	}

	const TOOL_KEYS: Record<string, Tool> = {
		v: 'select',
		h: 'hand',
		e: 'eraser', // Excalidraw `shapes.tsx` eraser key
		f: 'frame',
		c: 'container',
		r: 'card', // R is muscle-memory for "rectangle" in Excalidraw; maps to our card
		t: 'text',
		b: 'button',
		i: 'image'
	};
	// Numeric tool row (Excalidraw 1–9). Mapped to our semantic analogs; gaps (5–7 = arrow/line/
	// freedraw) are intentionally unbound because those are out of scope.
	const NUMERIC_TOOL_KEYS: Record<string, Tool> = {
		'1': 'select',
		'2': 'card',
		'3': 'container',
		'4': 'frame',
		'8': 'text',
		'9': 'image'
	};

	async function onKeydown(e: KeyboardEvent): Promise<void> {
		if (isTypingTarget(e.target) || editor.editingTextId) return;
		const mod = e.metaKey || e.ctrlKey;

		if (mod && e.key.toLowerCase() === 's') {
			e.preventDefault();
			await (e.shiftKey ? saveAs() : save());
			return;
		}
		if (mod && e.key.toLowerCase() === 'z') {
			e.preventDefault();
			if (e.shiftKey) history.redo();
			else history.undo();
			return;
		}
		if (mod && e.key.toLowerCase() === 'y') {
			e.preventDefault();
			history.redo();
			return;
		}
		if (mod && e.key.toLowerCase() === 'd') {
			e.preventDefault();
			commands.duplicateSelection();
			return;
		}
		if (mod && e.key.toLowerCase() === 'a') {
			e.preventDefault();
			scene.selectAll();
			return;
		}
		// Copy/paste STYLES (⌘⌥C / ⌘⌥V) — must be checked before plain copy/paste.
		if (mod && e.altKey && e.key.toLowerCase() === 'c') {
			e.preventDefault();
			styleClipboard = commands.copyStyles();
			return;
		}
		if (mod && e.altKey && e.key.toLowerCase() === 'v') {
			e.preventDefault();
			if (styleClipboard) commands.pasteStyles(styleClipboard);
			return;
		}
		// Cut (⌘X) = copy + delete.
		if (mod && e.key.toLowerCase() === 'x') {
			e.preventDefault();
			const payload = commands.copySelection();
			editor.clipboard = payload;
			if (payload) void writeClipboard(payload);
			commands.deleteSelection();
			return;
		}
		if (mod && e.key.toLowerCase() === 'c') {
			e.preventDefault();
			const payload = commands.copySelection();
			editor.clipboard = payload;
			// Also write to the OS clipboard so the selection survives and is inspectable. The
			// in-process clipboard is the authoritative fast path; the OS write is best-effort.
			if (payload) void writeClipboard(payload);
			return;
		}
		if (mod && e.key.toLowerCase() === 'v') {
			e.preventDefault();
			void (async () => {
				const fromOs = await readClipboard();
				const payload = fromOs ?? editor.clipboard;
				if (payload) commands.paste(payload);
			})();
			return;
		}
		// Lock/unlock selection (⌘⇧L), Excalidraw toggleElementLock.
		if (mod && e.shiftKey && e.key.toLowerCase() === 'l') {
			e.preventDefault();
			commands.toggleLockSelection();
			return;
		}
		// Group (⌘G) / Ungroup (⌘⇧G) — Excalidraw `actionGroup.tsx:199` / `actionUngroup`. LF uses
		// containment instead of `groupIds[]`, so Group wraps the selection in a new container and
		// Ungroup dissolves selected containers, reparenting their children to the container's parent.
		if (mod && e.key.toLowerCase() === 'g') {
			e.preventDefault();
			if (e.shiftKey) commands.ungroup();
			else commands.group();
			return;
		}
		// Hyperlink (⌘K), Excalidraw `actionLink.tsx` — set/edit a `url` on the selected element(s).
		// Browser prompt is the simplest UX consistent with this local-desktop app's existing modal
		// pattern (the restore-session dialog); a richer popover can replace it later.
		if (mod && e.key.toLowerCase() === 'k') {
			e.preventDefault();
			const ids = [...scene.selection];
			if (ids.length === 0) return;
			const first = scene.get(ids[0]!);
			const current = first?.url ?? '';
			const next = window.prompt('Hyperlink URL (empty to remove):', current);
			if (next === null) return;
			const url = next.trim() === '' ? undefined : next.trim();
			for (const id of ids) commands.patch(id, { url } as Partial<import('$lib/elements/types.js').Element>, url ? 'Set link' : 'Remove link');
			return;
		}
		// Grid toggle (⌘'), Excalidraw `actionToggleGridMode.tsx`. Renders the dot-grid on/off.
		if (mod && e.key === "'") {
			e.preventDefault();
			editor.gridVisible = !editor.gridVisible;
			return;
		}
		// Z-order. Match on e.code so the Shift variants work regardless of the shifted character
		// (']' → '}'). Excalidraw `actionZindex.tsx:96,134` uses TWO chord conventions per platform:
		//   - macOS native:  ⌘⌥]/⌘⌥[ for bringToFront/sendToBack
		//   - everywhere else (and as a cross-platform alias): ⌘⇧]/⌘⇧[
		// We accept both so Mac power-user muscle memory works. Plain ⌘]/⌘[ = one step.
		if (mod && e.code === 'BracketRight') {
			e.preventDefault();
			if (e.shiftKey || e.altKey) commands.bringToFront();
			else commands.bringForward();
			return;
		}
		if (mod && e.code === 'BracketLeft') {
			e.preventDefault();
			if (e.shiftKey || e.altKey) commands.sendToBack();
			else commands.sendBackward();
			return;
		}
		if (mod && (e.key === '=' || e.key === '+')) {
			e.preventDefault();
			editor.zoomIn();
			return;
		}
		if (mod && e.key === '-') {
			e.preventDefault();
			editor.zoomOut();
			return;
		}
		if (mod && e.key === '0') {
			e.preventDefault();
			editor.zoomReset();
			return;
		}
		if (e.key === 'Delete' || e.key === 'Backspace') {
			e.preventDefault();
			commands.deleteSelection();
			return;
		}
		if (e.key === 'Escape') {
			editor.cancelGesture();
			scene.clearSelection();
			return;
		}
		// Arrow nudge (Shift = larger step).
		if (e.key.startsWith('Arrow')) {
			e.preventDefault();
			const step = e.shiftKey ? 10 : 1;
			const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
			const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
			commands.nudge(dx, dy);
			return;
		}
		// Distribute (Alt+H / Alt+V), Excalidraw `actionDistribute.tsx:87,118` —
		// `!event[KEYS.CTRL_OR_CMD] && event.altKey && event.code === CODES.H/V`. Must be checked
		// BEFORE the bare-letter tool block (Alt+H would otherwise be consumed by the `h`→hand tool).
		if (!mod && e.altKey && !e.shiftKey && e.code === 'KeyH') {
			e.preventDefault();
			commands.distribute('x');
			return;
		}
		if (!mod && e.altKey && !e.shiftKey && e.code === 'KeyV') {
			e.preventDefault();
			commands.distribute('y');
			return;
		}
		// Flip (⇧H / ⇧V), Excalidraw flipHorizontal / flipVertical.
		if (!mod && e.shiftKey && e.key.toLowerCase() === 'h') {
			e.preventDefault();
			commands.flip('x');
			return;
		}
		if (!mod && e.shiftKey && e.key.toLowerCase() === 'v') {
			e.preventDefault();
			commands.flip('y');
			return;
		}
		// Zoom-to-fit (⇧1) and zoom-to-fit-selection (⇧2), Excalidraw bindings.
		if (!mod && e.shiftKey && (e.key === '1' || e.key === '!')) {
			e.preventDefault();
			editor.zoomToFit();
			return;
		}
		if (!mod && e.shiftKey && (e.key === '2' || e.key === '@')) {
			e.preventDefault();
			editor.zoomToFitSelection();
			return;
		}
		// Tool shortcuts (no modifier).
		if (!mod && !e.altKey && !e.shiftKey) {
			if (e.key.toLowerCase() === 'q') {
				editor.toggleToolLock(); // Excalidraw uses Q to toggle the tool lock
				return;
			}
			const tool = TOOL_KEYS[e.key.toLowerCase()] ?? NUMERIC_TOOL_KEYS[e.key];
			if (tool) {
				editor.setTool(tool);
				return;
			}
		}
	}

	// NOTE: the initial zoom-to-fit is performed by Canvas.svelte once it has a real (non 1×1)
	// viewport. Fitting here on mount raced the layout and produced a broken camera.
</script>

<svelte:window onkeydown={onKeydown} />

<div class="editor {shellClass}" class:web={isWeb}>
	{#if isWeb}
		<!-- WEB SHELL — pixel-faithful Excalidraw: full-bleed canvas with floating Islands overlaid.
		     Layout mirrors Excalidraw's LayerUI: top 3-column grid (menu · shapes toolbar · actions),
		     floating property panels, and a bottom-left footer (zoom + undo/redo) island cluster. -->
		<main class="canvas-full">
			<Canvas />
		</main>

		<div class="ui-overlay">
			{#if showWelcome}
				<WelcomeScreen onOpen={openFile} onLibrary={() => (libraryOpen = true)} />
			{/if}
			<div class="x-top">
				<div class="x-top-left">
					<div class="x-island menu-island">
						<FileMenu
							compact
							docName={scene.doc.name}
							dirty={scene.dirty}
							onNew={newDocument}
							onOpen={openFile}
							onSave={save}
							onSaveAs={saveAs}
							onImport={openFile}
							onExport={doExport}
							onLibrary={() => (libraryOpen = true)}
						/>
					</div>
				</div>

				<div class="x-top-center">
					<Toolbar onIconTool={openIconToolPicker} />
				</div>

				<div class="x-top-right">
					<button
						class="x-ghost-btn"
						title="Library"
						aria-label="Library"
						onclick={() => (libraryOpen = true)}
					>
						<PhIcon name="library" size={16} />
					</button>
					<button
						class="x-export-btn"
						title="Export Markdown spec for Claude Code"
						onclick={() => doExport('md')}
					>
						<PhIcon name="export" size={15} />
						<span>Export</span>
					</button>
				</div>
			</div>

			<StylePanel />
			{#if editor.layersOpen}
				<div class="panel-dock left">
					<LeftPanel />
				</div>
			{/if}
			{#if showInspector}
				<div class="panel-dock right">
					<RightPanel onPickIcon={openIconReplace} onAttachIcon={openIconAttachPicker} />
				</div>
			{/if}

			<div class="x-bottom">
				<div class="x-island zoom-island">
					<button
						class="x-icon-btn"
						title="Zoom out  ⌘−"
						aria-label="Zoom out"
						onclick={() => editor.zoomOut()}
					>
						<PhIcon name="zoom-out" size={16} />
					</button>
					<button
						class="x-zoom-val"
						title="Reset zoom  ⌘0"
						aria-label="Reset zoom to 100%"
						onclick={() => editor.zoomReset()}
					>
						{zoomPct}%
					</button>
					<button
						class="x-icon-btn"
						title="Zoom in  ⌘+"
						aria-label="Zoom in"
						onclick={() => editor.zoomIn()}
					>
						<PhIcon name="zoom-in" size={16} />
					</button>
				</div>

				<div class="x-island undo-island">
					<button
						class="x-icon-btn"
						title="Undo  ⌘Z"
						aria-label="Undo"
						disabled={!history.canUndo}
						onclick={() => history.undo()}
					>
						<PhIcon name="undo" size={16} />
					</button>
					<button
						class="x-icon-btn"
						title="Redo  ⇧⌘Z"
						aria-label="Redo"
						disabled={!history.canRedo}
						onclick={() => history.redo()}
					>
						<PhIcon name="redo" size={16} />
					</button>
				</div>
			</div>
		</div>
	{:else}
		<!-- TAURI SHELL — the desktop app's native-window chrome (title bar · tool rail · status bar).
		     Intentionally left as-is; the web-parity work does not touch the desktop look. -->
		<TitleBar onExport={() => doExport('md')}>
			{#snippet brand()}
				<FileMenu
					docName={scene.doc.name}
					dirty={scene.dirty}
					onNew={newDocument}
					onOpen={openFile}
					onSave={save}
					onSaveAs={saveAs}
					onImport={openFile}
					onExport={doExport}
					onLibrary={() => (libraryOpen = true)}
				/>
			{/snippet}
		</TitleBar>

		<Toolbar onIconTool={openIconToolPicker} />

		<div class="workspace">
			<main class="canvas-area">
				<Canvas />
				<StylePanel />
				{#if editor.layersOpen}
					<div class="panel-dock left">
						<LeftPanel />
					</div>
				{/if}
				{#if showInspector}
					<div class="panel-dock right">
						<RightPanel onPickIcon={openIconReplace} onAttachIcon={openIconAttachPicker} />
					</div>
				{/if}
			</main>
		</div>

		<StatusBar />
	{/if}

	{#if toast}
		<div class="toast" role="status">{toast}</div>
	{/if}

	{#if restorePromptOpen}
		<div class="restore" role="dialog" aria-modal="true" aria-label="Restore session">
			<p>An autosaved session was found. Restore it?</p>
			<div class="restore-actions">
				<button class="secondary" onclick={declineRestore}>Discard</button>
				<button class="primary" onclick={acceptRestore}>Restore</button>
			</div>
		</div>
	{/if}
</div>

<IconPicker open={iconPickerOpen} onClose={() => (iconPickerOpen = false)} onSelect={onIconSelected} />
<LibraryView open={libraryOpen} onClose={() => (libraryOpen = false)} onOpenEntry={openEntry} />

<style>
	.editor {
		display: flex;
		flex-direction: column;
		block-size: 100dvh;
		inline-size: 100dvw;
		overflow: hidden;
	}

	/* ---- WEB SHELL (Excalidraw parity) ------------------------------------------------------- */

	/* Full-bleed canvas with UI floating over it (Excalidraw model): the editor is a positioning
	   context, the canvas fills it, and the overlay holds the Islands. */
	.editor.web {
		display: block;
		position: relative;
	}
	.canvas-full {
		position: absolute;
		inset: 0;
	}

	/* Excalidraw's `.layer-ui__wrapper`: spans the viewport, transparent to pointer events, with
	   each interactive Island re-enabling them. */
	.ui-overlay {
		position: absolute;
		inset: 0;
		z-index: 4;
		pointer-events: none;
	}
	.ui-overlay :where(.x-island, .menu-island, .x-ghost-btn, .x-export-btn, .panel-dock),
	.x-top-center > :global(*) {
		pointer-events: auto;
	}

	/* Top zone — Excalidraw `App-menu_top`: 3-column grid (menu · shapes toolbar · actions). */
	.x-top {
		position: absolute;
		inset-block-start: 0;
		inset-inline: 0;
		display: grid;
		grid-template-columns: 1fr 2fr 1fr;
		gap: var(--space-4);
		padding: var(--space-4);
		align-items: flex-start;
		pointer-events: none;
	}
	.x-top-left {
		justify-self: start;
	}
	.x-top-center {
		justify-self: center;
	}
	.x-top-right {
		justify-self: end;
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	/* A generic Island — white surface, 8px radius, Excalidraw's layered island shadow. */
	.x-island {
		display: flex;
		align-items: center;
		gap: 2px;
		padding: 4px;
		background: var(--surface);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-island);
	}
	.menu-island {
		padding: 0;
		/* NOTE: do NOT set overflow:hidden here. The FileMenu dropdown (.menu) is an absolutely
		   positioned child that drops below this island; clipping it to the 2.25rem button box made
		   the menu button appear dead (it toggled open but the menu was clipped away). The hamburger's
		   hover background is already rounded by the button's own border-radius, so no clip is needed. */
		overflow: visible;
	}

	/* Square icon button inside an island (zoom/undo/redo). 2rem hit target, 8px radius. */
	.x-icon-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		inline-size: 2rem;
		block-size: 2rem;
		border-radius: var(--radius-md);
		color: var(--ink);
		transition: background var(--dur-1) var(--ease);
	}
	.x-icon-btn:hover:not(:disabled) {
		background: var(--surface-2);
	}
	.x-icon-btn:active:not(:disabled) {
		background: var(--accent-soft);
	}
	.x-icon-btn:disabled {
		color: var(--ink-ghost);
		cursor: default;
	}
	.x-zoom-val {
		min-inline-size: 3.25rem;
		block-size: 2rem;
		padding-inline: var(--space-2);
		font-size: var(--text-sm);
		font-weight: 500;
		font-variant-numeric: tabular-nums;
		color: var(--ink);
		border-radius: var(--radius-md);
		text-align: center;
	}
	.x-zoom-val:hover {
		background: var(--surface-2);
	}

	/* Top-right action buttons. */
	.x-ghost-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		inline-size: var(--x-button-size, 2.25rem);
		block-size: var(--x-button-size, 2.25rem);
		background: var(--surface);
		color: var(--ink);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-island);
		transition: background var(--dur-1) var(--ease);
	}
	.x-ghost-btn:hover {
		background: var(--surface-2);
	}
	.x-export-btn {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		block-size: var(--x-button-size, 2.25rem);
		padding-inline: var(--space-3);
		font-size: var(--text-sm);
		font-weight: 600;
		color: var(--accent-ink);
		background: var(--accent);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-island);
		transition: background var(--dur-1) var(--ease);
	}
	.x-export-btn:hover {
		background: var(--accent-hover);
	}

	/* Bottom zone — Excalidraw footer: zoom + undo/redo island cluster, pinned bottom-left. */
	.x-bottom {
		position: absolute;
		inset-block-end: 0;
		inset-inline: 0;
		display: flex;
		align-items: flex-end;
		gap: var(--space-2);
		padding: var(--space-4);
		pointer-events: none;
	}

	/* In web mode the side panels become floating Islands, offset clear of the top toolbar. */
	.editor.web .panel-dock {
		inset-block: calc(var(--space-4) + 3.5rem) var(--space-4);
		background: var(--surface);
		border: none;
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-island);
		overflow: hidden;
	}
	.editor.web .panel-dock.left {
		inset-inline-start: var(--space-4);
	}
	.editor.web .panel-dock.right {
		inset-inline-end: var(--space-4);
	}

	/* Responsive form-factors (Excalidraw's phone/tablet adaptation). On a narrow viewport the top
	   row tightens to fit the menu/toolbar/actions, padding shrinks, and the side panels become
	   full-width bottom sheets instead of tall side Islands that would smother the canvas. */
	@media (max-width: 820px) {
		.editor.web .x-top {
			grid-template-columns: auto 1fr auto;
			gap: var(--space-2);
			padding: var(--space-2);
		}
		.editor.web .x-bottom {
			padding: var(--space-2);
		}
	}
	@media (max-width: 640px) {
		.editor.web .panel-dock {
			inset-block: auto 0;
			inset-inline: 0;
			max-block-size: 50vh;
			border-radius: var(--radius-lg) var(--radius-lg) 0 0;
		}
		/* The bottom footer rises above the sheet so zoom/undo stay reachable. */
		.editor.web .x-bottom {
			inset-block-end: 50vh;
		}
	}

	.workspace {
		flex: 1;
		display: flex;
		min-block-size: 0;
	}

	.canvas-area {
		flex: 1;
		position: relative;
		min-inline-size: 0;
	}

	/* Floating side panels: they overlay the full-bleed canvas (Excalidraw model) rather than
	   stealing layout columns. Both are hidden by default and mount on demand. */
	.panel-dock {
		position: absolute;
		inset-block: 0;
		z-index: 20;
		display: flex;
		background: var(--surface);
		box-shadow: var(--shadow-lg);
		animation: dock-in var(--dur-2) var(--ease-out);
	}
	.panel-dock.left {
		inset-inline-start: 0;
		border-inline-end: 1px solid var(--line);
	}
	.panel-dock.right {
		inset-inline-end: 0;
		border-inline-start: 1px solid var(--line);
	}
	@keyframes dock-in {
		from {
			opacity: 0;
			transform: translateX(calc(-1 * var(--space-3)));
		}
	}
	.panel-dock.right {
		animation-name: dock-in-right;
	}
	@keyframes dock-in-right {
		from {
			opacity: 0;
			transform: translateX(var(--space-3));
		}
	}

	.toast {
		position: fixed;
		inset-block-end: calc(var(--statusbar-h) + var(--space-4));
		inset-inline-start: 50%;
		transform: translateX(-50%);
		padding: 9px 16px;
		background: var(--ink);
		color: oklch(0.98 0.003 110);
		font-size: var(--text-xs);
		font-weight: 500;
		border-radius: var(--radius-pill);
		box-shadow: var(--shadow-lg);
		z-index: 50;
		animation: toast-in var(--dur-3) var(--ease-out);
	}
	@keyframes toast-in {
		from {
			opacity: 0;
			transform: translateX(-50%) translateY(8px);
		}
	}

	.restore {
		position: fixed;
		inset-block-start: 50%;
		inset-inline-start: 50%;
		transform: translate(-50%, -50%);
		padding: var(--space-5);
		background: var(--surface);
		border: 1px solid var(--line-strong);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-lg);
		z-index: 60;
		text-align: center;
		max-inline-size: 360px;
	}
	.restore p {
		margin-block-end: var(--space-4);
		color: var(--ink);
		font-size: var(--text-sm);
	}
	.restore-actions {
		display: flex;
		gap: var(--space-2);
		justify-content: center;
	}
	.restore-actions button {
		padding: 8px 16px;
		border-radius: var(--radius-md);
		font-size: var(--text-sm);
		font-weight: 550;
	}
	.primary {
		background: var(--accent);
		color: var(--accent-ink);
	}
	.secondary {
		background: var(--surface-2);
		color: var(--ink);
		border: 1px solid var(--line);
	}
</style>
