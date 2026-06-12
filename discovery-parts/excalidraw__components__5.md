## Cluster: excalidraw__components__5

This cluster covers the Dialog/Modal primitives, the diagram-to-code plugin registration shim, and the foundation of the Radix-backed DropdownMenu component family (root, content, group, and the shared helpers/context).

### packages/excalidraw/components/DiagramToCodePlugin/DiagramToCodePlugin.tsx

Purpose: A render-less plugin component that registers a user-supplied `generate` callback into the app's plugin registry so the "magic frame → code" feature can invoke it.

- `DiagramToCodePlugin(props: { generate: GenerateDiagramToCode }): null` — L7-L19. A React function component that grabs the app instance via `useApp()` (L10), and in a `useLayoutEffect` keyed on `[app, props.generate]` (L12-L16) calls `app.setPlugins({ diagramToCode: { generate: props.generate } })`. Returns `null` (renders nothing). Side effect: mutates the app's plugins. Invariant: re-registers whenever `app` or `generate` identity changes; uses `useLayoutEffect` (not `useEffect`) so the plugin is available synchronously before paint. Input type `GenerateDiagramToCode` is imported from `../../types`.

### packages/excalidraw/components/Dialog.tsx

Purpose: The modal dialog primitive — wraps `Modal` + `Island`, manages focus trapping (Tab cycling), autofocus, and close lifecycle (restores prior focus, clears open menus).

Types/interfaces:
- `DialogSize = number | "small" | "regular" | "wide" | undefined` (L22) — exported type alias for dialog width sizing.
- `DialogProps` interface (L24-L32): `children: React.ReactNode`, `className?: string`, `size?: DialogSize`, `onCloseRequest(): void`, `title: React.ReactNode | false`, `autofocus?: boolean`, `closeOnClickOutside?: boolean`.

Functions/components:
- `getDialogSize(size: DialogSize): number` — L34-L48. Maps the semantic size token to a pixel max-width: a numeric size passes through (L35-L37); `"small"` → 550, `"wide"` → 1024, `"regular"`/default → 800 (L39-L47). Pure function; no side effects. Notable: this is the only place dialog pixel widths are defined (parity-relevant).
- `Dialog(props: DialogProps)` — L50-L137. The component.
  - State/refs: `[islandNode, setIslandNode] = useCallbackRefState<HTMLDivElement>()` (L51) — a callback ref so the focus effect re-runs once the Island DOM node mounts; `[lastActiveElement] = useState(document.activeElement)` (L52) captures the element focused before the dialog opened, for focus restoration on close. `id` from `useExcalidrawContainer()` (L53) used to build the title element id. `isFullscreen = useEditorInterface().formFactor === "phone"` (L54) — phone form factor renders a full-screen dialog with an explicit close button.
  - Effect (L56-L94, deps `[islandNode, props.autofocus]`): once `islandNode` exists, queries focusable elements via `queryFocusableElements(islandNode)` (L61); in a `setTimeout` (deferred to next tick), if `autofocus !== false` it focuses `focusableElements[1] || focusableElements[0]` (L63-L68) — i.e. it prefers the second focusable element so it skips the close button and focuses the first real control. It binds a `keydown` handler implementing a manual focus trap (L70-L89): on `TAB`, if at index 0 with Shift it wraps to the last focusable element (L78-L80); if at the last index without Shift it wraps to the first (L81-L87), each `preventDefault()`-ing. Cleanup removes the listener (L93). Invariant: focus stays inside the dialog while Tabbing.
  - `onClose` handler (L99-L104): sets `appState.openMenu = null` via `useExcalidrawSetAppState()` (L100), closes the library menu via `setIsLibraryMenuOpen(false)` (jotai `useSetAtom(isLibraryMenuOpenAtom)`, L97/L101), restores focus to `lastActiveElement` (L102), then calls `props.onCloseRequest()` (L103).
  - Render (L106-L136): a `Modal` with class `clsx("Dialog", className, { "Dialog--fullscreen": isFullscreen })` (L108-L110), `labelledBy="dialog-title"`, `maxWidth={getDialogSize(props.size)}` (L112), `onCloseRequest={onClose}`, and pass-through `closeOnClickOutside`. Inside, an `Island` (ref `setIslandNode`); conditionally a `<h2 id={`${id}-dialog-title`}>` title (L117-L121, only when `props.title` truthy), a phone-only close button rendering `CloseIcon` (L122-L132), and `<div className="Dialog__content">{children}</div>` (L133). Note: the `labelledBy="dialog-title"` literal does not include the `id` prefix used on the actual `<h2>` (`${id}-dialog-title`) — a pre-existing minor a11y id mismatch worth noting for parity.

### packages/excalidraw/components/DialogActionButton.tsx

Purpose: A styled action button for dialog footers supporting primary/danger variants and an in-place loading spinner overlay (default export).

- `DialogActionButton({ label, onClick, className, children, actionType, type = "button", isLoading, ...rest }): JSX` — L16-L47. Props type is `DialogActionButtonProps & React.ButtonHTMLAttributes<HTMLButtonElement>`.
  - `DialogActionButtonProps` interface (L9-L14): `label: string`, `children?: ReactNode`, `actionType?: "primary" | "danger"`, `isLoading?: boolean`.
  - Computes `cs = actionType ? `Dialog__action-button--${actionType}` : ""` (L26) to pick the variant CSS modifier.
  - Renders a `<button>` (L29-L45) with `clsx("Dialog__action-button", cs, className)`, `type`, `aria-label={label}`, `onClick`, and spread `...rest`. The optional `children` (icon) and the `label` text are each wrapped in a div whose style is `{ visibility: "hidden" }` while `isLoading` (L36-L39) so layout/size is preserved but content hidden; when loading, an absolutely-positioned (`position:"absolute", inset:0`) `<Spinner />` overlays the button (L40-L44). Performance/UX note: uses visibility (not display) to avoid layout shift while the spinner shows.
- `export default DialogActionButton` (L49).

### packages/excalidraw/components/dropdownMenu/common.ts

Purpose: Shared context, classname builder, and a select-handler composition hook used across the DropdownMenu item components.

- `DropdownMenuContentPropsContext` — L5-L7. A `React.createContext<{ onSelect?: (event: Event) => void }>({})`. Carries the content-level `onSelect` callback down to individual items so they can notify the menu when any item is chosen. Exported constant.
- `getDropdownMenuItemClassName(className = "", selected = false, hovered = false): string` — L9-L17. Builds the item class string: always `"dropdown-menu-item dropdown-menu-item-base"` plus the caller's `className`, appending `"dropdown-menu-item--selected"` when `selected` and `"dropdown-menu-item--hovered"` when `hovered`, then `.trim()`s (L14-L16). Pure function. Parity note: this exact class composition drives item visual state.
- `useHandleDropdownMenuItemSelect(onSelect: ((event: Event) => void) | undefined)` — L19-L27. A hook returning a composed event handler. Reads `DropdownMenuContentPropsContext` (L22) and uses `composeEventHandlers` (from `@excalidraw/common`) to run the item's own `onSelect` first and then the content-level `onSelect` (L24-L26). Behavior: clicking an item fires both the item handler and the menu-wide handler; `composeEventHandlers` respects `defaultPrevented` semantics from the upstream util. Side effect: none beyond invoking the callbacks.

### packages/excalidraw/components/dropdownMenu/DropdownMenu.tsx

Purpose: The root `DropdownMenu` component (built on Radix `DropdownMenu.Root`) plus the static sub-component namespace (`.Trigger`, `.Content`, `.Item`, etc.); default export.

- `DropdownMenu({ children, open }: { children?: React.ReactNode; open: boolean })` — L23-L56. The root component.
  - Extracts the trigger and content children via `getMenuTriggerComponent(children)` and `getMenuContentComponent(children)` (L30-L31, from `./dropdownMenuUtils`).
  - Injects the `open` prop into the content child: if `MenuContentComp` is a valid element, `React.cloneElement` it with `{ open }` (L32-L40), otherwise passes it through. This is how the controlled `open` state reaches `DropdownMenuContent` even though the consumer writes the content as a child.
  - Renders `DropdownMenuPrimitive.Root` with `open={open}` and `modal={false}` (L43) wrapping a `<div>` with class `CLASSES.DROPDOWN_MENU_EVENT_WRAPPER` and inline style `display: "contents"` (L44-L50) — the wrapper exists only to scope outside-click detection while being layout-transparent (`display:contents` removes it from box layout). Contains the trigger then the state-augmented content (L51-L52).
  - Static members assigned (L58-L66): `.Trigger`, `.Content`, `.Item`, `.ItemCheckbox`, `.ItemLink`, `.ItemCustom`, `.Group`, `.Separator` (= `MenuSeparator`), `.Sub`. `DropdownMenu.displayName = "DropdownMenu"` (L70).
  - Note: `modal={false}` keeps the rest of the page interactive while the menu is open; the `display:contents` wrapper is referenced by `DropdownMenuContent`'s outside-click guard (`.closest(.${CLASSES.DROPDOWN_MENU_EVENT_WRAPPER})`).

### packages/excalidraw/components/dropdownMenu/DropdownMenuContent.tsx

Purpose: The menu content surface (Radix `DropdownMenu.Content`) — provides outside-click and Escape-to-close handling, mobile vs desktop layout, and propagates `onSelect` via context; default export named `MenuContent`.

- `MenuContent({ children, onClickOutside, className = "", onSelect, open = true, align = "end", style })` — L16-L108. Props as inline type (L23-L34): `children?`, `onClickOutside?: () => void`, `className?`, `onSelect?: (event: Event) => void`, `open?: boolean`, `style?: React.CSSProperties`, `align?: "start" | "center" | "end"`.
  - Refs/state: `editorInterface = useEditorInterface()` (L36) for form-factor branching; `menuRef = useRef<HTMLDivElement>(null)` (L37); `callbacksRef = useStable({ onClickOutside })` (L39) — keeps a stable identity for the outside-click callback so the effect doesn't re-bind on every render.
  - Outside-click: `useOutsideClick(menuRef, callback)` (L41-L56) where the memoized callback (`useCallback`, deps `[callbacksRef]`) ignores clicks that occur inside the `.${CLASSES.DROPDOWN_MENU_EVENT_WRAPPER}` ancestor (so clicking the trigger doesn't close), otherwise invokes `callbacksRef.onClickOutside?.()` (L44-L53). Invariant: trigger clicks are excluded from "outside."
  - Escape handling effect (L58-L79, deps `[callbacksRef, open]`): when `open`, binds a capture-phase `document` keydown listener; on `ESCAPE` it `stopImmediatePropagation()` (so earlier-bound handlers don't also fire) and calls `onClickOutside` (L62-L67). Uses `{ capture: true }` (L69-L73) and removes the listener on cleanup (L76-L77). Early-returns without binding when `!open` (L59-L61).
  - Classnames: `clsx(`dropdown-menu ${className}`, { "dropdown-menu--mobile": editorInterface.formFactor === "phone" }).trim()` (L81-L83).
  - Render (L85-L107): wraps everything in `DropdownMenuContentPropsContext.Provider value={{ onSelect }}` so items can reach the menu-wide select handler. Inside, `DropdownMenuPrimitive.Content` with `ref={menuRef}`, the computed class, `style`, `data-testid="dropdown-menu"`, `align`, `sideOffset={8}` (L93), and `onCloseAutoFocus` preventing default (L94, stops Radix from stealing focus on close). On phone it renders children in `Stack.Col.dropdown-menu-container` (L98-L99); otherwise in an `Island` with `padding={2}` (L101-L103). Comment at L96-L97 references PR #1445 about z-index/stacking order.
  - `MenuContent.displayName = "DropdownMenuContent"` (L109).
  - Parity-relevant constants: `sideOffset={8}` px, `align` default `"end"`, Island `padding={2}`.

### packages/excalidraw/components/dropdownMenu/DropdownMenuGroup.tsx

Purpose: A simple visual grouping wrapper for menu items with an optional group title; default export named `MenuGroup`.

- `MenuGroup({ children, className = "", style, title }: { children: React.ReactNode; className?: string; style?: React.CSSProperties; title?: string })` — L3-L20. Renders a `<div className={`dropdown-menu-group ${className}`} style={style}>` (L14) containing an optional `<p className="dropdown-menu-group-title">{title}</p>` (rendered only when `title` is truthy, L16) followed by `children` (L17). Pure presentational component; no state/effects/handlers. `MenuGroup.displayName = "DropdownMenuGroup"` (L23).
