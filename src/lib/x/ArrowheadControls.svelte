<script lang="ts">
  // Self-contained, props-driven arrowhead controls styled like Excalidraw's
  // property panel (actionChangeArrowhead): a Start and End row, each picking
  // none / arrow / triangle / circle / bar / diamond. No controller imports.

  // Callbacks emit this narrow subset; the live element's arrowhead may be any of
  // Excalidraw's broader set, so the `start`/`end` *input* props are `string|null`
  // and only this subset renders an active state.
  type Arrowhead = 'arrow' | 'triangle' | 'circle' | 'bar' | 'diamond' | null;

  type ArrowType = 'sharp' | 'round' | 'elbow';

  interface Props {
    start: string | null;
    end: string | null;
    arrowType: string;
    onStart: (v: Arrowhead) => void;
    onEnd: (v: Arrowhead) => void;
    onArrowType: (v: ArrowType) => void;
  }

  const { start, end, arrowType, onStart, onEnd, onArrowType }: Props = $props();

  const arrowTypeOptions: ReadonlyArray<{ value: ArrowType; label: string; icon: string }> = [
    {
      value: 'sharp',
      label: 'Sharp',
      icon: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 15l7-10 7 10"/></svg>`,
    },
    {
      value: 'round',
      label: 'Curved',
      icon: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M3 15c0-6 14-6 14 0"/></svg>`,
    },
    {
      value: 'elbow',
      label: 'Elbow',
      icon: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 15V9h14V3"/></svg>`,
    },
  ];

  // Icons drawn for the END (right-pointing) case; the start row mirrors them
  // horizontally via CSS so the glyph points the correct way.
  const options: ReadonlyArray<{ value: Arrowhead; label: string; icon: string }> = [
    {
      value: null,
      label: 'None',
      icon: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M3 10h14"/></svg>`,
    },
    {
      value: 'arrow',
      label: 'Arrow',
      icon: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10h13M11 6l5 4-5 4"/></svg>`,
    },
    {
      value: 'triangle',
      label: 'Triangle',
      icon: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M3 10h9"/><path d="M11 6l6 4-6 4Z" fill="currentColor"/></svg>`,
    },
    {
      value: 'circle',
      label: 'Circle',
      icon: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 10h9" stroke-linecap="round"/><circle cx="14" cy="10" r="3" fill="currentColor"/></svg>`,
    },
    {
      value: 'bar',
      label: 'Bar',
      icon: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M3 10h12M15 5v10"/></svg>`,
    },
    {
      value: 'diamond',
      label: 'Diamond',
      icon: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M3 10h8"/><path d="M14 7l3 3-3 3-3-3Z" fill="currentColor"/></svg>`,
    },
  ];
</script>

<div class="arrowhead-controls">
  <fieldset class="group">
    <legend>Arrow type</legend>
    <div class="button-list">
      {#each arrowTypeOptions as opt (opt.value)}
        <button
          type="button"
          class="square"
          class:active={arrowType === opt.value}
          title={opt.label}
          aria-label={opt.label}
          aria-pressed={arrowType === opt.value}
          onclick={() => onArrowType(opt.value)}
        >
          {@html opt.icon}
        </button>
      {/each}
    </div>
  </fieldset>

  <fieldset class="group">
    <legend>Arrowheads</legend>
    <div class="row">
      <span class="end-label">Start</span>
      <div class="button-list start">
        {#each options as opt (opt.value ?? 'none')}
          <button
            type="button"
            class="square"
            class:active={start === opt.value}
            title={opt.label}
            aria-label={`start ${opt.label}`}
            aria-pressed={start === opt.value}
            onclick={() => onStart(opt.value)}
          >
            {@html opt.icon}
          </button>
        {/each}
      </div>
    </div>
    <div class="row">
      <span class="end-label">End</span>
      <div class="button-list">
        {#each options as opt (opt.value ?? 'none')}
          <button
            type="button"
            class="square"
            class:active={end === opt.value}
            title={opt.label}
            aria-label={`end ${opt.label}`}
            aria-pressed={end === opt.value}
            onclick={() => onEnd(opt.value)}
          >
            {@html opt.icon}
          </button>
        {/each}
      </div>
    </div>
  </fieldset>
</div>

<style>
  .arrowhead-controls {
    display: flex;
    flex-direction: column;
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

  .row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 6px;
  }

  .end-label {
    width: 34px;
    color: var(--color-gray-60);
    font-size: 11px;
  }

  .button-list {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  /* mirror the start-row glyphs so they point leftward (toward the line start) */
  .button-list.start :global(svg) {
    transform: scaleX(-1);
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
</style>
