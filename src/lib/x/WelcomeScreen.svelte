<script lang="ts">
  import PhIcon from '$lib/ui/PhIcon.svelte';

  // Empty-canvas welcome screen, aligned with Excalidraw's WelcomeScreen.Center
  // and WelcomeScreen.Hints structure while keeping revo-draw's local-first copy.
  interface Props {
    onOpen: () => void;
    onHelp: () => void;
  }

  const { onOpen, onHelp }: Props = $props();
</script>

<section class="welcome" aria-label="Welcome screen">
  <div class="hint hint-menu">
    <svg width="41" height="94" viewBox="0 0 41 94" fill="none" aria-hidden="true">
      <path
        d="M38.5 83.5c-14-2-17.833-10.473-21-22.5C14.333 48.984 12 22 12 12.5"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
      />
      <path
        fill-rule="evenodd"
        clip-rule="evenodd"
        d="m12.005 10.478 7.905 14.423L6 25.75l6.005-15.273Z"
        fill="currentColor"
      />
      <path
        d="M12.005 10.478c1.92 3.495 3.838 7 7.905 14.423m-7.905-14.423c3.11 5.683 6.23 11.368 7.905 14.423m0 0c-3.68.226-7.35.455-13.91.85m13.91-.85c-5.279.33-10.566.647-13.91.85m0 0c1.936-4.931 3.882-9.86 6.005-15.273M6 25.75c2.069-5.257 4.135-10.505 6.005-15.272"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
      />
    </svg>
    <span>Export, preferences, and more...</span>
  </div>

  <div class="hint hint-toolbar">
    <span>Pick a tool &amp; start drawing!</span>
    <svg width="38" height="78" viewBox="0 0 38 78" fill="none" aria-hidden="true">
      <path
        d="M1 77c14-2 31.833-11.973 35-24 3.167-12.016-6-35-9.5-43.5"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
      />
      <path
        fill-rule="evenodd"
        clip-rule="evenodd"
        d="m24.165 1.093-2.132 16.309 13.27-4.258-11.138-12.05Z"
        fill="currentColor"
      />
      <path
        d="M24.165 1.093c-.522 3.953-1.037 7.916-2.132 16.309m2.131-16.309c-.835 6.424-1.68 12.854-2.13 16.308m0 0c3.51-1.125 7.013-2.243 13.27-4.257m-13.27 4.257c5.038-1.608 10.08-3.232 13.27-4.257m0 0c-3.595-3.892-7.197-7.777-11.14-12.05m11.14 12.05c-3.837-4.148-7.667-8.287-11.14-12.05"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
      />
    </svg>
  </div>

  <div class="hint hint-help">
    <span>Shortcuts &amp; help</span>
    <svg width="85" height="71" viewBox="0 0 85 71" fill="none" aria-hidden="true">
      <path
        d="M18.026 1.232c-5.268 13.125-5.548 33.555 3.285 42.311 8.823 8.75 33.31 12.304 42.422 13.523"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
      />
      <path
        fill-rule="evenodd"
        clip-rule="evenodd"
        d="m72.181 59.247-13.058-10-2.948 13.62 16.006-3.62Z"
        fill="currentColor"
      />
      <path
        d="M72.181 59.247c-3.163-2.429-6.337-4.856-13.058-10m13.058 10c-5.145-3.936-10.292-7.882-13.058-10m0 0c-.78 3.603-1.563 7.196-2.948 13.62m2.948-13.62c-1.126 5.168-2.24 10.346-2.948 13.62m0 0c5.168-1.166 10.334-2.343 16.006-3.62m-16.006 3.62c5.51-1.248 11.01-2.495 16.006-3.62"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
      />
    </svg>
  </div>

  <div class="center">
    <div class="logo">
      <span class="logo-mark" aria-hidden="true">
        <span class="logo-mark-stroke logo-mark-stroke-a"></span>
        <span class="logo-mark-stroke logo-mark-stroke-b"></span>
        <span class="logo-mark-stroke logo-mark-stroke-c"></span>
      </span>
      <span class="logo-wordmark">revo-draw</span>
    </div>

    <div class="copy">
      <p class="heading">Diagrams. Made. Simple.</p>
      <p class="local-note">All your data is saved locally on this Mac.</p>
    </div>

    <div class="menu">
      <button type="button" class="welcome-item" onclick={onOpen}>
        <span class="welcome-icon"><PhIcon name="open" size={18} /></span>
        <span class="welcome-label">Open...</span>
        <span class="welcome-shortcut">Cmd O</span>
      </button>
      <button type="button" class="welcome-item" onclick={onHelp}>
        <span class="welcome-icon"><PhIcon name="keyboard" size={18} /></span>
        <span class="welcome-label">Keyboard shortcuts</span>
        <span class="welcome-shortcut">?</span>
      </button>
    </div>
  </div>
</section>

<style>
  .welcome {
    position: fixed;
    inset: 0;
    z-index: 1;
    pointer-events: none;
    color: var(--color-gray-40);
    font-family:
      'Assistant', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  }

  .hint {
    position: absolute;
    display: flex;
    color: var(--color-gray-40);
    font-size: 1rem;
    line-height: 1.2;
  }

  .hint svg {
    flex: 0 0 auto;
  }

  .hint-menu {
    top: 3.75rem;
    left: 1rem;
    align-items: flex-end;
    gap: 0.5rem;
    max-width: 320px;
  }

  .hint-toolbar {
    top: 3.75rem;
    left: 50%;
    transform: translateX(-50%);
    align-items: baseline;
  }

  .hint-toolbar span {
    position: relative;
    top: -0.5rem;
    width: 124px;
    margin-right: 0.25rem;
    text-align: right;
  }

  .hint-help {
    right: 1.125rem;
    bottom: 2.25rem;
    align-items: flex-start;
    gap: 0.25rem;
  }

  .center {
    position: absolute;
    inset: 1rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2rem;
    text-align: center;
  }

  .logo {
    display: flex;
    align-items: center;
    column-gap: 0.75rem;
    color: var(--color-on-surface);
    font-size: 2.25rem;
  }

  .logo-mark {
    position: relative;
    display: inline-grid;
    place-items: center;
    width: 2.25rem;
    height: 2.25rem;
    color: var(--color-primary);
  }

  .logo-mark::before {
    content: '';
    position: absolute;
    inset: 0.2rem;
    border: 2px solid currentColor;
    border-radius: var(--border-radius-md);
    transform: rotate(-5deg);
  }

  .logo-mark-stroke {
    position: absolute;
    display: block;
    height: 2px;
    border-radius: 999px;
    background: currentColor;
  }

  .logo-mark-stroke-a {
    width: 1.5rem;
    transform: translateY(-0.42rem) rotate(-14deg);
  }

  .logo-mark-stroke-b {
    width: 1.2rem;
    transform: rotate(-14deg);
  }

  .logo-mark-stroke-c {
    width: 0.9rem;
    transform: translateY(0.42rem) rotate(-14deg);
  }

  .logo-wordmark {
    font-weight: 600;
  }

  .copy {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.375rem;
  }

  .heading {
    margin: 0;
    color: var(--color-gray-70);
    font-size: 1.125rem;
    line-height: 1.35rem;
  }

  .local-note {
    max-width: 360px;
    margin: 0;
    color: var(--color-gray-50);
    font-size: 0.875rem;
    line-height: 1.35;
  }

  .menu {
    display: flex;
    flex-direction: column;
    gap: 2px;
    align-items: stretch;
  }

  .welcome-item {
    pointer-events: auto;
    display: grid;
    grid-template-columns: calc(var(--default-icon-size) + 0.5rem) 1fr 3rem;
    align-items: center;
    min-width: 300px;
    max-width: 400px;
    padding: 0.75rem;
    border: 1px solid transparent;
    border-radius: var(--border-radius-md);
    background: transparent;
    color: var(--color-gray-70);
    font: inherit;
    font-size: 0.875rem;
    cursor: pointer;
    transition:
      background 0.12s ease,
      color 0.12s ease;
  }

  .welcome-item:hover,
  .welcome-item:focus-visible {
    background: var(--button-hover-bg);
    color: var(--color-on-surface);
    outline: none;
  }

  .welcome-icon {
    display: inline-flex;
    color: currentColor;
  }

  .welcome-label {
    text-align: left;
  }

  .welcome-shortcut {
    justify-self: end;
    color: var(--keybinding-color);
    font-size: 0.75rem;
  }

  :global(.excalidraw.theme--dark) .welcome {
    color: var(--color-gray-60);
  }

  :global(.excalidraw.theme--dark) .heading,
  :global(.excalidraw.theme--dark) .welcome-item {
    color: var(--color-gray-30);
  }

  :global(.excalidraw.theme--dark) .logo {
    color: var(--color-gray-10);
  }

  :global(.excalidraw.theme--dark) .local-note,
  :global(.excalidraw.theme--dark) .hint {
    color: var(--color-gray-60);
  }

  @media (max-height: 780px) {
    .hint {
      display: none;
    }
  }

  @media (max-width: 1024px) {
    .hint-menu,
    .hint-help {
      display: none;
    }
  }

  @media (max-height: 500px), (max-width: 360px) {
    .center {
      display: none;
    }
  }
</style>
