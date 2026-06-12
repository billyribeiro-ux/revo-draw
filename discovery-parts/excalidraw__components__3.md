## Cluster: excalidraw__components__3

This cluster covers the ColorPicker keyboard-navigation/sub-rendering pieces (`keyboardNavHandlers.ts`, `Picker.tsx`, `PickerColorList.tsx`, `PickerHeading.tsx`, `ShadeList.tsx`, `TopPicks.tsx`) plus the global `CommandPalette.tsx`.

A recurring concept across the ColorPicker files: a palette is `ColorPaletteCustom`, a record keyed by color name. Each value is either a single color string OR an array of shade strings (`palette[colorName][shadeIndex]`). `getColorNameAndShadeFromColor({ color, palette })` (defined in the sibling `colorPickerUtils.ts`, in cluster `__2`) resolves the current `color` string back to `{ colorName, shade }` (shade is the array index or `null` for single-value entries). The active section is tracked in a shared jotai atom `activeColorPickerSectionAtom` whose value is one of `"custom" | "baseColors" | "shades" | "hex" | null`. `COLORS_PER_ROW` (from `@excalidraw/common`) governs the 2D arrow-key grid wrapping.

---

### packages/excalidraw/components/ColorPicker/keyboardNavHandlers.ts

Purpose: Pure keyboard-navigation logic for the color picker — translates arrow keys, Tab, hotkeys (1-5, color letters, eyedropper) into color changes and active-section transitions; UI-free.

- `arrowHandler(eventKey: string, currentIndex: number | null, length: number)` — returns `number | undefined`. L18-L46. Computes the next index in a wrapped 2D grid of `length` items laid out `COLORS_PER_ROW` per row (`rows = ceil(length / COLORS_PER_ROW)`). `currentIndex ?? -1` so a null start behaves like "before first".
  - `ArrowLeft` (L28-L31): `currentIndex - 1`, wrapping to `length - 1` when negative.
  - `ArrowRight` (L32-L34): `(currentIndex + 1) % length`.
  - `ArrowDown` (L35-L38): `currentIndex + COLORS_PER_ROW`; if that overflows `length`, wraps back to the same column in the first row (`currentIndex % COLORS_PER_ROW`).
  - `ArrowUp` (L39-L44): `currentIndex - COLORS_PER_ROW`; if negative, wraps to the bottom row at the same column (`COLORS_PER_ROW * rows + prevIndex`); returns `undefined` if the wrapped index is `>= length` (i.e. that bottom cell does not exist), which callers treat as "do not move / boundary".
  - Non-obvious detail: returns `undefined` (not the old index) on the ArrowUp out-of-range case — this is the signal that lets the picker leave the section/no-op rather than land on a phantom swatch.
- `interface HotkeyHandlerProps` — L48-L58. Inputs to `hotkeyHandler`: `e: React.KeyboardEvent`, `colorObj: { colorName; shade: number | null } | null`, `onChange`, `palette`, `customColors: string[]`, `setActiveColorPickerSection`, `activeShade: number`.
- `hotkeyHandler(props: HotkeyHandlerProps): boolean` — L63-L106. Returns true if it consumed the event. Order of checks:
  - L72-L83: If a shade is active and `Shift + Digit1..Digit5` is pressed (using `e.code`, with a comment that "shift + numpad is messed up on windows"), set the shade index to `Number(code.slice(-1)) - 1`, call `onChange(palette[colorName][newShade])`, switch section to `"shades"`.
  - L85-L92: Plain keys `"1".."5"` pick the nth custom color (`customColors[n-1]`) if present, switching section to `"custom"`.
  - L94-L104: If `e.key` is one of `colorPickerHotkeyBindings` (the base-color letter bindings), map it to the nth palette entry; if that entry is an array, pick `paletteValue[activeShade]`, else the single value; switch section to `"baseColors"`.
- `interface ColorPickerKeyNavHandlerProps` — L108-L122. Inputs to the exported handler (adds `event`, `activeColorPickerSection`, `color`, `updateData`, `onEyeDropperToggle`, `onEscape`).
- `colorPickerKeyNavHandler(props): boolean` (EXPORTED) — L127-L289. The main dispatch. Returns true if handled. Logic in order:
  - L140-L142: If `Ctrl/Cmd` is held, returns false (lets the combo bubble).
  - L144-L147: `Escape` → `onEscape(event)`.
  - L150-L153: `Alt` key alone → `onEyeDropperToggle(true)` (press-and-hold eyedropper).
  - L155-L158: `i` key → `onEyeDropperToggle()` (toggle).
  - L160: Resolves `colorObj` from `color`+`palette`.
  - L162-L218: `Tab` handling. Builds the ordered set of available sections from `sectionsMap` (`custom` requires customColors, `baseColors` always, `shades` requires `colorObj.shade != null`, `hex` always), reduces to a present-sections array, then advances by `+1`/`-1` (Shift) with wrap-around. On entering `"custom"` selects `customColors[0]`; on entering `"baseColors"` it verifies the current color is one of the palette base colors and falls back to `COLOR_PALETTE.black` if not. Calls `preventDefault`+`stopPropagation`.
  - L220-L232: Delegates to `hotkeyHandler`; returns true if it handled.
  - L234-L244: When section is `"shades"`, runs `arrowHandler(key, shade, COLORS_PER_ROW)` and applies `palette[colorName][newShade]` (note `length` passed is `COLORS_PER_ROW`, treating shades as a single row).
  - L246-L270: When section is `"baseColors"`, navigates over `Object.keys(palette)` via `arrowHandler`, then emits the shaded or single value at `activeShade`.
  - L272-L286: When section is `"custom"`, navigates over `customColors` indices.
  - Invariant: the arrow handlers only fire when there is a resolvable `colorObj` (except custom, which defaults index to 0 if color unknown).

---

### packages/excalidraw/components/ColorPicker/Picker.tsx

Purpose: The forwardRef container component that assembles the color-picker dialog body (custom colors, base colors, shades, optional children) and wires the keyboard handler, eyedropper, and focus management.

- `interface PickerProps` — L32-L44. Props: `color: string | null`, `onChange`, `type: ColorPickerType`, `elements: readonly ExcalidrawElement[]`, `palette: ColorPaletteCustom`, `updateData`, optional `children`, `showTitle?`, `onEyeDropperToggle`, `onEscape`, `showHotKey? = true`.
- `Picker = React.forwardRef((props, ref) => …)` (EXPORTED) — L46-L210. The component.
  - `title` (L63-L69): derived label from `type` (`"elementStroke"` → stroke, `"elementBackground"` → background, else null) only when `showTitle`.
  - State `customColors` via `useState(initializer)` (L71-L76): computed once. Empty array for `"canvasBackground"`; otherwise `getMostUsedCustomColors(elements, type, palette)`. Lazy init so it is not recomputed on every render.
  - `[activeColorPickerSection, setActiveColorPickerSection]` from the shared atom (L78-L80).
  - `colorObj` (L82-L85): resolved from color+palette each render.
  - Effect L87-L109: when no active section, choose an initial section: if color is custom-but-not-in-list → `null`; custom-in-list → `"custom"`; has shade → `"shades"`; else `"baseColors"`.
  - State `activeShade` via `useState` (L111-L116): initial = `colorObj?.shade` else default index by type (`DEFAULT_ELEMENT_BACKGROUND_COLOR_INDEX` / `DEFAULT_ELEMENT_STROKE_COLOR_INDEX`).
  - Effect L118-L132: syncs `activeShade` from `colorObj.shade` when present, AND registers a capture-phase `keyup` listener on `document` that calls `onEyeDropperToggle(false)` when `Alt` is released (pairs with the keydown Alt-hold). Cleanup removes the listener. Side effect: global document listener.
  - Ref `pickerRef` (L133) + `useImperativeHandle(ref, () => pickerRef.current!)` (L135) exposes the inner div to parents.
  - Effect L137-L139: focuses `pickerRef` on mount.
  - Render (L141-L208): outer `div role="dialog" aria-modal="true"`. Inner div has `onKeyDown` calling `colorPickerKeyNavHandler` and, if handled, `preventDefault`+`stopPropagation`. `tabIndex={-1}` (focusable by click, not Tab). Conditionally renders the custom-colors block (`CustomColorList`), the base `PickerColorList`, and `ShadeList`, each under a `PickerHeading`, then `{children}`.
  - Notable: keyboard handling is doubly guarded — both the inner div's `onKeyDown` and the handler itself call `stopPropagation`, to keep editor-global shortcuts from firing while the picker is open.

---

### packages/excalidraw/components/ColorPicker/PickerColorList.tsx

Purpose: Renders the grid of base palette color swatch buttons (one per palette key) with hotkey labels and focus-on-active behavior.

- `interface PickerColorListProps` — L18-L24. `palette`, `color`, `onChange`, `activeShade: number`, `showHotKey? = true`.
- `PickerColorList(props)` (default export) — L26-L93.
  - `colorObj` from color+palette (L33-L36); `[activeColorPickerSection, setActiveColorPickerSection]` from atom (L37-L39); `btnRef` (L41).
  - Effect L43-L47: focuses `btnRef` (the active swatch) when section is `"baseColors"`; dependency on `colorObj?.colorName` so focus follows arrow-key selection.
  - Render L49-L92: maps `Object.entries(palette)` to buttons. For each entry, the displayed `color` is `value[activeShade]` if array else `value`, defaulting to `"transparent"` (L52-L53). `keybinding = colorPickerHotkeyBindings[index]` (L55). `label` is i18n-looked-up by stripping trailing digits from the key (L56-L60). Button gets `ref` only when it is the active color (L64), `tabIndex={-1}`, classes `active`/`is-transparent`, `onClick` → `onChange(color)` + set section `"baseColors"`, `title` showing label + hex (when starting with `#`) + keybinding, `aria-label`, and CSS var `--swatch-color`. Inner `.color-picker__button-outline` div and an optional `HotkeyLabel`.
  - Coordinate/visual detail: swatch color is driven entirely via the `--swatch-color` CSS custom property, not inline background — relevant for parity with a canvas/Svelte reimplementation.

---

### packages/excalidraw/components/ColorPicker/PickerHeading.tsx

Purpose: Trivial presentational wrapper for a section heading inside the color picker.

- `PickerHeading({ children }: { children: ReactNode })` (default export) — L3-L5. Renders `<div className="color-picker__heading">{children}</div>`. No state, no logic.

---

### packages/excalidraw/components/ColorPicker/ShadeList.tsx

Purpose: Renders the row of shade swatches for the currently selected base color, or a "no shades" placeholder when the color has no shade array.

- `interface ShadeListProps` — L15-L20. `color: string | null`, `onChange`, `palette`, `showHotKey?`.
- `ShadeList(props)` (EXPORTED) — L22-L116.
  - `colorObj` resolved from `color || "transparent"` (L28-L31) — note the fallback to transparent so a null color still resolves a name. `[activeColorPickerSection, setActiveColorPickerSection]` from atom (L33-L35); `btnRef` (L37).
  - Effect L39-L43: focuses the active shade button when section is `"shades"`; dep on `colorObj`.
  - If `colorObj` resolves and `palette[colorName]` is an array (L45-L83): renders one button per shade. `ref` attaches to the button when `i === shade && section === "shades"`. Each button: `tabIndex={-1}`, class `active` when `i === shade`, `aria-label="Shade"`, `title` = `${colorName} - ${i+1}`, `--swatch-color` style, `onClick` → `onChange(color)` + set `"shades"`. Optional `HotkeyLabel` with `keyLabel={i+1}` and `isShade`.
  - Fallback (L86-L114): when there are no shades, renders an empty disabled swatch button plus an absolutely-positioned centered overlay div with the `colorPicker.noShades` i18n text. Pure CSS centering (flex, absolute fill).

---

### packages/excalidraw/components/ColorPicker/TopPicks.tsx

Purpose: Renders the small fixed row of "top pick" preset color swatches shown above/outside the full picker, varying by picker type.

- `interface TopPicksProps` — L13-L18. `onChange`, `type: ColorPickerType`, `activeColor: string | null`, `topPicks?: readonly string[]`.
- `TopPicks(props)` (EXPORTED) — L20-L73.
  - Selects `colors` by `type`: `DEFAULT_ELEMENT_STROKE_PICKS` / `DEFAULT_ELEMENT_BACKGROUND_PICKS` / `DEFAULT_CANVAS_BACKGROUND_PICKS` (L26-L37). If `topPicks` prop is provided it overrides the defaults (L40-L42). If no colors resolved, logs `console.error` and returns null (L44-L47).
  - Render L49-L72: maps colors to buttons; classes: `active` when `color === activeColor`, `is-transparent` for transparent/empty, and `has-outline` only when `!isColorDark(color, COLOR_OUTLINE_CONTRAST_THRESHOLD)` (L56-L59). Uses `--swatch-color` style, `title=color`, `onClick` → `onChange(color)`, `data-testid` per color.
  - Non-obvious detail: the outline is conditional on a contrast/darkness test (`isColorDark` against `COLOR_OUTLINE_CONTRAST_THRESHOLD`) — light swatches get a visible outline so they read against a light background. Important for visual parity.

---

### packages/excalidraw/components/CommandPalette/CommandPalette.tsx

Purpose: The global command palette (Cmd/Ctrl+Shift+P or Cmd+/) — aggregates actions, tool shortcuts, library items and custom items into a fuzzy-searchable, keyboard-navigable dialog.

- Module atom `lastUsedPaletteItem` — L83. jotai atom holding the last-executed command for the "recents" row.
- `DEFAULT_CATEGORIES` (EXPORTED const) — L85-L93. Maps category keys to display labels (`app`, `export`, `tools`, `editor`, `elements`, `links`, `library`).
- `getCategoryOrder(category: string): number` — L95-L112. Returns a sort weight per category (app=1 … links=6, default=10) so categories render in a fixed order.
- `CommandShortcutHint({ shortcut, className?, children? })` — L114-L137. Renders a shortcut as styled key chips. L123: splits the shortcut on `+`, but first replaces a literal `"++"` with `"+$"` so a literal plus key survives the split (the `$` token is rendered back as `+` at L130). Pure presentational.
- `isCommandPaletteToggleShortcut(event: KeyboardEvent): boolean` — L139-L146. True when (no Alt) AND Ctrl/Cmd AND (Shift+P OR `/`). Used both to open the palette and to ignore that combo inside the input.
- `type CommandPaletteProps` — L148-L150. `{ customCommandPaletteItems?: CommandPaletteItem[] }`.
- `CommandPalette` (EXPORTED) — `Object.assign(component, { defaultItems })` — L152-L196. Outer gate component:
  - Reads `uiAppState`, `setAppState` (L154-L155).
  - Effect L157-L185: registers a capture-phase window `keydown` listener; on the toggle shortcut, toggles `openDialog` between `"commandPalette"` and null and fires `trackEvent("command_palette","open","shortcut")` on open.
  - L187-L189: returns null unless the dialog is open; otherwise renders `<CommandPaletteInner />`. The `defaultItems` namespace is attached as a static for consumers.
- `CommandPaletteInner({ customCommandPaletteItems })` — L198-L974. The real palette.
  - Hooks: `useApp`, `useUIAppState`, `useExcalidrawSetAppState`, `useAppProps`, `useExcalidrawActionManager` (L201-L205).
  - State/refs: `[lastUsed, setLastUsed]` (atom, L207), `allCommands` (L208-L210), `inputRef` (L212), `stableDeps = useStable({uiAppState, customCommandPaletteItems, appProps})` (L214-L218 — frozen so the big build effect doesn't re-run on frequent prop changes), `commandSearch` (L643), `currentCommand` (L644-L645), `commandsByCategory` (L646-L648).
  - `libraryCommands` `useMemo` — L221-L246. Maps named library items to commands whose `perform` inserts the item via `app.onInsertElements(distributeLibraryItemsOnSquareGrid([item]))`; icon is a `<LibraryItemIcon>`; `haystack = deburr(name)`.
  - Build effect L248-L641: constructs `allCommands`. Reads frozen deps from `stableDeps` (comment L249-L252 explains commands intentionally do NOT update while the palette is open). Helpers:
    - `getActionLabel(action)` L256-L272 — resolves function-or-string `action.label` through i18n (calling the fn with non-deleted elements + appState + app).
    - `getActionIcon(action)` L274-L279 — resolves function-or-static icon.
    - `actionToCommand(action, category, transformer?)` L283-L305 — wraps an `Action` into a `CommandPaletteItem`, capturing shortcut/keywords/predicate/viewMode and a `perform` that calls `actionManager.executeAction(action, "commandPalette")`; optional transformer post-processes.
    - Builds `elementsCommands` (L308-L357, with a default predicate requiring a non-empty selection), `toolCommands` (L358-L362), `editorCommands` (L364-L380), `exportCommands` (L382-L387), then `commandsFromActions` plus inline command objects for clear-canvas, export-image (L389-L424), and `additionalCommands` (library/search/shape-switch/stroke/background/canvas-bg colors with predicates, every SHAPES tool filtered by `UIOptions.tools`, lock, text-to-diagram, mermaid — L426-L608).
    - L610-L623: normalizes all commands — defaults icon to `boltIcon`, computes `order` (`command.order ?? getCategoryOrder(category)`), and builds the fuzzy `haystack = deburr(label.toLowerCase()) + keywords`.
    - L625-L630: `setAllCommands` and refreshes `lastUsed` by label identity (so a stale reference resolves to the new command object or null).
  - `closeCommandPalette(cb?)` — L650-L658. Clears `openDialog` (with optional callback) and resets search.
  - `executeCommand(command, event)` — L660-L677. Guards that the palette is open, stops/prevents the event, adds `excalidraw-animations-disabled` to body, closes the palette, then in the close callback runs `command.perform({ actionManager, event })`, records `lastUsed`, and re-enables animations on the next `requestAnimationFrame`. Side effect: toggles a global body class to suppress animation fl/CLS during command execution.
  - `isCommandAvailable(command)` `useStableCallback` — L679-L694. False if `viewMode === false` while view mode is on; otherwise evaluates `command.predicate` (function with elements/appState/appProps/app, or boolean, or undefined→true).
  - `handleKeyDown(event)` `useStableCallback` — L696-L807. The core nav:
    - L697-L709: builds `ignoreAlphanumerics` (true when focus is in a writable element, the toggle combo, or Escape) and early-returns unless the key is Up/Down/Enter.
    - ArrowUp (L715-L753) and ArrowDown (L755-L783): move `currentCommand` through the flattened `matchingCommands`, with special wrap handling that weaves the `lastUsed` "recents" item in/out of the cycle when `shouldConsiderLastUsed`. Indices wrap modulo list length.
    - Enter (L785-L791): `setTimeout(() => executeCommand(currentCommand, event))` (deferred so the keydown finishes first).
    - L793-L806: if not ignoring alphanumerics, `stopPropagation` (block editor shortcuts); a single `[a-zA-Z0-9]` keypress focuses the input; otherwise `preventDefault`.
  - Effect L809-L817: registers `handleKeyDown` as a capture-phase window keydown listener.
  - Filter/sort effect L819-L884: rebuilds `commandsByCategory` and `currentCommand` whenever search/commands change. With no search: filters by availability, sorts by `order`, optionally pulls `lastUsed` out into recents, sets `currentCommand` to lastUsed or first. With search (>1 char it also appends `libraryCommands`): normalizes the query (`deburr` + strip `[<>_| -]`), runs `fuzzy.filter` over `haystack`, sorts by descending score, groups by category, and selects the top match. `getNextCommandsByCategory` (L824-L835) buckets commands by `category`.
  - Render L886-L973: `<Dialog size={720} closeOnClickOutside autofocus className="command-palette-dialog">` containing a `TextField` (search, `selectOnRender`, `inputRef`), a shortcuts hint row (hidden on phone form factor), the recents block (when `lastUsed` and no search), and the categorized command list (`CommandItem` per command, `"large"` size for the Library category) or a "no match" message.
- `LibraryItemIcon({ id, elements })` — L975-L988. Renders a div ref into which `useLibraryItemSvg(id, elements, svgCache, ref)` paints the cached library SVG (`useLibraryCache` provides `svgCache`). Side effect: imperatively injects SVG into the ref'd DOM node.
- `CommandItem({ command, isSelected, disabled?, onMouseMove, onClick, showShortcut, appState, size = "small" })` — L990-L1048. Renders one command row. The `ref` callback scrolls the selected, non-disabled item into view (`scrollIntoView({ block: "nearest" })`) — keeps the keyboard cursor visible. Disabled rows swap handlers for `noop` and show a not-available title. Renders the icon (function-or-static via `InlineIcon`), an `Ellipsify`'d label, and a `CommandShortcutHint` when `showShortcut` and a shortcut exist.
  - Performance/UX detail: selection-driven `scrollIntoView` in a ref callback (not an effect) is how the list keeps the active item in view during arrow-key navigation — relevant for parity.
