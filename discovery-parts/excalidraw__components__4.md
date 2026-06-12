## Cluster: excalidraw__components__4

This cluster covers seven UI-layer files from `packages/excalidraw/components/`: two command-palette helpers (one type module, one item registration), the confirm dialog, the right-click context menu, the in-canvas element-type conversion popup (the largest and most geometry-heavy file in the cluster), the dark-mode toggle button, and the default docked sidebar.

---

### packages/excalidraw/components/CommandPalette/defaultCommandPaletteItems.ts

One-sentence purpose: Defines the single built-in default Command Palette item (`Toggle theme`) by spreading the `actionToggleTheme` action and adapting it to the `CommandPaletteItem` shape.

- `toggleTheme: CommandPaletteItem` (constant of significance) — L5-L12. Spreads all fields of `actionToggleTheme` (icon, predicate, etc.), then overrides `category: "App"`, `label: "Toggle theme"`, and supplies a `perform` callback. The `perform` invokes `actionManager.executeAction(actionToggleTheme, "commandPalette")`, routing the theme toggle through the central action manager with the `"commandPalette"` source/trigger string.
  - Notable: this is the bridge pattern — a raw `Action` is wrapped into a palette command. No other items live here; the file is effectively a one-item registry. Side effect: executing mutates app theme state via the action manager.

---

### packages/excalidraw/components/CommandPalette/types.ts

One-sentence purpose: Types-only module declaring the `CommandPaletteItem` shape consumed by the palette and by `defaultCommandPaletteItems.ts`.

- This file contains no functions/runtime code. It exports one type:
  - `CommandPaletteItem` (type) — L4-L25. Fields: `label: string`; `keywords?: string[]` (extra match terms appended to haystack, not displayed); `haystack?: string` (the precomputed search string = deburred name + keywords); `icon?: Action["icon"]`; `category: string`; `order?: number`; `predicate?: boolean | Action["predicate"]` (visibility gate, can be a static boolean or the action's predicate function); `shortcut?: string | null`; `viewMode?: boolean` (if `false`, hidden while in view mode); `perform: (data: { actionManager: ActionManager; event: React.MouseEvent | React.KeyboardEvent | KeyboardEvent }) => void`.
  - Notable invariant: `haystack` is documented as deburred-name + keywords — the search layer expects an accent-stripped, lowercased haystack rather than recomputing per keystroke.

---

### packages/excalidraw/components/ConfirmDialog.tsx

One-sentence purpose: A small modal confirm/cancel dialog built on top of `Dialog`, wiring danger-styled confirm and neutral cancel buttons with focus-safety handling.

- `ConfirmDialog(props: Props): JSX.Element` (default-exported React component) — L21-L80.
  - Props (`interface Props extends Omit<DialogProps, "onCloseRequest">`, L15-L20): `onConfirm: () => void`, `onCancel: () => void`, `confirmText?: string` (default `t("buttons.confirm")`), `cancelText?: string` (default `t("buttons.cancel")`), plus all `Dialog` props except `onCloseRequest`, and `className` (default `""`).
  - State/refs/effects owned: none — it is stateless. It pulls three hook-derived handles: `setAppState = useExcalidrawSetAppState()` (L31), `setIsLibraryMenuOpen = useSetAtom(isLibraryMenuOpenAtom)` (L32), and `{ container } = useExcalidrawContainer()` (L33).
  - Behavior: renders `<Dialog size="small" onCloseRequest={onCancel}>` (so backdrop/escape maps to cancel), then `children` followed by a `.confirm-dialog-buttons` row with two `DialogActionButton`s.
  - Event handlers: Cancel button onClick (L46-L58) and Confirm button onClick (L62-L73) both first call `setAppState({ openMenu: null })` and `setIsLibraryMenuOpen(false)`, then run the user callback inside `flushSync(() => onCancel()/onConfirm())`, then call `container?.focus()`.
  - Notable detail (performance/correctness): the `flushSync` wrap (L53-L55, L69-L71) is a deliberate workaround — comment notes that on some Chromium versions (131.0.6778.86) calling `.focus()` while the container is in an intermediate mounted-but-not-ready state crashes; flushing pending React updates synchronously before `container.focus()` avoids it. The confirm button is `actionType="danger"` (L75).

---

### packages/excalidraw/components/ContextMenu.tsx

One-sentence purpose: Renders the right-click context menu as a `Popover`, filtering items by predicate, rendering separators/labels/shortcuts, and dispatching the chosen action through the action manager.

- `ContextMenu = React.memo(({ actionManager, items, top, left, onClose }: ContextMenuProps) => …)` (exported component) — L33-L134.
  - Props (`ContextMenuProps`, L23-L29): `actionManager: ActionManager`, `items: ContextMenuItems` (array of `Action | "separator" | false | null | undefined`), `top: number`, `left: number`, `onClose: (callback?: () => void) => void`.
  - State/refs/effects: none owned. Reads `appState = useExcalidrawAppState()` (L35) and `elements = useExcalidrawElements()` (L36).
  - `filteredItems` computation (L38-L53): a `reduce` over `items` that keeps an item only if it is truthy AND (it is the separator constant OR has no `predicate` OR its `predicate(elements, appState, actionManager.app.props, actionManager.app)` returns truthy). Produces `ContextMenuItem[]`.
  - Rendering (L55-L132): wraps content in `<Popover>` with `fitInViewport`, passing `appState.offsetLeft/offsetTop/width/height` for viewport clamping (the popover positions itself in screen space and is repositioned to stay on-screen). The `<ul onContextMenu={preventDefault}>` suppresses nested right-clicks.
  - Per-item render logic (L73-L129):
    - Separator handling (L74-L82): a separator renders `null` if it is the first filtered item or follows another separator (collapses leading/adjacent separators); otherwise an `<hr className="context-menu-item-separator">`.
    - Label resolution (L84-L98): `item.label` may be a function `label(elements, appState, app)` (result fed through `t(...)`) or a translation key string fed through `t(...)`.
    - Item `<li>` onClick (L104-L111): calls `onClose(() => actionManager.executeAction(item, "contextMenu"))` — the comment (L105-L107) documents the invariant that state must be updated (menu closed) BEFORE executing the action, because the action's reducer reads the still-defined `contextMenu` in appState to compute next state; passing the action as a close-callback enforces ordering.
    - Button styling (L113-L126): adds `dangerous` class when `actionName === "deleteSelectedElements"` and `checkmark` when `item.checked?.(appState)` is true; shows label and a `<kbd>` shortcut resolved via `getShortcutFromShortcutName(actionName as ShortcutName)`.
- Exported constants/types:
  - `ContextMenuItem` (type) — L19: `typeof CONTEXT_MENU_SEPARATOR | Action`.
  - `ContextMenuItems` (type) — L21: `(ContextMenuItem | false | null | undefined)[]`.
  - `CONTEXT_MENU_SEPARATOR = "separator"` (exported constant) — L31. Sentinel used both as item value and discriminant.
  - Notable coordinate detail: `top`/`left` are absolute screen coordinates; the `Popover` does the viewport-fit math using the offset/size props, so this component does no geometry itself.

---

### packages/excalidraw/components/ConvertElementTypePopup.tsx

One-sentence purpose: The in-canvas floating popup (and supporting conversion engine) that lets the user switch a selection between generic shape types (rectangle/diamond/ellipse) or linear subtypes (line/sharpArrow/curvedArrow/elbowArrow), including the geometry to re-route lines into elbow arrows. This is the heaviest file in the cluster.

Module-level constants of significance:
- `GAP_HORIZONTAL = 8`, `GAP_VERTICAL = 10` (L97-L98) — pixel offsets for popup placement relative to the selection's bottom-left corner.
- `GENERIC_TYPES = ["rectangle","diamond","ellipse"] as const` (L107) and `LINEAR_TYPES = ["line","sharpArrow","curvedArrow","elbowArrow"] as const` (L109-L114) — ordered cycle arrays; order defines the left/right cycling sequence.
- `CONVERTIBLE_GENERIC_TYPES` / `CONVERTIBLE_LINEAR_TYPES` (L116-L122) — `ReadonlySet`s for O(1) membership tests.
- `convertElementTypePopupAtom` (exported jotai atom) — L135-L137. Holds `{ type: "panel" } | null`; null means the popup is closed.
- `CacheKey` (branded `string` type, L139); `FONT_SIZE_CONVERSION_CACHE: Map<id, {fontSize}>` (L141-L146) and `LINEAR_ELEMENT_CONVERSION_CACHE: Map<CacheKey, ExcalidrawLinearElement>` (L148-L151) — module-level caches preserving original font size and original linear-element geometry across reversible conversions. INVARIANT: these are cleared on component unmount (see effect L178-L183) so they do not leak across sessions.

Functions/components:
- `isConvertibleGenericType(elementType: string): elementType is ConvertibleGenericTypes` — L124-L127. Set-membership type guard.
- `isConvertibleLinearType(elementType: string): elementType is ConvertibleLinearTypes` — L129-L133. True for `"arrow"` or any member of `CONVERTIBLE_LINEAR_TYPES`.
- `ConvertElementTypePopup({ app }: { app: App })` (default-exported component) — L153-L186.
  - Owns: `elementsCategoryRef = useRef<ConversionType>(null)` (L155) tracking the original conversion category. Effect L158-L176 closes the popup (`updateEditorAtom(convertElementTypePopupAtom, null)`) when selection becomes empty or when the conversion category changes from the one first recorded (prevents the popup persisting across heterogeneous selections). Effect L178-L183 clears both caches on unmount. Renders `<Panel app elements={selectedElements} />`.
- `Panel({ app, elements }: { app: App; elements: ExcalidrawElement[] })` (internal component) — L188-L361.
  - State/refs: `panelPosition = useState({x,y})` (L221), `positionRef = useRef("")` (L222, a string fingerprint to avoid redundant repositions), `panelRef = useRef<HTMLDivElement>` (L223).
  - Derived: `conversionType` (L195); memoized `genericElements`/`linearElements` filtered by category (L197-L206); `sameType` (L208-L219) — whether all selected elements share a type/subtype (drives which radio is shown checked).
  - Positioning effect (L225-L263): builds a `newPositionRef` fingerprint from scrollX/scrollY/offsetTop/offsetLeft/zoom and the sorted element ids; bails if unchanged. Computes the selection bottom-left in scene space: for a single element it reads `getElementAbsoluteCoords` then rotates the bottom-left corner `pointRotateRads(pointFrom(x1, y2), pointFrom(cx, cy), angle)` to respect element rotation; for multiple it uses `getCommonBoundingBox().{minX, maxY}`. Converts to viewport via `sceneCoordsToViewportCoords` and stores in `panelPosition`. NOTE: rotation-aware anchor math — parity reimplementations must rotate the bottom-left corner about the element center.
  - Cache-priming effects: L265-L275 stores each linear element in `LINEAR_ELEMENT_CONVERSION_CACHE` keyed by `toCacheKey(id, getConvertibleType(el))` (preserves original points for reversal); L277-L291 records bound-text `fontSize` into `FONT_SIZE_CONVERSION_CACHE`.
  - `SHAPES: [string, ReactNode][]` (L293-L307) — the icon list per category.
  - Render (L309-L360): an absolutely positioned `<div>` whose inline `top` = `panelPosition.y + (GAP_VERTICAL + 8) * zoom - offsetTop` and `left` = `panelPosition.x - offsetLeft - GAP_HORIZONTAL`, `zIndex: 2`, class `CLASSES.CONVERT_ELEMENT_TYPE_POPUP`. NOTE: vertical offset is scaled by zoom, horizontal is not — a coordinate-space asymmetry worth matching. Each shape is a radio `ToolButton`; `isSelected` true only when `sameType` and the first element's (sub)type equals the button type. onChange (L344-L355) fires `trackEvent` (only if active tool differs), calls `convertElementTypes(app, { conversionType, nextType })`, then refocuses the panel.
- `adjustBoundTextSize(container, boundText, scene): void` (exported) — L363-L407. Recomputes max width/height for bound text, wraps text, then decrements `fontSize` one px at a time while measured width/height exceed the max (and fontSize > 0). Finally `mutateElement` with the fitted fontSize/width/height and `redrawTextBoundingBox`. NOTE: brute-force shrink loop; the wrap is computed once at the original size but the shrink loop re-measures the unwrapped text (subtle: line 393 measures `boundText.text`, not `wrappedText`).
- `ConversionType` (type) — L409: `"generic" | "linear" | null`.
- `convertElementTypes(app, { conversionType, nextType, direction = "right" }): boolean` (exported) — L411-L628. The core conversion engine.
  - Returns `false` immediately if no `conversionType` (L423). Computes `selectedElementIds` map and `advancement` (+1 for right, -1 for left, L429-L434).
  - Generic branch (L436-L505): determines current index in `GENERIC_TYPES` (only if all same type, else -1), computes `nextType` by modular cycling `(index + len + advancement) % len`, converts each element via `convertElementType`, rebuilds the full element list preserving order, `replaceAllElements`, then for each converted element restores cached font size and calls `adjustBoundTextSize`, finally sets selection + reverts active tool to `selection`.
  - Linear branch (L507-L625): computes `nextType` from the common subtype via `reduceToCommonValue` + modular cycling; for each element either reuses a cached element (if converting back to a previously-seen subtype — enables lossless simple↔elbow↔simple round-trips) or freshly converts; `replaceAllElements`. Post-normalization (L556-L605): for elbow targets it routes points through `convertLineToElbow` (skipping if <2 points), builds `FixedSegment[]` from the interior points, calls `updateElbowArrowPoints`, and forces `endArrowhead: "arrow"`; for non-elbow linear targets it tries to reuse cached points from a similar linear subtype via `mapFind`. Finally sets `selectedLinearElement` to a new `LinearElementEditor` only when exactly one linear element is selected, and reverts tool to `selection`.
- `getConversionTypeFromElements(elements): ConversionType` (exported) — L630-L653. Returns `"generic"` if any element is a convertible generic type (generic has preference), else `"linear"` if any element is an eligible linear element, else `null`.
- `isEligibleLinearElement(element): boolean` — L655-L661. Linear AND (not an arrow OR (not bound to an element AND has no bound text)) — excludes bound/labeled arrows from conversion.
- `toCacheKey(elementId, convertitleType): CacheKey` — L663-L668. Builds `"${id}:${type}"` branded key.
- `filterGenericConvetibleElements(elements)` — L670-L675 and `filterLinearConvertibleElements(elements)` — L677-L680. Typed filters.
- `THRESHOLD = 20` (L682); `isVert(a,b) = a[0]===b[0]` (L683); `isHorz(a,b) = a[1]===b[1]` (L684); `dist(a,b)` (L685-L686) — axis-aligned distance (vertical leg uses |Δy|, else |Δx|).
- `convertLineToElbow(line: ExcalidrawLinearElement): LocalPoint[]` — L688-L778. The notable geometry routine. Three passes: (1) build an orthogonal route from sanitized points, snapping any axis offset `< THRESHOLD` onto the current axis and inserting an L-bend `pointFrom(start[0], end[1])` for diagonal segments (L693-L711); (2) drop colinear middle points where both adjacent legs share the same orientation (L714-L725); (3) collapse micro "jogs" (V-H-V / H-V-H) whose short leg `< THRESHOLD` by absorbing the shorter leg — either pulling point `c` onto `a`'s axis, or sliding the whole first run of points onto `b`'s axis via the backward `for` loops (L728-L776). NOTE: in-place mutation of cloned `LocalPoint`s; the backward-walk loops at L753-L767 rewrite all trailing points that share `a`'s coordinate. This is the precise algorithm a Svelte/Canvas port must replicate for line→elbow parity.
- `sanitizePoints(points): LocalPoint[]` — L780-L797. Removes consecutive duplicate points (keeps first), guarding the elbow router against zero-length segments.
- `convertElementType<TElement>(element, targetType, app): ExcalidrawElement` — L809-L903. Validates the conversion (`isValidConversion`; throws in non-prod, returns element unchanged in prod, L816-L821); no-op if already target type; deletes the shape cache (`ShapeCache.delete`); for generic targets builds a `newElement` copy with adjusted `roundness` (diamond gets adaptive/proportional radius based on `isUsingAdaptiveRadius`) and `updateBindings`; for linear targets switches on subtype to build `newLinearElement` (line) or `newArrowElement` (sharp = no roundness/no elbow, curved = proportional roundness, elbow = `elbowed:true, fixedSegments:null, roundness:null`), carrying over the app's current default arrowheads. All results `bumpVersion`-ed. Ends with `assertNever(targetType)` for exhaustiveness.
- `isValidConversion(startType, targetType): startType is ConvertibleTypes` — L905-L926. True only when both ends are generic, or both ends are linear.
- `getConvertibleType(element): ConvertibleTypes` — L928-L935. Returns the linear subtype for linear elements, else the element's own type.

---

### packages/excalidraw/components/DarkModeToggle.tsx

One-sentence purpose: A controlled toggle button (built on `ToolButton`) that flips between light and dark theme, showing a sun or moon SVG.

- `DarkModeToggle(props: { value: Theme; onChange: (value: Theme) => void; title?: string })` (exported component) — L13-L36.
  - Props: `value` (current `Theme`), `onChange` callback, optional `title`. Comment (L11-L12) notes the deliberate choice of an explicit two-state toggle rather than a tri-state (no "system" option).
  - State/refs/effects: none — fully controlled/stateless.
  - Behavior: `title` defaults to `t("buttons.lightMode")` when currently dark, else `t("buttons.darkMode")` (L18-L22). Renders `ToolButton type="icon"` with `icon = value === THEME.LIGHT ? ICONS.MOON : ICONS.SUN` (L27). onClick calls `onChange(value === THEME.DARK ? THEME.LIGHT : THEME.DARK)` (L30-L32).
- `ICONS` (internal constant) — L38-L55. Object holding two inline 512×512 `<svg>` elements (`SUN`, `MOON`) using `fill="currentColor"` and class `rtl-mirror`. Pure markup, no logic.

---

### packages/excalidraw/components/DefaultSidebar.tsx

One-sentence purpose: Composes the application's default docked sidebar with built-in Library and Canvas-Search tabs, plus tunnels and an `onDock`/`docked` preference-syncing wrapper, all guarded by `withInternalFallback` to avoid duplicate render when a host app supplies its own.

- `DefaultSidebarTrigger` (internal, `withInternalFallback("DefaultSidebarTrigger", …)`) — L26-L44. Props: `Omit<SidebarTriggerProps,"name"> & React.HTMLAttributes<HTMLDivElement>`. Reads `DefaultSidebarTriggerTunnel` from `useTunnels()` and renders `<Sidebar.Trigger>` into the tunnel with `name={DEFAULT_SIDEBAR.name}` and class `default-sidebar-trigger`. Sets `displayName` (L44).
- `DefaultTabTriggers({ children })` (internal) — L46-L54. Renders children into the `DefaultSidebarTabTriggersTunnel.In` so host apps can inject extra tab triggers. Sets `displayName` (L54).
- `DefaultSidebar` (exported) — L56-L127. `Object.assign(withInternalFallback("DefaultSidebar", Component), { Trigger: DefaultSidebarTrigger, TabTriggers: DefaultTabTriggers })`.
  - Inner component props (L59-L71): `children`, `className`, `onDock?: SidebarProps["onDock"] | false` (pass `false` to disable docking), `docked`, plus the rest of `SidebarProps` minus `name`, with `children` made optional (`Merge<MarkOptional<...>>`).
  - State/refs/effects: none owned. Reads `appState = useUIAppState()` (L72), `setAppState = useExcalidrawSetAppState()` (L73), and a tunnel handle (L75).
  - Docking logic (L77, L85-L97): `isForceDocked = appState.openSidebar?.tab === CANVAS_SEARCH_TAB` — the search tab forces docked. `docked` resolves to `isForceDocked || (docked ?? appState.defaultSidebarDockedPreference)`. `onDock` resolves to `undefined` (manual docking disabled) when force-docked, when `onDock === false`, or when `docked` is controlled but no `onDock` given; otherwise it `composeEventHandlers(onDock, (docked) => setAppState({ defaultSidebarDockedPreference: docked }))` so the host callback runs alongside persisting the preference.
  - Render (L79-L120): a `<Sidebar name="default">` containing `Sidebar.Tabs` with a header of two `TabTrigger`s (search icon → `CANVAS_SEARCH_TAB`, library icon → `LIBRARY_SIDEBAR_TAB`) plus a tunnel outlet for host triggers, then `Sidebar.Tab` panels rendering `<LibraryMenu />` and `<SearchMenu />`, followed by any extra `children`.
  - Notable: heavy use of the tunnel-rat pattern (`useTunnels`) and `withInternalFallback` to dedupe when the host app declares its own sidebar; behavior here is composition/state-sync, no geometry.

---
