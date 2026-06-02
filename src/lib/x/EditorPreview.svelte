<script lang="ts">
  // Phase 3 preview: two stacked canvases (static scene + interactive overlay), driven by the
  // reactive DrawController. Draw shapes by dragging; with the selection tool, click a shape to
  // select it and the interactive overlay paints Excalidraw's selection box + transform handles.
  import rough from 'roughjs/bin/rough';

  import '$lib/x/css/theme.css';

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
  import { ICONS } from '$lib/x/icons.ts';
  import StyleControls from '$lib/x/StyleControls.svelte';
  import Stats from '$lib/x/Stats.svelte';

  const controller = new DrawController();
  const { scene, appState } = controller;

  (window as unknown as { __draw?: DrawController }).__draw = controller;

  let staticCanvas = $state<HTMLCanvasElement>();
  let interactiveCanvas = $state<HTMLCanvasElement>();

  const tools: Tool[] = ['selection', 'rectangle', 'ellipse', 'diamond', 'line', 'arrow', 'text', 'freedraw'];

  // Excalidraw's default palettes
  const strokeColors = ['#1e1e1e', '#e03131', '#2f9e44', '#1971c2', '#f08c00'];
  const bgColors = ['transparent', '#ffc9c9', '#b2f2bb', '#a5d8ff', '#ffec99'];
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

  function onpointerdown(e: PointerEvent): void {
    // pointer capture keeps move/up events flowing if the pointer leaves the canvas; guard it
    // because it can throw for non-active pointer ids (and must not block the gesture).
    try {
      (e.currentTarget as HTMLCanvasElement).setPointerCapture(e.pointerId);
    } catch {
      // ignore — capture is a best-effort optimization
    }
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
    // while typing in the text-editor overlay, let the textarea handle keys natively
    if (e.target instanceof HTMLTextAreaElement) {
      return;
    }
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

<div class="excalidraw" class:theme--dark={controller.theme === 'dark'}>
  <div class="toolbar">
    {#each tools as tool (tool)}
      <button
        type="button"
        class="tool-btn"
        class:active={controller.activeTool === tool}
        title={tool}
        aria-label={tool}
        onclick={() => controller.setTool(tool)}
      >
        {#if ICONS[tool]}{@html ICONS[tool]}{:else}{tool}{/if}
      </button>
    {/each}
    <button
      type="button"
      class="theme-toggle"
      aria-label="toggle theme"
      onclick={() => controller.toggleTheme()}
    >
      {controller.theme === 'dark' ? '☀' : '☾'}
    </button>
  </div>

<div class="properties">
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
    </div>
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
    </div>
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
</div>

<Stats
  element={controller.selectedElements[0] ?? null}
  sceneCount={controller.scene.elements.length}
/>

<div class="canvas-wrap">
  <canvas bind:this={staticCanvas} class="layer"></canvas>
  <canvas
    bind:this={interactiveCanvas}
    class="layer"
    {onpointerdown}
    {onpointermove}
    {onpointerup}
  ></canvas>

  {#if controller.editingText}
    {@const t = controller.editingText}
    <textarea
      class="text-editor"
      style="left:{t.x}px; top:{t.y}px; font-size:{t.fontSize}px; line-height:{t.lineHeight};"
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
</div>

<style>
  /* dark mode: invert the canvas (Excalidraw's filter approach) + dark chrome */
  .excalidraw.theme--dark .layer {
    filter: var(--theme-filter, invert(93%) hue-rotate(180deg));
  }

  .theme-toggle {
    padding: 6px 10px;
    border: 1px solid transparent;
    border-radius: 6px;
    background: transparent;
    cursor: pointer;
    font-size: 14px;
  }

  .excalidraw.theme--dark .toolbar,
  .excalidraw.theme--dark .properties {
    background: #232329;
    border-color: #31313a;
    color: #ced4da;
  }

  .excalidraw.theme--dark .toolbar button,
  .excalidraw.theme--dark .widths button {
    color: #ced4da;
  }

  .excalidraw.theme--dark .toolbar button.active,
  .excalidraw.theme--dark .widths button.active {
    background: #2d2d38;
    border-color: #4263eb;
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

  .tool-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 32px;
    height: 32px;
  }

  .toolbar button :global(svg) {
    width: 18px;
    height: 18px;
  }

  .properties {
    position: fixed;
    top: 70px;
    left: 12px;
    z-index: 10;
    display: flex;
    flex-direction: column;
    gap: 12px;
    width: 180px;
    padding: 12px;
    background: #fff;
    border: 1px solid #e0e0e0;
    border-radius: 12px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    font-size: 12px;
  }

  .prop-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .prop-label {
    color: #495057;
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
    outline: 2px solid #4263eb;
    outline-offset: 1px;
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
    background: #f1f3f5;
    cursor: pointer;
  }

  .widths button.active {
    background: #e7f5ff;
    border-color: #a5d8ff;
  }
</style>
