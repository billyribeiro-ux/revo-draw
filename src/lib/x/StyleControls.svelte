<script lang="ts">
  // Self-contained, props-driven shape-style controls styled like an Excalidraw
  // property panel. Mirrors SelectedShapeActions (Actions.tsx): Fill, Stroke
  // style, Sloppiness, Edges radio groups + an Opacity slider.
  // No controller imports, no external deps — purely props in / callback out.
  import XIcon from '$lib/x/XIcon.svelte';

  type FillStyle = 'hachure' | 'cross-hatch' | 'solid' | 'zigzag';
  type StrokeStyle = 'solid' | 'dashed' | 'dotted';
  type Edges = 'sharp' | 'round';

  interface Props {
    fillStyle: FillStyle;
    strokeStyle: StrokeStyle;
    sloppiness: number; // roughness 0 | 1 | 2 (Architect / Artist / Cartoonist)
    edges: Edges;
    opacity: number; // 0..100
    onFillStyle: (v: FillStyle) => void;
    onStrokeStyle: (v: StrokeStyle) => void;
    onSloppiness: (v: number) => void;
    onEdges: (v: Edges) => void;
    onOpacity: (v: number) => void;
  }

  const {
    fillStyle,
    strokeStyle,
    sloppiness,
    edges,
    opacity,
    onFillStyle,
    onStrokeStyle,
    onSloppiness,
    onEdges,
    onOpacity,
  }: Props = $props();

  // roughness 0 | 1 | 2 → Architect (clean) / Artist / Cartoonist (sketchy)
  const sloppinessOptions: ReadonlyArray<{ value: number; label: string; icon: string }> = [
    {
      value: 0,
      label: 'Architect',
      icon: 'sloppiness-0',
    },
    {
      value: 1,
      label: 'Artist',
      icon: 'sloppiness-1',
    },
    {
      value: 2,
      label: 'Cartoonist',
      icon: 'sloppiness-2',
    },
  ];

  const fillOrder: ReadonlyArray<{ value: FillStyle; label: string; icon: string }> = [
    { value: 'hachure', label: 'Hachure', icon: 'fill-hachure' },
    { value: 'cross-hatch', label: 'Cross-hatch', icon: 'fill-cross-hatch' },
    { value: 'solid', label: 'Solid', icon: 'fill-solid' },
    { value: 'zigzag', label: 'Zigzag', icon: 'fill-zigzag' },
  ];

  const strokeOrder: ReadonlyArray<{ value: StrokeStyle; label: string; icon: string }> = [
    { value: 'solid', label: 'Solid', icon: 'stroke-solid' },
    { value: 'dashed', label: 'Dashed', icon: 'stroke-dashed' },
    { value: 'dotted', label: 'Dotted', icon: 'stroke-dotted' },
  ];

  const edgeOrder: ReadonlyArray<{ value: Edges; label: string; icon: string }> = [
    { value: 'sharp', label: 'Sharp', icon: 'edge-sharp' },
    { value: 'round', label: 'Round', icon: 'edge-round' },
  ];

  function onOpacityInput(event: Event): void {
    const target = event.currentTarget as HTMLInputElement;
    onOpacity(Number(target.value));
  }
</script>

<div class="style-controls">
  <fieldset class="group">
    <legend>Fill</legend>
    <div class="button-list">
      {#each fillOrder as opt (opt.value)}
        <button
          type="button"
          class="square"
          class:active={fillStyle === opt.value}
          title={opt.label}
          aria-label={opt.label}
          aria-pressed={fillStyle === opt.value}
          onclick={() => onFillStyle(opt.value)}
        >
          <XIcon name={opt.icon} />
        </button>
      {/each}
    </div>
  </fieldset>

  <fieldset class="group">
    <legend>Stroke style</legend>
    <div class="button-list">
      {#each strokeOrder as opt (opt.value)}
        <button
          type="button"
          class="square"
          class:active={strokeStyle === opt.value}
          title={opt.label}
          aria-label={opt.label}
          aria-pressed={strokeStyle === opt.value}
          onclick={() => onStrokeStyle(opt.value)}
        >
          <XIcon name={opt.icon} />
        </button>
      {/each}
    </div>
  </fieldset>

  <fieldset class="group">
    <legend>Sloppiness</legend>
    <div class="button-list">
      {#each sloppinessOptions as opt (opt.value)}
        <button
          type="button"
          class="square"
          class:active={sloppiness === opt.value}
          title={opt.label}
          aria-label={opt.label}
          aria-pressed={sloppiness === opt.value}
          onclick={() => onSloppiness(opt.value)}
        >
          <XIcon name={opt.icon} />
        </button>
      {/each}
    </div>
  </fieldset>

  <fieldset class="group">
    <legend>Edges</legend>
    <div class="button-list">
      {#each edgeOrder as opt (opt.value)}
        <button
          type="button"
          class="square"
          class:active={edges === opt.value}
          title={opt.label}
          aria-label={opt.label}
          aria-pressed={edges === opt.value}
          onclick={() => onEdges(opt.value)}
        >
          <XIcon name={opt.icon} />
        </button>
      {/each}
    </div>
  </fieldset>

  <fieldset class="group">
    <legend>Opacity</legend>
    <input
      type="range"
      class="opacity"
      min="0"
      max="100"
      step="10"
      value={opacity}
      aria-label="Opacity"
      oninput={onOpacityInput}
    />
  </fieldset>
</div>

<style>
  .style-controls {
    display: flex;
    flex-direction: column;
    gap: 10px;
    box-sizing: border-box;
    width: 100%;
    min-width: 0;
    padding: 0;
    color: inherit;
    font: inherit;
  }

  .group {
    margin: 0;
    padding: 0;
    border: 0;
  }

  legend {
    margin: 0 0 5px;
    padding: 0;
    color: var(--text-primary-color);
    font-size: 12px;
    font-weight: 400;
  }

  .button-list {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .square {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    padding: 0;
    color: var(--color-on-surface);
    background: var(--island-bg-color);
    border: 1px solid var(--default-border-color);
    border-radius: 8px;
    cursor: pointer;
    transition:
      background 0.1s ease,
      border-color 0.1s ease;
  }

  .square:hover {
    background: var(--button-hover-bg);
  }

  .square:focus-visible {
    outline: 2px solid #6965db;
    outline-offset: 1px;
  }

  .square.active {
    color: #ffffff;
    background: #6965db;
    border-color: #6965db;
  }

  .square :global(svg) {
    width: 18px;
    height: 18px;
  }

  .opacity {
    width: 100%;
    min-width: 0;
    margin: 2px 0 0;
    accent-color: #6965db;
    cursor: pointer;
  }
</style>
