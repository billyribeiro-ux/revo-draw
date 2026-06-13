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

  function isTransparent(swatch: string): boolean {
    return normalize(swatch) === 'transparent';
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

<div class="color-picker" role="dialog" aria-label="Color picker">
  <div class="top-picks" aria-label="Top color picks">
    {#each palette as swatch (swatch)}
      <button
        type="button"
        class="swatch top-pick"
        class:active={isActive(swatch)}
        class:is-transparent={isTransparent(swatch)}
        style:background-color={isTransparent(swatch) ? 'transparent' : swatch}
        title={swatch}
        aria-label={swatch}
        aria-pressed={isActive(swatch)}
        onclick={() => pickSwatch(swatch)}
      >
        <span class="swatch-outline" aria-hidden="true"></span>
      </button>
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
              class:is-transparent={isTransparent(shade)}
              style:background-color={shade}
              title={`${row.name} ${shade}`}
              aria-label={`${row.name} ${shade}`}
              aria-pressed={isActive(shade)}
              onclick={() => pickSwatch(shade)}
            >
              <span class="swatch-outline" aria-hidden="true"></span>
            </button>
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
    gap: 0.75rem;
    padding: 0.5rem;
    width: max-content;
    background: var(--popup-bg-color);
    border: 0;
    border-radius: 4px;
    box-shadow: rgba(0, 0, 0, 0.25) 0 1px 4px;
    font-family:
      'Assistant', system-ui, -apple-system, 'Segoe UI', sans-serif;
  }

  .top-picks {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-inline-size: calc(5 * 1.875rem + 4 * 0.25rem);
  }

  .shade-ramp {
    display: grid;
    grid-template-columns: repeat(5, 1.875rem);
    gap: 0.25rem;
    padding: 0.5rem;
    border-radius: 4px;
    background: transparent;
  }

  .shade-row {
    display: contents;
  }

  .swatch.shade {
    --radius: 0.5rem;
    --size: 1.875rem;
  }

  .swatch {
    --radius: 4px;
    --size: 1.375rem;
    position: relative;
    box-sizing: border-box;
    inline-size: var(--size);
    block-size: var(--size);
    padding: 0;
    border: 0;
    border-radius: var(--radius);
    box-shadow: inset 0 0 0 1px var(--color-gray-30);
    cursor: pointer;
    filter: var(--theme-filter);
    outline: none;
    transition: transform 0.08s ease;
  }

  .swatch.is-transparent {
    background-image: url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAMUlEQVQ4T2NkYGAQYcAP3uCTZhw1gGGYhAGBZIA/nYDCgBDAm9BGDWAAJyRCgLaBCAAgXwixzAS0pgAAAABJRU5ErkJggg==');
    background-position: left center;
  }

  .swatch:hover:not(.active):not(.shade) {
    transform: scale(1.075);
  }

  .swatch.shade:hover:not(.active)::after {
    content: '';
    position: absolute;
    inset: -1px;
    border-radius: var(--radius);
    box-shadow: 0 0 0 1px var(--color-gray-30);
  }

  .swatch-outline {
    pointer-events: none;
  }

  .swatch.active .swatch-outline {
    position: absolute;
    inset: -1px;
    z-index: 1;
    border-radius: var(--radius);
    box-shadow: 0 0 0 1px var(--color-primary-darkest);
    filter: var(--theme-filter);
  }

  .swatch:focus-visible::after {
    content: '';
    position: absolute;
    inset: -4px;
    border: 3px solid var(--focus-highlight-color);
    border-radius: calc(var(--radius) + 1px);
  }

  .swatch.active:focus-visible .swatch-outline {
    display: none;
  }

  .top-pick:hover:not(.active) {
    transform: scale(1.08);
  }

  .hex-row {
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: center;
    gap: 8px;
    min-inline-size: calc(5 * 1.875rem + 4 * 0.25rem);
    padding: 0 12px;
    border: 1px solid var(--default-border-color);
    border-radius: var(--border-radius-lg);
    box-sizing: border-box;
  }

  .hex-row:focus-within {
    box-shadow: 0 0 0 1px var(--color-primary-darkest);
  }

  .hash {
    color: var(--input-label-color);
    font-size: 0.875rem;
    user-select: none;
  }

  .hex-input {
    flex: 1;
    min-inline-size: 0;
    inline-size: 100%;
    block-size: var(--default-button-size);
    margin: 0;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--text-primary-color);
    font-size: 0.875rem;
    font-family: inherit;
    letter-spacing: 0.4px;
    outline: none;
    appearance: none;
  }
</style>
