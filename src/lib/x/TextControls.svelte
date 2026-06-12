<script lang="ts">
  // Self-contained, props-driven text-style controls styled like Excalidraw's
  // property panel: Font family, Font size (S/M/L/XL), Text align. Mirrors
  // SelectedShapeActions' font section (actionChangeFontFamily / FontSize /
  // TextAlign). No controller imports — purely props in / callback out.

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
      icon: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"><path d="M3 15c2-7 4-9 5-9s1 4 2 4 2-6 3-6 1 9 4 11"/></svg>`,
    },
    {
      value: 6, // Nunito — normal
      label: 'Normal',
      icon: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"><path d="M5 16V6.5a2.5 2.5 0 0 1 5 0V16M5 11h5M15 6v10"/></svg>`,
    },
    {
      value: 8, // Comic Shanns — code
      label: 'Code',
      icon: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"><path d="m7 6-4 4 4 4M13 6l4 4-4 4"/></svg>`,
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
      icon: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M4 6h12M4 10h8M4 14h12"/></svg>`,
    },
    {
      value: 'center',
      label: 'Center',
      icon: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M4 6h12M6 10h8M4 14h12"/></svg>`,
    },
    {
      value: 'right',
      label: 'Right',
      icon: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M4 6h12M8 10h8M4 14h12"/></svg>`,
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
          {@html opt.icon}
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
          {@html opt.icon}
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

  .glyph {
    font-size: 12px;
    font-weight: 600;
    line-height: 1;
  }
</style>
