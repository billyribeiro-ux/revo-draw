## Cluster: excalidraw__components__13

This cluster covers seven UI building blocks in `packages/excalidraw/components/`: the library-grid cell, a small external-link button, the live-collaboration trigger button, the deferred loading splash, the canvas lock toggle, the AI/magic canvas button, and the large `DefaultItems` collection that defines every standard entry of the main menu (load, save, export, theme, preferences sub-menu, socials, etc.).

---

### packages/excalidraw/components/LibraryUnit.tsx

One-sentence purpose: Renders a single cell of the library grid — a draggable SVG preview of a library item (or a pending/empty skeleton) with hover/selection state and a multi-select checkbox.

- `LibraryUnit` — `memo((props) => JSX.Element)` where props are `{ id: LibraryItem["id"] | null; elements?: LibraryItem["elements"]; isPending?: boolean; onClick: (id: LibraryItem["id"] | null) => void; selected: boolean; onToggle: (id: string, event: React.MouseEvent) => void; onDrag: (id: string, event: React.DragEvent) => void; svgCache: SvgCache }` (L15-L92).
  - Behavior: a `React.memo`-wrapped functional component. Owns a `ref` to the dragger `<div>` (L35) and a `isHovered` state (L38). Calls `useLibraryItemSvg(id, elements, svgCache, ref)` (L36) which lazily renders/caches the item's SVG into the referenced DOM node. `isMobile` is derived from `useEditorInterface().formFactor === "phone"` (L39).
  - The `adder` (L40-L42) is a `PlusIcon` overlay shown only when `isPending`.
  - Root `<div>` (L44-L54) gets conditional classes via `clsx`: `library-unit__active` (has elements), `library-unit--hover` (elements && isHovered), `library-unit--selected` (selected), `library-unit--skeleton` (no svg yet — the loading/empty placeholder). `onMouseEnter`/`onMouseLeave` toggle `isHovered`.
  - The inner dragger `<div>` (L55-L80): class `library-unit__dragger` plus `library-unit__pulse` when pending; `draggable={!!elements}`. Its `onClick` (L61-L71) is only wired when there are elements or it's pending — shift-click calls `onToggle(id, event)` (multi-select), plain click calls `onClick(id)`. `onDragStart` (L72-L79) aborts (preventDefault) if there is no `id`, otherwise clears hover and calls `onDrag(id, event)`.
  - Checkbox (L82-L88): rendered only when `id && elements && (isHovered || isMobile || selected)`; a `CheckboxItem` whose `onChange` routes to `onToggle(id, event)`.
  - Side effects: mutates the dragger DOM node via the SVG hook; HTML5 drag-and-drop. Invariant: pending items (`id === null`) cannot be dragged.
- `EmptyLibraryUnit` — `() => JSX.Element` (L94-L96). Renders a bare skeleton `<div className="library-unit library-unit--skeleton" />`; used as a placeholder cell.

---

### packages/excalidraw/components/LinkButton.tsx

One-sentence purpose: A tiny presentational wrapper that renders a `FilledButton` inside an external `<a>` link.

- `LinkButton` — `({ children, href }: { href: string; children: React.ReactNode }) => JSX.Element` (L3-L15).
  - Behavior: wraps a `FilledButton` (children) in `<a href target="_blank" rel="noopener" className="link-button">` (L11-L13). Pure, stateless. No effects. Note `rel="noopener"` (no `noreferrer`) for the new-tab link.

---

### packages/excalidraw/components/live-collaboration/LiveCollaborationTrigger.tsx

One-sentence purpose: The toolbar "Share"/live-collaboration button that collapses to an icon on small viewports and shows a live collaborator count badge.

- `LiveCollaborationTrigger` (default export) — `({ isCollaborating, onSelect, editorInterface, ...rest }: { isCollaborating: boolean; onSelect: () => void; editorInterface?: EditorInterface } & React.ButtonHTMLAttributes<HTMLButtonElement>) => JSX.Element` (L12-L45).
  - Behavior: reads UI app state via `useUIAppState()` (L22). Computes `showIconOnly` (L24-L26) when `editorInterface?.formFactor !== "desktop"` OR `appState.width < MQ_MIN_WIDTH_DESKTOP` (responsive breakpoint constant from `@excalidraw/common`).
  - Renders a `Button` (L28-L44) with class `collab-button` (+ `active` when `isCollaborating`), inline style `position: relative` and `width: showIconOnly ? undefined : "auto"`, title `t("labels.liveCollaboration")`, and `onSelect={onSelect}`. Spreads remaining `rest` button attributes.
  - Content (L37): the `share` icon when `showIconOnly`, else the localized `t("labels.share")` text. Collaborator badge (L38-L42): a `div.CollabButton-collaborators` showing `appState.collaborators.size` only when `> 0`.
  - `displayName` set to `"LiveCollaborationTrigger"` (L48). No local state/refs/effects. Note: responsive logic depends on both the editor form-factor AND a pixel width threshold.

---

### packages/excalidraw/components/LoadingMessage.tsx

One-sentence purpose: A centered spinner + "loading scene" splash that optionally stays hidden for an initial `delay` (so quick loads never flash a spinner).

- `LoadingMessage` — `React.FC<{ delay?: number; theme?: Theme }>` (L12-L44).
  - State: `isWaiting`, initialized to `!!delay` (L16) — i.e. true only when a delay is requested.
  - Effect (L18-L26): if no `delay`, returns immediately (stays visible). Otherwise sets a `setTimeout(delay)` that flips `isWaiting` to `false`, with cleanup `clearTimeout(timer)`; dependency `[delay]`. This is the deferred-render guard.
  - Render: while `isWaiting`, returns `null` (L28-L30) so nothing paints during the delay window. Otherwise renders `div.LoadingMessage` (+ `LoadingMessage--dark` when `theme === THEME.DARK`) containing a `Spinner` (L39) and the localized text `t("labels.loadingScene")` (L41). No refs. Invariant: with a `delay`, the spinner appears only if loading outlasts `delay` ms.

---

### packages/excalidraw/components/LockButton.tsx

One-sentence purpose: A checkbox-styled toolbar toggle showing a locked/unlocked padlock icon, bound to the "keep selected tool active" lock (shortcut Q).

- `LockIconProps` (type, L9-L15): `{ title?: string; name?: string; checked: boolean; onChange?(): void; isMobile?: boolean }`.
- `DEFAULT_SIZE: ToolButtonSize` constant `= "medium"` (L17) — drives the `ToolIcon_size_*` class.
- `ICONS` constant (L19-L22): `{ CHECKED: LockedIcon, UNCHECKED: UnlockedIcon }` — icon lookup by checked state.
- `LockButton` — `(props: LockIconProps) => JSX.Element` (L24-L50).
  - Behavior: stateless `<label>` (L26-L34) with `clsx` classes `ToolIcon ToolIcon__lock ToolIcon_size_medium` plus `is-mobile` when `props.isMobile`; title is interpolated as `` `${props.title} — Q` `` (L34) embedding the keyboard shortcut. Contains a hidden `<input type="checkbox">` (L36-L44) wired to `props.checked`/`props.onChange`, with `aria-label={props.title}` and `data-testid="toolbar-lock"`. The visible `div.ToolIcon__icon` (L45-L47) shows `ICONS.CHECKED` or `ICONS.UNCHECKED` based on `props.checked`.

---

### packages/excalidraw/components/MagicButton.tsx

One-sentence purpose: A small generic checkbox-styled canvas button (used for AI/magic actions) that displays a caller-supplied icon.

- `DEFAULT_SIZE: ToolButtonSize` constant `= "small"` (L8).
- `ElementCanvasButton` — `(props: { title?: string; icon: JSX.Element; name?: string; checked: boolean; onChange?(): void; isMobile?: boolean }) => JSX.Element` (L10-L40).
  - Behavior: stateless `<label>` (L19-L28) with `clsx` classes `ToolIcon ToolIcon__MagicButton ToolIcon_size_small` plus `is-mobile` when `props.isMobile`; `title={props.title}`. Hidden `<input type="checkbox">` (L29-L36) bound to `props.checked`/`props.onChange` with `aria-label={props.title}`. Visible `div.ToolIcon__icon` (L37) renders the supplied `props.icon`. Note: the exported name is `ElementCanvasButton`, not "MagicButton"; the file/class differs from its component name.

---

### packages/excalidraw/components/main-menu/DefaultItems.tsx

One-sentence purpose: Defines all standard main-menu entries (load/save/export, command palette, search, help, clear canvas, theme toggle, canvas background, socials, collaboration trigger, and the full Preferences sub-menu) as individually exported components wired to the action manager and app state.

Common pattern across these components: each is a thin wrapper around `DropdownMenuItem` / `DropdownMenuItemCheckbox` / `DropdownMenuItemContentRadio` / `DropdownMenuItemLink` / `DropdownMenuSub`. They read i18n via `useI18n()`, the action manager via `useExcalidrawActionManager()`, UI state via `useUIAppState()`, and dispatch through `actionManager.executeAction(...)` or `setAppState(...)`. Most gate visibility with `actionManager.isActionEnabled(...)`. Each sets a `displayName`.

- `LoadScene` — `() => JSX.Element | null` (L66-L107). Returns `null` if `actionLoadScene` is disabled (L71-L73). `handleSelect` (L75-L93) is async: if the canvas has elements it first calls `openConfirmModal({...})` (overwrite warning with a `Trans`-rendered description, `color: "warning"`); only on confirm (or when empty) does it `executeAction(actionLoadScene)`. Renders a `DropdownMenuItem` with `LoadIcon`, the `loadScene` shortcut, `data-testid="load-button"`. Side effect: may open a modal then run the load action.
- `SaveToActiveFile` — `() => JSX.Element | null` (L109-L127). Null if `actionSaveToActiveFile` disabled. `DropdownMenuItem` with `save` icon, `saveScene` shortcut, `onSelect` runs the save action. `data-testid="save-button"`.
- `SaveAsImage` — `() => JSX.Element` (L129-L144). `DropdownMenuItem` (`ExportImageIcon`, `imageExport` shortcut) whose `onSelect` calls `setAppState({ openDialog: { name: "imageExport" } })`. `data-testid="image-export-button"`.
- `CommandPalette` — `(opts?: { className?: string }) => JSX.Element` (L146-L166). `DropdownMenuItem` (`boltIcon`) whose `onSelect` fires `trackEvent("command_palette", "open", "menu")` then opens the `commandPalette` dialog via `setAppState`. Accepts optional className.
- `SearchMenu` — `(opts?: { className?: string }) => JSX.Element` (L168-L187). `DropdownMenuItem` (`searchIcon`) whose `onSelect` executes `actionToggleSearchMenu`. `data-testid="search-menu-button"`.
- `Help` — `() => JSX.Element` (L189-L206). `DropdownMenuItem` (`HelpIcon`, shortcut `"?"`) executing `actionShortcuts`. `data-testid="help-menu-item"`.
- `ClearCanvas` — `() => JSX.Element | null` (L208-L229). Null if `actionClearCanvas` disabled. Uses `useSetAtom(activeConfirmDialogAtom)`; `onSelect` sets the confirm dialog atom to `"clearCanvas"` (opens a confirm dialog rather than acting directly). `TrashIcon`, `data-testid="clear-canvas-button"`.
- `ToggleTheme` — overloaded props (L231-L310): either `{ allowSystemTheme: true; theme: Theme|"system"; onSelect: (theme) => void }` or `{ allowSystemTheme?: false; onSelect?: (theme: Theme) => void }`. Null if `actionToggleTheme` disabled. When `allowSystemTheme`, renders a `DropdownMenuItemContentRadio` named `"theme"` with three choices Light/Dark/System (each with icon `SunIcon`/`MoonIcon`/`DeviceDesktopIcon` and an `ariaLabel` including the `toggleTheme` shortcut) (L252-L279). Otherwise renders a single `DropdownMenuItem` (L281-L308) whose `onSelect` calls `event.preventDefault()` (keep menu open), then either invokes the caller `onSelect` with the opposite of `appState.theme` (Dark↔Light, L287-L291) or falls back to `executeAction(actionToggleTheme)`. The icon and label flip on current theme. `data-testid="toggle-dark-mode"`.
- `ChangeCanvasBackground` — `() => JSX.Element | null` (L312-L342). Null when `appState.viewModeEnabled` OR `UIOptions.canvasActions.changeViewBackgroundColor` is off. Renders a labeled section ("Canvas background") with inline styles and delegates the picker to `actionManager.renderAction("changeViewBackgroundColor")` (L337). `data-testid="canvas-background-label"`.
- `Export` — `() => JSX.Element` (L344-L360). `DropdownMenuItem` (`ExportIcon`) opening the `jsonExport` dialog via `setAppState`. `data-testid="json-export-button"`.
- `Socials` — `() => JSX.Element` (L362-L391). A fragment of three `DropdownMenuItemLink`s: GitHub, X (label `followUs`), Discord, each with brand icon and `aria-label`.
- `LiveCollaborationTrigger` — `({ onSelect, isCollaborating }: { onSelect: () => void; isCollaborating: boolean }) => JSX.Element` (L393-L415). A menu-item variant (distinct from the toolbar `LiveCollaborationTrigger` in the other file): `DropdownMenuItem` (`usersIcon`) with class `active-collab` when collaborating; `onSelect` runs the supplied callback. `data-testid="collab-button"`.

Preferences sub-menu items (all `DropdownMenuItemCheckbox`/`...ContentRadio`; each calls `event.preventDefault()` in `onSelect` to keep the sub-menu open after toggling):
- `PreferencesToggleToolLockItem` — internal `() => JSX.Element` (L417-L434). Checkbox bound to `appState.activeTool.locked`, shortcut `toolLock`; `onSelect` calls `app.toggleLock()` (via `useApp()`).
- `PreferencesBoxSelectionModeItem` — internal `() => JSX.Element` (L436-L467). `DropdownMenuItemContentRadio<"contain" | "overlap">` named `boxSelectionMode`, value `appState.boxSelectionMode`; `onChange` writes the chosen mode via `setAppState`. Choices contain/overlap.
- `PreferencesToggleSnapModeItem` — internal (L469-L485). Checkbox `appState.objectsSnapModeEnabled`, shortcut `objectsSnapMode`; executes `actionToggleObjectsSnapMode`.
- `PreferencesToggleArrowBindingItem` — internal (L487-L502). Checkbox `appState.bindingPreference === "enabled"`; executes `actionToggleArrowBinding`.
- `PreferencesToggleMidpointSnappingItem` — internal (L504-L519). Checkbox `appState.isMidpointSnappingEnabled`; executes `actionToggleMidpointSnapping`.
- `PreferencesToggleGridModeItem` (exported) — (L521-L538). Checkbox `appState.gridModeEnabled`, shortcut `gridMode`; executes `actionToggleGridMode`.
- `PreferencesToggleZenModeItem` (exported) — (L540-L556). Checkbox `appState.zenModeEnabled`, shortcut `zenMode`; executes `actionToggleZenMode`.
- `PreferencesToggleViewModeItem` — internal (L558-L574). Checkbox `appState.viewModeEnabled`, shortcut `viewMode`; executes `actionToggleViewMode`.
- `PreferencesToggleElementPropertiesItem` — internal (L576-L592). Checkbox `appState.stats.open`, shortcut `stats`; executes `actionToggleStats`.
- `Preferences` — `({ children, additionalItems }: { children?: React.ReactNode; additionalItems?: React.ReactNode }) => JSX.Element` (L594-L625). Renders a `DropdownMenuSub` with `settingsIcon` trigger. If no `children` override is supplied it renders the default set of the nine preference items above (L610-L618), then appends `additionalItems`. After definition (L627-L637) it attaches the toggle components as static properties (`Preferences.ToggleToolLock`, `.BoxSelectionMode`, `.ToggleSnapMode`, `.ToggleArrowBinding`, `.ToggleMidpointSnapping`, `.ToggleGridMode`, `.ToggleZenMode`, `.ToggleViewMode`, `.ToggleElementProperties`) so consumers can compose a custom menu.

No non-obvious geometry/coordinate math in this file; the only numeric concern is the `MQ_MIN_WIDTH_DESKTOP` responsive threshold used by the sibling `LiveCollaborationTrigger.tsx`.
