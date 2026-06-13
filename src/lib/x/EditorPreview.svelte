<script lang="ts">
  // Phase 3 preview: two stacked canvases (static scene + interactive overlay), driven by the
  // reactive DrawController. Draw shapes by dragging; with the selection tool, click a shape to
  // select it and the interactive overlay paints Excalidraw's selection box + transform handles.
  import rough from 'roughjs/bin/rough';
  import { SvelteMap } from 'svelte/reactivity';

  import '$lib/x/css/theme.css';

  import { renderStaticScene } from '@excalidraw/excalidraw/renderer/staticScene';
  import { renderInteractiveScene } from '@excalidraw/excalidraw/renderer/interactiveScene';

  import { ShapeCache } from '@excalidraw/element';

  import type {
    NonDeletedSceneElementsMap,
    OrderedExcalidrawElement
  } from '@excalidraw/element/types';
  import type {
    RenderableElementsMap,
    StaticCanvasRenderConfig,
    InteractiveCanvasRenderConfig
  } from '@excalidraw/excalidraw/scene/types';
  import type {
    StaticCanvasAppState,
    InteractiveCanvasAppState,
    AppClassProperties
  } from '@excalidraw/excalidraw/types';
  import type { EditorInterface } from '@excalidraw/common';
  import { CODES, isDarwin, sceneCoordsToViewportCoords } from '@excalidraw/common';

  import { DrawController, type Tool } from '$lib/x/draw-controller.svelte.ts';
  import XIcon from '$lib/x/XIcon.svelte';
  import StyleControls from '$lib/x/StyleControls.svelte';
  import TextControls from '$lib/x/TextControls.svelte';
  import ArrowheadControls from '$lib/x/ArrowheadControls.svelte';
  import Stats from '$lib/x/Stats.svelte';
  import ColorPicker from '$lib/x/ColorPicker.svelte';
  import ContextMenu from '$lib/x/ContextMenu.svelte';
  import MainMenu from '$lib/x/MainMenu.svelte';
  import HelpDialog from '$lib/x/HelpDialog.svelte';
  import ExportDialog from '$lib/x/ExportDialog.svelte';
  import Toast from '$lib/x/Toast.svelte';
  import HintViewer from '$lib/x/HintViewer.svelte';
  import Tooltip from '$lib/x/Tooltip.svelte';
  import WelcomeScreen from '$lib/x/WelcomeScreen.svelte';
  import PhIcon from '$lib/ui/PhIcon.svelte';
  import CommandPalette, { type Command } from '$lib/x/CommandPalette.svelte';
  import LibraryPanel from '$lib/x/LibraryPanel.svelte';
  import EmbedDialog from '$lib/x/EmbedDialog.svelte';
  import MermaidDialog from '$lib/x/MermaidDialog.svelte';

  // tool → human label + keyboard shortcut, for the styled toolbar tooltips
  const TOOL_INFO: Record<string, { label: string; shortcut?: string }> = {
    hand: { label: 'Hand (panning tool)', shortcut: 'H' },
    selection: { label: 'Selection', shortcut: 'V' },
    lasso: { label: 'Lasso' },
    rectangle: { label: 'Rectangle', shortcut: 'R' },
    diamond: { label: 'Diamond', shortcut: 'D' },
    ellipse: { label: 'Ellipse', shortcut: 'O' },
    arrow: { label: 'Arrow', shortcut: 'A' },
    line: { label: 'Line', shortcut: 'L' },
    freedraw: { label: 'Draw', shortcut: 'P' },
    text: { label: 'Text', shortcut: 'T' },
    image: { label: 'Insert image', shortcut: '9' },
    eraser: { label: 'Eraser', shortcut: 'E' },
    frame: { label: 'Frame', shortcut: 'F' },
    embeddable: { label: 'Embed a link' },
    laser: { label: 'Laser pointer', shortcut: 'K' }
  };

  const controller = new DrawController();
  const { scene, appState } = controller;

  (window as unknown as { __draw?: DrawController }).__draw = controller;
  // Dev-only probe hook: lets headless-Chrome parity probes assert against the
  // real ShapeCache (cache-invalidation differential tests). Not used by the app.
  (window as unknown as { __shapeCache?: typeof ShapeCache }).__shapeCache = ShapeCache;

  let staticCanvas = $state<HTMLCanvasElement>();
  let interactiveCanvas = $state<HTMLCanvasElement>();

  const tools: Tool[] = [
    'hand',
    'selection',
    'lasso',
    'rectangle',
    'ellipse',
    'diamond',
    'line',
    'arrow',
    'text',
    'freedraw',
    'image',
    'eraser',
    'frame',
    'embeddable',
    'laser'
  ];

  let fileInput = $state<HTMLInputElement>();
  let pendingImageAt: { x: number; y: number } | null = null;
  let pickerOpen = $state<'stroke' | 'background' | 'canvas' | null>(null);

  // Excalidraw's default palettes
  const strokeColors = ['#1e1e1e', '#e03131', '#2f9e44', '#1971c2', '#f08c00'];
  const bgColors = ['transparent', '#ffc9c9', '#b2f2bb', '#a5d8ff', '#ffec99'];
  // Excalidraw's canvas-background palette (white + light tints)
  const canvasBgColors = ['#ffffff', '#f8f9fa', '#f5faff', '#fffce8', '#fdf2f8'];
  const widths = [
    { label: 'S', w: 1 },
    { label: 'M', w: 2 },
    { label: 'L', w: 4 }
  ];

  const editorInterface: EditorInterface = {
    formFactor: 'desktop',
    desktopUIMode: 'full',
    userAgent: { isMobileDevice: false, platform: 'other' },
    isTouchScreen: false,
    canFitSidebar: true,
    isLandscape: true
  };

  function relative(e: PointerEvent): { x: number; y: number } {
    const rect = (e.currentTarget as HTMLCanvasElement).getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function canvasRelative(clientX: number, clientY: number): { x: number; y: number } | null {
    const rect = interactiveCanvas?.getBoundingClientRect();
    if (!rect) {
      return null;
    }
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  function pointerMods(e: PointerEvent): {
    shiftKey: boolean;
    altKey: boolean;
    ctrlKey: boolean;
    metaKey: boolean;
  } {
    return {
      shiftKey: e.shiftKey,
      altKey: e.altKey,
      ctrlKey: e.ctrlKey,
      metaKey: e.metaKey
    };
  }

  function attachFileInput(node: HTMLInputElement): () => void {
    fileInput = node;
    return () => {
      if (fileInput === node) {
        fileInput = undefined;
      }
    };
  }

  function attachStaticCanvas(node: HTMLCanvasElement): () => void {
    staticCanvas = node;
    return () => {
      if (staticCanvas === node) {
        staticCanvas = undefined;
      }
    };
  }

  function attachInteractiveCanvas(node: HTMLCanvasElement): () => void {
    interactiveCanvas = node;
    return () => {
      if (interactiveCanvas === node) {
        interactiveCanvas = undefined;
      }
    };
  }

  function onpointerdown(e: PointerEvent): void {
    if (e.button !== 0 && e.button !== 1) {
      return;
    }
    // pointer capture keeps move/up events flowing if the pointer leaves the canvas; guard it
    // because it can throw for non-active pointer ids (and must not block the gesture).
    try {
      (e.currentTarget as HTMLCanvasElement).setPointerCapture(e.pointerId);
    } catch {
      // ignore — capture is a best-effort optimization
    }
    const { x, y } = relative(e);
    // image tool opens the picker — but not while panning (space/middle/hand)
    if (controller.activeTool === 'image' && !spaceHeld && e.button !== 1) {
      pendingImageAt = { x: e.clientX, y: e.clientY };
      fileInput?.click();
      return;
    }
    pointerGestureActive = true;
    controller.pointerDown(x, y, {
      shiftKey: e.shiftKey,
      altKey: e.altKey,
      ctrlKey: e.ctrlKey,
      metaKey: e.metaKey,
      spaceKey: spaceHeld,
      button: e.button
    });
  }

  async function onImagePicked(e: Event): Promise<void> {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (file && pendingImageAt) {
      await controller.placeImage(file, pendingImageAt.x, pendingImageAt.y);
    }
    input.value = '';
    pendingImageAt = null;
  }

  let lastPointer = { x: 0, y: 0 };
  let pointerGestureActive = false;
  // Space-held → temporary pan (Excalidraw); tracked globally, plain let (not $state —
  // it only gates pointer handlers, never rendered).
  let spaceHeld = false;

  function movePointer(e: PointerEvent): void {
    const point = canvasRelative(e.clientX, e.clientY);
    if (!point) {
      return;
    }
    lastPointer = point;
    controller.pointerMove(point.x, point.y, pointerMods(e));
  }

  function onpointermove(e: PointerEvent): void {
    if (!pointerGestureActive) {
      movePointer(e);
    }
  }

  function onWindowPointerMove(e: PointerEvent): void {
    if (pointerGestureActive) {
      movePointer(e);
    }
  }

  function onpointerup(): void {
    pointerGestureActive = false;
    controller.pointerUp();
  }

  function onWindowPointerUp(): void {
    if (!pointerGestureActive) {
      return;
    }
    pointerGestureActive = false;
    controller.pointerUp();
  }

  function onwheel(e: WheelEvent): void {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      controller.zoomAt(Math.exp(-e.deltaY * 0.001), e.clientX, e.clientY);
    } else if (e.shiftKey) {
      controller.panBy(e.deltaY || e.deltaX, 0);
    } else {
      controller.panBy(e.deltaX, e.deltaY);
    }
  }

  // menus / dialogs / right-click
  let menuOpen = $state(false);
  let helpOpen = $state(false);
  let exportOpen = $state(false);
  let cmdpOpen = $state(false);
  let libraryOpen = $state(false);
  let mermaidOpen = $state(false);
  let contextAt = $state<{ x: number; y: number } | null>(null);

  // the command palette's action list (assembled from existing controller ops)
  const commandsList: Command[] = [
    { group: 'Tools', label: 'Selection', shortcut: 'V', run: () => controller.setTool('selection') },
    { group: 'Tools', label: 'Rectangle', shortcut: 'R', run: () => controller.setTool('rectangle') },
    { group: 'Tools', label: 'Ellipse', shortcut: 'O', run: () => controller.setTool('ellipse') },
    { group: 'Tools', label: 'Diamond', shortcut: 'D', run: () => controller.setTool('diamond') },
    { group: 'Tools', label: 'Arrow', shortcut: 'A', run: () => controller.setTool('arrow') },
    { group: 'Tools', label: 'Line', shortcut: 'L', run: () => controller.setTool('line') },
    { group: 'Tools', label: 'Draw', shortcut: 'P', run: () => controller.setTool('freedraw') },
    { group: 'Tools', label: 'Text', shortcut: 'T', run: () => controller.setTool('text') },
    { group: 'Tools', label: 'Frame', shortcut: 'F', run: () => controller.setTool('frame') },
    { group: 'Tools', label: 'Laser pointer', shortcut: 'K', run: () => controller.setTool('laser') },
    { group: 'Tools', label: 'Hand (pan)', shortcut: 'H', run: () => controller.setTool('hand') },
    { group: 'Edit', label: 'Select all', shortcut: '⌘A', run: () => controller.selectAll() },
    { group: 'Edit', label: 'Duplicate', shortcut: '⌘D', run: () => controller.duplicateSelected() },
    { group: 'Edit', label: 'Delete', shortcut: 'Del', run: () => controller.deleteSelected() },
    { group: 'Edit', label: 'Group selection', shortcut: '⌘G', run: () => controller.groupSelected() },
    { group: 'Edit', label: 'Ungroup selection', shortcut: '⌘⇧G', run: () => controller.ungroupSelected() },
    { group: 'Edit', label: 'Copy', shortcut: '⌘C', run: () => void controller.copySelected() },
    { group: 'Edit', label: 'Paste', shortcut: '⌘V', run: () => void controller.paste() },
    { group: 'Edit', label: 'Copy to clipboard as PNG', run: () => void controller.copyToClipboardAsPng() },
    { group: 'Edit', label: 'Undo', shortcut: '⌘Z', run: () => controller.undo() },
    { group: 'Edit', label: 'Redo', shortcut: '⌘⇧Z', run: () => controller.redo() },
    { group: 'Align', label: 'Align left', run: () => controller.alignSelected('start', 'x') },
    { group: 'Align', label: 'Align right', run: () => controller.alignSelected('end', 'x') },
    { group: 'Align', label: 'Align top', run: () => controller.alignSelected('start', 'y') },
    { group: 'Align', label: 'Align bottom', run: () => controller.alignSelected('end', 'y') },
    { group: 'Align', label: 'Distribute horizontally', run: () => controller.distributeSelected('x') },
    { group: 'Align', label: 'Distribute vertically', run: () => controller.distributeSelected('y') },
    { group: 'View', label: 'Zoom to fit', run: () => controller.zoomToFit() },
    { group: 'View', label: 'Scroll back to content', run: () => controller.scrollToContent() },
    { group: 'View', label: 'Reset view', run: () => controller.resetView() },
    { group: 'View', label: 'Toggle grid', shortcut: "⌘'", run: () => controller.toggleGrid() },
    { group: 'View', label: 'Toggle theme', run: () => controller.toggleTheme() },
    { group: 'View', label: 'View mode', run: () => controller.toggleViewMode() },
    { group: 'View', label: 'Zen mode', run: () => controller.toggleZenMode() },
    { group: 'File', label: 'Open…', shortcut: '⌘O', run: () => void controller.openFile() },
    { group: 'File', label: 'Save to…', shortcut: '⌘S', run: () => void controller.saveToFile() },
    { group: 'File', label: 'Save as image…', run: () => (exportOpen = true) },
    { group: 'File', label: 'Reset the canvas', run: () => controller.clear() },
    { group: 'Edit', label: 'Add to library', run: () => controller.addSelectionToLibrary() },
    { group: 'View', label: 'Toggle library', run: () => (libraryOpen = !libraryOpen) },
    { group: 'File', label: 'Mermaid to diagram…', run: () => (mermaidOpen = true) },
    { group: 'Help', label: 'Keyboard shortcuts', shortcut: '?', run: () => (helpOpen = true) }
  ];

  function oncontextmenu(e: MouseEvent): void {
    e.preventDefault();
    controller.selectAt(e.clientX, e.clientY);
    contextAt = { x: e.clientX, y: e.clientY };
  }

  const contextItems = [
    { label: 'Bring to front', shortcut: '⌘⇧]', action: () => controller.bringToFront() },
    { label: 'Bring forward', shortcut: '⌘]', action: () => controller.bringForward() },
    { label: 'Send backward', shortcut: '⌘[', action: () => controller.sendBackward() },
    { label: 'Send to back', shortcut: '⌘⇧[', action: () => controller.sendToBack() },
    'separator' as const,
    { label: 'Copy', shortcut: '⌘C', action: () => void controller.copySelected() },
    { label: 'Cut', shortcut: '⌘X', action: () => void controller.cutSelected() },
    { label: 'Paste', shortcut: '⌘V', action: () => void controller.paste(contextAt?.x, contextAt?.y) },
    { label: 'Paste as plaintext', shortcut: '⇧⌘V', action: () => void controller.pasteAsPlaintext(contextAt?.x, contextAt?.y) },
    'separator' as const,
    { label: 'Copy styles', shortcut: '⌥⌘C', action: () => controller.copyStyles() },
    { label: 'Paste styles', shortcut: '⌥⌘V', action: () => controller.pasteStyles() },
    { label: 'Copy to clipboard as PNG', action: () => void controller.copyToClipboardAsPng() },
    'separator' as const,
    { label: 'Duplicate', shortcut: '⌘D', action: () => controller.duplicateSelected() },
    { label: 'Delete', shortcut: 'Del', action: () => controller.deleteSelected() },
    'separator' as const,
    { label: 'Flip horizontal', action: () => controller.flipSelected('horizontal') },
    { label: 'Flip vertical', action: () => controller.flipSelected('vertical') },
    'separator' as const,
    { label: 'Group selection', shortcut: '⌘G', action: () => controller.groupSelected() },
    { label: 'Ungroup selection', shortcut: '⌘⇧G', action: () => controller.ungroupSelected() },
    'separator' as const,
    { label: 'Align left', action: () => controller.alignSelected('start', 'x') },
    { label: 'Align center', action: () => controller.alignSelected('center', 'x') },
    { label: 'Align right', action: () => controller.alignSelected('end', 'x') },
    { label: 'Align top', action: () => controller.alignSelected('start', 'y') },
    { label: 'Align middle', action: () => controller.alignSelected('center', 'y') },
    { label: 'Align bottom', action: () => controller.alignSelected('end', 'y') },
    { label: 'Distribute horizontally', action: () => controller.distributeSelected('x') },
    { label: 'Distribute vertically', action: () => controller.distributeSelected('y') },
    'separator' as const,
    { label: 'Lock', action: () => controller.lockSelected() },
    { label: 'Unlock all', action: () => controller.unlockAll() },
    'separator' as const,
    { label: 'Add to library', action: () => controller.addSelectionToLibrary() },
    'separator' as const,
    { label: 'Select all', action: () => controller.selectAll() },
    { label: 'Select none', action: () => controller.deselect() }
  ];

  const menuItems = $derived([
    { label: 'Open…', shortcut: '⌘O', action: () => void controller.openFile() },
    { label: 'Save to…', shortcut: '⌘S', action: () => void controller.saveToFile() },
    'separator' as const,
    { label: 'Reset the canvas', icon: 'trash', action: () => controller.clear() },
    { label: 'Zoom to fit', action: () => controller.zoomToFit() },
    { label: 'Scroll back to content', action: () => controller.scrollToContent() },
    { label: 'Reset view', action: () => controller.resetView() },
    'separator' as const,
    { label: 'Save as image…', action: () => (exportOpen = true) },
    { label: 'Mermaid to diagram…', action: () => (mermaidOpen = true) },
    { label: libraryOpen ? 'Hide library' : 'Show library', action: () => (libraryOpen = !libraryOpen) },
    { label: controller.gridMode ? 'Hide grid' : 'Show grid', action: () => controller.toggleGrid() },
    { label: controller.objectsSnapMode ? 'Disable snapping' : 'Enable snapping', action: () => controller.toggleObjectsSnapMode() },
    { label: controller.midpointSnapping ? 'Disable midpoint snapping' : 'Enable midpoint snapping', action: () => controller.toggleMidpointSnapping() },
    { label: controller.viewMode ? 'Exit view mode' : 'View mode', action: () => controller.toggleViewMode() },
    { label: controller.zenMode ? 'Exit zen mode' : 'Zen mode', action: () => controller.toggleZenMode() },
    'separator' as const,
    { label: controller.theme === 'dark' ? 'Light mode' : 'Dark mode', action: () => controller.toggleTheme() },
    { label: 'Keyboard shortcuts', action: () => (helpOpen = true) }
  ]);

  function onkeyup(e: KeyboardEvent): void {
    if (e.key === ' ') {
      spaceHeld = false;
    }
  }

  function onkeydown(e: KeyboardEvent): void {
    // while typing in the text-editor overlay, let the textarea handle keys natively
    if (e.target instanceof HTMLTextAreaElement) {
      return;
    }
    // Space-drag pan: hold Space (don't scroll the page); released in onkeyup
    if (e.key === ' ') {
      spaceHeld = true;
      e.preventDefault();
      return;
    }
    if ((e.key === 'Enter' || e.key === 'Escape') && controller.finalizeLinearCreation()) {
      e.preventDefault();
      return;
    }
    if ((e.key === 'Backspace' || e.key === 'Delete') && !e.metaKey && !e.ctrlKey) {
      controller.deleteSelected();
      e.preventDefault();
    } else if (e.key === 'Escape') {
      if (controller.isCropping) {
        controller.exitCrop();
      } else {
        controller.deselect();
      }
    } else if ((e.metaKey || e.ctrlKey) && (e.key === 'd' || e.key === 'D')) {
      controller.duplicateSelected();
      e.preventDefault();
    } else if ((e.metaKey || e.ctrlKey) && e.altKey && (e.key === 'c' || e.key === 'C')) {
      controller.copyStyles(); // ⌥⌘C
      e.preventDefault();
    } else if ((e.metaKey || e.ctrlKey) && e.altKey && (e.key === 'v' || e.key === 'V')) {
      controller.pasteStyles(); // ⌥⌘V
      e.preventDefault();
    } else if ((e.metaKey || e.ctrlKey) && (e.key === 'c' || e.key === 'C')) {
      void controller.copySelected();
      e.preventDefault();
    } else if ((e.metaKey || e.ctrlKey) && (e.key === 'x' || e.key === 'X')) {
      void controller.cutSelected();
      e.preventDefault();
    } else if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'v' || e.key === 'V')) {
      void controller.pasteAsPlaintext(lastPointer.x, lastPointer.y); // ⇧⌘V
      e.preventDefault();
    } else if ((e.metaKey || e.ctrlKey) && (e.key === 'v' || e.key === 'V')) {
      void controller.paste(lastPointer.x, lastPointer.y);
      e.preventDefault();
    } else if ((e.metaKey || e.ctrlKey) && e.code === CODES.BRACKET_RIGHT) {
      // forward = ⌘]; to-front = ⌘⌥] on macOS, ⌘⇧] elsewhere (actionZindex.tsx:96-141).
      // Use event.code so the Alt-modified character doesn't break the match.
      if (isDarwin ? e.altKey : e.shiftKey) {
        controller.bringToFront();
      } else if (!e.shiftKey && !e.altKey) {
        controller.bringForward();
      } else {
        return;
      }
      e.preventDefault();
    } else if ((e.metaKey || e.ctrlKey) && e.code === CODES.BRACKET_LEFT) {
      if (isDarwin ? e.altKey : e.shiftKey) {
        controller.sendToBack();
      } else if (!e.shiftKey && !e.altKey) {
        controller.sendBackward();
      } else {
        return;
      }
      e.preventDefault();
    } else if ((e.metaKey || e.ctrlKey) && (e.key === 'z' || e.key === 'Z')) {
      if (e.shiftKey) {
        controller.redo();
      } else {
        controller.undo();
      }
      e.preventDefault();
    } else if (
      !e.altKey &&
      (e.metaKey || e.ctrlKey) &&
      (e.key === '/' || (e.shiftKey && (e.key === 'p' || e.key === 'P')))
    ) {
      cmdpOpen = !cmdpOpen; // ⌘/ or ⌘⇧P toggles the command palette
      e.preventDefault();
    } else if ((e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'S')) {
      void controller.saveToFile();
      e.preventDefault();
    } else if ((e.metaKey || e.ctrlKey) && (e.key === 'o' || e.key === 'O')) {
      void controller.openFile();
      e.preventDefault();
    } else if ((e.metaKey || e.ctrlKey) && e.key === "'") {
      controller.toggleGrid();
      e.preventDefault();
    } else if ((e.metaKey || e.ctrlKey) && (e.key === 'a' || e.key === 'A')) {
      controller.selectAll();
      e.preventDefault();
    } else if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'g' || e.key === 'G')) {
      controller.ungroupSelected();
      e.preventDefault();
    } else if ((e.metaKey || e.ctrlKey) && (e.key === 'g' || e.key === 'G')) {
      controller.groupSelected();
      e.preventDefault();
    } else if (!e.metaKey && !e.ctrlKey && e.shiftKey && e.key === 'H') {
      controller.flipSelected('horizontal');
      e.preventDefault();
    } else if (!e.metaKey && !e.ctrlKey && e.shiftKey && e.key === 'V') {
      controller.flipSelected('vertical');
      e.preventDefault();
    } else if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'l') {
      controller.lockSelected(); // ⌘⇧L (actionElementLock.ts:143-153)
      e.preventDefault();
    } else if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.startsWith('Arrow')) {
      // ⌘⇧Arrow aligns the selection (actionAlign.tsx:96-199)
      const map = {
        ArrowLeft: ['start', 'x'],
        ArrowRight: ['end', 'x'],
        ArrowUp: ['start', 'y'],
        ArrowDown: ['end', 'y']
      } as const;
      const a = map[e.key as keyof typeof map];
      if (a) {
        controller.alignSelected(a[0], a[1]);
        e.preventDefault();
      }
    } else if (!e.metaKey && !e.ctrlKey && e.altKey && e.code === CODES.R) {
      controller.toggleViewMode(); // Alt+R (actionToggleViewMode.tsx:31)
      e.preventDefault();
    } else if (!e.metaKey && !e.ctrlKey && e.altKey && e.code === CODES.Z) {
      controller.toggleZenMode(); // Alt+Z (actionToggleZenMode.tsx:34)
      e.preventDefault();
    } else if (!e.metaKey && !e.ctrlKey && e.altKey && e.code === CODES.SLASH) {
      controller.toggleStats(); // Alt+/ (actionToggleStats.tsx:26)
      e.preventDefault();
    } else if (
      (e.code === CODES.EQUAL || e.code === CODES.NUM_ADD) &&
      (e.metaKey || e.ctrlKey || e.shiftKey)
    ) {
      controller.zoomAt(1.1, window.innerWidth / 2, window.innerHeight / 2); // zoom in
      e.preventDefault();
    } else if (
      (e.code === CODES.MINUS || e.code === CODES.NUM_SUBTRACT) &&
      (e.metaKey || e.ctrlKey || e.shiftKey)
    ) {
      controller.zoomAt(1 / 1.1, window.innerWidth / 2, window.innerHeight / 2); // zoom out
      e.preventDefault();
    } else if (
      (e.code === CODES.ZERO || e.code === CODES.NUM_ZERO) &&
      (e.metaKey || e.ctrlKey || e.shiftKey)
    ) {
      controller.resetView(); // reset zoom
      e.preventDefault();
    } else if (e.code === CODES.ONE && e.shiftKey && !e.altKey && !e.metaKey && !e.ctrlKey) {
      controller.zoomToFit(); // ⇧1 (actionZoomToFit)
      e.preventDefault();
    } else if (e.code === CODES.TWO && e.shiftKey && !e.altKey && !e.metaKey && !e.ctrlKey) {
      controller.zoomToSelection(); // ⇧2 (actionZoomToFitSelection)
      e.preventDefault();
    } else if (
      !e.metaKey &&
      !e.ctrlKey &&
      !e.altKey &&
      !e.shiftKey &&
      (e.key === 'q' || e.key === 'Q')
    ) {
      controller.toggleToolLock(); // Q (tool lock / keep selected tool active)
      e.preventDefault();
    } else if (e.key === '?') {
      helpOpen = true;
    } else if (!e.metaKey && !e.ctrlKey && !e.altKey && TOOL_KEYS[e.key]) {
      controller.setTool(TOOL_KEYS[e.key]);
      e.preventDefault();
    }
  }

  // Excalidraw tool keyboard shortcuts (digit + letter)
  const TOOL_KEYS: Record<string, Tool> = {
    '1': 'selection', v: 'selection',
    '2': 'rectangle', r: 'rectangle',
    '3': 'diamond', d: 'diamond',
    '4': 'ellipse', o: 'ellipse',
    '5': 'arrow', a: 'arrow',
    '6': 'line', l: 'line',
    '7': 'freedraw', p: 'freedraw',
    '8': 'text', t: 'text',
    '9': 'image',
    '0': 'eraser', e: 'eraser',
    f: 'frame',
    k: 'laser',
    h: 'hand'
  };

  function sizeCanvas(el: HTMLCanvasElement, scale: number): { width: number; height: number } {
    const width = el.clientWidth;
    const height = el.clientHeight;
    el.style.width = `${width}px`;
    el.style.height = `${height}px`;
    el.width = width * scale;
    el.height = height * scale;
    return { width, height };
  }

  function staticAppState(width: number, height: number): StaticCanvasAppState {
    return { ...appState.current, width, height, offsetLeft: 0, offsetTop: 0 };
  }

  // Static scene
  $effect(() => {
    const el = staticCanvas;
    if (!el) {
      return;
    }
    const scale = window.devicePixelRatio || 1;
    const { width, height } = sizeCanvas(el, scale);
    // keep appState's viewport size current so snapping/visibility checks work
    controller.setViewport(width, height);
    const editingTextId = controller.editingTextId;
    const visibleElements = editingTextId
      ? scene.elements.filter((element) => element.id !== editingTextId)
      : scene.elements;
    const baseElementsMap = scene.scene.getNonDeletedElementsMap();
    const elementsMap = editingTextId ? new SvelteMap(baseElementsMap) : baseElementsMap;
    if (editingTextId) {
      elementsMap.delete(editingTextId);
    }

    const renderConfig: StaticCanvasRenderConfig = {
      canvasBackgroundColor: appState.current.viewBackgroundColor,
      // image-support types mimeType as a plain string; the renderer wants the MIME union, and
      // the loaded value is always a valid image MIME — only used for the SVG dark-mode case.
      imageCache: controller.imageCache as unknown as StaticCanvasRenderConfig['imageCache'],
      renderGrid: appState.current.gridModeEnabled,
      isExporting: false,
      embedsValidationStatus: new SvelteMap() as StaticCanvasRenderConfig['embedsValidationStatus'],
      elementsPendingErasure: new Set(),
      pendingFlowchartNodes: null,
      theme: appState.current.theme
    };

    renderStaticScene(
      {
        canvas: el,
        rc: rough.canvas(el),
        scale,
        elementsMap: elementsMap as Map<string, OrderedExcalidrawElement> as RenderableElementsMap,
        allElementsMap: elementsMap as NonDeletedSceneElementsMap,
        visibleElements,
        appState: staticAppState(width, height),
        renderConfig
      },
      false
    );
  });

  // Interactive overlay (selection box, transform handles, marquee)
  $effect(() => {
    const el = interactiveCanvas;
    if (!el) {
      return;
    }
    const scale = window.devicePixelRatio || 1;
    const { width, height } = sizeCanvas(el, scale);
    const visibleElements = scene.elements;
    const selectedElements = controller.selectedElements;
    const elementsMap = scene.scene.getNonDeletedElementsMap();

    // interactiveScene reads only app.state / app.lastPointerMoveCoords / app.bindModeHandler
    const app = {
      state: appState.current,
      lastPointerMoveCoords: null,
      bindModeHandler: null
    } as unknown as AppClassProperties;

    const renderConfig: InteractiveCanvasRenderConfig = {
      remoteSelectedElementIds: new SvelteMap() as InteractiveCanvasRenderConfig['remoteSelectedElementIds'],
      remotePointerViewportCoords: new SvelteMap() as InteractiveCanvasRenderConfig['remotePointerViewportCoords'],
      remotePointerUserStates: new SvelteMap() as InteractiveCanvasRenderConfig['remotePointerUserStates'],
      remotePointerUsernames: new SvelteMap() as InteractiveCanvasRenderConfig['remotePointerUsernames'],
      remotePointerButton: new SvelteMap() as InteractiveCanvasRenderConfig['remotePointerButton'],
      selectionColor: '#6965db',
      lastViewportPosition: { x: 0, y: 0 },
      renderScrollbars: false
    };

    renderInteractiveScene(
      {
        app,
        canvas: el,
        scale,
        elementsMap: elementsMap as Map<string, OrderedExcalidrawElement> as RenderableElementsMap,
        allElementsMap: elementsMap as NonDeletedSceneElementsMap,
        visibleElements,
        selectedElements,
        appState: staticAppState(width, height) as unknown as InteractiveCanvasAppState,
        renderConfig,
        editorInterface,
        callback: () => {},
        deltaTime: 0
      }
    );
  });
</script>

<svelte:window
  {onkeydown}
  {onkeyup}
  onpointermove={onWindowPointerMove}
  onpointerup={onWindowPointerUp}
  onpointercancel={onWindowPointerUp}
/>

<input
  type="file"
  accept="image/*"
  style="display:none"
  onchange={onImagePicked}
  {@attach attachFileInput}
/>

<div class="excalidraw" class:theme--dark={controller.theme === 'dark'}>
  <div class="toolbar">
    <button
      type="button"
      class="tool-btn"
      title="Menu"
      aria-label="menu"
      onclick={() => (menuOpen = !menuOpen)}
    >
      <PhIcon name="nav" size={16} />
    </button>
    {#each tools as tool (tool)}
      <Tooltip label={TOOL_INFO[tool]?.label ?? tool} shortcut={TOOL_INFO[tool]?.shortcut}>
        <button
          type="button"
          class="tool-btn"
          class:active={controller.activeTool === tool}
          aria-label={TOOL_INFO[tool]?.label ?? tool}
          onclick={() => controller.setTool(tool)}
        >
          <XIcon name={tool} />
        </button>
      </Tooltip>
    {/each}
    <button
      type="button"
      class="theme-toggle"
      aria-label="toggle theme"
      onclick={() => controller.toggleTheme()}
    >
      <PhIcon name={controller.theme === 'dark' ? 'sun' : 'moon'} size={16} />
    </button>
  </div>

<div class="properties" class:hidden={!controller.showProperties}>
  <div class="prop-group">
    <span class="prop-label">Stroke</span>
    <div class="swatches">
      {#each strokeColors as c (c)}
        <button
          type="button"
          class="swatch"
          class:active={controller.strokeColor === c}
          style="background:{c}"
          aria-label="stroke {c}"
          onclick={() => controller.setStrokeColor(c)}
        ></button>
      {/each}
      <button
        type="button"
        class="swatch custom"
        style="background:{controller.strokeColor}"
        aria-label="custom stroke color"
        onclick={() => (pickerOpen = pickerOpen === 'stroke' ? null : 'stroke')}
      ></button>
    </div>
    {#if pickerOpen === 'stroke'}
      <ColorPicker
        value={controller.strokeColor}
        palette={strokeColors}
        showShades
        onPick={(c) => {
          controller.setStrokeColor(c);
          pickerOpen = null;
        }}
      />
    {/if}
  </div>
  <div class="prop-group">
    <span class="prop-label">Background</span>
    <div class="swatches">
      {#each bgColors as c (c)}
        <button
          type="button"
          class="swatch"
          class:active={controller.backgroundColor === c}
          style="background:{c === 'transparent' ? '#fff' : c}"
          aria-label="background {c}"
          onclick={() => controller.setBackgroundColor(c)}
        ></button>
      {/each}
      <button
        type="button"
        class="swatch custom"
        style="background:{controller.backgroundColor === 'transparent' ? '#fff' : controller.backgroundColor}"
        aria-label="custom background color"
        onclick={() => (pickerOpen = pickerOpen === 'background' ? null : 'background')}
      ></button>
    </div>
    {#if pickerOpen === 'background'}
      <ColorPicker
        value={controller.backgroundColor}
        palette={bgColors}
        showShades
        onPick={(c) => {
          controller.setBackgroundColor(c);
          pickerOpen = null;
        }}
      />
    {/if}
  </div>
  <div class="prop-group">
    <span class="prop-label">Canvas</span>
    <div class="swatches">
      {#each canvasBgColors as c (c)}
        <button
          type="button"
          class="swatch"
          class:active={controller.viewBackgroundColor === c}
          style="background:{c}"
          aria-label="canvas background {c}"
          onclick={() => controller.setViewBackgroundColor(c)}
        ></button>
      {/each}
      <button
        type="button"
        class="swatch custom"
        style="background:{controller.viewBackgroundColor}"
        aria-label="custom canvas background color"
        onclick={() => (pickerOpen = pickerOpen === 'canvas' ? null : 'canvas')}
      ></button>
    </div>
    {#if pickerOpen === 'canvas'}
      <ColorPicker
        value={controller.viewBackgroundColor}
        palette={canvasBgColors}
        onPick={(c) => {
          controller.setViewBackgroundColor(c);
          pickerOpen = null;
        }}
      />
    {/if}
  </div>
  <div class="prop-group">
    <span class="prop-label">Stroke width</span>
    <div class="widths">
      {#each widths as ww (ww.w)}
        <button
          type="button"
          class:active={controller.strokeWidth === ww.w}
          onclick={() => controller.setStrokeWidth(ww.w)}
        >
          {ww.label}
        </button>
      {/each}
    </div>
  </div>

  <StyleControls
    fillStyle={controller.fillStyle}
    strokeStyle={controller.strokeStyle}
    sloppiness={controller.sloppiness}
    edges={controller.edges}
    opacity={controller.opacity}
    onFillStyle={(v) => controller.setFillStyle(v)}
    onStrokeStyle={(v) => controller.setStrokeStyle(v)}
    onSloppiness={(v) => controller.setSloppiness(v)}
    onEdges={(v) => controller.setEdges(v)}
    onOpacity={(v) => controller.setOpacity(v)}
  />

  {#if controller.showTextProperties}
    <TextControls
      fontFamily={controller.currentFontFamily}
      fontSize={controller.currentFontSize}
      textAlign={controller.currentTextAlign}
      onFontFamily={(v) => controller.setFontFamily(v)}
      onFontSize={(v) => controller.setFontSize(v)}
      onTextAlign={(v) => controller.setTextAlign(v)}
    />
  {/if}

  {#if controller.showArrowProperties}
    <ArrowheadControls
      start={controller.currentStartArrowhead}
      end={controller.currentEndArrowhead}
      arrowType={controller.currentArrowType}
      onStart={(v) => controller.setStartArrowhead(v)}
      onEnd={(v) => controller.setEndArrowhead(v)}
      onArrowType={(v) => controller.setArrowType(v)}
    />
  {/if}
</div>

{#if controller.statsOpen && !controller.zenMode}
  <Stats
    element={controller.selectedElements[0] ?? null}
    sceneCount={controller.scene.elements.length}
  />
{/if}

{#if !controller.zenMode && !controller.viewMode}
  <HintViewer hint={controller.hint} />
{/if}

{#if cmdpOpen}
  <CommandPalette commands={commandsList} onClose={() => (cmdpOpen = false)} />
{/if}

{#if controller.pendingEmbed}
  <EmbedDialog
    onSubmit={(url) => controller.setEmbedLink(url)}
    onCancel={() => controller.cancelEmbed()}
  />
{/if}

{#if mermaidOpen}
  <MermaidDialog
    onInsert={(src) => controller.insertMermaid(src)}
    onClose={() => (mermaidOpen = false)}
  />
{/if}

{#if libraryOpen}
  <LibraryPanel
    items={controller.library}
    canAdd={controller.canAddToLibrary}
    onAdd={() => controller.addSelectionToLibrary()}
    onInsert={(id) => controller.insertLibraryItem(id)}
    onRemove={(id) => controller.removeLibraryItem(id)}
    onClose={() => (libraryOpen = false)}
  />
{/if}

{#if controller.showWelcome}
  <WelcomeScreen
    onOpen={() => void controller.openFile()}
    onHelp={() => (helpOpen = true)}
  />
{/if}

{#if controller.toastMessage !== null}
  <Toast
    message={controller.toastMessage}
    closable={controller.toastClosable}
    duration={controller.toastDuration}
    onClose={() => controller.dismissToast()}
  />
{/if}

<div class="canvas-wrap">
  <canvas class="layer" {@attach attachStaticCanvas}></canvas>
  <canvas
    class="layer"
    class:grab={controller.activeTool === 'hand'}
    {onpointerdown}
    {onpointermove}
    {onpointerup}
    {onwheel}
    {oncontextmenu}
    ondblclick={(e) => {
      const { x, y } = relative(e as unknown as PointerEvent);
      controller.doubleClickAt(x, y);
    }}
    {@attach attachInteractiveCanvas}
  ></canvas>
  <!-- ephemeral laser-pointer trail (SVG; pointer-events:none so the canvas keeps the gesture) -->
  <svg
    class="layer laser-layer"
    aria-hidden="true"
    {@attach (node: SVGSVGElement) => {
      controller.startLaserLayer(node);
      return () => controller.stopLaserLayer();
    }}
  ></svg>

  <!-- live iframe overlay for embeddable elements (positioned in screen space) -->
  {#each controller.embeddables as embed (embed.id)}
    {@const a = controller.appState.current}
    {@const sx = (embed.x + a.scrollX) * a.zoom.value + a.offsetLeft}
    {@const sy = (embed.y + a.scrollY) * a.zoom.value + a.offsetTop}
    <iframe
      class="embed-frame"
      title="Embedded content"
      src={embed.link ?? ''}
      style="left:{sx}px; top:{sy}px; width:{embed.width * a.zoom.value}px; height:{embed.height *
        a.zoom.value}px;"
      sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
      referrerpolicy="no-referrer"
      allowfullscreen
    ></iframe>
  {/each}

  {#if controller.editingText}
    {@const t = controller.editingText}
    {@const a = controller.appState.current}
    {@const textViewport = sceneCoordsToViewportCoords({ sceneX: t.x, sceneY: t.y }, a)}
    <textarea
      class="text-editor"
      style="left:{textViewport.x}px; top:{textViewport.y}px; width:{t.width *
        a.zoom.value}px; height:{t.height * a.zoom.value}px; font-size:{t.fontSize *
        a.zoom.value}px; line-height:{t.lineHeight};"
      value={t.text}
      oninput={(e) => controller.setEditingText(e.currentTarget.value)}
      onblur={() => controller.commitText()}
      onkeydown={(e) => {
        if (e.key === 'Escape') {
          e.currentTarget.blur();
        }
      }}
      {@attach (node: HTMLTextAreaElement) => {
        node.focus();
      }}
    ></textarea>
  {/if}
  </div>

  <div class="footer" role="contentinfo">
    <div class="zoom-actions" aria-label="Zoom controls">
      <button
        type="button"
        class="footer-button zoom-button zoom-out-button"
        aria-label="zoom out"
        onclick={() => controller.zoomAt(1 / 1.1, window.innerWidth / 2, window.innerHeight / 2)}
      >
        <PhIcon name="zoom-out" size={16} />
      </button>
      <button
        type="button"
        class="footer-button zoom-button reset-zoom-button"
        title="reset zoom"
        onclick={() => controller.resetView()}
      >
        {Math.round(controller.zoom * 100)}%
      </button>
      <button
        type="button"
        class="footer-button zoom-button zoom-in-button"
        aria-label="zoom in"
        onclick={() => controller.zoomAt(1.1, window.innerWidth / 2, window.innerHeight / 2)}
      >
        <PhIcon name="zoom-in" size={16} />
      </button>
    </div>
    <div class="undo-redo-buttons" aria-label="Undo and redo">
      <button
        type="button"
        class="footer-button undo-button"
        aria-label="undo"
        disabled={!controller.canUndo}
        onclick={() => controller.undo()}
      >
        <PhIcon name="undo" size={16} />
      </button>
      <button
        type="button"
        class="footer-button redo-button"
        aria-label="redo"
        disabled={!controller.canRedo}
        onclick={() => controller.redo()}
      >
        <PhIcon name="redo" size={16} />
      </button>
    </div>
  </div>

  {#if contextAt}
    <ContextMenu
      x={contextAt.x}
      y={contextAt.y}
      items={contextItems}
      onClose={() => (contextAt = null)}
    />
  {/if}

  <MainMenu open={menuOpen} onClose={() => (menuOpen = false)} items={menuItems} />
  <HelpDialog open={helpOpen} onClose={() => (helpOpen = false)} />
  <ExportDialog
    open={exportOpen}
    onClose={() => (exportOpen = false)}
    onExportPng={() => controller.downloadPng()}
    onExportSvg={() => controller.downloadSvg()}
  />
</div>

<style>
  /* dark mode: invert the canvas (Excalidraw's filter approach) + dark chrome */
  .excalidraw.theme--dark .layer {
    filter: var(--theme-filter, invert(93%) hue-rotate(180deg));
  }

  .theme-toggle {
    padding: 0;
    border: 1px solid transparent;
    border-radius: var(--border-radius-lg);
    background: transparent;
    color: var(--icon-fill-color);
    cursor: pointer;
  }

  .excalidraw.theme--dark .toolbar,
  .excalidraw.theme--dark .properties {
    background: var(--island-bg-color);
    color: var(--color-on-surface);
  }

  .excalidraw.theme--dark .toolbar button,
  .excalidraw.theme--dark .widths button {
    color: var(--icon-fill-color);
  }

  .excalidraw.theme--dark .toolbar button.active,
  .excalidraw.theme--dark .widths button.active {
    background: var(--color-surface-primary-container);
    border-color: transparent;
    color: var(--color-on-primary-container);
  }

  .excalidraw.theme--dark .prop-label {
    color: #909296;
  }

  .canvas-wrap {
    position: relative;
    width: 100vw;
    height: 100vh;
  }

  .layer {
    position: absolute;
    inset: 0;
    display: block;
    width: 100%;
    height: 100%;
    touch-action: none;
  }

  /* hand tool → grab cursor (grabbing while dragging) */
  .layer.grab {
    cursor: grab;
  }
  .layer.grab:active {
    cursor: grabbing;
  }

  /* laser trail sits above the canvases but never intercepts pointer events */
  .embed-frame {
    position: absolute;
    z-index: 1;
    border: 1px solid #e9ecef;
    border-radius: 6px;
    background: #fff;
  }

  .laser-layer {
    pointer-events: none;
  }

  .text-editor {
    position: absolute;
    margin: 0;
    padding: 0;
    border: 0;
    outline: 0;
    resize: none;
    overflow: hidden;
    background: transparent;
    white-space: pre;
    min-width: 1em;
    font-family:
      'Excalifont', 'Virgil', 'Segoe UI Emoji', sans-serif;
    color: #1e1e1e;
  }

  .toolbar {
    position: fixed;
    top: var(--editor-container-padding);
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 2px;
    padding: 4px;
    background: var(--island-bg-color);
    border-radius: var(--border-radius-lg);
    box-shadow: var(--shadow-island);
    z-index: 10;
  }

  .toolbar button {
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--lg-button-size);
    min-width: var(--lg-button-size);
    height: var(--lg-button-size);
    padding: 0;
    border: 1px solid transparent;
    border-radius: var(--border-radius-lg);
    background: transparent;
    color: var(--icon-fill-color);
    cursor: pointer;
    font: inherit;
    line-height: 0;
  }

  .toolbar button:hover {
    background: var(--button-hover-bg);
  }

  .toolbar button:active {
    background: var(--button-hover-bg);
    border-color: var(--button-active-border);
  }

  .toolbar button.active {
    background: var(--color-surface-primary-container);
    color: var(--color-on-primary-container);
  }

  .tool-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: var(--lg-button-size);
    height: var(--lg-button-size);
  }

  .footer {
    position: fixed;
    bottom: var(--editor-container-padding);
    left: var(--editor-container-padding);
    z-index: 10;
    display: flex;
    align-items: center;
    gap: calc(var(--space-factor) * 2);
    padding: 0;
    pointer-events: auto;
    background: transparent;
    border: 0;
    box-shadow: none;
  }

  .zoom-actions,
  .undo-redo-buttons {
    display: flex;
    align-items: center;
    overflow: hidden;
    background-color: var(--island-bg-color);
    border-radius: var(--border-radius-lg);
    box-shadow: 0 0 0 1px var(--color-surface-lowest);
  }

  .footer-button {
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--lg-button-size);
    height: var(--lg-button-size);
    padding: 0;
    border: 1px solid transparent;
    border-radius: 0;
    background: var(--color-surface-low);
    color: var(--icon-fill-color);
    cursor: pointer;
    font: inherit;
    font-size: 0.875rem;
    line-height: 1;
  }

  .footer-button:hover {
    background: var(--button-hover-bg);
  }

  .footer-button:active {
    border-color: var(--button-active-border);
  }

  .footer-button:disabled {
    color: var(--color-disabled);
    cursor: default;
  }

  .footer-button:disabled:hover,
  .footer-button:disabled:active {
    background: var(--color-surface-low);
    border-color: transparent;
  }

  .reset-zoom-button {
    width: 3.75rem;
    padding: 0 0.625rem;
    color: var(--text-primary-color);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .zoom-out-button,
  .undo-button {
    border-top-left-radius: var(--border-radius-lg);
    border-bottom-left-radius: var(--border-radius-lg);
    border-right: 0;
  }

  .zoom-in-button,
  .redo-button {
    border-top-right-radius: var(--border-radius-lg);
    border-bottom-right-radius: var(--border-radius-lg);
  }

  .footer :global(svg) {
    width: var(--lg-icon-size);
    height: var(--lg-icon-size);
    color: currentColor;
  }

  .excalidraw.theme--dark .footer {
    color: var(--color-on-surface);
  }

  .toolbar button :global(svg) {
    width: var(--lg-icon-size);
    height: var(--lg-icon-size);
    color: currentColor;
  }

  .properties {
    position: fixed;
    top: 70px;
    left: 12px;
    z-index: 10;
    display: flex;
    flex-direction: column;
    gap: 10px;
    width: max-content;
    min-width: 180px;
    max-width: calc(100vw - 24px);
    max-height: calc(100vh - 166px);
    box-sizing: border-box;
    overflow: auto;
    padding: calc(2 * var(--space-factor));
    color: var(--color-on-surface);
    background: var(--island-bg-color);
    border-radius: var(--border-radius-lg);
    box-shadow: var(--shadow-island);
    font-size: 12px;
  }

  .prop-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .prop-label {
    color: var(--text-primary-color);
  }

  .swatches {
    display: flex;
    gap: 6px;
  }

  .swatch {
    width: 24px;
    height: 24px;
    padding: 0;
    border: 1px solid rgba(0, 0, 0, 0.15);
    border-radius: 6px;
    cursor: pointer;
  }

  .swatch.active {
    outline: 2px solid var(--color-primary);
    outline-offset: 1px;
  }

  .swatch.custom {
    border: 2px solid var(--color-primary);
    margin-left: 4px;
  }

  .hidden {
    display: none;
  }

  .widths {
    display: flex;
    gap: 6px;
  }

  .widths button {
    flex: 1;
    padding: 6px 0;
    border: 1px solid transparent;
    border-radius: 6px;
    color: var(--color-on-surface);
    background: var(--button-hover-bg);
    cursor: pointer;
  }

  .widths button.active {
    background: var(--color-primary-light);
    border-color: var(--color-primary);
  }
</style>
