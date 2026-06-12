<script lang="ts">
  // Contextual hint bar, ported from excalidraw-master HintViewer.tsx. Shows a
  // single tool-/selection-aware tip centered above the toolbar's lower edge. The
  // hint string is computed by the controller (controller.hint); this component is
  // purely presentational.

  interface Props {
    hint: string | null;
  }

  const { hint }: Props = $props();
</script>

{#if hint}
  <div class="HintViewer">
    <span>{hint}</span>
  </div>
{/if}

<style>
  .HintViewer {
    position: fixed;
    top: 76px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 2;
    max-width: 70vw;
    padding: 0 8px;
    color: #868e96;
    font-family:
      'Assistant', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
    font-size: 13px;
    text-align: center;
    pointer-events: none;
    white-space: pre-wrap;
  }

  :global(.excalidraw.theme--dark) .HintViewer {
    color: #8a8a93;
  }
</style>
