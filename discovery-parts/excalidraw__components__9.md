## Cluster: excalidraw__components__9

This cluster covers the FontPicker subsystem (picker shell, scrollable list, popover trigger, keyboard navigation), the editor footer (left zoom/undo-redo block + center tunnel), and the toolbar Hand tool button.

---

### packages/excalidraw/components/FontPicker/FontPicker.tsx

Purpose: The font-family picker shell — renders the three "default" font radio buttons plus a Radix popover that opens the searchable full font list.

- `DEFAULT_FONTS` (constant, L23-L42): An array of 3 `FontDescriptor`-like objects (`{ value, icon, text, testId }`) for the quick-pick radio row: Excalifont (hand-drawn / `FreedrawIcon`), Nunito (normal / `FontFamilyNormalIcon`), and "Comic Shanns" (code / `FontFamilyCodeIcon`). `text` is resolved at module load via `t(...)`. Exported.
- `defaultFontFamilies` (constant, L44): A `Set` built from `DEFAULT_FONTS.map(x => x.value)`, used for O(1) membership testing. Module-internal.
- `isDefaultFont = (fontFamily: number | null) => boolean` (L46-L52): Returns `false` for falsy input (null/0), otherwise `defaultFontFamilies.has(fontFamily)`. Exported; consumers use it to decide whether the active font is one of the three quick picks. Note the falsy guard treats `0` as "not a default font."
- `FontPickerProps` (interface, L54-L63): `isOpened`, `selectedFontFamily: FontFamilyValues | null`, `hoveredFontFamily: FontFamilyValues | null`, callbacks `onSelect(fontFamily)`, `onHover(fontFamily)`, `onLeave()`, `onPopupChange(open: boolean)`, and optional `compactMode?: boolean`.
- `FontPicker` (React component, `React.memo`, L65-L130): The exported component.
  - Props: as in `FontPickerProps`; `compactMode` defaults to `false` (L74).
  - Memoized values/callbacks: `defaultFonts = useMemo(() => DEFAULT_FONTS, [])` (L76); `onSelectCallback = useCallback((value: number | false) => { if (value) onSelect(value); }, [onSelect])` (L77-L84) — swallows the `false` value emitted by `RadioSelection` when nothing is selected.
  - Render (L86-L124): Root `<div role="dialog" aria-modal="true">` with class `FontPicker__container` plus `--compact` modifier when `compactMode`. When NOT compact: renders the quick-pick `RadioSelection<FontFamilyValues | false>` over `defaultFonts` bound to `selectedFontFamily`/`onSelectCallback`, followed by a `ButtonSeparator`. Always renders a Radix `Popover.Root` (`open={isOpened}`, `onOpenChange={onPopupChange}`) containing `FontPickerTrigger` and — only when `isOpened` — the `FontPickerList`. The list's `onOpen`/`onClose` are wired to `onPopupChange(true|false)`.
  - State/refs/effects: none owned directly (stateless, props-driven).
  - `React.memo` comparator (L126-L129): re-renders only when `isOpened`, `selectedFontFamily`, or `hoveredFontFamily` change (other props/handler identities are ignored).

---

### packages/excalidraw/components/FontPicker/FontPickerList.tsx

Purpose: The searchable, keyboard-navigable popover list of all fonts, split into "scene fonts" (fonts already used in the document) and "available fonts" groups, with caret-preservation when editing live text.

- `FontDescriptor` (interface, L51-L60): `{ value: number; icon: JSX.Element; text: string; deprecated?: true; badge?: { type: ValueOf<typeof DropDownMenuItemBadgeType>; placeholder: string } }`. Exported; the shared per-font row model.
- `FontPickerListProps` (interface, L62-L70): `selectedFontFamily`, `hoveredFontFamily` (both `FontFamilyValues | null`), and callbacks `onSelect(value: number)`, `onHover(value: number)`, `onLeave()`, `onOpen()`, `onClose()`.
- `getFontFamilyIcon = (fontFamily: FontFamilyValues): JSX.Element` (L72-L88): Maps a font family id to an icon via a `switch`: Excalifont/Virgil → `FreedrawIcon`; Nunito/Helvetica → `FontFamilyNormalIcon`; "Lilita One" → `FontFamilyHeadingIcon`; "Comic Shanns"/Cascadia → `FontFamilyCodeIcon`; default → `FontFamilyNormalIcon`. Module-internal, pure.
- `getFontFamilyLabel = (fontFamily, fontFaces: ExcalidrawFontFace[]) => string` (L90-L97): Resolves a human-readable family name by reverse-looking-up the `FONT_FAMILY` map by id (preferred, to avoid quoted browser-resolved names), falling back to `fontFaces[0]?.fontFace?.family`, then `"Unknown"`. Module-internal.
- `FontPickerList` (React component, `React.memo`, L99-L413): The exported list.
  - Props: `FontPickerListProps`.
  - Context/hooks consumed: `useExcalidrawContainer()` → `container` (L109); `useApp()` → `app` (L110) and `app.fonts` (L111); `useAppProps()` → `showDeprecatedFonts` (L112); `useStylesPanelMode()` → `stylesPanelMode` (L113).
  - State/refs: `searchTerm` (`useState("")`, L115); `inputRef = useRef<HTMLInputElement>(null)` (L116) for the search box.
  - `allFonts` (`useMemo`, deps `[]`, L117-L146): Builds the full descriptor list from `Fonts.registered.entries()`, filtering out `metadata.private` and `metadata.fallback` fonts, mapping each to `{ value, icon, text }`, attaching `deprecated` + a RED "old" badge when `metadata.deprecated`, and sorting case-insensitively by `text` (`a.text.toLowerCase() > b.text.toLowerCase() ? 1 : -1`). Computed once (empty deps).
  - `sceneFamilies` (`useMemo`, deps `[selectedFontFamily]`, L148-L153): `new Set(fonts.getSceneFamilies())`. Intentionally keyed off `selectedFontFamily` (not `fonts`) so hover-driven re-renders don't recompute it — an explicit perf/cache invariant (comment L150-L151).
  - `sceneFonts` (`useMemo`, L155-L158): `allFonts` filtered to families present in `sceneFamilies` — always shown even when deprecated.
  - `availableFonts` (`useMemo`, L160-L168): `allFonts` not in `sceneFamilies` and (unless `showDeprecatedFonts`) not deprecated.
  - `filteredFonts` (`useMemo`, L170-L178): `arrayToList([...sceneFonts, ...availableFonts])` filtered by `text.toLowerCase().includes(searchTerm)`. `arrayToList` wraps items into a doubly-linked `Node<T>` list (`.prev`/`.next`) for keyboard nav.
  - `hoveredFont` (`useMemo`, L180-L207): Resolves the currently-hovered node: prefers `hoveredFontFamily`, else `selectedFontFamily`. Side-effecting fallback: if no match AND there's a `searchTerm`, it auto-hovers `filteredFonts[0]` (so search auto-highlights the first result) or calls `onLeave()` to clear hover state when there are no results. Returns the matching `Node<FontDescriptor>` or undefined.
  - `wrappedOnSelect = useCallback((fontFamily) => {...}, [onSelect, app.state.editingTextElement])` (L210-L243): Wraps `onSelect` to preserve the WYSIWYG caret. If editing text, it reads `selectionStart/selectionEnd` from `.excalidraw-wysiwyg` textarea before selecting, calls `onSelect`, then on a `setTimeout(...,0)` re-focuses the textarea and restores the saved selection range. Side effect: DOM focus + caret mutation. Invariant: only runs the save/restore when `app.state.editingTextElement` is truthy.
  - `onKeyDown` (`useCallback<KeyboardEventHandler<HTMLDivElement>>`, L245-L263): Delegates to `fontPickerKeyHandler({event, inputRef, hoveredFont, filteredFonts, onSelect: wrappedOnSelect, onHover, onClose})`; if it returns truthy, calls `preventDefault()` + `stopPropagation()`.
  - Mount effect (`useEffect`, deps `[]`, L265-L272): Calls `onOpen()` on mount and `onClose()` on unmount — drives the popup-open app state lifecycle.
  - `sceneFilteredFonts` / `availableFilteredFonts` (`useMemo`, L274-L282): Re-partition `filteredFonts` by `sceneFamilies` membership for the two rendered groups.
  - `FontPickerListItem` (inner component, L284-L342): Props `{ font: FontDescriptor; order: number }`.
    - Owns `ref = useRef<HTMLButtonElement>(null)` (L291); derives `isHovered`/`isSelected` (L292-L293).
    - Scroll effect (`useEffect`, deps `[isHovered, order]`, L295-L305): when hovered, scrolls into view — `order === 0` uses `{ block: "end" }` (so the group title above stays visible), otherwise `{ block: "nearest" }`. Non-obvious UX/scroll detail relevant for parity.
    - Renders a `<button type="button" value={font.value}>` with `getDropdownMenuItemClassName("", isSelected, isHovered)`, `tabIndex={isSelected ? 0 : -1}` (only the selected font is tab-focusable), `onClick` → `wrappedOnSelect(Number(value))`, `onMouseMove` → `onHover(font.value)` (guarded to fire only when hover changes). Inner `MenuItemContent` renders the icon, optional `DropDownMenuItemBadge`, and applies `textStyle.fontFamily = getFontFamilyString({ fontFamily: font.value })` so each row previews in its own font.
  - `groups` array (L344-L368): Pushes a `DropdownMenuGroup` titled `fontList.sceneFonts` for scene fonts and one titled `fontList.availableFonts` for available fonts; the available group's per-item `order` is offset by `sceneFilteredFonts.length` so keyboard scroll ordering is continuous across groups.
  - Render (L370-L408): Wraps everything in `PropertiesPopover` (`width: 15rem`) with: `onClose` → `onClose()` plus, when editing text, a `setTimeout(...,0)` re-focus of the WYSIWYG textarea; `onPointerLeave={onLeave}`; `onKeyDown`; `preventAutoFocusOnTouch={!!app.state.editingTextElement}`. Renders the `QuickSearch` (ref `inputRef`, `onChange={debounce(setSearchTerm, 20)}` — 20ms debounce) only when `stylesPanelMode === "full"`, then a `ScrollableList` (classes `dropdown-menu fonts manual-hover`, empty placeholder `fontList.empty`) containing `groups` or null.
  - `React.memo` comparator (L410-L412): re-renders only when `selectedFontFamily` or `hoveredFontFamily` change.

---

### packages/excalidraw/components/FontPicker/FontPickerTrigger.tsx

Purpose: The Radix popover trigger button (a `TextIcon` `ButtonIcon`) that opens/closes the font list, with a compact-mode mobile style.

- `FontPickerTriggerProps` (interface, L13-L17): `selectedFontFamily: FontFamilyValues | null`, optional `isOpened?: boolean`, optional `compactMode?: boolean`.
- `FontPickerTrigger` (React component, L19-L58): Exported.
  - Props as above; `isOpened` defaults `false`, `compactMode` defaults `false` (L21-L22).
  - Hooks: `setAppState = useExcalidrawSetAppState()` (L24).
  - `compactStyle` (L26-L32): when `compactMode`, spreads `MOBILE_ACTION_BUTTON_BG` and forces `width/height: "2rem"`; otherwise `{}`.
  - Render: `Popover.Trigger asChild` wrapping a `<div data-openpopup="fontFamily" className="properties-trigger">` containing a `ButtonIcon` (`icon={TextIcon}`, title `labels.showFonts`, `active={isOpened}`, testId `font-family-show-fonts`).
  - Event handler `onClick` (L44-L49): Calls `setAppState` with an updater that closes the popup (`openPopup: null`) only if `appState.openPopup === "fontFamily"`, otherwise leaves `openPopup` unchanged. Style forces `border: "none"` plus the compact style. (Note: `selectedFontFamily` is in props but unused in the body.)
  - State/refs/effects: none owned.

---

### packages/excalidraw/components/FontPicker/keyboardNavHandlers.ts

Purpose: Pure keyboard-navigation reducer for the font list, operating on the doubly-linked `Node<FontDescriptor>` list.

- `FontPickerKeyNavHandlerProps` (interface, L7-L15): `event: React.KeyboardEvent<HTMLDivElement>`, `inputRef`, `hoveredFont: Node<FontDescriptor> | undefined`, `filteredFonts: Node<FontDescriptor>[]`, and callbacks `onClose`, `onSelect(value: number)`, `onHover(value: number)`.
- `fontPickerKeyHandler = ({ event, inputRef, hoveredFont, filteredFonts, onClose, onSelect, onHover }) => boolean | undefined` (L17-L68): Exported. Branches on the key and returns `true` when it handles the event (caller then prevents default/propagation):
  - Shift+F without CTRL/CMD (L26-L34): re-focus the search `inputRef` (the popup-trigger shortcut), return `true`.
  - Escape (L36-L39): `onClose()`, return `true`.
  - Enter (L41-L47): if `hoveredFont?.value`, `onSelect(hoveredFont.value)`; return `true`.
  - ArrowDown (L49-L57): hover `hoveredFont.next.value` if present, else wrap to `filteredFonts[0].value`; return `true`.
  - ArrowUp (L59-L67): hover `hoveredFont.prev.value` if present, else wrap to the last element `filteredFonts[length-1].value`; return `true`.
  - Falls through to `undefined` (unhandled) for any other key. Uses linked-list `.next`/`.prev` traversal with wraparound at the ends — relevant for parity.

---

### packages/excalidraw/components/footer/Footer.tsx

Purpose: The editor's bottom footer bar — left cluster (zoom + undo/redo), a center tunnel slot, and a right cluster (welcome-hint + help button), all with zen-mode transition handling.

- `Footer` (React component, default export, L13-L75): Props `{ appState: UIAppState; actionManager: ActionManager; showExitZenModeBtn: boolean; renderWelcomeScreen: boolean }`.
  - Hooks: `useTunnels()` → `FooterCenterTunnel`, `WelcomeScreenHelpHintTunnel` (L24).
  - Render: a `<footer role="contentinfo">` with footer-bar classes.
    - Left div (L31-L55): class toggles `--transition-left` when `appState.zenModeEnabled`. Contains a `Stack.Col gap={2}` → `Section heading="canvasActions"` with `ZoomActions` (`renderAction={actionManager.renderAction}`, `zoom={appState.zoom}`) and, unless `appState.viewModeEnabled`, `UndoRedoActions` (with a zen-mode `--transition-bottom` class toggle).
    - `FooterCenterTunnel.Out` (L56): renders whatever `FooterCenter` injected.
    - Right div (L57-L68): zen-mode `transition-right` toggle; a relatively-positioned wrapper that renders `WelcomeScreenHelpHintTunnel.Out` when `renderWelcomeScreen`, and a `HelpButton` whose `onClick` runs `actionManager.executeAction(actionShortcuts)`.
    - `ExitZenModeButton` (L69-L72): passed `actionManager` and `showExitZenModeBtn`.
  - State/refs/effects: none owned (pure presentational). `Footer.displayName = "Footer"` (L78).

---

### packages/excalidraw/components/footer/FooterCenter.tsx

Purpose: Public composition slot that injects user-supplied children into the footer's center tunnel.

- `FooterCenter` (React component, default export, L8-L23): Props `{ children?: React.ReactNode }`.
  - Hooks: `useTunnels()` → `FooterCenterTunnel` (L9); `useUIAppState()` → `appState` (L10).
  - Render: `FooterCenterTunnel.In` wrapping a `<div className={clsx("footer-center zen-mode-transition", { "layer-ui__wrapper__footer-left--transition-bottom": appState.zenModeEnabled })}>` containing `children`. Uses the tunnel-rat in/out pattern so children declared anywhere in the tree render at the footer center.
  - State/refs/effects: none owned. `FooterCenter.displayName = "FooterCenter"` (L26).

---

### packages/excalidraw/components/HandButton.tsx

Purpose: The toolbar "Hand" (pan) tool radio button, wrapping the shared `ToolButton`.

- `LockIconProps` (type, L10-L16): `{ title?: string; name?: string; checked: boolean; onChange?(): void; isMobile?: boolean }`. (Name is misleading — it's the Hand button's props.)
- `HandButton` (React component, L18-L34): Exported. Props as `LockIconProps`.
  - Render: a `ToolButton` with `type="radio"`, `icon={handIcon}`, `name="editor-current-shape"`, `checked={props.checked}`, className `clsx("Shape", { fillable: false, active: props.checked })`, `title`/`aria-label` = `` `${props.title} — H` ``, `keyBindingLabel` = `KEYS.H.toLocaleUpperCase()` only when not mobile (else undefined), `aria-keyshortcuts={KEYS.H}`, `data-testid="toolbar-hand"`, and `onChange={() => props.onChange?.()}`.
  - State/refs/effects: none owned (pure wrapper). The "H" shortcut label and key binding are the notable parity detail.
