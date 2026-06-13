<script lang="ts">
  // Self-contained, props-driven hamburger main menu styled like Excalidraw's
  // dropdown menu. No controller imports — purely props in / callbacks out.
  import PhIcon from '$lib/ui/PhIcon.svelte';

  type MenuItem =
    | { label: string; icon?: string; action: () => void }
    | 'separator';

  interface Props {
    open: boolean;
    onClose: () => void;
    items: MenuItem[];
  }

  const { open, onClose, items }: Props = $props();

  // The menu's own root element — used to distinguish inside vs. outside clicks.
  let menuEl = $state<HTMLElement | null>(null);

  function isSeparator(item: MenuItem): item is 'separator' {
    return item === 'separator';
  }

  function attachMenu(node: HTMLElement): () => void {
    menuEl = node;
    return () => {
      if (menuEl === node) {
        menuEl = null;
      }
    };
  }

  // Collapse leading/duplicate separators so we never render a dangling rule
  // (mirrors Excalidraw's DropdownMenu separator-suppression logic).
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
    if (!open) {
      return;
    }
    // Only intercept Escape; let every other key pass through untouched.
    if (event.key === 'Escape') {
      onClose();
    }
  }

  function onWindowPointerdown(event: PointerEvent): void {
    if (!open) {
      return;
    }
    const target = event.target;
    if (menuEl && target instanceof Node && menuEl.contains(target)) {
      return;
    }
    onClose();
  }
</script>

<svelte:window onkeydown={onWindowKeydown} onpointerdown={onWindowPointerdown} />

{#if open}
  <div class="main-menu" role="menu" aria-label="Main menu" {@attach attachMenu}>
    {#each rendered as item, idx (idx)}
      {#if isSeparator(item)}
        <hr class="main-menu-item-separator" />
      {:else}
        <button
          type="button"
          class="main-menu-item"
          role="menuitem"
          onclick={() => runItem(item)}
        >
          {#if item.icon}
            <span class="main-menu-item__icon" aria-hidden="true">
              <PhIcon name={item.icon} size={16} />
            </span>
          {:else}
            <span class="main-menu-item__icon main-menu-item__icon--empty" aria-hidden="true"></span>
          {/if}
          <span class="main-menu-item__label">{item.label}</span>
        </button>
      {/if}
    {/each}
  </div>
{/if}

<style>
  .main-menu {
    position: fixed;
    top: 64px;
    left: 12px;
    z-index: 100;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0.375rem;
    list-style: none;
    user-select: none;
    cursor: default;
    background-color: #ffffff;
    border: 1px solid #e9e9ed;
    border-radius: 8px;
    box-shadow: 0 3px 10px rgba(0, 0, 0, 0.2);
    color: #1b1b1f;
    font-size: 0.875rem;
    font-family: inherit;
    min-width: 12rem;
  }

  .main-menu-item {
    box-sizing: border-box;
    display: flex;
    align-items: center;
    column-gap: 0.625rem;
    width: 100%;
    margin: 0;
    padding: 0.5rem 0.625rem;
    text-align: start;
    white-space: nowrap;
    background-color: transparent;
    border: none;
    border-radius: 6px;
    color: inherit;
    font-family: inherit;
    font-size: inherit;
    line-height: 1;
    cursor: pointer;
  }

  .main-menu-item:hover,
  .main-menu-item:focus-visible {
    background-color: #f1f0ff;
    color: #1b1b1f;
    outline: none;
  }

  .main-menu-item__icon {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1rem;
    height: 1rem;
  }

  .main-menu-item__icon :global(svg) {
    width: 1rem;
    height: 1rem;
  }

  .main-menu-item__icon--empty {
    visibility: hidden;
  }

  .main-menu-item__label {
    flex: 1 1 auto;
    justify-self: start;
  }

  .main-menu-item-separator {
    margin: 0.375rem 0;
    border: none;
    border-top: 1px solid #e9e9ed;
  }
</style>
