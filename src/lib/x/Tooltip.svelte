<script lang="ts">
  // Styled tooltip, ported from excalidraw-master Tooltip.tsx. Wraps its children
  // and shows a dark label (+ optional shortcut keycap) on hover/focus. CSS-driven
  // (no JS positioning) — appears above the wrapped control, centered.
  import type { Snippet } from 'svelte';

  interface Props {
    label: string;
    /** optional shortcut text rendered as a keycap, e.g. "R" or "⌘C" */
    shortcut?: string;
    children: Snippet;
  }

  const { label, shortcut, children }: Props = $props();
</script>

<span class="tooltip-wrap">
  {@render children()}
  <span class="tooltip" role="tooltip">
    <span class="tooltip-label">{label}</span>
    {#if shortcut}<span class="tooltip-shortcut">{shortcut}</span>{/if}
  </span>
</span>

<style>
  .tooltip-wrap {
    position: relative;
    display: inline-flex;
  }

  .tooltip {
    position: absolute;
    bottom: calc(100% + 8px);
    left: 50%;
    transform: translateX(-50%);
    z-index: 10;
    display: flex;
    align-items: center;
    gap: 6px;
    width: max-content;
    max-width: 220px;
    padding: 5px 8px;
    border-radius: 6px;
    background: #30303a;
    color: #ffffff;
    font-family:
      'Assistant', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
    font-size: 12px;
    line-height: 1.4;
    white-space: nowrap;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.1s ease;
  }

  /* little arrow */
  .tooltip::after {
    content: '';
    position: absolute;
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    border: 4px solid transparent;
    border-top-color: #30303a;
  }

  .tooltip-wrap:hover .tooltip,
  .tooltip-wrap:focus-within .tooltip {
    opacity: 1;
  }

  .tooltip-shortcut {
    padding: 1px 5px;
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.18);
    font-size: 11px;
  }
</style>
