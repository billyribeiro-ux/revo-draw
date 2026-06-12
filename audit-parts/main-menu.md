## Audit: main-menu

Side-by-side parity audit of the main/hamburger dropdown menu. OUR file:
`src/lib/ui/FileMenu.svelte`. Excalidraw reference: `MainMenu.tsx`,
`dropdownMenu/DropdownMenu.scss`, `DropdownMenuItemContent.tsx`,
`DropdownMenuSeparator.tsx`, `DropdownMenuContent.tsx`,
`DropdownMenuSub.tsx` (all under `excalidraw-master/packages/excalidraw/components/`).

### Matchable findings

| Title | Severity | Our ref | Excal ref | Proposed fix |
|---|---|---|---|---|
| Hover uses saturated accent fill + inverted text instead of subtle neutral hover | visual | `FileMenu.svelte:251-259` | `DropdownMenu.scss:174-177` | Replace `&:hover { background: var(--accent); color: var(--accent-ink); }` (and the `&:hover :global(svg)/kbd/.hint { color: var(--accent-ink) }` block) with `&:hover { background: var(--surface-sunken); }` only. Excalidraw hover is `background-color: var(--button-hover-bg)` with text color unchanged; the bright blue-fill-with-white-text row is a non-parity divergence. |
| No keyboard navigation (Arrow Up/Down / Home/End) within the open menu | a11y | `FileMenu.svelte:86-120` (no key handler) | Radix `DropdownMenu.Content` (`DropdownMenuContent.tsx:84-96`) provides roving focus + arrow-key nav | Add `onkeydown` to `.menu` to move focus between `[role=menuitem]` on ArrowDown/ArrowUp (wrapping), and Home/End to first/last. Currently the menu is mouse-only. |
| Escape does not close the menu | a11y | `FileMenu.svelte:34-37` (only outside-click closes) | `DropdownMenuContent.tsx:62-79` (capture-phase Escape → close) | Add a window/menu `onkeydown` that calls `close()` and refocuses the trigger when `e.key === 'Escape'` while `menuOpen`. |
| Active (pressed) state missing the brand-ring affordance | visual | `FileMenu.svelte:236-260` (no `:active`) | `DropdownMenu.scss:179-182` | Add `&:active { background: var(--surface-sunken); box-shadow: 0 0 0 1px var(--accent); }` to the menu-item rule to match Excalidraw's `box-shadow: 0 0 0 1px var(--color-brand-active)`. |
| Item row height is implicit (padding-derived ~31px) vs fixed 2rem | visual | `FileMenu.svelte:242` (`padding: 7px 9px`, no height) | `DropdownMenu.scss:135-137` (`height: 2rem; padding: 0 0.5rem`) | Set explicit `block-size: 2rem; padding-inline: 0.5rem; padding-block: 0;` on `.menu button, .sub-trigger` so rows are a stable 32px regardless of icon/text metrics. |
| Inter-item gap differs (5px container padding, no row gap) vs 1px gap, 8px padding | cosmetic | `FileMenu.svelte:225` (`padding: 5px`) | `DropdownMenu.scss:59-65` (`padding: 8px 8px; gap: 1px`) + `DropdownMenuContent.tsx:99` (`Island padding={2}`) | Change `.menu` padding to `8px` and add `display:flex; flex-direction:column; gap:1px;` so items sit 1px apart, matching the Island container. |
| Icon-to-label column gap (10px) doesn't match Excalidraw's split (0.625rem row gap + 0.75rem text gap) | cosmetic | `FileMenu.svelte:240` (`gap: 10px`) | `DropdownMenu.scss:78-79,155` (`column-gap: 0.625rem`, text `gap: 0.75rem`) | Use `gap: 0.625rem` (10px) on the row but ensure the icon sits in its own slot; acceptable as-is, but for exact parity set row `column-gap: 0.625rem` and label/shortcut group gap `0.75rem`. |
| Submenu trigger arrow lacks the `opacity: 0.5` dim and aria-expanded hover wiring | cosmetic | `FileMenu.svelte:106` (`caret-right`, full opacity) | `DropdownMenu.scss:20-26` (`__submenu-trigger-icon { opacity: 0.5 }`) and `:12-18` (expanded → keep `--button-hover-bg`) | Wrap the trailing `caret-right` icon with `opacity: 0.5` and keep the trigger background in the hover color while `exportOpen` is true. |
| Submenu opens on hover only — no keyboard (ArrowRight/Enter) open, no ArrowLeft close | a11y | `FileMenu.svelte:97-107` (`onpointerenter` only) | Radix `DropdownMenuSub` (`DropdownMenuSub.tsx`) supports ArrowRight open / ArrowLeft close | Add key handling to `.sub-trigger`: ArrowRight/Enter sets `exportOpen = true` and focuses first submenu item; ArrowLeft closes. |
| Disabled menu-item state not represented | a11y | `FileMenu.svelte:236-260` (no disabled styling) | `DropdownMenu.scss:184-197` | Add `&[disabled], &[aria-disabled='true'] { cursor: not-allowed; opacity: 0.5; pointer-events: none; }`. (Save/Save-As could be disabled when `!dirty`.) |
| Trigger separator/min-width: our menu min-width 232px matches but submenu lacks max-width clamp | cosmetic | `FileMenu.svelte:288` (`min-inline-size: 220px`, no max) | `DropdownMenu.scss:6` (`max-width: 20rem`) | Add `max-inline-size: 20rem` to `.submenu` (and `.menu`) to prevent over-wide rows for long labels. |

### By-design divergences (do NOT fix)

- **Custom 3-bar logo + doc-name chip trigger** (`FileMenu.svelte:73-83`). Excalidraw uses a single
  `HamburgerMenuIcon` button (`MainMenu.tsx:49`). The doc-name chip is a LayoutForge product choice;
  the `compact` variant (`:69-71`) already mirrors the hamburger. Do not adopt Excalidraw's logo/wordmark.
- **Menu content is LayoutForge-specific** (New / Open / Library / Save / Save As / Import / Export
  submenu with Markdown/lfdoc/json/svg/png). Excalidraw's DefaultItems (LoadScene, Theme toggle,
  Zen/Grid/Stats modes, Help, GitHub/Discord/X links, collaborators) are a different product surface —
  do not import them.
- **No collaborators `<fieldset>`/UserList** (`MainMenu.tsx:60-70`). Single-user local app; collab is out of scope.
- **No mobile/phone form-factor branch** (`DropdownMenu.scss:28-57`, `DropdownMenuContent.tsx:97`).
  Desktop Tauri/web app only.
- **Export submenu with `hint` mono captions** (`FileMenu.svelte:110-115`). This is a product-specific
  affordance; Excalidraw has no equivalent. Keep.
- **OKLCH design tokens** (`tokens.css`) vs Excalidraw's CSS-var palette — intentional house style.
