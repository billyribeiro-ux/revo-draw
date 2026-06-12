## Audit: library

Scope: library panel layout, item grid, headers, empty state — matchable chrome only.

OUR surface (`src/lib/ui/LibraryView.svelte`) is a centered modal that lists saved
`.lfdoc` documents (thumbnail + name + path + updated-date + delete). Excalidraw's
`LibraryMenu`/`LibraryMenuItems` is a sidebar of reusable *element groups* with a
4-column square grid, search field, multi-select, section headers, and add-to-library
controls. These are different products, so most structure is a by-design divergence.
The matchable items below are the small chrome/behavior/a11y details that we can and
should align.

### Matchable findings

| Title | Severity | Our ref | Excal ref | Proposed fix |
|---|---|---|---|---|
| Escape key does not close the dialog | bug | LibraryView.svelte:44-50 (dialog has no `onkeydown`; only the `tabindex="-1"` backdrop has one, and it never receives keyboard focus) | LibraryMenu.tsx:274-312 (document-level capture ESC handler closes the sidebar) | Add a global `Escape` listener while `open` (e.g. a `$effect` registering `window.addEventListener('keydown', …, true)` that calls `onClose()` when `e.key === 'Escape'`), and remove the dead `onkeydown` on the backdrop. |
| Backdrop uses `role="button"` for a click-to-dismiss overlay | a11y | LibraryView.svelte:45 (`role="button" tabindex="-1"`) | n/a (Excalidraw is a docked sidebar with no modal backdrop; standard dialog-overlay pattern applies) | Drop `role="button"`/`tabindex`/`aria-label`/`onkeydown` from the backdrop; keep a plain `<div class="backdrop" onclick={onClose}>` (presentational) and rely on the dialog-level Escape handler for keyboard dismissal. A click-only overlay should not be in the tab/AT order. |
| Empty state is a single muted line; no bold heading + hint hierarchy | visual | LibraryView.svelte:57 (`<p class="msg">No saved documents yet. Save a layout to see it here.</p>`) | LibraryMenuItems.tsx:269-281 + LibraryMenuItems.scss:14-38 (two-tier: `__label` bold `1.125rem` `font-weight:700` `--color-primary`, then softer `__hint`) | Render two elements: a bold primary-colored label (our `--ink`, `font-weight:700`, `font-size:var(--text-lg)`) e.g. "No saved documents yet", and beneath it a softer hint line in `--ink-faint` e.g. "Save a layout to see it here." Mirrors Excalidraw's label/hint split. |
| Loading state is a bare text line, no spinner | cosmetic | LibraryView.svelte:53 (`<p class="msg">Loading…</p>`) | LibraryMenu.tsx:132-141 (`<Spinner size="2em" />` + label "Loading library…") | Add a spinner glyph next to the text (project already has `PhIcon`; use a spinner/`circle-notch` icon with a CSS rotate, or a small CSS spinner) so the loading state matches Excalidraw's spinner+label. |
| Section header weight/size lighter than Excalidraw's | cosmetic | LibraryView.svelte:128-134 (`h2` `font-size:var(--text-md)`, `font-weight:650`) | LibraryMenuItems.scss:82-91 (`__header` `font-size:1.125rem`, `font-weight:700`, `--color-primary`) | If aligning the in-panel section heading, bump to `font-weight:700` and a larger size (`var(--text-lg)` ≈ 1.125rem). The dialog title `h2` is acceptable as-is given the modal framing; only flag if a content-region header is added. |

### By-design divergences (do NOT fix)

- **Modal vs sidebar.** Ours is a centered `role="dialog"` modal with a dimmed
  backdrop (LibraryView.svelte:46-50, 99-120). Excalidraw renders inside a docked
  `Sidebar.Tab` (`layer-ui__library`, LibraryMenu.tsx:60-62). Different shell by design.
- **File browser vs element-group grid.** We list saved documents (thumbnail + name +
  path + updated date + per-row delete, LibraryView.svelte:60-89). Excalidraw shows a
  4-column square grid of reusable element clusters (`__grid`/`__row`,
  LibraryMenuItems.scss:65-117). Our product has no "library item = group of canvas
  elements" concept.
- **No search field.** Excalidraw has a `TextField type="search"` with deburr filtering
  and an "esc to clear" hint (LibraryMenuItems.tsx:331-408). Our library is a small
  local document index; search is out of scope.
- **No multi-select / shift-range / drag-to-canvas.** Excalidraw supports shift-range
  selection, drag-out, and bulk insert (LibraryMenuItems.tsx:124-223). We open a single
  document on click (LibraryView.svelte:66); no multi-select model.
- **No "Personal Library" / "Excalidraw Library" section split or published-items tier**
  (LibraryMenuItems.tsx:262-327). We have one flat list; no publish/community concept.
- **No `LibraryMenuControlButtons` (add-to-library / browse public repository / import-export)**
  (LibraryMenu.tsx:161-169, LibraryMenuItems.tsx:435-442). Add-to-library and the public
  repo are Excalidraw-specific; our docs are saved via the file menu.
- **No batched/virtualized SVG rendering** (`ITEMS_RENDERED_PER_BATCH`,
  `svgCache`, LibraryMenuItems.tsx:50-53, 248-252). We render PNG thumbnails from the
  document index; no per-item SVG cache needed.
- **Branding/logo/wordmark** in the public-repo controls — excluded per guardrail.
