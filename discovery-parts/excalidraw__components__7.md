## Cluster: excalidraw__components__7

This cluster covers the tail of the Radix-backed dropdown-menu submenu primitives plus two standalone canvas-overlay components (element action buttons, element-link dialog). All dropdown components wrap `radix-ui`'s `DropdownMenu` primitive; Excalidraw layers its own class names, mobile (`phone`) form-factor handling, and a custom collision-avoidance positioning shim on top.

---

### packages/excalidraw/components/dropdownMenu/DropdownMenuSub.tsx

Purpose: Composes a Radix `DropdownMenu.Sub` from `<DropdownMenuSub.Trigger>` / `<DropdownMenuSub.Content>` children, picking them out by `displayName`.

- `DropdownMenuSub({ children }: { children?: React.ReactNode })` — L10-L19. Functional component. Calls `getSubMenuTriggerComponent(children)` and `getSubMenuContentComponent(children)` (from `dropdownMenuUtils`) to locate the trigger and content child elements by their `displayName`, then renders them inside a `DropdownMenuPrimitive.Sub`. Behavior: it does NOT pass children through directly; it filters/reorders so the Radix `Sub` always receives exactly the trigger then the content, regardless of authoring order. Invariant: relies on `DropdownMenuSubTrigger.displayName === "DropdownMenuSubTrigger"` and `DropdownMenuSubContent.displayName === "DropdownMenuSubContent"`.
- Static-property assignments — L21-L24. `DropdownMenuSub.Trigger = DropdownMenuSubTrigger`, `DropdownMenuSub.Content = DropdownMenuSubContent`, and `DropdownMenuSub.displayName = "DropdownMenuSub"`. This is the namespacing pattern used across the dropdown components (compound-component API: `<DropdownMenuSub.Trigger>` / `<DropdownMenuSub.Content>`).
- Default export — L26. The `DropdownMenuSub` function.

No state, refs, or effects. Props: only `children`.

---

### packages/excalidraw/components/dropdownMenu/DropdownMenuSubContent.tsx

Purpose: The submenu's floating content panel — renders a Radix `SubContent`, wraps children in an `Island` (desktop) or `Stack.Col` (phone), and dynamically nudges its side/align offsets to avoid running off the right edge of the viewport.

Module constants:
- `BASE_ALIGN_OFFSET = -4` — L11. Default `alignOffset` for the Radix SubContent.
- `BASE_SIDE_OFFSET = 4` — L12. Default `sideOffset` for the Radix SubContent.

Component `DropdownMenuSubContent({ children, className }: { children?: React.ReactNode; className?: string })` — L14-L68.
- Props: `children`, optional `className`.
- Hooks/context: `useEditorInterface()` (L21) to read `editorInterface.formFactor`.
- State: `sideOffset` initialized to `BASE_SIDE_OFFSET` (L44); `alignOffset` initialized to `BASE_ALIGN_OFFSET` (L45). Note these `useState` calls are declared AFTER the `callbacksRef` (which references their setters) — legal because the closure captures the setters at call time, not definition order, but worth noting for a port.
- Ref callback `callbacksRef = useCallback((node: HTMLDivElement | null) => {...}, [])` — L27-L42. Collision-avoidance logic. When the SubContent node mounts: finds the nearest ancestor `.dropdown-menu-container` (the parent menu's island), reads its `getBoundingClientRect()`, measures the submenu's own width via `node.getBoundingClientRect().width`, and computes `spaceRemaining = window.innerWidth - parentRect.right`. If `spaceRemaining < menuWidth + 20` (i.e. the submenu would overflow the right edge with a 20px margin), it flips the submenu leftward: `setSideOffset(spaceRemaining - menuWidth + BASE_ALIGN_OFFSET)` and `setAlignOffset(BASE_ALIGN_OFFSET + 8)`. Side effect: triggers a re-render with adjusted offsets. Empty dependency array means it runs once per mount of the node.
- `classNames` — L23-L25. `clsx("dropdown-menu dropdown-submenu ${className}", { "dropdown-menu--mobile": formFactor === "phone" })` then `.trim()`.
- Render — L47-L66. `DropdownMenuPrimitive.SubContent` with `className`, the dynamic `sideOffset`/`alignOffset`, `collisionPadding={8}`, and `ref={callbacksRef}`. On phone it wraps children in `<Stack.Col className="dropdown-menu-container">`; otherwise in `<Island className="dropdown-menu-container" padding={2} style={{ zIndex: 1 }}>`.
- Default export L70; `displayName = "DropdownMenuSubContent"` L71 (consumed by `getSubMenuContentComponent`).

Coordinate-space / geometry note: all measurements are in viewport (client) pixels via `getBoundingClientRect()` and `window.innerWidth`. The overflow heuristic uses a fixed 20px buffer and an 8px nudge — relevant for parity. `collisionPadding={8}` is Radix's own collision handling, layered on top of the manual offset adjustment.

---

### packages/excalidraw/components/dropdownMenu/DropdownMenuSubTrigger.tsx

Purpose: The clickable row inside a parent menu that opens a submenu; renders the label/icon/shortcut plus a trailing chevron-right indicator.

Component `DropdownMenuSubTrigger({ children, icon, shortcut, className }: { children: React.ReactNode; icon?: JSX.Element; shortcut?: string; className?: string })` — L12-L35.
- Props: required `children`; optional `icon` (JSX.Element), `shortcut` (string), `className` (string).
- Render: `DropdownMenuPrimitive.SubTrigger` with class `${getDropdownMenuItemClassName(className)} dropdown-menu__submenu-trigger` (L24-L28). Inside, renders `<MenuItemContent icon={icon} shortcut={shortcut}>{children}</MenuItemContent>` (the shared item-content layout, L29-L31) followed by `<div className="dropdown-menu__submenu-trigger-icon">{chevronRight}</div>` (L32), where `chevronRight` is imported from `../icons`.
- No state/refs/effects. Default export L37; `displayName = "DropdownMenuSubTrigger"` L38 (consumed by `getSubMenuTriggerComponent`).

---

### packages/excalidraw/components/dropdownMenu/DropdownMenuTrigger.tsx

Purpose: The top-level button that opens the main dropdown menu (e.g. the hamburger/main-menu button), wrapping Radix `DropdownMenu.Trigger`.

Component `MenuTrigger({ className = "", children, onToggle, title, ...rest })` — L7-L39.
- Props type: `{ className?: string; children: React.ReactNode; onToggle: () => void; title?: string } & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onSelect">` (L13-L18). So it forwards arbitrary native button attributes except `onSelect`.
- Context: `useEditorInterface()` (L19) for `formFactor`.
- `classNames` — L20-L26. `clsx("dropdown-menu-button ${className}", "zen-mode-transition", { "dropdown-menu-button--mobile": formFactor === "phone" })` then `.trim()`. The `zen-mode-transition` class participates in the editor's zen-mode show/hide animations.
- Render — L27-L38. `DropdownMenuPrimitive.Trigger` with `className`, `onClick={onToggle}`, `type="button"`, `data-testid="dropdown-menu-button"`, `title`, and `{...rest}` spread.
- No state/refs/effects. Default export L41; `displayName = "DropdownMenuTrigger"` L42 (consumed by `getMenuTriggerComponent` in `dropdownMenuUtils`).

Note: the file's component is locally named `MenuTrigger` but its `displayName` is `"DropdownMenuTrigger"`, which is what the child-finding util keys on.

---

### packages/excalidraw/components/dropdownMenu/dropdownMenuUtils.ts

Purpose: A child-finding factory used by the dropdown compound components to locate a specific named child element (trigger/content) out of a `children` collection.

- `getMenuComponent(component: string) => (children: React.ReactNode) => React.ReactNode | null` — L3-L18. Higher-order function. Returns a finder that runs `React.Children.toArray(children)` and `.find()`s the first child where: it is a valid element (`React.isValidElement`), its `type` is not a string (i.e. a component, not a DOM tag), and `child.type.displayName === component`. Returns the matched child element, or `null` if none found (L13-L15). Uses several `//@ts-ignore` lines (L8, L16) because `child.type.displayName` is not in React's public element typing. Invariant: matching is by `displayName` string equality, so every dropdown sub-component must declare a matching `displayName` (as each file in this cluster does).
- `getMenuTriggerComponent` — L20. `= getMenuComponent("DropdownMenuTrigger")`. Exported.
- `getMenuContentComponent` — L21. `= getMenuComponent("DropdownMenuContent")`. Exported.
- `getSubMenuTriggerComponent` — L22-L24. `= getMenuComponent("DropdownMenuSubTrigger")`. Exported.
- `getSubMenuContentComponent` — L25-L27. `= getMenuComponent("DropdownMenuSubContent")`. Exported.

No React component; pure utility module.

---

### packages/excalidraw/components/ElementCanvasButtons.tsx

Purpose: Positions a small floating button cluster (e.g. link/embeddable action buttons) in viewport pixels next to a single element's top-right corner, hiding itself during transient interactions.

Module constant:
- `CONTAINER_PADDING = 5` — L15. Used as the wrapper div's `padding`.

Functions/components:
- `getContainerCoords(element: NonDeletedExcalidrawElement, appState: AppState, elementsMap: ElementsMap) => { x: number; y: number }` — L17-L30. Computes the screen position. Gets the element's absolute scene bounds via `getElementAbsoluteCoords(element, elementsMap)` (destructures `[x1, y1]`), converts the element's top-right scene corner `{ sceneX: x1 + element.width, sceneY: y1 }` to viewport coords via `sceneCoordsToViewportCoords(..., appState)`, then subtracts the canvas offsets and adds a fixed gutter: `x = viewportX - appState.offsetLeft + 10`, `y = viewportY - appState.offsetTop`. Returns viewport-space CSS pixel coords. Geometry note: anchors to the element's top-right (x1+width, y1) and nudges +10px right; the `appState.offsetLeft/offsetTop` subtraction converts page coords to canvas-container-relative coords.
- `ElementCanvasButtons({ children, element, elementsMap })` — L32-L69. Component. Props: `children` (React.ReactNode), `element` (NonDeletedExcalidrawElement), `elementsMap` (ElementsMap).
  - Context: `useExcalidrawAppState()` (L41).
  - Early-return guard — L43-L52: returns `null` (renders nothing) if any of `appState.contextMenu`, `appState.newElement`, `appState.resizingElement`, `appState.isRotating`, `appState.openMenu`, or `appState.viewModeEnabled` is truthy. This hides the buttons during context-menu open, element creation, resize, rotation, any open menu, or view mode.
  - Render — L54-L68: computes `{ x, y }` via `getContainerCoords`, renders `<div className="excalidraw-canvas-buttons" style={{ top: ${y}px, left: ${x}px, padding: CONTAINER_PADDING }}>{children}</div>`. (A `width: CONTAINER_WIDTH` style is commented out, L62.)
  - No state/refs/effects of its own; purely derives position from appState.

Coordinate-space note: this is the canonical scene→viewport conversion path for an on-canvas overlay. Any Svelte/Canvas reimplementation must replicate `getElementAbsoluteCoords` (scene bbox) + `sceneCoordsToViewportCoords` (camera transform) + the `offsetLeft/offsetTop` and `+10` gutter to match placement exactly.

---

### packages/excalidraw/components/ElementLinkDialog.tsx

Purpose: A dialog/panel for viewing, editing, generating, and removing the `link` on a single source element, including auto-generating an element link from the current selection.

Component `ElementLinkDialog({ sourceElementId, onClose, appState, scene, generateLinkForSelection = defaultGetElementLinkFromSelection })` — L25-L178.
- Props (L25-L37): `sourceElementId: ExcalidrawElement["id"]`; `appState: UIAppState`; `scene: Scene`; optional `onClose?: () => void`; `generateLinkForSelection: AppProps["generateLinkForSelection"]` (defaulted to `defaultGetElementLinkFromSelection`).
- Derived values: `elementsMap = scene.getNonDeletedElementsMap()` (L38); `originalLink = elementsMap.get(sourceElementId)?.link ?? null` (L39).
- State: `nextLink: string | null` initialized to `originalLink` (L41); `linkEdited: boolean` initialized to `false` (L42) — tracks whether the user has manually touched the input (so an intentionally-cleared link is distinguished from an untouched empty one).
- Effect (selection→link autogen) — L44-L68. On change of `elementsMap`, `appState`, `appState.selectedElementIds`, `originalLink`, or `generateLinkForSelection`: reads `getSelectedElements(elementsMap, appState)`; if there is a selection and a `generateLinkForSelection` callback, calls `getLinkIdAndTypeFromSelection(selectedElements, appState as AppState)`, and if it returns an `{ id, type }`, sets `nextLink = normalizeLink(generateLinkForSelection(id, type))`. Then `setNextLink(nextLink)`. Side effect: keeps the input synced to the currently-selected element/region's deep link.
- `handleConfirm = useCallback(() => {...}, [sourceElementId, nextLink, elementsMap, linkEdited, scene, onClose])` — L70-L88. Commit logic: if `nextLink` is set and differs from the element's current link, calls `scene.mutateElement(elementToLink, { link: nextLink })`. If `nextLink` is falsy AND `linkEdited` AND `sourceElementId`, clears it via `scene.mutateElement(elementToLink, { link: null })`. Then calls `onClose?.()`. Side effect: mutates the scene element. Invariant: a link is only removed when the user actually edited the field (`linkEdited`), preventing accidental clears on confirm.
- Effect (global keyboard) — L90-L112. Adds a `window` `keydown` listener (cleaned up on unmount): when `appState.openDialog?.name === "elementLinkSelector"`, ENTER triggers `handleConfirm()` and ESCAPE triggers `onClose?.()`. Deps: `[appState, onClose, handleConfirm]`.
- Render — L114-L177:
  - Header (L116-L119): `t("elementLink.title")` / `t("elementLink.desc")`.
  - Input (L121-L137): `<TextField value={nextLink ?? ""} onChange={...} onKeyDown={...} selectOnRender>`. `onChange` sets `linkEdited = true` (if not already) and updates `nextLink`. `onKeyDown` ENTER calls `handleConfirm()`.
  - Conditional remove button (L139-L156): rendered only when `originalLink && nextLink`. A `ToolButton` with `TrashIcon` that sets `nextLink = null` and `linkEdited = true` — clears the input but does NOT mutate the element until confirm (comment L146-L149).
  - Actions (L159-L175): a Cancel `DialogActionButton` (`onClick → onClose?.()`, `marginRight: 10`) and a primary Confirm `DialogActionButton` (`onClick={handleConfirm}`, `actionType="primary"`).
- Default export L180.

i18n keys used: `elementLink.title`, `elementLink.desc`, `buttons.remove`, `buttons.cancel`, `buttons.confirm`. Behavior note: `normalizeLink` and `defaultGetElementLinkFromSelection` come from `@excalidraw/common` / `@excalidraw/element`; the dialog only ever mutates the single `sourceElementId` element, never the selection itself.
