<script lang="ts">
  // Phase 2 → 3 interactive preview: draw hand-drawn shapes by dragging. Wires a <canvas> to the
  // vendored renderStaticScene (driven by the reactive EditorScene + AppState on the DrawController)
  // and routes pointer events into the generic-create gesture. Isolated on /x.
  import rough from 'roughjs/bin/rough';

  import { renderStaticScene } from '@excalidraw/excalidraw/renderer/staticScene';

  import type {
    NonDeletedSceneElementsMap,
    OrderedExcalidrawElement
  } from '@excalidraw/element/types';
  import type {
    RenderableElementsMap,
    StaticCanvasRenderConfig
  } from '@excalidraw/excalidraw/scene/types';
  import type { StaticCanvasAppState } from '@excalidraw/excalidraw/types';

  import { DrawController, type Tool } from '$lib/x/draw-controller.svelte.ts';

  const controller = new DrawController();
  const { scene, appState } = controller;

  // expose for headless CDP probes (typed, no `any`)
  (window as unknown as { __draw?: DrawController }).__draw = controller;

  let canvas = $state<HTMLCanvasElement>();

  const tools: Tool[] = ['selection', 'rectangle', 'ellipse', 'diamond', 'freedraw'];

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

  $effect(() => {
    const el = canvas;
    if (!el) {
      return;
    }

    const scale = window.devicePixelRatio || 1;
    const width = el.clientWidth;
    const height = el.clientHeight;

    el.style.width = `${width}px`;
    el.style.height = `${height}px`;
    el.width = width * scale;
    el.height = height * scale;

    // reactive deps: repaint when elements mutate or app state changes
    const visibleElements = scene.elements;
    const st: StaticCanvasAppState = {
      ...appState.current,
      width,
      height,
      offsetLeft: 0,
      offsetTop: 0
    };

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

    const elementsMap = scene.scene.getNonDeletedElementsMap();

    renderStaticScene(
      {
        canvas: el,
        rc: rough.canvas(el),
        scale,
        elementsMap: elementsMap as Map<string, OrderedExcalidrawElement> as RenderableElementsMap,
        allElementsMap: elementsMap as NonDeletedSceneElementsMap,
        visibleElements,
        appState: st,
        renderConfig
      },
      false
    );
  });
</script>

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

<canvas
  bind:this={canvas}
  class="excalidraw-preview"
  {onpointerdown}
  {onpointermove}
  {onpointerup}
></canvas>

<style>
  .excalidraw-preview {
    display: block;
    width: 100vw;
    height: 100vh;
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
