## Cluster: excalidraw__components__14

This cluster covers the main hamburger menu, the mobile UI surface (menu + toolbar), the base modal portal primitive, and the "overwrite confirm" dialog subsystem (component, action sub-components, and its Jotai state + promise-based opener).

---

### packages/excalidraw/components/main-menu/MainMenu.tsx

Defines the host-app-facing `<MainMenu>` component: the hamburger dropdown rendered into a tunnel, plus its attached static sub-components (Item, Group, Sub, DefaultItems, etc.).

- **`MainMenu` (default export)** — `Object.assign(withInternalFallback("MainMenu", ({children, onSelect}) => JSX), { Trigger, Item, ItemLink, ItemCustom, Group, Separator, Sub, DefaultItems })` — L17-L87.
  - Inner render fn props: `children?: React.ReactNode`, `onSelect?: (event: Event) => void` (called whenever any menu item is selected) — L20-L29.
  - Wrapped in `withInternalFallback("MainMenu", ...)` so that if the host app does not render a `<MainMenu>`, an internal fallback renders one. The whole tree is portaled via `MainMenuTunnel.In` (L36) so the host can declare the menu anywhere but it physically lands where the editor places the tunnel `Out`.
  - State/hooks it consumes: `useTunnels()` → `MainMenuTunnel`; `useEditorInterface()`; `useUIAppState()` → `appState`; `useExcalidrawSetAppState()` → `setAppState` (L30-L33). Owns no local state/refs/effects.
  - Behavior: renders `<DropdownMenu open={appState.openMenu === "canvas"}>` (L37). The `DropdownMenu.Trigger.onToggle` (L39-L45) toggles `openMenu` between `"canvas"` and `null` and clears `openPopup`/`openDialog` — i.e. opening the canvas menu force-closes popups and dialogs. Trigger renders `HamburgerMenuIcon`, `data-testid="main-menu-trigger"`.
  - `DropdownMenu.Content` (L51-L71): `onClickOutside` sets `openMenu: null`; `onSelect` is `composeEventHandlers(onSelect, () => setAppState({ openMenu: null }))` — runs the host's `onSelect` first, then closes the menu (compose means host can't prevent the close unless it stops propagation). `align="start"`.
  - Conditional collaborator list (L60-L70): only when `editorInterface.formFactor === "phone"` AND `appState.collaborators.size > 0`, renders a `<fieldset className="UserList-Wrapper">` with a `<legend>` and `<UserList mobile collaborators=... userToFollow={appState.userToFollow?.socketId || null}>`. This is the phone-only path where collaborators are folded into the main menu rather than a separate avatar row.
  - The static-property assignment (L77-L86) re-exports DropdownMenu primitives and `DefaultItems` (the `* as DefaultItems` module namespace, L15) so consumers write `<MainMenu.Item>`, `<MainMenu.DefaultItems.Export>`, etc.

---

### packages/excalidraw/components/MobileMenu.tsx

Assembles the entire mobile UI layout: top bar (main-menu + pen mode + sidebar trigger), bottom bar (shape actions + tool island + scroll-back button), welcome screen, and sidebars.

- **`type MobileMenuProps`** — L27-L49. Props: `appState: UIAppState`, `actionManager: ActionManager`, `renderJSONExportDialog: () => React.ReactNode`, `renderImageExportDialog: () => React.ReactNode`, `setAppState: React.Component<any, AppState>["setState"]`, `elements: readonly NonDeletedExcalidrawElement[]`, `onHandToolToggle: () => void`, `onPenModeToggle: AppClassProperties["togglePenMode"]`, optional `renderTopRightUI?/renderTopLeftUI?: (isMobile, appState) => JSX.Element | null`, `renderSidebars: () => JSX.Element | null`, `renderWelcomeScreen: boolean`, `UIOptions: AppProps["UIOptions"]`, `app: AppClassProperties`. (Note: `renderJSONExportDialog`/`renderImageExportDialog`/`UIOptions` are declared in props but not referenced in the body of this file.)

- **`MobileMenu` (named export)** — `({...MobileMenuProps}) => JSX` — L51-L180. Owns no local state/refs/effects; pure layout composition driven by `appState`.
  - Hooks: `useTunnels()` → `WelcomeScreenCenterTunnel`, `MainMenuTunnel`, `DefaultSidebarTriggerTunnel` (L65-L69).
  - **`renderAppTopBar` (internal)** — `() => JSX.Element | null` — L70-L116. Early-returns `null` when `appState.openDialog?.name === "elementLinkSelector"` (hides the top bar during link-target selection). Builds `topRightUI` (L75-L94): uses host `renderTopRightUI?.(true, appState)` if provided, else (when not view-mode) a `PenModeButton` (checked=`appState.penMode`, onChange=`onPenModeToggle(null)`, `isMobile`, `penDetected=appState.penDetected`) plus `DefaultSidebarTriggerTunnel.Out`; when `viewModeEnabled` shows `ExitViewModeButton`. Builds `topLeftUI` (L96-L101): host `renderTopLeftUI?.(true, appState)` plus `MainMenuTunnel.Out`. Returns a flex row `App-toolbar-content` with `justifyContent: "space-between"` (left vs right) — L103-L115.
  - **`renderToolbar` (internal)** — `() => JSX.Element` — L118-L126. Renders `<MobileToolBar app onHandToolToggle setAppState />`.
  - Render tree (L128-L179): `renderSidebars()` first; then `App-welcome-screen` (renders `WelcomeScreenCenterTunnel.Out` only if `renderWelcomeScreen`); then (only when NOT `viewModeEnabled`) the `App-bottom-bar`. **Coordinate/layout detail:** the bottom bar has `marginBottom: SCROLLBAR_WIDTH + SCROLLBAR_MARGIN` (L141) so it clears the canvas scrollbars. The bottom bar contains `MobileShapeActions` (passed `app.scene.getNonDeletedElementsMap()`) and an `Island className="App-toolbar"` holding the toolbar (rendered only when not view-mode and dialog isn't `elementLinkSelector`) and a "scroll back to content" `<button>` shown only when `appState.scrolledOutside && !openMenu && !openSidebar` whose onClick spreads `calculateScrollCenter(elements, appState)` into appState (recenters the camera) — L156-L170. Finally a `FixedSideContainer side="top" className="App-top-bar"` wraps `renderAppTopBar()` (L175-L177). The comment at L131-L132 notes welcome/bottom/top bars share a z-index and are intentionally ordered so the top bar paints last (on top).

---

### packages/excalidraw/components/MobileToolBar.tsx

The mobile floating toolbar: responsive set of tool buttons/popovers (hand, selection/lasso, freedraw, eraser, shapes, arrow/line) that progressively reveals text/image/frame as horizontal space allows, with an overflow "extra tools" dropdown.

- Module constants:
  - **`SHAPE_TOOLS`** (L44-L60), **`SELECTION_TOOLS`** (L62-L73), **`LINEAR_ELEMENT_TOOLS`** (L75-L82) — `as const` arrays of `{ type, icon, title }`. Titles are `capitalizeString(t("toolBar.X"))`. SHAPE_TOOLS = rectangle/diamond/ellipse; SELECTION_TOOLS = selection/lasso; LINEAR = arrow/line. These feed `ToolPopover` option lists.
- **`type MobileToolBarProps`** — L84-L88: `app: AppClassProperties`, `onHandToolToggle: () => void`, `setAppState: React.Component<any, UIAppState>["setState"]`.
- **`MobileToolBar` (named export)** — `({app, onHandToolToggle, setAppState}) => JSX` — L90-L485.
  - State/refs: `isOtherShapesMenuOpen` (bool, L96); `lastActiveGenericShape: "rectangle"|"diamond"|"ellipse"` default `"rectangle"` (L97-L99); `lastActiveLinearElement: "arrow"|"line"` default `"arrow"` (L100-L102); `toolbarWidth: number` default 0 (L144). `app.state.activeTool` aliased to `activeTool` (L95).
  - Effects: L105-L113 syncs `lastActiveGenericShape` to `activeTool.type` when it becomes rectangle/diamond/ellipse (so the shape popover's primary button reflects the last-used generic shape even if switched elsewhere). L116-L120 does the same for arrow/line → `lastActiveLinearElement`. Both depend on `[activeTool.type]`.
  - Hooks: `useTunnels()` → `TTDDialogTriggerTunnel` (L126).
  - **`handleToolChange` (internal)** — `(toolType: string, pointerType?: string) => void` — L128-L142. Fires `trackEvent("toolbar", toolType, "ui")` only if the tool is actually changing (L129-L131). For `"selection"` it no-ops if already selection, else `app.setActiveTool({type:"selection"})`; otherwise `app.setActiveTool({type: toolType as ToolType})`. `pointerType` param is unused.
  - **Responsive width math (the key parity-relevant logic, L144-L156):** constants `WIDTH = 36`, `GAP = 4`, `MIN_TOOLS = 7` (hand, selection, freedraw, eraser, rectangle, arrow, others), `MIN_WIDTH = MIN_TOOLS*WIDTH + (MIN_TOOLS-1)*GAP` = `7*36 + 6*4 = 276`, `ADDITIONAL_WIDTH = WIDTH+GAP = 40`. Then `showTextToolOutside = toolbarWidth >= MIN_WIDTH + 1*40` (≥316), `showImageToolOutside = >= MIN_WIDTH + 2*40` (≥356), `showFrameToolOutside = >= MIN_WIDTH + 3*40` (≥396). `toolbarWidth` is measured via the root `<div>`'s ref callback `getBoundingClientRect().width` (L196-L200) — a measure-on-mount/ref-set pattern, not a ResizeObserver.
  - **`extraTools` / `extraToolSelected` / `extraIcon` (L158-L191):** filters `["text","frame","embeddable","laser","magicframe"]` removing text/frame when shown outside (note: the `image` filter branch at L168-L170 never matches because `"image"` isn't in the source array — a latent dead branch). `extraToolSelected` = active tool is in `extraTools`. `extraIcon` is a nested ternary mapping the active extra tool to its icon (TextIcon/ImageIcon/frameToolIcon/EmbedIcon/laserPointerToolIcon/MagicIcon), defaulting to `extraToolsIcon`.
  - Render (L193-L484): root `div.mobile-toolbar` with the measuring ref. Children in order: `HandButton` (checked=`isHandToolActive(app.state)`); `ToolPopover` for selection/lasso (defaultOption=`app.state.preferredSelectionTool.type`; onToolChange sets active tool AND persists `preferredSelectionTool: {type, initialized:true}`; displayedOption falls back to `SELECTION_TOOLS[0]`); `ToolButton` freedraw and eraser (radio, `name="editor-current-shape"`); `ToolPopover` shapes (defaultOption=`lastActiveGenericShape`, title via ternary on lastActiveGenericShape, updates `lastActiveGenericShape`); `ToolPopover` arrow/line (`fillable`, updates `lastActiveLinearElement`); conditionally `ToolButton` text (if `showTextToolOutside`), image (if `showImageToolOutside`), frame (if `showFrameToolOutside`).
  - Overflow dropdown (L378-L482): `DropdownMenu open={isOtherShapesMenuOpen}`. Trigger toggles the menu and also clears `openMenu`/`openPopup` in appState (L387-L390); trigger is sized `WIDTH×WIDTH` centered flex, gets `--selected` class when an extra tool is active or the menu is open. Content lists text/image/frame only when NOT shown outside, plus always embeddable, laser (shortcut K), a literal "Generate" section label, the TTD AI trigger (`TTDDialogTriggerTunnel.Out`, gated on `app.props.aiEnabled !== false`), mermaid-to-excalidraw (`setOpenDialog({name:"ttd", tab:"mermaid"})`), and magicframe (gated on `aiEnabled !== false && app.plugins.diagramToCode`, with an "AI" badge). Shortcut labels use `KEYS.T/F/K.toLocaleUpperCase()`.

---

### packages/excalidraw/components/Modal.tsx

Base modal primitive: renders its children into a portal with a backdrop, ARIA dialog semantics, and Escape-to-close handling.

- **`Modal` (named export)** — `React.FC<{className?: string; children: React.ReactNode; maxWidth?: number; onCloseRequest(): void; labelledBy: string; theme?: AppState["theme"]; closeOnClickOutside?: boolean}>` — L13-L67.
  - Props default: `closeOnClickOutside = true` (L22). `theme` is in the prop type but unused in the body.
  - Refs/hooks: `useCreatePortalContainer({className: "excalidraw-modal-container"})` → `modalRoot` (L23-L25) — creates/returns the portal DOM container. `animationsDisabledRef = useRef(document.body.classList.contains("excalidraw-animations-disabled"))` (L27-L29) — snapshots the animations-disabled flag once at mount.
  - Guard: returns `null` if `modalRoot` is not ready (L31-L33).
  - **`handleKeydown` (internal)** — `(event: React.KeyboardEvent) => void` — L35-L41. On `KEYS.ESCAPE`: calls `event.nativeEvent.stopImmediatePropagation()` AND `event.stopPropagation()` (prevents other Escape handlers in the editor from also firing) then `props.onCloseRequest()`.
  - Render (L43-L66): `createPortal` into `modalRoot`. Outer `div.Modal` gets `props.className` and conditional `animations-disabled` class from the ref; `role="dialog"`, `aria-modal="true"`, `aria-labelledby={props.labelledBy}`, `onKeyDown={handleKeydown}`. `Modal__background` div is the backdrop — its `onClick` is `props.onCloseRequest` only when `closeOnClickOutside`, else `undefined`. `Modal__content` sets a CSS custom property `--max-width: ${props.maxWidth}px` and `tabIndex={0}` so the content is focusable.

---

### packages/excalidraw/components/OverwriteConfirm/OverwriteConfirm.tsx

The "you have unsaved work — overwrite?" dialog, driven by a Jotai atom; renders a warning/danger header with a primary confirm button and a set of alternative-action cards.

- **`type OverwriteConfirmDialogProps`** — `{ children: React.ReactNode }` — L15-L17 (exported).
- **`OverwriteConfirmDialog` (named export)** — `Object.assign(withInternalFallback("OverwriteConfirmDialog", ({children}) => JSX), { Actions, Action })` — L19-L75.
  - Inner render (L22-L67) hooks: `useTunnels()` → `OverwriteConfirmDialogTunnel`; `useAtom(overwriteConfirmStateAtom)` → `[overwriteConfirmState, setState]`. No local state/refs/effects.
  - Guard: returns `null` if `!overwriteConfirmState.active` (L28-L30) — the dialog only mounts when the atom is in its `active: true` shape.
  - **`handleClose` (internal closure)** — `() => void` — L32-L35. Calls the atom's `onClose()` (which resolves the opener promise with `false`) then flips `active: false` via `setState(state => ({...state, active:false}))`.
  - **`handleConfirm` (internal closure)** — `() => void` — L37-L40. Calls `onConfirm()` (resolves promise `true`) then sets `active: false`. (Note: `onReject` exists on state but is not wired in this component.)
  - Render (L42-L66): portaled via `OverwriteConfirmDialogTunnel.In`. `<Dialog onCloseRequest={handleClose} title={false} size={916}>` containing `.OverwriteConfirm` → `<h3>` title, a description block whose class includes `--color-${overwriteConfirmState.color}` (danger/warning), the `alertTriangleIcon`, the description node, a spacer, and a primary `FilledButton` (color=state.color, size large, label=`actionLabel`, onClick=`handleConfirm`). Below that `<Actions>{children}</Actions>` hosts the alternative-action cards.
  - Static props (L70-L72): attaches `Actions` and `Action` so consumers write `<OverwriteConfirmDialog.Action>` etc.

---

### packages/excalidraw/components/OverwriteConfirm/OverwriteConfirmActions.tsx

Sub-components for the overwrite-confirm dialog: a generic `Action` card plus two concrete pre-built actions (export-to-image, save-to-disk), grouped by an `Actions` container.

- **`type ActionProps`** — `{ title: string; children: React.ReactNode; actionLabel: string; onClick: () => void }` — L9-L14 (exported).
- **`Action` (named export)** — `({title, children, actionLabel, onClick}: ActionProps) => JSX` — L16-L38. Renders an `OverwriteConfirm__Actions__Action` card: `<h4>` title, a content area (children), and an outlined muted full-width large `FilledButton` with `label={actionLabel}` onClick. Stateless.
- **`ExportToImage` (named export)** — `() => JSX` — L40-L57. Hooks: `useI18n()` → `t`; `useExcalidrawActionManager()`; `useExcalidrawSetAppState()`. Renders an `Action` whose onClick (L48-L52) executes `actionChangeExportEmbedScene` via `actionManager.executeAction(..., "ui", true)` (the `true` = value, forcing embed-scene on) then opens the image export dialog via `setAppState({openDialog:{name:"imageExport"}})`. Side effect: mutates editor action + app state.
- **`SaveToDisk` (named export)** — `() => JSX` — L59-L74. Hooks: `useI18n()`, `useExcalidrawActionManager()`. Renders an `Action` whose onClick executes `actionSaveFileToDisk` via `actionManager.executeAction(actionSaveFileToDisk, "ui")`. Side effect: triggers the save-to-disk flow.
- **`Actions` (named export)** — `Object.assign(({children}) => <div className="OverwriteConfirm__Actions">{children}</div>, { ExportToImage, SaveToDisk })` — L76-L86. Simple flex/grid container that also exposes the two concrete actions as static members.

---

### packages/excalidraw/components/OverwriteConfirm/OverwriteConfirmState.ts

State module for the overwrite-confirm dialog: the discriminated-union state type, its Jotai atom, and a promise-based imperative opener.

- **`type OverwriteConfirmState`** (exported) — L5-L17. Discriminated union on `active`. Active shape: `{ active: true; title: string; description: React.ReactNode; actionLabel: string; color: "danger" | "warning"; onClose: () => void; onConfirm: () => void; onReject: () => void }`. Inactive: `{ active: false }`.
- **`overwriteConfirmStateAtom` (exported const)** — `atom<OverwriteConfirmState>({ active: false })` — L19-L21. The single source of truth read by the dialog component.
- **`openConfirmModal` (exported async fn)** — `({title, description, actionLabel, color}: {title: string; description: React.ReactNode; actionLabel: string; color: "danger" | "warning"}) => Promise<boolean>` — L23-L46. **The imperative bridge between async code and the declarative dialog.** Returns a `Promise<boolean>` and synchronously sets the atom to `active: true` with callbacks wired so `onConfirm` → `resolve(true)` and both `onClose`/`onReject` → `resolve(false)` (L34-L45). Side effect: writes the atom directly via `editorJotaiStore.set(...)`, causing the dialog to mount; the promise settles when the user confirms/closes. Invariant: the dialog component is responsible for flipping `active` back to `false` after invoking a callback.
