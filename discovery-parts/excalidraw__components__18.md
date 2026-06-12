## Cluster: excalidraw__components__18

This cluster covers the remaining Sidebar tab-trigger / trigger components, a sidebar test helper, two small layout/feedback primitives (`Spinner`, `Stack`), and the first of the Stats panel drag-inputs (`Angle`).

---

### packages/excalidraw/components/Sidebar/SidebarTabTrigger.tsx

Purpose: A button that selects a specific tab inside a Radix `Tabs` group within the sidebar.

- **`SidebarTabTrigger({ children, tab, onSelect, ...rest })`** — L5-L26. React FC. Props: `children: React.ReactNode`, `tab: SidebarTabName` (the Radix tab `value`), `onSelect?: React.ReactEventHandler<HTMLButtonElement>`, plus the rest of `Omit<React.HTMLAttributes<HTMLButtonElement>, "onSelect">` spread onto the inner `<button>`.
  - Behavior: Renders a Radix `RadixTabs.Trigger` with `value={tab}` and `asChild`, delegating the rendered element to a native `<button type="button" className="excalidraw-button sidebar-tab-trigger">`. The `onSelect` handler is passed to the Radix trigger (fires when the tab becomes active). All extra HTML attributes are forwarded to the button (L20).
  - Side effects: none of its own; selection state is owned by the enclosing Radix `Tabs` (driven from the parent `Sidebar`/`SidebarTabs`).
  - Invariant: `tab` must be a registered `SidebarTabName` matching a corresponding `SidebarTab` content panel.
  - `SidebarTabTrigger.displayName = "SidebarTabTrigger"` — L27 (used by sidebar child-component reconciliation that filters children by `displayName`).

---

### packages/excalidraw/components/Sidebar/SidebarTabTriggers.tsx

Purpose: The container/list wrapping a set of `SidebarTabTrigger` buttons (the tab strip).

- **`SidebarTabTriggers({ children, ...rest })`** — L3-L15. React FC. Props: `children: React.ReactNode` plus the rest of `Omit<React.RefAttributes<HTMLDivElement>, "onSelect">`.
  - Behavior: Renders `RadixTabs.List` with `className="sidebar-triggers"`, spreading `...rest` and rendering `children` (the individual triggers).
  - Side effects: none; pure structural wrapper around the Radix tab list.
  - `SidebarTabTriggers.displayName = "SidebarTabTriggers"` — L16 (consumed by the sidebar's child-type filtering).
  - Note: the `Omit<..., "onSelect">` on `RefAttributes` is type-cosmetic; `RefAttributes` has no `onSelect`, so it is effectively a passthrough of `key`/`ref`.

---

### packages/excalidraw/components/Sidebar/SidebarTrigger.tsx

Purpose: A checkbox-styled toggle button (rendered outside the sidebar, e.g. in toolbars/menus) that opens or closes a named sidebar and selects a tab.

- **`SidebarTrigger({ name, tab, icon, title, children, onToggle, className, style })`** — L10-L50. React FC. Props typed via `SidebarTriggerProps` (imported from `./common`): `name` (sidebar name), `tab` (tab to open), `icon`, `title`, `children`, `onToggle?: (open: boolean) => void`, `className`, `style`.
  - Hooks used: `useExcalidrawSetAppState()` (L20) to obtain the app-state setter; `useUIAppState()` (L21) to read current UI app state.
  - Behavior: Renders a `<label>` wrapping a hidden checkbox `<input type="checkbox" className="ToolIcon_type_checkbox">` whose `checked` is `appState.openSidebar?.name === name` (L40) — so the control reflects whether *this* sidebar is currently open. On `onChange` (L28-L39): first removes the `animate` class from `.layer-ui__wrapper` via direct DOM query (L29-L31, suppresses the open/close animation when toggling); reads `event.target.checked` as `isOpen`; then `setAppState({ openSidebar: isOpen ? { name, tab } : null, openMenu: null, openPopup: null })` (L33-L37) — opening the sidebar to the given tab or closing it, and closing any open menu/popup; finally calls `onToggle?.(isOpen)` (L38).
  - Renders the visual `.sidebar-trigger` div (L44) with optional icon (L45) and label children (L46).
  - Side effects: mutates global app state; performs a direct DOM `querySelector`/`classList.remove` on `.layer-ui__wrapper` (an imperative escape hatch outside React).
  - Accessibility: `aria-label={title}`, `aria-keyshortcuts="0"` (L42) — keyboard shortcut "0" toggles the sidebar.
  - Imports `./SidebarTrigger.scss` (L6).
  - `SidebarTrigger.displayName = "SidebarTrigger"` — L51.

---

### packages/excalidraw/components/Sidebar/siderbar.test.helpers.tsx

Purpose: Test-only helpers (note the misspelled filename "siderbar") for asserting sidebar rendering/dock-button presence in the Vitest suite.

- **`assertSidebarDockButton<T extends boolean>(hasDockButton: T): Promise<T extends false ? { dockButton: null; sidebar: HTMLElement } : { dockButton: HTMLElement; sidebar: HTMLElement }>`** — L11-L30. Async generic helper. Queries `.sidebar` from `GlobalTestState.renderResult.container` (L18-L21), asserts it is non-null (L22), then `queryByTestId(sidebar!, "sidebar-dock")` for the dock button (L23). If `hasDockButton` is true it asserts the dock button exists and returns `{ dockButton, sidebar }`; otherwise asserts it is `null` and returns `{ dockButton: null, sidebar }` (L24-L29). The conditional return type narrows the result shape based on the boolean argument; casts use `as any` (L26, L29).
  - Side effects: contains Vitest `expect` assertions (throws on failure).
- **`assertExcalidrawWithSidebar(sidebar: React.ReactNode, name: string, test: () => void)`** — L32-L43. Async helper. Renders `<Excalidraw initialData={{ appState: { openSidebar: { name } } }}>{sidebar}</Excalidraw>` (L37-L41) so the named sidebar starts open, then runs the supplied `test` callback inside `withExcalidrawDimensions({ width: 1920, height: 1080 }, test)` (L42) to force a desktop viewport (so the dock button is eligible to render).
  - Side effects: renders into the global test DOM via `render`.

---

### packages/excalidraw/components/Spinner.tsx

Purpose: A small SVG circular loading spinner with optional cross-instance animation synchronization.

- **`Spinner({ size = "1em", circleWidth = 8, synchronized = false, className = "" })`** — L5-L41. Default-exported React FC. Props: `size?: string | number`, `circleWidth?: number`, `synchronized?: boolean`, `className?: string`.
  - State/refs: `mountTime = React.useRef(Date.now())` (L16) — captures the component mount timestamp. `mountDelay = -(mountTime.current % 1600)` (L17) — a negative offset (in ms) into a 1600ms animation cycle.
  - Behavior: Renders `<div className="Spinner ...">` containing an SVG `viewBox="0 0 100 100"` sized to `size`. When `synchronized` is true it sets the CSS custom property `--spinner-delay` to `${mountDelay}ms` (a negative animation-delay), aligning newly mounted spinners to the same phase so re-mounts don't flicker/restart the stroke animation (L27, comment L26); when false, delay is `0`.
  - Geometry detail: the `<circle>` has `cx=50 cy=50` and `r = 50 - circleWidth / 2` (L33) so the stroke (width `circleWidth`) stays inside the 100×100 viewBox without clipping. `strokeWidth={circleWidth}`, `fill="none"`, `strokeMiterlimit="10"` (L34-L36); the rotating arc is produced by CSS (stroke-dasharray/animation) in `Spinner.scss`.
  - Performance/timing note: 1600 is the animation period; using `Date.now() % 1600` keeps the phase offset bounded to one cycle.

---

### packages/excalidraw/components/Stack.tsx

Purpose: Flexbox layout primitives (`Stack.Row` / `Stack.Col`) for horizontal and vertical stacking with a CSS-variable-driven gap.

- **`StackProps`** (type) — L6-L13: `children`, `gap?: number`, `align?: "start" | "center" | "end" | "baseline"`, `justifyContent?: "center" | "space-around" | "space-between"`, `className?: string | boolean`, `style?: React.CSSProperties`.
- **`RowStack = forwardRef((props: StackProps, ref) => ...)`** — L15-L35. Renders `<div className={clsx("Stack Stack_horizontal", className)}>` with inline style `{ "--gap": gap, alignItems: align, justifyContent, ...style }` and forwards `ref` to the div. Horizontal variant uses `alignItems` for cross-axis alignment (L26).
- **`ColStack = forwardRef((props: StackProps, ref) => ...)`** — L37-L57. Same as `RowStack` but `className="Stack Stack_vertical"` and uses `justifyItems: align` (L48) instead of `alignItems` — the vertical variant aligns items along the cross axis via `justifyItems`. Forwards `ref`.
- **Default export** — L59-L62: object `{ Row: RowStack, Col: ColStack }` (no top-level `Stack` component; consumers use `Stack.Row` / `Stack.Col`).
  - Note: the gap is passed as the raw `--gap` custom property (a unitless number) — `Stack.scss` is responsible for applying units; the components themselves do no math.
  - Side effects: none; imports `./Stack.scss` (L4).

---

### packages/excalidraw/components/Stats/Angle.tsx

Purpose: The Stats-panel control for editing a single element's rotation angle via a draggable numeric input (degrees), keeping bound text and arrow bindings in sync.

- **`AngleProps`** (interface) — L22-L27: `element: ExcalidrawElement`, `scene: Scene`, `appState: AppState`, `property: "angle"`.
- **`STEP_SIZE = 15`** — L29: degree step used when snapping is active (15° increments).
- **`handleDegreeChange: DragInputCallbackType<"angle">`** — L31-L85. The drag-input callback. Destructures `{ accumulatedChange, originalElements, shouldChangeByStepSize, nextValue, scene, app }`.
  - Algorithm:
    1. Gets the non-deleted elements map and the first original element (L39-L40). Bails if it is an elbow arrow (`isElbowArrow`) — elbow arrows cannot be freely rotated (L41). Re-fetches the latest element by id and bails if missing (L43-L45).
    2. **Direct-entry path** (`nextValue !== undefined`, L47-L60): converts `nextValue` degrees → radians via `degreesToRadians` (L48), mutates the element's `angle` through `scene.mutateElement` (L49-L51), updates arrow/binding geometry via `updateBindings(latestElement, scene, app.state)` (L52), and if there is a bound text element (and the element is not itself an arrow) mutates its `angle` to match (L54-L57). Returns early (L59).
    3. **Drag path** (L62-L83): computes `originalAngleInDegrees = round(radiansToDegrees(origElement.angle) * 100) / 100` (2-decimal rounding, L62-L63); `changeInDegrees = round(accumulatedChange)` (L64); `nextAngleInDegrees = (original + change) % 360` (L65). If `shouldChangeByStepSize`, snaps to nearest 15° via `getStepSizedValue` (L66-L68). Normalizes negatives by adding 360 (L70-L71). Converts to radians (L73), mutates element angle + `updateBindings` (L75-L78), and syncs the bound text element's angle (non-arrow only) (L80-L83).
  - Coordinate/geometry detail: angle stored on elements is in **radians** (the model unit); the Stats UI works in **degrees** and converts at the boundary. Normalization keeps the canonical angle in `[0, 360)` degrees. Bound text rotates with its container, but arrows' bound text is excluded (`!isArrowElement`) because arrow label angle is derived differently.
  - Side effects: mutates scene elements and bindings (history-affecting); no return value.
- **`Angle({ element, scene, appState, property })`** — L87-L101. Default-exported React FC. Renders a `<DragInput>` with `label="A"`, `icon={angleIcon}`, `value = round((radiansToDegrees(element.angle) % 360) * 100) / 100` (the displayed degrees, 2-decimal, normalized to one turn, L92), `elements={[element]}`, `dragInputCallback={handleDegreeChange}`, `editable={isPropertyEditable(element, "angle")}`, and forwards `scene`/`appState`/`property`.
  - Note: display value can be negative if `element.angle` is negative (the `% 360` does not force-positive here, unlike the drag-path normalization).
