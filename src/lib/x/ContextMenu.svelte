<script lang="ts">
  // Self-contained, props-driven right-click context menu styled like an
  // Excalidraw context menu. No controller imports — purely props in / callbacks out.

  type MenuItem =
    | { label: string; shortcut?: string; action: () => void }
    | 'separator';

  interface Props {
    x: number;
    y: number;
    items: MenuItem[];
    onClose: () => void;
  }

  const { x, y, items, onClose }: Props = $props();

  // The menu's own root element — used to distinguish inside vs. outside clicks.
  let menuEl = $state<HTMLElement | null>(null);

  // Clamp the menu inside the viewport so it never gets cut off near an edge.
  // Mirrors Excalidraw's Popover fitInViewport (Popover.tsx): if the menu would
  // overflow the right/bottom edge, shift it back by its own size (10px gutter).
  // The menu's rendered size is measured once on attach (its size is independent of
  // where we place it), so re-clamping from the raw click point (x, y) is stable.
  let measured = $state<{ width: number; height: number } | null>(null);

  const placement = $derived.by(() => {
    let left = x;
    let top = y;
    if (measured) {
      const margin = 10;
      if (left + measured.width > window.innerWidth) {
        left = Math.max(margin, window.innerWidth - measured.width - margin);
      }
      if (top + measured.height > window.innerHeight) {
        top = Math.max(margin, window.innerHeight - measured.height - margin);
      }
    }
    return { left, top };
  });

  function isSeparator(item: MenuItem): item is 'separator' {
    return item === 'separator';
  }

  // Collapse leading/duplicate separators so we never render a dangling rule
  // (mirrors Excalidraw's filteredItems separator-suppression logic).
  const rendered = $derived(
    items.filter((item, idx) => {
      if (!isSeparator(item)) {
        return true;
      }
      const prev = items[idx - 1];
      return prev !== undefined && !isSeparator(prev);
    }),
  );

  function runItem(item: Exclude<MenuItem, 'separator'>): void {
    item.action();
    onClose();
  }

  function onWindowKeydown(event: KeyboardEvent): void {
    // Only intercept Escape; let every other key pass through untouched.
    if (event.key === 'Escape') {
      onClose();
    }
  }

  function onWindowPointerdown(event: PointerEvent): void {
    const target = event.target;
    if (menuEl && target instanceof Node && menuEl.contains(target)) {
      return;
    }
    onClose();
  }

  function attachMenu(node: HTMLElement): () => void {
    menuEl = node;
    // Measure once the menu is in the DOM so `placement` can clamp it into view.
    const rect = node.getBoundingClientRect();
    measured = { width: rect.width, height: rect.height };
    return () => {
      if (menuEl === node) {
        menuEl = null;
      }
    };
  }
</script>

<svelte:window onkeydown={onWindowKeydown} onpointerdown={onWindowPointerdown} />

<ul
  class="context-menu"
  style="left: {placement.left}px; top: {placement.top}px;"
  oncontextmenu={(event) => event.preventDefault()}
  {@attach attachMenu}
>
  {#each rendered as item, idx (idx)}
    {#if isSeparator(item)}
      <hr class="context-menu-item-separator" />
    {:else}
      <li>
        <button type="button" class="context-menu-item" onclick={() => runItem(item)}>
          <span class="context-menu-item__label">{item.label}</span>
          {#if item.shortcut}
            <kbd class="context-menu-item__shortcut">{item.shortcut}</kbd>
          {/if}
        </button>
      </li>
    {/if}
  {/each}
</ul>

<style>
  .context-menu {
    position: fixed;
    z-index: 100;
    margin: 0;
    padding: 0.25rem 0;
    list-style: none;
    user-select: none;
    cursor: default;
    background-color: #ffffff;
    border: 1px solid #d6d6d6;
    border-radius: 6px;
    box-shadow: 0 3px 10px rgba(0, 0, 0, 0.2);
    color: #1b1b1f;
    font-size: 0.8125rem;
    font-family: inherit;
    min-width: 9.5rem;
    /* If the menu is taller than the viewport, scroll within it rather than
       spilling off-screen (Excalidraw Popover full-height + overflow case). */
    max-height: calc(100vh - 20px);
    overflow-y: auto;
  }

  .context-menu li {
    margin: 0;
    padding: 0;
  }

  .context-menu-item {
    box-sizing: border-box;
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: center;
    column-gap: 20px;
    width: 100%;
    margin: 0;
    padding: 0.25rem 1rem;
    text-align: start;
    white-space: nowrap;
    background-color: transparent;
    border: none;
    border-radius: 0;
    color: inherit;
    font-family: inherit;
    font-size: inherit;
    cursor: pointer;
  }

  .context-menu-item:hover,
  .context-menu-item:focus-visible {
    background-color: #6965db;
    color: #ffffff;
    outline: none;
  }

  .context-menu-item__label {
    justify-self: start;
  }

  .context-menu-item__shortcut {
    justify-self: end;
    opacity: 0.6;
    font-family: inherit;
    font-size: 0.7rem;
  }

  .context-menu-item:hover .context-menu-item__shortcut,
  .context-menu-item:focus-visible .context-menu-item__shortcut {
    opacity: 0.85;
  }

  .context-menu-item-separator {
    margin: 0.25rem 0;
    border: none;
    border-top: 1px solid #e9e9ed;
  }
</style>
