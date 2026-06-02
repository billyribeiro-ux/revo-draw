<script lang="ts">
  // Phase 3 preview: two stacked canvases (static scene + interactive overlay), driven by the
  // reactive DrawController. Draw shapes by dragging; with the selection tool, click a shape to
  // select it and the interactive overlay paints Excalidraw's selection box + transform handles.
  import rough from 'roughjs/bin/rough';

  import { renderStaticScene } from '@excalidraw/excalidraw/renderer/staticScene';
  import { renderInteractiveScene } from '@excalidraw/excalidraw/renderer/interactiveScene';

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

  import { DrawController, type Tool } from '$lib/x/draw-controller.svelte.ts';

  const controller = new DrawController();
  const { scene, appState } = controller;

  (window as unknown as { __draw?: DrawController }).__draw = controller;

  let staticCanvas = $state<HTMLCanvasElement>();
  let interactiveCanvas = $state<HTMLCanvasElement>();

  const tools: Tool[] = ['selection', 'rectangle', 'ellipse', 'diamond', 'line', 'arrow', 'freedraw'];

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

  function onpointerdown(e: PointerEvent): void {
    (e.currentTarget as HTMLCanvasElement).setPointerCapture(e.pointerId);
    const { x, y } = relative(e);
    controller.pointerDown(x, y);
  }

  function onpointermove(e: PointerEvent): void {
    const { x, y } = relative(e);
    controller.pointerMove(x, y);
  }

  function onpointerup(): void {
    controller.pointerUp();
  }

  function onkeydown(e: KeyboardEvent): void {
    if (e.key === 'Backspace' || e.key === 'Delete') {
      controller.deleteSelected();
      e.preventDefault();
    } else if (e.key === 'Escape') {
      controller.deselect();
    } else if ((e.metaKey || e.ctrlKey) && (e.key === 'd' || e.key === 'D')) {
      controller.duplicateSelected();
      e.preventDefault();
    } else if ((e.metaKey || e.ctrlKey) && (e.key === 'z' || e.key === 'Z')) {
      if (e.shiftKey) {
        controller.redo();
      } else {
        controller.undo();
      }
      e.preventDefault();
    }
  }

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
    const visibleElements = scene.elements;
    const elementsMap = scene.scene.getNonDeletedElementsMap();

    const renderConfig: StaticCanvasRenderConfig = {
      canvasBackgroundColor: appState.current.viewBackgroundColor,
      imageCache: new Map(),
      renderGrid: false,
      isExporting: false,
      embedsValidationStatus: new Map(),
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
      remoteSelectedElementIds: new Map(),
      remotePointerViewportCoords: new Map(),
      remotePointerUserStates: new Map(),
      remotePointerUsernames: new Map(),
      remotePointerButton: new Map(),
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

<svelte:window {onkeydown} />

<div class="toolbar">
  {#each tools as tool (tool)}
    <button
      type="button"
      class:active={controller.activeTool === tool}
      onclick={() => controller.setTool(tool)}
    >
      {tool}
    </button>
  {/each}
</div>

<div class="canvas-wrap">
  <canvas bind:this={staticCanvas} class="layer"></canvas>
  <canvas
    bind:this={interactiveCanvas}
    class="layer"
    {onpointerdown}
    {onpointermove}
    {onpointerup}
  ></canvas>
</div>

<style>
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

  .toolbar {
    position: fixed;
    top: 12px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    gap: 4px;
    padding: 6px;
    background: #fff;
    border: 1px solid #e0e0e0;
    border-radius: 10px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    z-index: 10;
  }

  .toolbar button {
    padding: 6px 12px;
    border: 1px solid transparent;
    border-radius: 6px;
    background: transparent;
    font-size: 13px;
    cursor: pointer;
    text-transform: capitalize;
  }

  .toolbar button.active {
    background: #e7f5ff;
    border-color: #a5d8ff;
  }
</style>
