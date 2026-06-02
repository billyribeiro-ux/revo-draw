<script lang="ts">
  // Phase 2 visible-payoff proof: render real Excalidraw elements (hand-drawn via rough.js) onto a
  // canvas using the vendored `renderStaticScene`, driven by the reactive EditorScene + AppState.
  // Isolated on the /x dev route so the existing app is untouched while the render path is proven.
  import rough from 'roughjs/bin/rough';

  import { newElement, syncInvalidIndices } from '@excalidraw/element';
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

  import { EditorScene } from '$lib/scene/editor-scene.svelte.ts';
  import { EditorAppState } from '$lib/state/app-state.svelte.ts';

  // A starter scene: hand-drawn rectangle, ellipse, diamond — the three generic shapes.
  const initial = syncInvalidIndices([
    newElement({ type: 'rectangle', x: 120, y: 120, width: 220, height: 130, backgroundColor: '#a5d8ff' }),
    newElement({ type: 'ellipse', x: 400, y: 150, width: 170, height: 170, backgroundColor: '#ffc9c9' }),
    newElement({ type: 'diamond', x: 220, y: 330, width: 200, height: 140, backgroundColor: '#b2f2bb' })
  ]);

  const scene = new EditorScene(initial);
  const appState = new EditorAppState();

  let canvas = $state<HTMLCanvasElement>();

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

    // reactive deps: re-render when elements mutate or app state changes
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

<canvas bind:this={canvas} class="excalidraw-preview"></canvas>

<style>
  .excalidraw-preview {
    display: block;
    width: 100vw;
    height: 100vh;
  }
</style>
