<script lang="ts">
  // Welcome screen overlay, ported from excalidraw-master welcome-screen/. Shown on
  // an empty canvas: a centered heading + getting-started actions, plus the three
  // arrow hints (menu top-left, toolbar top-center, help bottom-right). Strings are
  // Excalidraw's English defaults (i18n out of scope). Pointer-events pass through
  // except on the action buttons, so the canvas underneath stays interactive.

  interface Props {
    onOpen: () => void;
    onHelp: () => void;
  }

  const { onOpen, onHelp }: Props = $props();
</script>

<div class="welcome" aria-hidden="false">
  <!-- top-left: points at the menu -->
  <div class="hint hint-menu">
    <span class="hint-arrow">↖</span>
    <span>Export, preferences, and more...</span>
  </div>

  <!-- top-center: points at the toolbar -->
  <div class="hint hint-toolbar">
    <span class="hint-arrow">↑</span>
    <span>Pick a tool &amp; Start drawing!</span>
  </div>

  <!-- bottom-right: points at the help button -->
  <div class="hint hint-help">
    <span>Shortcuts &amp; help</span>
  </div>

  <!-- center island -->
  <div class="center">
    <div class="logo">✏️ revo-draw</div>
    <p class="heading">Diagrams. Made. Simple.</p>
    <div class="menu">
      <button type="button" class="welcome-item" onclick={onOpen}>
        <span class="welcome-icon" aria-hidden="true">📂</span>
        <span>Open</span>
      </button>
      <button type="button" class="welcome-item" onclick={onHelp}>
        <span class="welcome-icon" aria-hidden="true">⌨</span>
        <span>Keyboard shortcuts</span>
      </button>
    </div>
  </div>
</div>

<style>
  .welcome {
    position: fixed;
    inset: 0;
    z-index: 1;
    pointer-events: none;
    color: #adb5bd;
    font-family:
      'Assistant', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  }

  .hint {
    position: absolute;
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 15px;
  }

  .hint-arrow {
    font-size: 18px;
  }

  /* the toolbar sits top-center; menu top-left; help bottom-right */
  .hint-menu {
    top: 58px;
    left: 18px;
  }
  .hint-toolbar {
    top: 64px;
    left: 50%;
    transform: translateX(-50%);
    flex-direction: column;
    gap: 2px;
    text-align: center;
  }
  .hint-help {
    right: 18px;
    bottom: 18px;
  }

  .center {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    text-align: center;
  }

  .logo {
    font-size: 26px;
    font-weight: 600;
    color: #495057;
  }

  .heading {
    margin: 0 0 8px;
    font-size: 16px;
  }

  .menu {
    display: flex;
    flex-direction: column;
    gap: 4px;
    pointer-events: auto;
  }

  .welcome-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 14px;
    min-width: 220px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: #495057;
    font: inherit;
    font-size: 15px;
    cursor: pointer;
    transition: background 0.1s ease;
  }

  .welcome-item:hover {
    background: rgba(0, 0, 0, 0.05);
  }

  :global(.excalidraw.theme--dark) .welcome {
    color: #6c6c75;
  }
  :global(.excalidraw.theme--dark) .logo,
  :global(.excalidraw.theme--dark) .welcome-item {
    color: #b8b8c0;
  }
  :global(.excalidraw.theme--dark) .welcome-item:hover {
    background: rgba(255, 255, 255, 0.06);
  }
</style>
