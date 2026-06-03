<script lang="ts">
  // Self-contained "Save as image" dialog, faithful to Excalidraw's export modal.
  // Props-driven: receives `open` + `onClose` + two export callbacks via $props() — no
  // controller/EditorPreview imports. Centered modal over a dim backdrop; backdrop click
  // or Escape calls onClose.

  interface Props {
    open: boolean;
    onClose: () => void;
    onExportPng: () => void;
    onExportSvg: () => void;
  }

  const { open, onClose, onExportPng, onExportSvg }: Props = $props();

  function onKeydown(event: KeyboardEvent): void {
    if (open && event.key === 'Escape') {
      event.stopPropagation();
      onClose();
    }
  }

  function pick(fn: () => void): void {
    fn();
    onClose();
  }
</script>

<svelte:window onkeydown={onKeydown} />

{#if open}
  <div class="exp-backdrop" role="presentation" onclick={onClose}>
    <div
      class="exp-dialog"
      role="dialog"
      aria-modal="true"
      aria-label="Save as image"
      tabindex="-1"
      onclick={(event) => event.stopPropagation()}
      onkeydown={(event) => event.stopPropagation()}
    >
      <header class="exp-header">
        <h2 class="exp-title">Save as image</h2>
        <button type="button" class="exp-close" aria-label="Close" onclick={onClose}>
          &times;
        </button>
      </header>

      <div class="exp-body">
        <button type="button" class="exp-card" onclick={() => pick(onExportPng)}>
          <span class="exp-card-fmt">PNG</span>
          <span class="exp-card-desc">Raster image (transparent or background)</span>
        </button>
        <button type="button" class="exp-card" onclick={() => pick(onExportSvg)}>
          <span class="exp-card-fmt">SVG</span>
          <span class="exp-card-desc">Scalable vector (preserves hand-drawn strokes)</span>
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .exp-backdrop {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2rem 1rem;
    background: rgba(0, 0, 0, 0.5);
  }
  .exp-dialog {
    display: flex;
    flex-direction: column;
    width: min(440px, 100%);
    overflow: hidden;
    background: var(--exp-bg, #ffffff);
    color: var(--exp-fg, #1b1b1f);
    border-radius: 12px;
    box-shadow: 0 14px 40px rgba(0, 0, 0, 0.35);
    font-family:
      Assistant, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  }
  .exp-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid #ececf1;
  }
  .exp-title {
    margin: 0;
    font-size: 16px;
    font-weight: 700;
  }
  .exp-close {
    border: 0;
    background: transparent;
    font-size: 22px;
    line-height: 1;
    cursor: pointer;
    color: inherit;
  }
  .exp-body {
    display: flex;
    gap: 12px;
    padding: 20px;
  }
  .exp-card {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 6px;
    align-items: flex-start;
    text-align: left;
    padding: 16px;
    border: 1px solid #d6d6e0;
    border-radius: 10px;
    background: #f8f8fb;
    cursor: pointer;
    transition: border-color 0.12s ease, background 0.12s ease;
  }
  .exp-card:hover {
    border-color: #6965db;
    background: #f0f0fe;
  }
  .exp-card-fmt {
    font-size: 18px;
    font-weight: 700;
  }
  .exp-card-desc {
    font-size: 12px;
    color: #6b6b76;
  }
</style>
