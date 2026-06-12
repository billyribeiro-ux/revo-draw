<script lang="ts">
  // Transient status toast, ported from excalidraw-master Toast.tsx. Auto-dismisses
  // after `duration` ms (default 5000; pause on hover); pass duration=Infinity to
  // keep it open. Mirrors the bottom-center island styling.

  interface Props {
    message: string;
    duration?: number;
    closable?: boolean;
    onClose: () => void;
  }

  const { message, duration = 5000, closable = false, onClose }: Props = $props();

  // plain (non-reactive) handle — the timer id must NOT be $state or it perturbs
  // the effect scheduler
  let timer: ReturnType<typeof setTimeout> | null = null;
  const shouldAutoClose = $derived(duration !== Infinity);

  function schedule(): void {
    if (!shouldAutoClose) {
      return;
    }
    clear();
    timer = setTimeout(() => onClose(), duration);
  }

  function clear(): void {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  // (re)schedule whenever the message changes. The teardown (`clear`) runs before
  // each re-run AND on unmount (per the $effect lifecycle), so no separate
  // onDestroy is needed.
  $effect(() => {
    // reference `message` so the effect re-runs on each new toast
    void message;
    schedule();
    return clear;
  });
</script>

<div
  class="Toast"
  role="status"
  aria-live="polite"
  onmouseenter={clear}
  onmouseleave={schedule}
>
  <p class="Toast__message">{message}</p>
  {#if closable}
    <button type="button" class="Toast__close" aria-label="Close" onclick={onClose}>
      ✕
    </button>
  {/if}
</div>

<style>
  .Toast {
    position: fixed;
    bottom: 60px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 6;
    display: flex;
    align-items: center;
    gap: 10px;
    max-width: 520px;
    padding: 10px 16px;
    border-radius: 10px;
    border: 1px solid #e9ecef;
    background: #ffffff;
    color: #1b1b1f;
    box-shadow:
      0 1px 4px rgba(0, 0, 0, 0.08),
      0 6px 18px rgba(0, 0, 0, 0.12);
    font-family:
      'Assistant', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
    animation: toast-in 0.16s ease;
  }

  :global(.excalidraw.theme--dark) .Toast {
    background: #232329;
    color: #e3e3e8;
    border-color: #2e2e36;
  }

  .Toast__message {
    margin: 0;
    white-space: pre-wrap;
  }

  .Toast__close {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    padding: 0;
    color: inherit;
    background: transparent;
    border: 0;
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
  }

  .Toast__close:hover {
    background: rgba(0, 0, 0, 0.06);
  }

  @keyframes toast-in {
    from {
      opacity: 0;
      transform: translate(-50%, 8px);
    }
    to {
      opacity: 1;
      transform: translate(-50%, 0);
    }
  }
</style>
