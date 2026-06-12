## Audit: toolbar

Axis focus: island geometry, button size/radius, selected-state color, keybinding badge, lock toggle, hover/active/focus states. NOT the tool set (product-divergent semantic types).

OUR file: `src/lib/ui/Toolbar.svelte`
Excalidraw refs: `components/ToolIcon.scss`, `components/Toolbar.scss`, `css/variables.module.scss`, `css/theme.scss`, `components/Actions.tsx`, `components/Stack.tsx`.

Verified Excalidraw geometry tokens (`css/theme.scss`):
- `--lg-button-size: 2.25rem` (toolbar button), `--lg-icon-size: 1rem` (toolbar icon svg)
- `--default-button-size: 2rem`, `--default-icon-size: 1rem`
- `--border-radius-lg: 0.5rem`
- selected tool: `background: var(--color-surface-primary-container)` + icon `var(--color-on-primary-container)` (variables.module.scss:48-54)
- toolbar keybinding override: `bottom: 4px; right: 4px` (variables.module.scss:58-61) — NOT the base 2px/3px
- divider: `width:1px; height:1.5rem; margin:0 0.25rem` (Toolbar.scss:22-28)
- `:focus-visible` ToolIcon: `box-shadow: 0 0 0 2px var(--focus-highlight-color)` (ToolIcon.scss:86-88)

### Matchable findings

| Title | Severity | Our ref | Excal ref | Proposed fix |
|---|---|---|---|---|
| Toolbar icon svg is 18px, Excalidraw is 16px (`--lg-icon-size: 1rem`) | visual | Toolbar.svelte:152 `size={18}` | theme.scss:50 (`--lg-icon-size: 1rem`); ToolIcon.scss:186-188 | Set the tool-button icon to `size={16}` to match `--lg-icon-size`. The 2.25rem button (Toolbar.svelte:469-470) is correct; only the glyph is oversized. |
| No `:focus-visible` ring on tool buttons (keyboard a11y gap) | a11y | Toolbar.svelte:288-310 (`.tool` has only `:hover`/`:active`) | ToolIcon.scss:86-88 | Add `.tool:focus-visible { box-shadow: 0 0 0 2px var(--focus-highlight-color); outline: none; }`. Excalidraw maps `--focus-highlight-color` to a blue ring; use the project blue token. Currently keyboard users get no visible focus indicator. |
| Keybinding badge sits at 2px/3px; Excalidraw toolbar override is 4px/4px | cosmetic | Toolbar.svelte:321-322 (`inset-block-end: 2px; inset-inline-end: 3px`) | variables.module.scss:58-61 (`.App-toolbar-container` overrides `bottom:4px; right:4px`) | The 2px/3px values match the *base* `.ToolIcon__keybinding` (ToolIcon.scss:153-156), but inside the toolbar Excalidraw bumps both to 4px. Set `inset-block-end: 4px; inset-inline-end: 4px` for parity in the toolbar context. |
| Divider height 20px vs Excalidraw 24px (1.5rem); margin 4px vs 0.25rem | visual | Toolbar.svelte:282-285 (`block-size: 20px; margin-inline: 4px`) | Toolbar.scss:23-27 (`height: 1.5rem; margin: 0 0.25rem`) | Set `block-size: 1.5rem` (24px). Margin 4px = 0.25rem already matches; keep. |
| Active-tool keybinding badge dims via `opacity:0.7`; Excalidraw keeps it full-color on the container | cosmetic | Toolbar.svelte:330-333 (`.tool.active .kb { color: currentColor; opacity:0.7 }`) | variables.module.scss:50 (`--keybinding-color: var(--color-on-primary-container)` — full, no opacity) | Drop the `opacity: 0.7`; Excalidraw renders the selected-state keybinding at full `--color-on-primary-container`. Keep `color: currentColor`. |
| Mousedown scale-down (`scale(0.94)`) on tool buttons — not an Excalidraw behavior | cosmetic | Toolbar.svelte:307-309 (`&:active { transform: scale(0.94) }`) | ToolIcon.scss:98-99 (`:active` only changes `background-color: var(--button-gray-3)`) | Replace the scale transform with a background change on `:active`. Excalidraw never scales buttons; it darkens the bg. In the web shell, set `.tool:active { background: var(--surface-2) }` (or a darker step) and remove `transform`. |
| `:active` (pressed) state missing in web shell; only `.active` (selected) styled | visual | Toolbar.svelte:474-483 (web-shell `.tool:hover`/`.tool.active` only, no `:active`) | ToolIcon.scss:98-99 + variables.module.scss:68-70 (pressed = darker bg + border) | Add `:global(.x-web) .tool:active { background: var(--surface-2); }` so a mousedown gives the same darken-on-press feedback Excalidraw shows via `--button-gray-3`. |
| Extra-tools / "More" trigger lacks Excalidraw selected-trigger treatment | cosmetic | Toolbar.svelte:166 (`class:active={moreOpen \|\| moreActive}` reuses generic `.active` lavender fill) | Toolbar.scss:35-55 (`.App-toolbar__extra-tools-trigger` is transparent; `--selected` = `--color-primary-light` bg + `--color-primary` text; base has no box-shadow) | Acceptable to reuse `.active`, but for exact parity the extra-tools trigger in Excalidraw is transparent by default (`box-shadow:none; border:0`) and only fills on `--selected`. Our `.active` fill on mere `moreOpen` (popover open, no tool picked) over-highlights vs Excalidraw, which only highlights when a tool *inside* the menu is the active tool. Consider splitting "open" (no fill) from "active tool selected" (fill). |

### By-design divergences (do NOT fix)

- **Tool set differs entirely.** Our toolbar exposes semantic UI-layout types (frame, container, card, nav, sidebar, tabs, modal, button, input, table, chart, checkbox, hero, etc.) and a categorized "More elements" popover. Excalidraw exposes drawing primitives (selection, rectangle, ellipse, arrow, draw, text, image, eraser, frame, laser). This is the core product difference — do not swap our types for Excalidraw shapes.
- **"More elements" popover content/layout** (3-col grid grouped by Form/Data/Feedback/Layout) is product-specific; Excalidraw's extra-tools dropdown is a flat menu with Generate/Mermaid/Magicframe AI entries. Do not reproduce AI/Mermaid/Magicframe entries.
- **Custom CSS tooltip** (`.tip`, Toolbar.svelte:336-371) vs Excalidraw's `ToolButton title` / `Tooltip` component. Functionally equivalent; not a chrome-parity defect.
- **Lock toggle** (Toolbar.svelte:204-217) exists in both products conceptually but our placement/icons (`lock`/`lock-open` Phosphor) are an intentional local choice; Excalidraw's lock lives in a separate `LockButton`. Not a defect.
- **Layers / Inspector toggle buttons** (Toolbar.svelte:220-241) are app-specific panel toggles with no Excalidraw equivalent in the main toolbar. By design.
- **Dual-shell styling** (native Tauri rail vs `.x-web` floating Island). Excalidraw is web-only; the native-shell `.toolrail` full-width bar with solid `--accent` selected fill is the desktop product's own look. Only the `.x-web` path targets Excalidraw parity.
- **Phosphor icons** instead of Excalidraw's hand-drawn icon set — mandated by project hard rule (Phosphor via unplugin-icons only).
