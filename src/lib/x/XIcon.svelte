<script lang="ts">
  // Svelte-native SVG glyphs used by the `/x` editor. These replace static SVG strings.
  let { name }: { name: string } = $props();
</script>

{#if name === 'selection'}
  <svg aria-hidden="true" focusable="false" role="img" viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round">
    <path stroke="none" d="M0 0h24v24H0z" fill="none" />
    <path d="M6 6l4.153 11.793a0.365 .365 0 0 0 .331 .207a0.366 .366 0 0 0 .332 -.207l2.184 -4.793l4.787 -1.994a0.355 .355 0 0 0 .213 -.323a0.355 .355 0 0 0 -.213 -.323l-11.787 -4.36z" />
    <path d="M13.5 13.5l4.5 4.5" />
  </svg>
{:else if name === 'rectangle'}
  <svg aria-hidden="true" focusable="false" role="img" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path stroke="none" d="M0 0h24v24H0z" fill="none" />
    <rect x="4" y="4" width="16" height="16" rx="2" stroke-width="1.5" />
  </svg>
{:else if name === 'ellipse'}
  <svg aria-hidden="true" focusable="false" role="img" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path stroke="none" d="M0 0h24v24H0z" fill="none" />
    <circle cx="12" cy="12" r="9" stroke-width="1.5" />
  </svg>
{:else if name === 'diamond'}
  <svg aria-hidden="true" focusable="false" role="img" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path stroke="none" d="M0 0h24v24H0z" fill="none" />
    <path stroke-width="1.5" d="M10.5 20.4l-6.9 -6.9c-.781 -.781 -.781 -2.219 0 -3l6.9 -6.9c.781 -.781 2.219 -.781 3 0l6.9 6.9c.781 .781 .781 2.219 0 3l-6.9 6.9c-.781 .781 -2.219 .781 -3 0z" />
  </svg>
{:else if name === 'line'}
  <svg aria-hidden="true" focusable="false" role="img" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
    <path d="M4.167 10h11.666" stroke-width="1.5" />
  </svg>
{:else if name === 'arrow'}
  <svg aria-hidden="true" focusable="false" role="img" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <g stroke-width="1.5">
      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <line x1="5" y1="12" x2="19" y2="12" />
      <line x1="15" y1="16" x2="19" y2="12" />
      <line x1="15" y1="8" x2="19" y2="12" />
    </g>
  </svg>
{:else if name === 'text'}
  <svg aria-hidden="true" focusable="false" role="img" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <g stroke-width="1.5">
      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <line x1="4" y1="20" x2="7" y2="20" />
      <line x1="14" y1="20" x2="21" y2="20" />
      <line x1="6.9" y1="15" x2="13.8" y2="15" />
      <line x1="10.2" y1="6.3" x2="16" y2="20" />
      <polyline points="5 20 11 4 13 4 20 20" />
    </g>
  </svg>
{:else if name === 'freedraw'}
  <svg aria-hidden="true" focusable="false" role="img" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
    <g stroke-width="1.25">
      <path clip-rule="evenodd" d="m7.643 15.69 7.774-7.773a2.357 2.357 0 1 0-3.334-3.334L4.31 12.357a3.333 3.333 0 0 0-.977 2.357v1.953h1.953c.884 0 1.732-.352 2.357-.977Z" />
      <path d="m11.25 5.417 3.333 3.333" />
    </g>
  </svg>
{:else if name === 'image'}
  <svg aria-hidden="true" focusable="false" role="img" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
    <g stroke-width="1.25">
      <path d="M12.5 6.667h.01" />
      <path d="M4.91 2.625h10.18a2.284 2.284 0 0 1 2.285 2.284v10.182a2.284 2.284 0 0 1-2.284 2.284H4.909a2.284 2.284 0 0 1-2.284-2.284V4.909a2.284 2.284 0 0 1 2.284-2.284Z" />
      <path d="m3.333 12.5 3.334-3.333c.773-.745 1.726-.745 2.5 0l4.166 4.166" />
      <path d="m11.667 11.667.833-.834c.774-.744 1.726-.744 2.5 0l1.667 1.667" />
    </g>
  </svg>
{:else if name === 'eraser'}
  <svg aria-hidden="true" focusable="false" role="img" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <g stroke-width="1.5">
      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <path d="M19 20h-10.5l-4.21 -4.3a1 1 0 0 1 0 -1.41l10 -10a1 1 0 0 1 1.41 0l5 5a1 1 0 0 1 0 1.41l-9.2 9.3" />
      <path d="M18 13.3l-6.3 -6.3" />
    </g>
  </svg>
{:else if name === 'frame'}
  <svg aria-hidden="true" focusable="false" role="img" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <g stroke-width="1.5">
      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <path d="M4 7l16 0" />
      <path d="M4 17l16 0" />
      <path d="M7 4l0 16" />
      <path d="M17 4l0 16" />
    </g>
  </svg>
{:else if name === 'laser'}
  <svg aria-hidden="true" focusable="false" role="img" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
    <g stroke-width="1.25" transform="rotate(90 10 10)">
      <path d="m9.644 13.69 7.774-7.773a2.357 2.357 0 0 0-3.334-3.334l-7.773 7.774L8 12l1.643 1.69Z" />
      <path d="m13.25 3.417 3.333 3.333M10 10l2-2M5 15l3-3M2.156 17.894l1-1M5.453 19.029l-.144-1.407M2.377 11.887l.866 1.118M8.354 17.273l-1.194-.758M.953 14.652l1.408.13" />
    </g>
  </svg>
{:else if name === 'hand'}
  <svg aria-hidden="true" focusable="false" role="img" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <g stroke-width="1.25">
      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <path d="M8 13v-7.5a1.5 1.5 0 0 1 3 0v6.5" />
      <path d="M11 5.5v-2a1.5 1.5 0 1 1 3 0v8.5" />
      <path d="M14 5.5a1.5 1.5 0 0 1 3 0v6.5" />
      <path d="M17 7.5a1.5 1.5 0 0 1 3 0v8.5a6 6 0 0 1 -6 6h-2h.208a6 6 0 0 1 -5.012 -2.7a69.74 69.74 0 0 1 -.196 -.3c-.312 -.479 -1.407 -2.388 -3.286 -5.728a1.5 1.5 0 0 1 .536 -2.022a1.867 1.867 0 0 1 2.28 .28l1.47 1.47" />
    </g>
  </svg>
{:else if name === 'lasso'}
  <svg aria-hidden="true" focusable="false" role="img" viewBox="0 0 22 22" fill="none">
    <g stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5">
      <path d="M4.028 13.252c-.657 -.972 -1.028 -2.078 -1.028 -3.252c0 -3.866 4.03 -7 9 -7s9 3.134 9 7s-4.03 7 -9 7c-1.913 0 -3.686 -.464 -5.144 -1.255" />
      <path d="M5 15m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" />
      <path d="M5 17c0 1.42 .316 2.805 1 4" />
    </g>
  </svg>
{:else if name === 'embeddable'}
  <svg aria-hidden="true" focusable="false" role="img" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
    <g stroke-width="1.5">
      <polyline points="12 16 18 10 12 4" />
      <polyline points="8 4 2 10 8 16" />
    </g>
  </svg>
{:else if name === 'fill-hachure'}
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round">
    <path d="M5.879 2.625h8.242a3.254 3.254 0 0 1 3.254 3.254v8.242a3.254 3.254 0 0 1-3.254 3.254H5.88a3.254 3.254 0 0 1-3.254-3.254V5.88a3.254 3.254 0 0 1 3.254-3.254Z" />
    <path d="m6 12 6-6M8.5 14l5.5-5.5M3 11l5-5M6 16l8-8" stroke-width="1" />
  </svg>
{:else if name === 'fill-cross-hatch'}
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round">
    <path d="M5.879 2.625h8.242a3.254 3.254 0 0 1 3.254 3.254v8.242a3.254 3.254 0 0 1-3.254 3.254H5.88a3.254 3.254 0 0 1-3.254-3.254V5.88a3.254 3.254 0 0 1 3.254-3.254Z" />
    <g stroke-width="1">
      <path d="m6 12 6-6M3 11l5-5M6 16l8-8" />
      <path d="m6 6 6 6M3 7l5 5M6 4l8 8" />
    </g>
  </svg>
{:else if name === 'fill-zigzag'}
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round">
    <path d="M5.879 2.625h8.242a3.254 3.254 0 0 1 3.254 3.254v8.242a3.254 3.254 0 0 1-3.254 3.254H5.88a3.254 3.254 0 0 1-3.254-3.254V5.88a3.254 3.254 0 0 1 3.254-3.254Z" />
    <path d="m4 14 3-3-3-3 3-3M9 14l3-3-3-3 3-3" stroke-width="1" />
  </svg>
{:else if name === 'fill-solid'}
  <svg viewBox="0 0 20 20" fill="currentColor" stroke="currentColor" stroke-width="1.25" stroke-linecap="round">
    <path d="M5.879 2.625h8.242a3.254 3.254 0 0 1 3.254 3.254v8.242a3.254 3.254 0 0 1-3.254 3.254H5.88a3.254 3.254 0 0 1-3.254-3.254V5.88a3.254 3.254 0 0 1 3.254-3.254Z" />
  </svg>
{:else if name === 'stroke-solid'}
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
    <path d="M3 10h14" />
  </svg>
{:else if name === 'stroke-dashed'}
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-dasharray="3.5 4">
    <path d="M3 10h14" />
  </svg>
{:else if name === 'stroke-dotted'}
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-dasharray="0.5 3.5">
    <path d="M3 10h14" />
  </svg>
{:else if name === 'sloppiness-0'}
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M3.5 13.5c2.5-5 5-7.5 13-9" />
  </svg>
{:else if name === 'sloppiness-1'}
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M3.5 13.5c2-4 3.8-5.6 6-6.2 1.8-.5 2.4.6 4 .2 1.8-.4 2.4-2 3-3" />
  </svg>
{:else if name === 'sloppiness-2'}
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M3 14c1.5-2 1.6-4 3-4.4 1.4-.4 1.6 1.6 3 1.4 1.4-.2 1.4-2.4 2.6-3 1.2-.6 2 .6 3.4-1.5" />
  </svg>
{:else if name === 'edge-sharp'}
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M4 17V8a4 4 0 0 1 4-4h9" />
  </svg>
{:else if name === 'edge-round'}
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M4 17v-3a10 10 0 0 1 10-10h3" />
  </svg>
{:else if name === 'font-hand'}
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round">
    <path d="M3 15c2-7 4-9 5-9s1 4 2 4 2-6 3-6 1 9 4 11" />
  </svg>
{:else if name === 'font-normal'}
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round">
    <path d="M5 16V6.5a2.5 2.5 0 0 1 5 0V16M5 11h5M15 6v10" />
  </svg>
{:else if name === 'font-code'}
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round">
    <path d="m7 6-4 4 4 4M13 6l4 4-4 4" />
  </svg>
{:else if name === 'align-left'}
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
    <path d="M4 6h12M4 10h8M4 14h12" />
  </svg>
{:else if name === 'align-center'}
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
    <path d="M4 6h12M6 10h8M4 14h12" />
  </svg>
{:else if name === 'align-right'}
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
    <path d="M4 6h12M8 10h8M4 14h12" />
  </svg>
{:else if name === 'arrow-type-sharp'}
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M3 15l7-10 7 10" />
  </svg>
{:else if name === 'arrow-type-round'}
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
    <path d="M3 15c0-6 14-6 14 0" />
  </svg>
{:else if name === 'arrow-type-elbow'}
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M3 15V9h14V3" />
  </svg>
{:else if name === 'arrowhead-none'}
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
    <path d="M3 10h14" />
  </svg>
{:else if name === 'arrowhead-arrow'}
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M3 10h13M11 6l5 4-5 4" />
  </svg>
{:else if name === 'arrowhead-triangle'}
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round">
    <path d="M3 10h9" />
    <path d="M11 6l6 4-6 4Z" fill="currentColor" />
  </svg>
{:else if name === 'arrowhead-circle'}
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5">
    <path d="M3 10h9" stroke-linecap="round" />
    <circle cx="14" cy="10" r="3" fill="currentColor" />
  </svg>
{:else if name === 'arrowhead-bar'}
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
    <path d="M3 10h12M15 5v10" />
  </svg>
{:else if name === 'arrowhead-diamond'}
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round">
    <path d="M3 10h8" />
    <path d="M14 7l3 3-3 3-3-3Z" fill="currentColor" />
  </svg>
{:else}
  <svg aria-hidden="true" focusable="false" role="img" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <rect x="5" y="5" width="14" height="14" rx="2" />
  </svg>
{/if}
