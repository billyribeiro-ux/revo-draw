<script lang="ts">
  // Embed-link dialog (excalidraw embeddable). Prompts for a URL to embed; on
  // submit the controller validates + normalizes it (getEmbedLink). Cancel removes
  // the placeholder. Props-driven.
  import { tick } from 'svelte';

  interface Props {
    onSubmit: (url: string) => boolean;
    onCancel: () => void;
  }

  const { onSubmit, onCancel }: Props = $props();

  let url = $state('');
  let input = $state<HTMLInputElement>();

  $effect(() => {
    void tick().then(() => input?.focus());
  });

  function submit(): void {
    if (url.trim()) {
      onSubmit(url);
    }
  }

  function onKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  }
</script>

<div
  class="embed-backdrop"
  role="presentation"
  onclick={(e) => {
    if (e.target === e.currentTarget) onCancel();
  }}
>
  <div class="embed-dialog" role="dialog" aria-modal="true" aria-label="Embed a link">
    <h2 class="embed-title">Embed a link</h2>
    <p class="embed-hint">Paste a YouTube, Vimeo, or any embeddable page URL.</p>
    <input
      bind:this={input}
      bind:value={url}
      class="embed-input"
      type="url"
      placeholder="https://…"
      aria-label="URL to embed"
      onkeydown={onKeydown}
    />
    <div class="embed-actions">
      <button type="button" class="embed-cancel" onclick={onCancel}>Cancel</button>
      <button type="button" class="embed-submit" disabled={!url.trim()} onclick={submit}>
        Embed
      </button>
    </div>
  </div>
</div>

<style>
  .embed-backdrop {
    position: fixed;
    inset: 0;
    z-index: 32;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.35);
  }

  .embed-dialog {
    width: min(440px, 92vw);
    padding: 20px;
    background: #ffffff;
    border-radius: 12px;
    box-shadow: 0 8px 40px rgba(0, 0, 0, 0.24);
    font-family:
      'Assistant', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
    color: #1b1b1f;
  }

  .embed-title {
    margin: 0 0 4px;
    font-size: 18px;
  }

  .embed-hint {
    margin: 0 0 14px;
    color: #868e96;
    font-size: 13px;
  }

  .embed-input {
    width: 100%;
    box-sizing: border-box;
    padding: 10px 12px;
    border: 1px solid #ced4da;
    border-radius: 8px;
    font: inherit;
    font-size: 15px;
    outline: none;
  }
  .embed-input:focus {
    border-color: #6965db;
  }

  .embed-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 16px;
  }

  .embed-cancel,
  .embed-submit {
    padding: 8px 16px;
    border-radius: 8px;
    font: inherit;
    font-size: 14px;
    cursor: pointer;
  }
  .embed-cancel {
    border: 1px solid #ced4da;
    background: transparent;
    color: #495057;
  }
  .embed-submit {
    border: 1px solid #6965db;
    background: #6965db;
    color: #ffffff;
  }
  .embed-submit:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  :global(.excalidraw.theme--dark) .embed-dialog {
    background: #232329;
    color: #e3e3e8;
  }
  :global(.excalidraw.theme--dark) .embed-input {
    background: #2a2a31;
    border-color: #2e2e36;
    color: #e3e3e8;
  }
</style>
