## Cluster: excalidraw__components__2

This cluster covers small generic UI primitives (`Card`, `CheckboxItem`) plus the core of the **ColorPicker** subsystem (`ColorInput`, `ColorPicker`, `colorPickerUtils`, `CustomColorList`, `HotkeyLabel`). The ColorPicker is a Radix-Popover-based widget that combines top-pick swatches, a hex input, an eye-dropper, custom-color memory, and keyboard-hotkey-driven palette navigation.

---

### packages/excalidraw/components/Card.tsx

A presentational container that injects three CSS custom properties (`--card-color`, `--card-color-darker`, `--card-color-darkest`) based on a named color theme, used for promo/info cards.

- **`COLOR_MAP`** (const, L4-L20): Static lookup mapping each of `primary | lime | pink` to a `{ base, darker, darkest }` triple. `primary` uses CSS vars; `lime`/`pink` use hard-coded open-color hex values (lime[7/8/9], pink[7/8/9]). Invariant: the three keys are the only valid `color` prop values.
- **`Card`** (`React.FC<{ color: "primary" | "lime" | "pink"; children?: React.ReactNode }>`) (L22-L38): Renders a `<div className="Card">` whose inline `style` sets the three CSS vars from `COLOR_MAP[color]`. The `["--card-color" as any]` casts are needed because TS's `CSSProperties` does not type custom properties. No state/effects/handlers. Pure presentational.

---

### packages/excalidraw/components/CheckboxItem.tsx

A custom checkbox row (clickable label + box) that renders a check icon and manages focus on click.

- **`CheckboxItem`** (`React.FC<{ checked: boolean; onChange: (checked: boolean, event: React.MouseEvent) => void; className?: string; children?: React.ReactNode }>`) (L8-L37):
  - Renders an outer `<div className={clsx("Checkbox", className, { "is-checked": checked })}>` whose `onClick` (L17-L24) calls `onChange(!checked, event)` (toggles the boolean) and then imperatively queries `.Checkbox-box` inside `event.currentTarget` and `.focus()`es it — i.e. clicking the label moves focus to the inner button.
  - Inner `<button role="checkbox" aria-checked={checked}>` (L26-L33) renders the `checkIcon`; a `.Checkbox-label` div wraps `children`.
  - No internal state — fully controlled via `checked`/`onChange`. Side effect: imperative focus call on click. Accessibility: uses `role="checkbox"` + `aria-checked`.

---

### packages/excalidraw/components/ColorPicker/ColorInput.tsx

The hex-input field row of the color picker, with a "#" prefix, debounced-by-validation color commit, and an eye-dropper trigger.

- **`ColorInput`** (props: `{ color: string; onChange: (color: string) => void; label: string; colorPickerType: ColorPickerType; placeholder?: string }`) (L17-L134):
  - **State/refs**: `innerValue` (`useState(color)`, L31) — the raw text shown in the input, decoupled from the committed `color`; `inputRef` (L53) for the text input; `eyeDropperTriggerRef` (L54) for the eyedropper div. Two jotai atoms via `useAtom`: `activeColorPickerSectionAtom` (L32-L34) and `activeEyeDropperAtom` (L62). `editorInterface` from `useEditorInterface()` (L30) used to gate the eyedropper off on `formFactor === "phone"`.
  - **Effects**: (a) L36-L38 resyncs `innerValue` whenever the external `color` prop changes; (b) L56-L60 focuses `inputRef` whenever `activeSection` changes (so the hex input grabs focus when its section becomes active); (c) L64-L68 cleanup-only effect that clears the eyedropper state on unmount.
  - **`changeColor(inputValue: string)`** (`useCallback`, L40-L51): Lowercases the input, runs `normalizeInputColor(value)` (from `@excalidraw/common`); if it yields a valid color, calls `onChange(color)`. Always updates `innerValue` to the raw typed value (so the field reflects invalid in-progress text without committing it). Invariant: parent only sees normalized/valid colors.
  - **Input rendering** (L73-L97): `value` strips a leading `#` via `.replace(/^#/, "")` (the "#" is a separate sibling div, L72). `ref` is bound only when `activeSection === "hex"`. `onBlur` resets `innerValue` back to the committed `color` (discarding invalid text). `onFocus` sets the active section to `"hex"`. `tabIndex={-1}`. `onKeyDown` (L88-L95): lets `TAB` propagate (returns early), on `ESCAPE` moves focus to the eyedropper trigger, and otherwise `stopPropagation()` to keep keystrokes from reaching global shortcuts.
  - **Eyedropper trigger** (L99-L131): hidden on phones. Clicking toggles `activeEyeDropperAtom`: if currently set → `null`, else an object `{ keepOpenOnAlt: false, onSelect: (color) => onChange(color), colorPickerType }`. Title string composes the i18n label with the `I` key and `Alt` shortcut. A 1px divider is drawn before it.

---

### packages/excalidraw/components/ColorPicker/ColorPicker.tsx

The top-level color-picker widget: a Radix `Popover.Root` wrapping a trigger swatch, top-pick swatches, and (when open) the full picker popup with palette + hex input + eyedropper.

- **`ColorPickerProps`** (interface, L41-L55): `type: ColorPickerType`, `color: string | null` (null = indeterminate/multi-selection), `onChange`, `label`, `elements: readonly ExcalidrawElement[]`, `appState: AppState`, optional `palette?: ColorPaletteCustom | null`, optional `topPicks?: ColorTuple`, `updateData: (formData?: any) => void`.

- **`ColorPickerPopupContent`** (component, L57-L210): The popup body. Props are a `Pick` of `ColorPickerProps` plus `getOpenPopup: () => AppState["openPopup"]`.
  - Reads `container` from `useExcalidrawContainer()`, and `stylesPanelMode` from `useStylesPanelMode()` to derive `isCompactMode = mode !== "full"` and `isMobileMode = mode === "mobile"` (L80-L83). Uses `activeColorPickerSectionAtom` (setter) and `activeEyeDropperAtom`.
  - **`colorInputJSX`** (L88-L101): a `PickerHeading` + `ColorInput` block, passed either as a child of `Picker` (when a palette exists) or rendered standalone (L205-L207).
  - **`colorPickerContentRef`** (L103) + **`focusPickerContent()`** (L105-L107): imperatively focuses the picker content, used to re-grab focus after eyedropper interactions.
  - Renders a `PropertiesPopover` (L109-L209) with: `preventAutoFocusOnTouch={!!appState.editingTextElement}`; `onFocusOutside` (L115-L121) which refocuses the picker content if the focus target is not a writable element, then `preventDefault()`; `onPointerDownOutside` (L122-L129) which `preventDefault()`s while eyedropping so outside clicks don't close the popover; `onClose` (L130-L148) which clears `openPopup` to `null` (guarded by `getOpenPopup() === type` to avoid racing a switch), clears the active section, and — if editing text — refocuses `.excalidraw-wysiwyg` on a `setTimeout(...,0)`.
  - When `palette` is truthy, renders `<Picker>` (L150-L204): `onChange` handler (L155-L167) **saves and restores caret position** (`saveCaretPosition`/`restoreCaretPosition` from `useTextEditorFocus`) around the color change when `appState.editingTextElement` is set — important so applying a color while editing text doesn't lose the caret. `onEyeDropperToggle(force)` (L168-L188) toggles/forces `activeEyeDropperAtom` with `keepOpenOnAlt` semantics. `onEscape` (L189-L196) closes the eyedropper if active, else sets `openPopup: null`. Passes `showTitle={isCompactMode}` and `showHotKey={!isMobileMode}`.

- **`ColorPickerTrigger`** (component, L212-L280): The clickable swatch button that opens the popover and doubles as the active-color indicator.
  - Props: `{ color: string | null; label: string; type: ColorPickerType; mode?: "background" | "stroke"; onToggle: () => void; editingTextElement?: boolean }`.
  - Derives `isCompactMode`/`isMobileMode` from `useStylesPanelMode()`.
  - **`handleClick(e)`** (L230-L241): `preventDefault()` + `stopPropagation()` (runs before outside-close logic); if `editingTextElement`, calls `temporarilyDisableTextEditorBlur()` so opening the picker doesn't blur the wysiwyg; then `onToggle()`.
  - Renders a Radix `Popover.Trigger` with conditional classes: `is-transparent` (no color or `"transparent"`), `has-outline` (no color OR color is not "dark" per `isColorDark(color, COLOR_OUTLINE_CONTRAST_THRESHOLD)`), plus `compact-sizing`/`mobile-border`. Sets `--swatch-color` CSS var. In compact mode with a stroke color it overlays a `strokeIcon` whose text color is `#fff`/`#111` chosen by `isColorDark`. Renders `slashIcon` when there is no color (L263). **Notable**: outline/contrast decisions use `isColorDark` against `COLOR_OUTLINE_CONTRAST_THRESHOLD` — relevant for parity (light swatches need a visible border).

- **`ColorPicker`** (exported component, L282-L364): The public entry.
  - **State/refs**: `openRef = useRef(appState.openPopup)` (L293) kept in sync via an effect (L294-L296) so `getOpenPopup()` reads the latest popup without stale closure. `isCompactMode` from `useStylesPanelMode()`.
  - Renders an outer wrapper with `role="dialog" aria-modal="true"` and class `color-picker-container` (+ `--no-top-picks` modifier in compact mode). In non-compact mode it shows `<TopPicks>` and a `<ButtonSeparator>` (L309-L317).
  - `Popover.Root` `open={appState.openPopup === type}`; `onOpenChange` only acts on `open === true` (sets `openPopup: type`) — closing is handled by the popup's own `onClose`.
  - `ColorPickerTrigger.onToggle` (L333-L344): atomic switch logic — if this type is already open, set `openPopup: null` (toggle off); otherwise set `openPopup: type` (whether another popup was open or none). The popup content (`ColorPickerPopupContent`) is only mounted when `appState.openPopup === type` (L347-L359), passing `getOpenPopup={() => openRef.current}`.

---

### packages/excalidraw/components/ColorPicker/colorPickerUtils.ts

Pure utility + jotai-atom + type module for the color picker (palette lookup, custom-color extraction, hotkey grid).

- **`getColorNameAndShadeFromColor({ palette, color })`** → `{ colorName: ColorPickerColor; shade: number | null } | null` (L9-L33): Searches a `ColorPaletteCustom`. Returns `null` if `color` is falsy. For each palette entry: if the value is an array (a shade ramp), returns `{ colorName, shade: indexOf(color) }` when found; if the value is a scalar equal to `color`, returns `{ colorName, shade: null }`. Returns `null` if not found. Used to highlight the active swatch/shade.
- **`colorPickerHotkeyBindings`** (const, L35-L39): `[["q","w","e","r","t"],["a","s","d","f","g"],["z","x","c","v","b"]].flat()` → a flat 15-key array mapping keyboard positions to palette swatches (3 rows × 5). Invariant: order matters for keyboard navigation parity.
- **`isCustomColor({ color, palette })`** → boolean (L41-L50): Flattens all palette values and returns true iff `color` is NOT among them (i.e. it is a user-custom color).
- **`getMostUsedCustomColors(elements, type, palette)`** (L52-L88): `type` is `"elementBackground" | "elementStroke"`, mapped to the element field (`backgroundColor`/`strokeColor`) via `elementColorTypeMap`. Filters out deleted elements and palette colors (keeps only custom), tallies occurrences in a `Map<string, number>`, sorts descending by count, maps to color strings, and `slice(0, MAX_CUSTOM_COLORS_USED_IN_CANVAS)`. Output: the most-used custom colors for the "recent/custom" row. Performance note: O(n) over elements plus a sort over distinct colors.
- **`ActiveColorPickerSectionAtomType`** (type, L90-L95): `"custom" | "baseColors" | "shades" | "hex" | null`.
- **`activeColorPickerSectionAtom`** (jotai atom, L96-L97): tracks which picker section currently has focus (drives focus effects across `ColorInput`/`CustomColorList`/`Picker`).
- **`ColorPickerType`** (type, L99-L102): `"canvasBackground" | "elementBackground" | "elementStroke"`.

---

### packages/excalidraw/components/ColorPicker/CustomColorList.tsx

Renders the row of user "custom"/recently-used color swatch buttons with hotkey labels and auto-focus on the active swatch.

- **`CustomColorListProps`** (interface, L9-L14): `{ colors: string[]; color: string | null; onChange: (color: string) => void; label: string }`.
- **`CustomColorList`** (component, L16-L65):
  - Uses `activeColorPickerSectionAtom` (value + setter, L22-L24) and a `btnRef` (L26).
  - **Effect** (L28-L32): focuses `btnRef.current` whenever `color` or `activeColorPickerSection` changes — so the currently-selected custom swatch auto-focuses when this section activates.
  - Maps `colors` to `<button>` swatches (L36-L62): the active button (where `color === c`) receives `btnRef`; class adds `active` and `is-transparent` (for `"transparent"`/empty). `onClick` calls `onChange(c)` then sets the active section to `"custom"`. Sets `--swatch-color: c` CSS var, `title={c}`, `tabIndex={-1}`, and renders a `HotkeyLabel` with `keyLabel={i + 1}` (1-indexed). Key is the array index `i`.

---

### packages/excalidraw/components/ColorPicker/HotkeyLabel.tsx

Tiny overlay label showing the hotkey (and optional shift glyph) on a color swatch, with contrast-aware text color.

- **`HotkeyLabelProps`** (interface, L4-L8): `{ color: string; keyLabel: string | number; isShade?: boolean }`.
- **`HotkeyLabel`** (default-exported component, L9-L26): Renders `<div className="color-picker__button__hotkey-label">` whose text `color` is `#fff` if `isColorDark(color)` else `#000` (contrast against the swatch). When `isShade` is true it prefixes a `⇧` glyph (indicating the shift-modified hotkey for shades), then the `keyLabel`. No state/effects. **Notable**: the dark/light text decision via `isColorDark` is the same contrast pattern used in the trigger — matters for parity.
