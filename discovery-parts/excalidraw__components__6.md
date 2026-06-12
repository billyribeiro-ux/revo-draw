## Cluster: excalidraw__components__6

This cluster is the leaf-node layer of Excalidraw's dropdown-menu component family. Every file is a thin React presentational wrapper around either the Radix UI `DropdownMenu.Item` primitive or a plain DOM element, sharing two helpers imported from a sibling `./common` module (`getDropdownMenuItemClassName` and `useHandleDropdownMenuItemSelect`) and a shared inner layout component (`DropdownMenuItemContent`). There is no canvas, geometry, or coordinate-space math in this cluster — it is pure UI composition. For a Svelte/Canvas parity reimplementation, the load-bearing details are: the className composition rules, the `asChild` + native-`<button>`/`<a>` rendering pattern, the badge color/style switch, the phone form-factor gating of shortcuts, and the radio variant's layout structure.

---

### packages/excalidraw/components/dropdownMenu/DropdownMenuItem.tsx

Purpose: The primary selectable dropdown menu row — a Radix `DropdownMenu.Item` rendered `asChild` over a native `<button>`, plus an attached `Badge` subcomponent and badge-type constant.

- `DropdownMenuItemProps` (type, L19-L28): Props shape — `icon?: JSX.Element`, `badge?: React.ReactNode`, `value?: string | number | undefined`, `onSelect?: (event: Event) => void`, `children: React.ReactNode`, `shortcut?: string`, `selected?: boolean`, `className?: string`, intersected with `Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onSelect">` (so it accepts arbitrary native button attributes but overrides the native `onSelect`).
- `DropdownMenuItem = ({ icon, badge, value, children, shortcut, className, selected, onSelect, ...rest }: DropdownMenuItemProps)` (L30-L61): The component. Calls `useHandleDropdownMenuItemSelect(onSelect)` (from `./common`) to get a wrapped `handleSelect` (L41). Renders `<DropdownMenuPrimitive.Item className="radix-menu-item" onSelect={handleSelect} asChild>` wrapping a native `<button>` that spreads `...rest`, sets `value`, computes `className` via `getDropdownMenuItemClassName(className, selected)`, and sets `title={rest.title ?? rest["aria-label"]}` (L44-L59). Inner content is delegated to `<MenuItemContent icon shortcut badge>{children}</MenuItemContent>`. Side effect/invariant: the `asChild` pattern means Radix forwards its item behavior (focus, keyboard nav, `onSelect` semantics) onto the underlying `<button>`; `title` falls back to the aria-label for hover tooltips. `displayName = "DropdownMenuItem"` set L62.
- `DropDownMenuItemBadgeType` (const, L64-L68): Frozen object `{ GREEN: "green", RED: "red", BLUE: "blue" } as const` — the enum of badge color variants.
- `DropDownMenuItemBadge = ({ type = DropDownMenuItemBadgeType.BLUE, children }: { type?: ValueOf<typeof DropDownMenuItemBadgeType>; children: React.ReactNode })` (L70-L114): Renders a small inline badge `<div className="DropDownMenuItemBadge">`. Reads theme via `useExcalidrawAppState()` (L77). Builds a base inline-style object (L78-L86): `display: inline-flex`, `marginLeft: auto` (pushes badge to the right edge of the row), `padding: "2px 4px"`, `borderRadius: 6`, `fontSize: 9`, `fontFamily: "Cascadia, monospace"`, and a conditional `border: theme === THEME.LIGHT ? "1.5px solid white" : "none"`. Then a `switch (type)` mutates the style via `Object.assign` (L88-L107): GREEN → `backgroundColor: var(--background-color-badge)` / `color: var(--color-badge)`; RED → `backgroundColor: pink` / `color: darkred`; BLUE/default → `background: var(--color-promo)` / `color: var(--color-surface-lowest)`. `displayName = "DropdownMenuItemBadge"` (L115). Notable: in light theme a white 1.5px border is drawn around every badge regardless of type.
- `DropdownMenuItem.Badge = DropDownMenuItemBadge` (L117): Attaches the badge as a static property so callers can write `<DropdownMenuItem.Badge>`.
- Default export: `DropdownMenuItem` (L119). Named export: `DropDownMenuItemBadgeType`, `DropDownMenuItemBadge`.

---

### packages/excalidraw/components/dropdownMenu/DropdownMenuItemCheckbox.tsx

Purpose: A checkbox-flavored dropdown item that maps a boolean `checked` prop to a check/empty icon and otherwise defers entirely to `DropdownMenuItem`.

- `DropdownMenuItemCheckbox = (props: Omit<DropdownMenuItemProps, "icon"> & { checked: boolean })` (L7-L13): Renders `<DropdownMenuItem {...props} icon={props.checked ? checkIcon : emptyIcon} />`. It removes `icon` from the accepted props and synthesizes it from `checked`: `checkIcon` when true, `emptyIcon` (a blank spacer icon preserving layout alignment) when false (icons imported from `../icons`, L1). No state, no effects. Invariant: alignment is preserved in the unchecked state via `emptyIcon` rather than rendering no icon. Default export L15.

---

### packages/excalidraw/components/dropdownMenu/DropdownMenuItemContent.tsx

Purpose: The shared internal layout primitive that arranges icon, text (ellipsified), badge, and shortcut inside a menu row; reused by `DropdownMenuItem` and `DropdownMenuItemLink`.

- `MenuItemContent = ({ textStyle, icon, shortcut, children, badge }: { icon?: JSX.Element; shortcut?: string; textStyle?: React.CSSProperties; children: React.ReactNode; badge?: React.ReactNode })` (L7-L33): Calls `useEditorInterface()` (L20) to read the editor form factor. Renders a fragment with up to four parts: an optional `<div className="dropdown-menu-item__icon">{icon}</div>` (L23, only when `icon` is truthy); a `<div className="dropdown-menu-item__text" style={textStyle}>` wrapping `<Ellipsify>{children}</Ellipsify>` (L24-L26) for truncated text; an optional `<div className="dropdown-menu-item__badge">{badge}</div>` (L27); and an optional `<div className="dropdown-menu-item__shortcut">{shortcut}</div>` (L28-L30). Notable invariant/gating: the shortcut is only rendered when `shortcut` is truthy AND `editorInterface.formFactor !== "phone"` — shortcuts are suppressed on phone form factors. Default export L34. No own state/refs.

---

### packages/excalidraw/components/dropdownMenu/DropdownMenuItemContentRadio.tsx

Purpose: A generic (type-parameterized) dropdown-row content variant that embeds a `RadioGroup` of choices inline alongside a label, used for multi-option settings within a menu.

- `Props<T>` (type, L5-L17): `value: T`, `shortcut?: string`, `choices: { value: T; label: React.ReactNode; ariaLabel?: string }[]`, `onChange: (value: T) => void`, `children: React.ReactNode`, `name: string`, `icon?: React.ReactNode`.
- `DropdownMenuItemContentRadio = <T,>({ value, shortcut, onChange, choices, children, name, icon }: Props<T>)` (L19-L51): Generic over `T`. Calls `useEditorInterface()` (L28). Renders a row `<div className="dropdown-menu-item-base dropdown-menu-item-bare">` (L32) containing: optional icon div (L33), a `<label className="dropdown-menu-item__text">` with `<Ellipsify>{children}</Ellipsify>` (L34-L36), and a `<RadioGroup name value onChange choices />` (L37-L42, from `../RadioGroup`). After the row, an optional shortcut `<div className="dropdown-menu-item__shortcut dropdown-menu-item__shortcut--orphaned">` (L44-L48) — same phone-gating as `MenuItemContent` (`shortcut && editorInterface.formFactor !== "phone"`); the `--orphaned` modifier styles a shortcut that sits below/outside the inline radio row. `displayName = "DropdownMenuItemContentRadio"` (L53). Default export L55. Notable: this is the only content variant that uses the `dropdown-menu-item-bare` class and renders an interactive `RadioGroup` rather than a passive shortcut/badge.

---

### packages/excalidraw/components/dropdownMenu/DropdownMenuItemCustom.tsx

Purpose: An unopinionated container row for arbitrary custom content — a plain `<div>` with the base menu-item classes but no Radix item behavior, icon, or content scaffolding.

- `DropdownMenuItemCustom = ({ children, className = "", selected, ...rest }: { children: React.ReactNode; className?: string; selected?: boolean } & React.HTMLAttributes<HTMLDivElement>)` (L3-L23): Renders a `<div>` spreading `...rest` with a composed className built inline (L16-L18): `` `dropdown-menu-item-base dropdown-menu-item-custom ${className} ${selected ? "dropdown-menu-item--selected" : ""}`.trim() ``. The `.trim()` removes the trailing space when `selected` is falsy and `className` is empty. No Radix wrapper (so no keyboard/select semantics), no state/refs/effects. Default export L25. Invariant: unlike `DropdownMenuItem`, the selected modifier here is appended manually rather than via the shared `getDropdownMenuItemClassName` helper.

---

### packages/excalidraw/components/dropdownMenu/DropdownMenuItemLink.tsx

Purpose: An anchor (`<a>`)-based dropdown item for external links — same Radix `Item asChild` pattern as `DropdownMenuItem` but rendering an `<a target="_blank">` instead of a button.

- `DropdownMenuItemLink = ({ icon, shortcut, href, children, onSelect, className = "", selected, rel = "noopener", ...rest }: { href: string; icon?: JSX.Element; children: React.ReactNode; shortcut?: string; className?: string; selected?: boolean; onSelect?: (event: Event) => void; rel?: string } & React.AnchorHTMLAttributes<HTMLAnchorElement>)` (L13-L56): Calls `useHandleDropdownMenuItemSelect(onSelect)` (L33). Renders `<DropdownMenuPrimitive.Item className="radix-menu-item" onSelect={handleSelect} asChild>` over an `<a>` (L37-L54) that spreads `...rest`, sets `href`, `target="_blank"`, `rel={`noopener ${rel}`}` (note: `noopener` is always prepended, so the effective rel may be e.g. `"noopener noopener"` when `rel` defaults), the computed `className={getDropdownMenuItemClassName(className, selected)}`, and `title={rest.title ?? rest["aria-label"]}`. Inner content via `<MenuItemContent icon shortcut>{children}</MenuItemContent>` (no badge support, unlike the button variant). An ESLint disable comment for `react/jsx-no-target-blank` is present (L36) because `target="_blank"` is intentional. Default export L58; `displayName = "DropdownMenuItemLink"` (L59).

---

### packages/excalidraw/components/dropdownMenu/DropdownMenuSeparator.tsx

Purpose: A purely visual horizontal divider between menu sections.

- `MenuSeparator = ()` (L3-L12): Renders a single `<div>` with inline styles `height: "1px"`, `backgroundColor: "var(--default-border-color)"`, `margin: "6px 0"` (6px vertical spacing above and below), `flex: "0 0 auto"` (prevents the separator from growing/shrinking in a flex column). No props, no state. Default export L14; `displayName = "DropdownMenuSeparator"` (L15). Parity note: the 1px line plus 6px top/bottom margin = 13px total vertical footprint.
