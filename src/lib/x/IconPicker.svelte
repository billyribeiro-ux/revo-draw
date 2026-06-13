<script lang="ts">
  // Phosphor icon picker for the editor. Searches the offline-bundled Iconify set and renders
  // monochrome previews; selecting one hands its qualified name (ph:<name>) back to the caller,
  // which inserts it as a recolourable icon element. Self-contained — props in / callbacks out.
  // Previews are rendered as <img> data-URLs (not {@html}) so there is no raw-markup injection.
  import { searchIcons, resolveIcon, iconToSvgString } from '$lib/icons/offline-iconify.ts';

  interface Props {
    onSelect: (name: string) => void;
    onClose: () => void;
    /** Colour to render the grid previews in (so they read against the current theme). */
    previewColor?: string;
  }

  const { onSelect, onClose, previewColor = '#1e1e1e' }: Props = $props();

  let query = $state('');
  let names = $state<string[]>([]);
  let previews = $state<Record<string, string>>({});

  function svgDataUrl(svg: string): string {
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }

  // Search (and render previews) whenever the query or preview colour changes. The cancelled flag
  // drops a superseded search's results so out-of-order async resolution can't clobber newer input.
  // Async I/O has no synchronous `$derived` equivalent, so this load belongs in an effect.
  $effect(() => {
    const q = query;
    const color = previewColor;
    let cancelled = false;
    void (async () => {
      const found = await searchIcons(q, 120);
      if (cancelled) {
        return;
      }
      names = found;
      const rendered: Record<string, string> = {};
      for (const name of found) {
        const icon = await resolveIcon(name);
        if (icon) {
          rendered[name] = svgDataUrl(iconToSvgString(icon, 24, color));
        }
      }
      if (!cancelled) {
        previews = rendered;
      }
    })();
    return () => {
      cancelled = true;
    };
  });

  function onWindowKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      onClose();
    }
  }

  function focusOnOpen(node: HTMLInputElement): void {
    queueMicrotask(() => node.focus());
  }
</script>

<svelte:window onkeydown={onWindowKeydown} />

<div
  class="icon-picker-overlay"
  role="presentation"
  onpointerdown={(event) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  }}
>
  <div class="icon-picker" role="dialog" aria-label="Insert icon" aria-modal="true">
    <input
      class="icon-picker__search"
      type="text"
      placeholder="Search Phosphor icons…"
      aria-label="Search icons"
      bind:value={query}
      {@attach focusOnOpen}
    />
    <div class="icon-picker__grid">
      {#each names as name (name)}
        <button
          type="button"
          class="icon-picker__cell"
          title={name}
          aria-label={name}
          onclick={() => onSelect(name)}
        >
          {#if previews[name]}
            <img class="icon-picker__preview" src={previews[name]} alt="" draggable="false" />
          {/if}
        </button>
      {/each}
      {#if names.length === 0}
        <p class="icon-picker__empty">No icons match “{query}”.</p>
      {/if}
    </div>
  </div>
</div>

<style>
  .icon-picker-overlay {
    position: fixed;
    inset: 0;
    z-index: 100;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: 12vh;
    background: rgba(0, 0, 0, 0.2);
  }

  .icon-picker {
    display: flex;
    flex-direction: column;
    gap: 10px;
    width: min(520px, 92vw);
    max-height: 64vh;
    padding: 14px;
    background: var(--island-bg-color, #fff);
    color: var(--color-on-surface, #1b1b1f);
    border-radius: var(--border-radius-lg, 10px);
    box-shadow: var(--shadow-island, 0 8px 30px rgba(0, 0, 0, 0.18));
  }

  .icon-picker__search {
    width: 100%;
    padding: 8px 10px;
    border: 1px solid var(--input-border-color, #ced4da);
    border-radius: 8px;
    background: var(--input-bg-color, #fff);
    color: inherit;
    font: inherit;
  }

  .icon-picker__grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(40px, 1fr));
    gap: 6px;
    overflow-y: auto;
  }

  .icon-picker__cell {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    aspect-ratio: 1;
    padding: 8px;
    border: 1px solid transparent;
    border-radius: 8px;
    background: transparent;
    cursor: pointer;
  }

  .icon-picker__cell:hover {
    background: var(--button-hover-bg, #f1f3f5);
    border-color: var(--default-border-color, #e9ecef);
  }

  .icon-picker__preview {
    width: 24px;
    height: 24px;
  }

  .icon-picker__empty {
    grid-column: 1 / -1;
    padding: 16px;
    color: var(--color-on-surface-muted, #868e96);
    text-align: center;
  }
</style>
