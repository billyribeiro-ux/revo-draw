<script lang="ts">
  // Self-contained, props-driven shape-style controls styled like an Excalidraw
  // property panel. Mirrors SelectedShapeActions (Actions.tsx): Fill, Stroke
  // style, Sloppiness, Edges radio groups + an Opacity slider.
  // No controller imports, no external deps — purely props in / callback out.

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

  // Inline SVGs (20x20 viewBox, stroke-based) mirroring Excalidraw's icon
  // language for each option. Kept as small markup strings so {@html} can stamp
  // them into the square buttons.
  const fillIcons: Record<FillStyle, string> = {
    hachure: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"><path d="M5.879 2.625h8.242a3.254 3.254 0 0 1 3.254 3.254v8.242a3.254 3.254 0 0 1-3.254 3.254H5.88a3.254 3.254 0 0 1-3.254-3.254V5.88a3.254 3.254 0 0 1 3.254-3.254Z"/><path d="m6 12 6-6M8.5 14l5.5-5.5M3 11l5-5M6 16l8-8" stroke-width="1"/></svg>`,
    'cross-hatch': `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"><path d="M5.879 2.625h8.242a3.254 3.254 0 0 1 3.254 3.254v8.242a3.254 3.254 0 0 1-3.254 3.254H5.88a3.254 3.254 0 0 1-3.254-3.254V5.88a3.254 3.254 0 0 1 3.254-3.254Z"/><g stroke-width="1"><path d="m6 12 6-6M3 11l5-5M6 16l8-8"/><path d="m6 6 6 6M3 7l5 5M6 4l8 8"/></g></svg>`,
    zigzag: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"><path d="M5.879 2.625h8.242a3.254 3.254 0 0 1 3.254 3.254v8.242a3.254 3.254 0 0 1-3.254 3.254H5.88a3.254 3.254 0 0 1-3.254-3.254V5.88a3.254 3.254 0 0 1 3.254-3.254Z"/><path d="m4 14 3-3-3-3 3-3M9 14l3-3-3-3 3-3" stroke-width="1"/></svg>`,
    solid: `<svg viewBox="0 0 20 20" fill="currentColor" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"><path d="M5.879 2.625h8.242a3.254 3.254 0 0 1 3.254 3.254v8.242a3.254 3.254 0 0 1-3.254 3.254H5.88a3.254 3.254 0 0 1-3.254-3.254V5.88a3.254 3.254 0 0 1 3.254-3.254Z"/></svg>`,
  };

  const strokeIcons: Record<StrokeStyle, string> = {
    solid: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 10h14"/></svg>`,
    dashed: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-dasharray="3.5 4"><path d="M3 10h14"/></svg>`,
    dotted: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-dasharray="0.5 3.5"><path d="M3 10h14"/></svg>`,
  };

  // roughness 0 | 1 | 2 → Architect (clean) / Artist / Cartoonist (sketchy)
  const sloppinessOptions: ReadonlyArray<{ value: number; label: string; icon: string }> = [
    {
      value: 0,
      label: 'Architect',
      icon: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 13.5c2.5-5 5-7.5 13-9"/></svg>`,
    },
    {
      value: 1,
      label: 'Artist',
      icon: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 13.5c2-4 3.8-5.6 6-6.2 1.8-.5 2.4.6 4 .2 1.8-.4 2.4-2 3-3"/></svg>`,
    },
    {
      value: 2,
      label: 'Cartoonist',
      icon: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 14c1.5-2 1.6-4 3-4.4 1.4-.4 1.6 1.6 3 1.4 1.4-.2 1.4-2.4 2.6-3 1.2-.6 2 .6 3.4-1.5"/></svg>`,
    },
  ];

  const edgeIcons: Record<Edges, string> = {
    sharp: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 17V8a4 4 0 0 1 4-4h9"/></svg>`,
    round: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 17v-3a10 10 0 0 1 10-10h3"/></svg>`,
  };

  const fillOrder: ReadonlyArray<{ value: FillStyle; label: string }> = [
    { value: 'hachure', label: 'Hachure' },
    { value: 'cross-hatch', label: 'Cross-hatch' },
    { value: 'solid', label: 'Solid' },
    { value: 'zigzag', label: 'Zigzag' },
  ];

  const strokeOrder: ReadonlyArray<{ value: StrokeStyle; label: string }> = [
    { value: 'solid', label: 'Solid' },
    { value: 'dashed', label: 'Dashed' },
    { value: 'dotted', label: 'Dotted' },
  ];

  const edgeOrder: ReadonlyArray<{ value: Edges; label: string }> = [
    { value: 'sharp', label: 'Sharp' },
    { value: 'round', label: 'Round' },
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
          {@html fillIcons[opt.value]}
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
          {@html strokeIcons[opt.value]}
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
          {@html opt.icon}
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
          {@html edgeIcons[opt.value]}
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
    width: max-content;
    padding: 12px;
    background: #ffffff;
    border: 1px solid #e9ecef;
    border-radius: 10px;
    box-shadow:
      0 1px 4px rgba(0, 0, 0, 0.06),
      0 4px 12px rgba(0, 0, 0, 0.08);
    color: #1b1b1f;
    font-family:
      'Assistant', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
    font-size: 13px;
  }

  .group {
    margin: 0;
    padding: 0;
    border: 0;
  }

  legend {
    margin: 0 0 5px;
    padding: 0;
    color: #495057;
    font-size: 12px;
    font-weight: 400;
  }

  .button-list {
    display: flex;
    gap: 6px;
  }

  .square {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    padding: 0;
    color: #1b1b1f;
    background: #ffffff;
    border: 1px solid #e9ecef;
    border-radius: 8px;
    cursor: pointer;
    transition:
      background 0.1s ease,
      border-color 0.1s ease;
  }

  .square:hover {
    background: #f1f3f5;
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
    min-width: 152px;
    margin: 2px 0 0;
    accent-color: #6965db;
    cursor: pointer;
  }
</style>
