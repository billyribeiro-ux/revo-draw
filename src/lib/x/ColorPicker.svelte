<script lang="ts">
  // Self-contained, props-driven color picker styled like an Excalidraw popover.
  // No controller imports, no external deps — purely props in / callback out.
  import { COLOR_PALETTE } from '@excalidraw/common';

  interface Props {
    value: string;
    palette: string[];
    onPick: (color: string) => void;
    /** show the full Excalidraw shade ramp (named colors × 5 shades) below the quick palette */
    showShades?: boolean;
  }

  const { value, palette, onPick, showShades = false }: Props = $props();

  // The shade ramp: each named color is a row of 5 shades (Excalidraw's COLOR_PALETTE).
  // Filter to the array-valued entries (skip transparent/black/white scalars).
  const shadeRows: ReadonlyArray<{ name: string; shades: readonly string[] }> = Object.entries(
    COLOR_PALETTE
  )
    .filter(([, v]) => Array.isArray(v))
    .map(([name, v]) => ({ name, shades: v as readonly string[] }));

  // Local mirror of the hex input so typing doesn't immediately clobber `value`.
  // The leading "#" is shown as a separate decoration, so the draft holds the digits
  // WITHOUT it (the user types "ff0000", not "#ff0000"). Writable $derived: resets to
  // `value` whenever the prop changes, yet stays locally mutable while the user types.
  let hexDraft = $derived(value.replace(/^#/, ''));

  const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

  function normalize(color: string): string {
    return color.trim().toLowerCase();
  }

  function isActive(swatch: string): boolean {
    return normalize(swatch) === normalize(value);
  }

  function pickSwatch(swatch: string): void {
    onPick(swatch);
  }

  function commitHex(): void {
    // prepend the decorative "#" (and tolerate a pasted leading "#") before validating
    const candidate = '#' + hexDraft.trim().replace(/^#/, '');
    if (HEX_RE.test(candidate)) {
      onPick(candidate);
    } else {
      // Invalid hex: ignore and restore the last valid value (digits only).
      hexDraft = value.replace(/^#/, '');
    }
  }

  function onHexKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitHex();
    }
  }
</script>

<div class="color-picker" role="group" aria-label="Color picker">
  <div class="swatches">
    {#each palette as swatch (swatch)}
      <button
        type="button"
        class="swatch"
        class:active={isActive(swatch)}
        style:background-color={swatch}
        title={swatch}
        aria-label={swatch}
        aria-pressed={isActive(swatch)}
        onclick={() => pickSwatch(swatch)}
      ></button>
    {/each}
  </div>

  {#if showShades}
    <div class="shade-ramp" role="group" aria-label="Color shades">
      {#each shadeRows as row (row.name)}
        <div class="shade-row">
          {#each row.shades as shade (shade)}
            <button
              type="button"
              class="swatch shade"
              class:active={isActive(shade)}
              style:background-color={shade}
              title={`${row.name} ${shade}`}
              aria-label={`${row.name} ${shade}`}
              aria-pressed={isActive(shade)}
              onclick={() => pickSwatch(shade)}
            ></button>
          {/each}
        </div>
      {/each}
    </div>
  {/if}

  <div class="hex-row">
    <span class="hash" aria-hidden="true">#</span>
    <input
      class="hex-input"
      type="text"
      inputmode="text"
      spellcheck="false"
      autocomplete="off"
      aria-label="Hex color"
      bind:value={hexDraft}
      onchange={commitHex}
      onkeydown={onHexKeydown}
    />
  </div>
</div>

<style>
  .color-picker {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 8px;
    width: max-content;
    background: #ffffff;
    border: 1px solid rgba(0, 0, 0, 0.1);
    border-radius: 8px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.08), 0 4px 12px rgba(0, 0, 0, 0.1);
    font-family:
      'Assistant', system-ui, -apple-system, 'Segoe UI', sans-serif;
  }

  .swatches {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 4px;
  }

  .shade-ramp {
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding-top: 6px;
    border-top: 1px solid rgba(0, 0, 0, 0.08);
  }

  .shade-row {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 3px;
  }

  .swatch.shade {
    inline-size: 18px;
    block-size: 18px;
    border-radius: 3px;
  }

  .swatch {
    inline-size: 22px;
    block-size: 22px;
    padding: 0;
    border: 1px solid rgba(0, 0, 0, 0.1);
    border-radius: 4px;
    cursor: pointer;
    outline: none;
    transition: transform 0.08s ease;
  }

  .swatch:hover {
    transform: scale(1.08);
  }

  .swatch.active {
    box-shadow:
      0 0 0 1px #ffffff,
      0 0 0 3px #6965db;
  }

  .swatch:focus-visible {
    box-shadow:
      0 0 0 1px #ffffff,
      0 0 0 3px #6965db;
  }

  .hex-row {
    display: flex;
    align-items: center;
    gap: 4px;
    padding-inline: 6px;
    border: 1px solid rgba(0, 0, 0, 0.12);
    border-radius: 6px;
    background: #f5f5f5;
  }

  .hash {
    color: rgba(0, 0, 0, 0.4);
    font-size: 13px;
    user-select: none;
  }

  .hex-input {
    flex: 1;
    min-inline-size: 0;
    inline-size: 80px;
    padding-block: 5px;
    border: none;
    background: transparent;
    color: #1b1b1f;
    font-size: 13px;
    font-family: inherit;
    outline: none;
  }
</style>
