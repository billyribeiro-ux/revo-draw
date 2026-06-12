<script lang="ts">
  // Library sidebar, ported from excalidraw-master LibraryMenu. Lists saved element
  // groups as tiles; "Add to library" stores the current selection; clicking a tile
  // stamps it onto the canvas; the × removes it. Props-driven.
  import type { LibraryItems } from '@excalidraw/excalidraw/types';

  interface Props {
    items: LibraryItems;
    canAdd: boolean;
    onAdd: () => void;
    onInsert: (id: string) => void;
    onRemove: (id: string) => void;
    onClose: () => void;
  }

  const { items, canAdd, onAdd, onInsert, onRemove, onClose }: Props = $props();
</script>

<aside class="library" aria-label="Library">
  <header class="library-head">
    <span class="library-title">Library</span>
    <button type="button" class="library-close" aria-label="Close library" onclick={onClose}>✕</button>
  </header>

  <button type="button" class="library-add" disabled={!canAdd} onclick={onAdd}>
    + Add to library
  </button>

  {#if items.length === 0}
    <p class="library-empty">Select elements and add them to reuse later.</p>
  {:else}
    <div class="library-grid">
      {#each items as item (item.id)}
        <div class="library-tile">
          <button
            type="button"
            class="library-tile-btn"
            title={`Insert (${item.elements.length} element${item.elements.length === 1 ? '' : 's'})`}
            aria-label={`Insert library item with ${item.elements.length} elements`}
            onclick={() => onInsert(item.id)}
          >
            <span class="library-count">{item.elements.length}</span>
          </button>
          <button
            type="button"
            class="library-remove"
            aria-label="Remove from library"
            onclick={() => onRemove(item.id)}
          >✕</button>
        </div>
      {/each}
    </div>
  {/if}
</aside>

<style>
  .library {
    position: fixed;
    top: 56px;
    right: 12px;
    bottom: 12px;
    z-index: 4;
    width: 240px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px;
    background: #ffffff;
    border: 1px solid #e9ecef;
    border-radius: 12px;
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.12);
    font-family:
      'Assistant', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  }

  .library-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .library-title {
    font-size: 15px;
    font-weight: 600;
    color: #1b1b1f;
  }

  .library-close {
    width: 24px;
    height: 24px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: #868e96;
    cursor: pointer;
  }
  .library-close:hover {
    background: rgba(0, 0, 0, 0.06);
  }

  .library-add {
    padding: 8px;
    border: 1px solid #6965db;
    border-radius: 8px;
    background: #6965db;
    color: #ffffff;
    font: inherit;
    font-size: 13px;
    cursor: pointer;
  }
  .library-add:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .library-empty {
    margin: 0;
    color: #868e96;
    font-size: 13px;
    line-height: 1.5;
  }

  .library-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
    overflow-y: auto;
  }

  .library-tile {
    position: relative;
    aspect-ratio: 1;
  }

  .library-tile-btn {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid #e9ecef;
    border-radius: 8px;
    background: #f8f9fa;
    color: #495057;
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
  }
  .library-tile-btn:hover {
    border-color: #6965db;
  }

  .library-remove {
    position: absolute;
    top: -6px;
    right: -6px;
    width: 18px;
    height: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 0;
    border-radius: 50%;
    background: #e03131;
    color: #ffffff;
    font-size: 10px;
    line-height: 1;
    cursor: pointer;
  }

  :global(.excalidraw.theme--dark) .library {
    background: #232329;
    border-color: #2e2e36;
  }
  :global(.excalidraw.theme--dark) .library-title {
    color: #e3e3e8;
  }
  :global(.excalidraw.theme--dark) .library-tile-btn {
    background: #2a2a31;
    border-color: #2e2e36;
    color: #b8b8c0;
  }
</style>
