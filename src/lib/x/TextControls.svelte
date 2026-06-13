<script lang="ts">
  // Self-contained, props-driven text-style controls styled like Excalidraw's
  // property panel: Font family, Font size (S/M/L/XL), Text align. Mirrors
  // SelectedShapeActions' font section (actionChangeFontFamily / FontSize /
  // TextAlign). No controller imports — purely props in / callback out.
  import XIcon from '$lib/x/XIcon.svelte';

  // Excalidraw's `TextAlign` resolves to `string` (TEXT_ALIGN has no `as const`),
  // so the prop is `string`; the internal option set keeps the real values.
  type AlignValue = 'left' | 'center' | 'right';

  interface Props {
    fontFamily: number; // FONT_FAMILY value (5 Excalifont / 6 Nunito / 8 Comic Shanns)
    fontSize: number; // 16 S / 20 M / 28 L / 36 XL
    textAlign: string;
    onFontFamily: (v: number) => void;
    onFontSize: (v: number) => void;
    onTextAlign: (v: AlignValue) => void;
  }

  const {
    fontFamily,
    fontSize,
    textAlign,
    onFontFamily,
    onFontSize,
    onTextAlign,
  }: Props = $props();

  // Excalidraw's three "top pick" font families (FONT_FAMILY values).
  const fontOptions: ReadonlyArray<{ value: number; label: string; icon: string }> = [
    {
      value: 5, // Excalifont — hand-drawn
      label: 'Hand-drawn',
      icon: 'font-hand',
    },
    {
      value: 6, // Nunito — normal
      label: 'Normal',
      icon: 'font-normal',
    },
    {
      value: 8, // Comic Shanns — code
      label: 'Code',
      icon: 'font-code',
    },
  ];

  // Excalidraw font sizes: Small 16, Medium 20, Large 28, Extra-large 36.
  const sizeOptions: ReadonlyArray<{ value: number; label: string; glyph: string }> = [
    { value: 16, label: 'Small', glyph: 'S' },
    { value: 20, label: 'Medium', glyph: 'M' },
    { value: 28, label: 'Large', glyph: 'L' },
    { value: 36, label: 'Extra large', glyph: 'XL' },
  ];

  const alignOptions: ReadonlyArray<{ value: AlignValue; label: string; icon: string }> = [
    {
      value: 'left',
      label: 'Left',
      icon: 'align-left',
    },
    {
      value: 'center',
      label: 'Center',
      icon: 'align-center',
    },
    {
      value: 'right',
      label: 'Right',
      icon: 'align-right',
    },
  ];
</script>

<div class="text-controls">
  <fieldset class="group">
    <legend>Font family</legend>
    <div class="button-list">
      {#each fontOptions as opt (opt.value)}
        <button
          type="button"
          class="square"
          class:active={fontFamily === opt.value}
          title={opt.label}
          aria-label={opt.label}
          aria-pressed={fontFamily === opt.value}
          onclick={() => onFontFamily(opt.value)}
        >
          <XIcon name={opt.icon} />
        </button>
      {/each}
    </div>
  </fieldset>

  <fieldset class="group">
    <legend>Font size</legend>
    <div class="button-list">
      {#each sizeOptions as opt (opt.value)}
        <button
          type="button"
          class="square"
          class:active={fontSize === opt.value}
          title={opt.label}
          aria-label={opt.label}
          aria-pressed={fontSize === opt.value}
          onclick={() => onFontSize(opt.value)}
        >
          <span class="glyph">{opt.glyph}</span>
        </button>
      {/each}
    </div>
  </fieldset>

  <fieldset class="group">
    <legend>Text align</legend>
    <div class="button-list">
      {#each alignOptions as opt (opt.value)}
        <button
          type="button"
          class="square"
          class:active={textAlign === opt.value}
          title={opt.label}
          aria-label={opt.label}
          aria-pressed={textAlign === opt.value}
          onclick={() => onTextAlign(opt.value)}
        >
          <XIcon name={opt.icon} />
        </button>
      {/each}
    </div>
  </fieldset>
</div>

<style>
  .text-controls {
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
    outline: 2px solid var(--color-primary);
    outline-offset: 1px;
  }

  .square.active {
    color: var(--color-on-primary-container);
    background: var(--color-surface-primary-container);
    border-color: transparent;
  }

  .square :global(svg) {
    width: 18px;
    height: 18px;
  }

  .glyph {
    font-size: 12px;
    font-weight: 600;
    line-height: 1;
  }
</style>
