<script lang="ts">
  // Mermaid → diagram dialog (excalidraw TTDDialog). Paste a Mermaid flowchart,
  // press Insert to convert it to editable elements. Errors from the converter are
  // shown inline. Props-driven: onInsert returns an error string or null.
  import { tick } from 'svelte';

  interface Props {
    onInsert: (source: string) => Promise<string | null>;
    onClose: () => void;
  }

  const { onInsert, onClose }: Props = $props();

  const SAMPLE = `graph TD
  A[Start] --> B{Is it working?}
  B -->|Yes| C[Ship it]
  B -->|No| D[Debug]
  D --> A`;

  let source = $state(SAMPLE);
  let error = $state<string | null>(null);
  let busy = $state(false);
  let area = $state<HTMLTextAreaElement>();

  $effect(() => {
    void tick().then(() => area?.focus());
  });

  async function insert(): Promise<void> {
    if (busy) {
      return;
    }
    busy = true;
    error = await onInsert(source);
    busy = false;
    if (error === null) {
      onClose();
    }
  }

  function onKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void insert();
    }
  }
</script>

<div
  class="mmd-backdrop"
  role="presentation"
  onclick={(e) => {
    if (e.target === e.currentTarget) onClose();
  }}
>
  <div class="mmd-dialog" role="dialog" aria-modal="true" aria-label="Mermaid to diagram">
    <h2 class="mmd-title">Mermaid to diagram</h2>
    <p class="mmd-hint">
      Paste a Mermaid <code>graph TD</code> / <code>flowchart LR</code> definition.
    </p>
    <textarea
      bind:this={area}
      bind:value={source}
      class="mmd-input"
      spellcheck="false"
      aria-label="Mermaid source"
      onkeydown={onKeydown}
    ></textarea>
    {#if error}
      <p class="mmd-error" role="alert">{error}</p>
    {/if}
    <div class="mmd-actions">
      <button type="button" class="mmd-cancel" onclick={onClose}>Cancel</button>
      <button type="button" class="mmd-submit" disabled={busy || !source.trim()} onclick={insert}>
        Insert
      </button>
    </div>
  </div>
</div>

<style>
  .mmd-backdrop {
    position: fixed;
    inset: 0;
    z-index: 32;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.35);
  }

  .mmd-dialog {
    width: min(560px, 94vw);
    padding: 20px;
    background: #ffffff;
    border-radius: 12px;
    box-shadow: 0 8px 40px rgba(0, 0, 0, 0.24);
    color: #1b1b1f;
    font-family:
      'Assistant', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  }

  .mmd-title {
    margin: 0 0 4px;
    font-size: 18px;
  }

  .mmd-hint {
    margin: 0 0 12px;
    color: #868e96;
    font-size: 13px;
  }
  .mmd-hint code {
    padding: 1px 5px;
    border-radius: 4px;
    background: #f1f3f5;
    font-size: 12px;
  }

  .mmd-input {
    width: 100%;
    box-sizing: border-box;
    height: 180px;
    padding: 12px;
    border: 1px solid #ced4da;
    border-radius: 8px;
    font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
    font-size: 13px;
    line-height: 1.5;
    resize: vertical;
    outline: none;
  }
  .mmd-input:focus {
    border-color: #6965db;
  }

  .mmd-error {
    margin: 8px 0 0;
    color: #e03131;
    font-size: 13px;
  }

  .mmd-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 16px;
  }

  .mmd-cancel,
  .mmd-submit {
    padding: 8px 16px;
    border-radius: 8px;
    font: inherit;
    font-size: 14px;
    cursor: pointer;
  }
  .mmd-cancel {
    border: 1px solid #ced4da;
    background: transparent;
    color: #495057;
  }
  .mmd-submit {
    border: 1px solid #6965db;
    background: #6965db;
    color: #ffffff;
  }
  .mmd-submit:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  :global(.excalidraw.theme--dark) .mmd-dialog {
    background: #232329;
    color: #e3e3e8;
  }
  :global(.excalidraw.theme--dark) .mmd-input {
    background: #2a2a31;
    border-color: #2e2e36;
    color: #e3e3e8;
  }
  :global(.excalidraw.theme--dark) .mmd-hint code {
    background: #2a2a31;
  }
</style>
