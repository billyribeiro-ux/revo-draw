<script lang="ts">
  // Self-contained keyboard-shortcuts help dialog, faithful to Excalidraw's
  // HelpDialog (packages/excalidraw/components/HelpDialog.tsx). Props-driven:
  // receives `open` + `onClose` via $props() — no controller/EditorPreview
  // imports. Renders a centered modal over a dim backdrop; backdrop click or
  // Escape calls onClose. Shortcut rows are grouped into "islands" (Tools /
  // View / Editor) with small <kbd>-styled key chips.

  interface Props {
    open: boolean;
    onClose: () => void;
  }

  const { open, onClose }: Props = $props();

  // A single shortcut: a human label plus one or more key-combos. Each combo is
  // an array of individual chips. `isOr` controls whether combos are joined by
  // "or" (alternative bindings) vs. juxtaposed (a sequence).
  interface Shortcut {
    label: string;
    combos: string[][];
    isOr?: boolean;
  }

  interface Island {
    caption: string;
    shortcuts: Shortcut[];
  }

  // Ctrl on win/linux, Cmd on mac. Detect platform once for chip labels; this
  // is display-only so a heuristic is fine (no behaviour depends on it).
  const isMac =
    typeof navigator !== 'undefined' &&
    /Mac|iPod|iPhone|iPad/.test(navigator.platform);
  const CMD = isMac ? 'Cmd' : 'Ctrl';

  const toolIsland: Island = {
    caption: 'Tools',
    shortcuts: [
      { label: 'Hand (panning tool)', combos: [['H']] },
      { label: 'Selection', combos: [['V'], ['1']] },
      { label: 'Rectangle', combos: [['R'], ['2']] },
      { label: 'Diamond', combos: [['D'], ['3']] },
      { label: 'Ellipse', combos: [['O'], ['4']] },
      { label: 'Arrow', combos: [['A'], ['5']] },
      { label: 'Line', combos: [['L'], ['6']] },
      { label: 'Draw', combos: [['P'], ['7']] },
      { label: 'Text', combos: [['T'], ['8']] },
      { label: 'Insert image', combos: [['9']] },
      { label: 'Eraser', combos: [['E'], ['0']] },
      { label: 'Frame tool', combos: [['F']] },
      { label: 'Laser pointer', combos: [['K']] },
      { label: 'Pick color', combos: [['I'], ['Shift', 'S'], ['Shift', 'G']] },
      { label: 'Edit line/arrow points', combos: [[CMD, 'Enter']] },
      { label: 'Edit text / add label', combos: [['Enter']] },
      {
        label: 'New line (text editor)',
        combos: [['Enter'], ['Shift', 'Enter']]
      },
      {
        label: 'Finish editing (text editor)',
        combos: [['Esc'], [CMD, 'Enter']]
      },
      {
        label: 'Curved arrow',
        combos: [['A'], ['Click'], ['Click'], ['Click']],
        isOr: false
      },
      {
        label: 'Curved line',
        combos: [['L'], ['Click'], ['Click'], ['Click']],
        isOr: false
      },
      { label: 'Keep selected tool active', combos: [['Q']] },
      { label: 'Prevent binding arrow', combos: [[CMD]] },
      { label: 'Add/update link', combos: [[CMD, 'K']] }
    ]
  };

  const viewIsland: Island = {
    caption: 'View',
    shortcuts: [
      { label: 'Zoom in', combos: [[CMD, '+']] },
      { label: 'Zoom out', combos: [[CMD, '-']] },
      { label: 'Reset zoom', combos: [[CMD, '0']] },
      { label: 'Zoom to fit all elements', combos: [['Shift', '1']] },
      { label: 'Zoom to selection', combos: [['Shift', '2']] },
      { label: 'Move page up/down', combos: [['PgUp', '/', 'PgDn']] },
      {
        label: 'Move page left/right',
        combos: [['Shift', 'PgUp', '/', 'PgDn']]
      },
      { label: 'Zen mode', combos: [['Alt', 'Z']] },
      { label: 'Toggle snapping', combos: [['Alt', 'S']] },
      { label: 'Show grid', combos: [[CMD, "'"]] },
      { label: 'View mode', combos: [['Alt', 'R']] },
      { label: 'Toggle theme', combos: [['Alt', 'Shift', 'D']] },
      { label: 'Stats for nerds', combos: [['Alt', '/']] },
      { label: 'Find on canvas', combos: [[CMD, 'F']] },
      { label: 'Command palette', combos: [[CMD, '/'], [CMD, 'P']] }
    ]
  };

  const editorIsland: Island = {
    caption: 'Editor',
    shortcuts: [
      { label: 'Move canvas', combos: [['Space', 'drag'], ['Wheel', 'drag']] },
      { label: 'Clear canvas', combos: [[CMD, 'Delete']] },
      { label: 'Delete', combos: [['Delete']] },
      { label: 'Cut', combos: [[CMD, 'X']] },
      { label: 'Copy', combos: [[CMD, 'C']] },
      { label: 'Paste', combos: [[CMD, 'V']] },
      { label: 'Paste as plaintext', combos: [[CMD, 'Shift', 'V']] },
      { label: 'Select all', combos: [[CMD, 'A']] },
      { label: 'Add to selection', combos: [['Shift', 'Click']] },
      { label: 'Deep select', combos: [[CMD, 'Click']] },
      { label: 'Deep select within box', combos: [[CMD, 'drag']] },
      { label: 'Copy to clipboard as PNG', combos: [['Shift', 'Alt', 'C']] },
      { label: 'Copy styles', combos: [[CMD, 'Alt', 'C']] },
      { label: 'Paste styles', combos: [[CMD, 'Alt', 'V']] },
      {
        label: 'Send to back',
        combos: [isMac ? [CMD, 'Alt', '['] : [CMD, 'Shift', '[']]
      },
      {
        label: 'Bring to front',
        combos: [isMac ? [CMD, 'Alt', ']'] : [CMD, 'Shift', ']']]
      },
      { label: 'Send backward', combos: [[CMD, '[']] },
      { label: 'Bring forward', combos: [[CMD, ']']] },
      { label: 'Align top', combos: [[CMD, 'Shift', 'Up']] },
      { label: 'Align bottom', combos: [[CMD, 'Shift', 'Down']] },
      { label: 'Align left', combos: [[CMD, 'Shift', 'Left']] },
      { label: 'Align right', combos: [[CMD, 'Shift', 'Right']] },
      { label: 'Duplicate', combos: [[CMD, 'D'], ['Alt', 'drag']] },
      { label: 'Toggle element lock', combos: [[CMD, 'Shift', 'L']] },
      { label: 'Undo', combos: [[CMD, 'Z']] },
      { label: 'Redo', combos: [[CMD, 'Shift', 'Z']] },
      { label: 'Group selection', combos: [[CMD, 'G']] },
      { label: 'Ungroup selection', combos: [[CMD, 'Shift', 'G']] },
      { label: 'Flip horizontal', combos: [['Shift', 'H']] },
      { label: 'Flip vertical', combos: [['Shift', 'V']] },
      { label: 'Show/hide stroke color', combos: [['S']] },
      { label: 'Show/hide background', combos: [['G']] },
      { label: 'Decrease font size', combos: [[CMD, 'Shift', '<']] },
      { label: 'Increase font size', combos: [[CMD, 'Shift', '>']] }
    ]
  };

  const islands: Island[] = [toolIsland, viewIsland, editorIsland];

  function onKeydown(event: KeyboardEvent): void {
    if (open && event.key === 'Escape') {
      event.stopPropagation();
      onClose();
    }
  }

  function onBackdropClick(): void {
    onClose();
  }
</script>

<svelte:window onkeydown={onKeydown} />

{#if open}
  <div
    class="help-backdrop"
    role="presentation"
    onclick={onBackdropClick}
  >
    <div
      class="help-dialog"
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
      tabindex="-1"
      onclick={(event) => event.stopPropagation()}
      onkeydown={(event) => event.stopPropagation()}
    >
      <header class="help-header">
        <h2 class="help-title">Help</h2>
        <button
          type="button"
          class="help-close"
          aria-label="Close"
          onclick={onClose}
        >
          &times;
        </button>
      </header>

      <div class="help-body">
        <h3 class="help-section-title">Keyboard shortcuts</h3>
        <div class="help-islands">
          {#each islands as island (island.caption)}
            <section class="help-island">
              <h4 class="help-island-title">{island.caption}</h4>
              <div class="help-island-content">
                {#each island.shortcuts as shortcut (shortcut.label)}
                  <div class="help-shortcut">
                    <span class="help-shortcut-label">{shortcut.label}</span>
                    <span class="help-keys">
                      {#each shortcut.combos as combo, comboIndex (comboIndex)}
                        {#if comboIndex > 0 && shortcut.isOr !== false}
                          <span class="help-or">or</span>
                        {/if}
                        <span class="help-combo">
                          {#each combo as key (key)}
                            <kbd class="help-key">{key}</kbd>
                          {/each}
                        </span>
                      {/each}
                    </span>
                  </div>
                {/each}
              </div>
            </section>
          {/each}
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .help-backdrop {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2rem 1rem;
    background: rgba(0, 0, 0, 0.5);
  }

  .help-dialog {
    display: flex;
    flex-direction: column;
    width: min(960px, 100%);
    max-height: 85vh;
    overflow: hidden;
    background: var(--help-bg, #ffffff);
    color: var(--help-fg, #1b1b1f);
    border-radius: 12px;
    box-shadow: 0 14px 40px rgba(0, 0, 0, 0.35);
    font-family:
      Assistant, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  }

  .help-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.25rem;
    border-bottom: 1px solid var(--help-border, #e9ecef);
  }

  .help-title {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 700;
  }

  .help-close {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    padding: 0;
    font-size: 1.5rem;
    line-height: 1;
    color: inherit;
    cursor: pointer;
    background: transparent;
    border: none;
    border-radius: 8px;
  }

  .help-close:hover {
    background: var(--help-hover, #f1f3f5);
  }

  .help-body {
    padding: 1rem 1.25rem 1.5rem;
    overflow-y: auto;
  }

  .help-section-title {
    margin: 0 0 0.75rem;
    font-size: 1rem;
    font-weight: 700;
  }

  .help-islands {
    column-width: 280px;
    column-gap: 1.25rem;
  }

  .help-island {
    display: inline-block;
    width: 100%;
    margin: 0 0 1.25rem;
    padding: 0.75rem 1rem;
    background: var(--help-island-bg, #f8f9fa);
    border-radius: 10px;
    break-inside: avoid;
  }

  .help-island-title {
    margin: 0 0 0.5rem;
    font-size: 0.95rem;
    font-weight: 700;
  }

  .help-island-content {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .help-shortcut {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.2rem 0;
    font-size: 0.8rem;
  }

  .help-shortcut-label {
    flex: 1 1 auto;
    min-width: 0;
  }

  .help-keys {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: 0.2rem;
    flex-shrink: 0;
  }

  .help-combo {
    display: inline-flex;
    align-items: center;
    gap: 0.15rem;
  }

  .help-or {
    font-size: 0.7rem;
    color: var(--help-muted, #868e96);
  }

  .help-key {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 1.4rem;
    height: 1.4rem;
    padding: 0 0.35rem;
    font-family: inherit;
    font-size: 0.7rem;
    font-weight: 600;
    line-height: 1;
    color: inherit;
    background: var(--help-key-bg, #ffffff);
    border: 1px solid var(--help-key-border, #ced4da);
    border-radius: 5px;
    box-shadow: 0 1px 0 var(--help-key-border, #ced4da);
  }
</style>
