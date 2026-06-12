<script lang="ts">
  // Command palette, ported from excalidraw-master CommandPalette/. A searchable
  // modal list of every editor action: type to filter, ↑/↓ to move, Enter to run,
  // Esc to close. Props-driven (the command list is assembled by the parent).

  export interface Command {
    label: string;
    shortcut?: string;
    /** group heading, e.g. "Tools", "Edit", "View" */
    group: string;
    run: () => void;
  }

  interface Props {
    commands: Command[];
    onClose: () => void;
  }

  const { commands, onClose }: Props = $props();

  let query = $state('');
  // raw selection intent; the rendered index is clamped to the filtered list via
  // `active` ($derived) so we never write state inside an $effect (scheduler-safe).
  let activeRaw = $state(0);

  // case-insensitive substring filter; preserves the source order (grouped)
  const filtered = $derived(
    query.trim() === ''
      ? commands
      : commands.filter((c) =>
          `${c.group} ${c.label}`.toLowerCase().includes(query.trim().toLowerCase())
        )
  );

  // clamp at read-time — no effect writes state
  const active = $derived(Math.min(activeRaw, Math.max(0, filtered.length - 1)));

  // autofocus the search box on mount (attachment = the Svelte 5 element-lifecycle
  // idiom; reads no reactive state so it runs exactly once)
  const autofocus = (node: HTMLInputElement) => {
    node.focus();
  };

  function run(cmd: Command): void {
    onClose();
    cmd.run();
  }

  function onKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeRaw = Math.min(active + 1, filtered.length - 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeRaw = Math.max(active - 1, 0);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const cmd = filtered[active];
      if (cmd) {
        run(cmd);
      }
    }
  }
</script>

<div
  class="cmdp-backdrop"
  role="presentation"
  onclick={(e) => {
    if (e.target === e.currentTarget) onClose();
  }}
>
  <div class="cmdp" role="dialog" aria-modal="true" aria-label="Command palette">
    <input
      {@attach autofocus}
      bind:value={query}
      class="cmdp-input"
      type="text"
      placeholder="Search for a command…"
      aria-label="Search for a command"
      spellcheck="false"
      autocomplete="off"
      onkeydown={onKeydown}
    />
    <div class="cmdp-list" role="listbox" aria-label="Commands">
      {#if filtered.length === 0}
        <div class="cmdp-empty">No matching commands</div>
      {/if}
      {#each filtered as cmd, i (cmd.group + cmd.label)}
        {#if i === 0 || filtered[i - 1].group !== cmd.group}
          <div class="cmdp-group">{cmd.group}</div>
        {/if}
        <button
          type="button"
          class="cmdp-item"
          class:active={i === active}
          role="option"
          aria-selected={i === active}
          onmousemove={() => (activeRaw = i)}
          onclick={() => run(cmd)}
        >
          <span class="cmdp-label">{cmd.label}</span>
          {#if cmd.shortcut}<span class="cmdp-shortcut">{cmd.shortcut}</span>{/if}
        </button>
      {/each}
    </div>
  </div>
</div>

<style>
  .cmdp-backdrop {
    position: fixed;
    inset: 0;
    z-index: 30;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: 12vh;
    background: rgba(0, 0, 0, 0.3);
  }

  .cmdp {
    width: min(560px, 92vw);
    max-height: 64vh;
    display: flex;
    flex-direction: column;
    background: #ffffff;
    border: 1px solid #e9ecef;
    border-radius: 12px;
    box-shadow: 0 8px 40px rgba(0, 0, 0, 0.24);
    overflow: hidden;
    font-family:
      'Assistant', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  }

  .cmdp-input {
    padding: 14px 16px;
    border: 0;
    border-bottom: 1px solid #f1f3f5;
    background: transparent;
    color: #1b1b1f;
    font: inherit;
    font-size: 16px;
    outline: none;
  }

  .cmdp-list {
    overflow-y: auto;
    padding: 6px;
  }

  .cmdp-group {
    padding: 8px 10px 4px;
    color: #868e96;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .cmdp-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    width: 100%;
    padding: 9px 10px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: #1b1b1f;
    font: inherit;
    font-size: 14px;
    text-align: left;
    cursor: pointer;
  }

  .cmdp-item.active {
    background: #6965db;
    color: #ffffff;
  }

  .cmdp-shortcut {
    font-size: 12px;
    opacity: 0.7;
  }

  .cmdp-empty {
    padding: 18px;
    color: #868e96;
    text-align: center;
    font-size: 14px;
  }

  :global(.excalidraw.theme--dark) .cmdp {
    background: #232329;
    border-color: #2e2e36;
  }
  :global(.excalidraw.theme--dark) .cmdp-input,
  :global(.excalidraw.theme--dark) .cmdp-item {
    color: #e3e3e8;
  }
  :global(.excalidraw.theme--dark) .cmdp-input {
    border-bottom-color: #2e2e36;
  }
</style>
