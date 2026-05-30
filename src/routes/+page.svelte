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

	const { scene, commands, history } = editor;

	let currentPath = $state<string | null>(null);
	let iconPickerOpen = $state(false);
	let libraryOpen = $state(false);
	let restorePromptOpen = $state(false);
	let toast = $state<string | null>(null);
	// When the icon picker is opened from the toolbar Icon tool (place mode) vs. inspector (replace).
	let iconPlaceMode = $state(false);

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
		iconPlaceMode = true;
		iconPickerOpen = true;
	}
	function openIconReplace(): void {
		iconPlaceMode = false;
		iconPickerOpen = true;
	}
	function onIconSelected(icon: { name: string; svgPath: string; viewBox: string }): void {
		iconPickerOpen = false;
		if (iconPlaceMode) {
			editor.pendingIcon = icon;
			editor.setTool('icon');
		} else {
			// Replace the icon on the selected icon element.
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
		}
	}

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
		f: 'frame',
		c: 'container',
		r: 'card', // R is muscle-memory for "rectangle" in Excalidraw; maps to our card
		t: 'text',
		b: 'button',
		i: 'image'
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
		if (mod && e.key.toLowerCase() === 'c') {
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
		if (mod && e.key === ']') {
			e.preventDefault();
			commands.bringForward();
			return;
		}
		if (mod && e.key === '[') {
			e.preventDefault();
			commands.sendBackward();
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
		// Tool shortcuts (no modifier).
		if (!mod && !e.altKey) {
			if (e.key.toLowerCase() === 'q') {
				editor.toggleToolLock(); // Excalidraw uses Q to toggle the tool lock
				return;
			}
			const tool = TOOL_KEYS[e.key.toLowerCase()];
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

<div class="editor">
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
		<LeftPanel />
		<main class="canvas-area">
			<Canvas />
			<StylePanel />
		</main>
		<RightPanel onPickIcon={openIconReplace} />
	</div>

	<StatusBar />

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
