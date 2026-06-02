<script lang="ts">
  // Self-contained, props-driven selected-element stats panel styled like an
  // Excalidraw island (top-right). No controller imports, no external deps —
  // purely props in. Read-only display of the selected element's geometry plus
  // the total scene element count.

  interface SelectedStats {
    x: number;
    y: number;
    width: number;
    height: number;
    angle: number;
  }

  interface Props {
    element: SelectedStats | null;
    sceneCount: number;
  }

  const { element, sceneCount }: Props = $props();

  function round(n: number): number {
    return Math.round(n);
  }

  // Excalidraw stores rotation in radians; surface it as whole degrees.
  function toDegrees(angle: number): number {
    return Math.round((angle * 180) / Math.PI);
  }
</script>

<aside class="exc-stats" aria-label="Stats">
  <div class="exc-stats__heading">Stats</div>

  <div class="exc-stats__rows">
    <div class="exc-stats__row">
      <span class="label">Elements</span>
      <span class="value">{sceneCount}</span>
    </div>
  </div>

  {#if element}
    <div class="exc-stats__divider"></div>
    <div class="exc-stats__heading exc-stats__heading--sub">Selected</div>
    <div class="exc-stats__rows">
      <div class="exc-stats__row">
        <span class="label">X</span>
        <span class="value">{round(element.x)}</span>
      </div>
      <div class="exc-stats__row">
        <span class="label">Y</span>
        <span class="value">{round(element.y)}</span>
      </div>
      <div class="exc-stats__row">
        <span class="label">W</span>
        <span class="value">{round(element.width)}</span>
      </div>
      <div class="exc-stats__row">
        <span class="label">H</span>
        <span class="value">{round(element.height)}</span>
      </div>
      <div class="exc-stats__row">
        <span class="label">Angle</span>
        <span class="value">{toDegrees(element.angle)}&deg;</span>
      </div>
    </div>
  {/if}
</aside>

<style>
  .exc-stats {
    width: 184px;
    box-sizing: border-box;
    padding: 12px;
    background: #ffffff;
    border: 1px solid #e9ecef;
    border-radius: 10px;
    box-shadow:
      0 1px 4px rgba(0, 0, 0, 0.06),
      0 4px 12px rgba(0, 0, 0, 0.08);
    font-family:
      Assistant, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    font-size: 12px;
    color: #1b1b1f;
    user-select: none;
  }

  .exc-stats__heading {
    font-size: 13px;
    font-weight: 700;
    margin-bottom: 8px;
  }

  .exc-stats__heading--sub {
    font-size: 12px;
    color: #495057;
    margin-top: 0;
  }

  .exc-stats__divider {
    height: 1px;
    background: #e9ecef;
    margin: 10px 0;
  }

  .exc-stats__rows {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .exc-stats__row {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .label {
    color: #868e96;
    font-size: 12px;
  }

  .value {
    font-family:
      ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    color: #1b1b1f;
  }
</style>
