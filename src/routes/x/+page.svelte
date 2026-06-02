<script lang="ts">
  // /x — isolated dev route for the Excalidraw-port render path (Phase 2). Keeps the existing
  // LayoutForge editor (/) untouched while the new canvas is brought up and verified.
  import EditorPreview from '$lib/x/EditorPreview.svelte';
</script>

<EditorPreview />
