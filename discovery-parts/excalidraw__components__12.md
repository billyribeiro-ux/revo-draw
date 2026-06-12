## Cluster: excalidraw__components__12

This cluster covers the top-level editor UI shell (`LayerUI`) and the entire Library Menu subsystem (browse/control/header/items/section components plus the menu container with its pending-elements selection logic).

---

### packages/excalidraw/components/LayerUI.tsx

Purpose: The master desktop UI composition layer that lays out the top toolbar, selected-shape actions panel, sidebars, footer, dialogs, toasts, and tunneled UI for the Excalidraw editor (delegating to `MobileMenu` on phones).

- `interface LayerUIProps` (L80-L102): Props bundle for the shell — `actionManager`, `appState: UIAppState`, `files`, `canvas`, `setAppState`, `elements`, toggles (`onLockToggle`, `onHandToolToggle`, `onPenModeToggle`), `showExitZenModeBtn`, `langCode`, optional host renderers (`renderTopLeftUI`, `renderTopRightUI`, `renderCustomStats`), `UIOptions`, `onExportImage`, `renderWelcomeScreen`, `children`, `app: AppClassProperties`, `isCollaborating`, `generateLinkForSelection`.

- `DefaultMainMenu: React.FC<{ UIOptions }>` (L104-L129): Fallback main hamburger menu rendered only when the host app supplies none (uses `__fallback`). Conditionally includes Export/SaveAsImage based on `UIOptions.canvasActions`, plus LoadScene, SaveToActiveFile, SearchMenu, Help, ClearCanvas, separators, an "Excalidraw links" group (Socials), ToggleTheme, ChangeCanvasBackground.

- `DefaultOverwriteConfirmDialog: () => JSX` (L131-L138): Fallback overwrite-confirm dialog wrapping `SaveToDisk` and `ExportToImage` actions, also via `__fallback`.

- `LayerUI = ({...props}) => JSX` (L140-L650): The main functional component. It is the algorithmic core; key internal pieces:
  - Reads `useEditorInterface()` and `useStylesPanelMode()`; derives `isCompactStylesPanel` (L162-L164). Computes a `spacing` object (menu/toolbar gaps, island padding, collab margin) that differs between compact and normal modes (L167-L183) — relevant for parity of toolbar layout metrics.
  - `useInitializeTunnels()` (L165) creates the per-instance tunnel set; `TunnelsJotaiProvider` (L185) and the bottom-of-file provider wrapping (L642-L648) scope tunnels + UI app state + jotai store.
  - `[eyeDropperState, setEyeDropperState] = useAtom(activeEyeDropperAtom)` (L187): owns eye-dropper state.
  - `renderJSONExportDialog()` (L189-L205): returns `<JSONExportDialog>` only if `UIOptions.canvasActions.export` is set; else null.
  - `renderImageExportDialog()` (L207-L226): returns `<ImageExportDialog>` only if `saveAsImage` enabled AND `appState.openDialog?.name === "imageExport"`; wires `onCloseRequest` to clear `openDialog`.
  - `renderCanvasActions()` (L228-L235): renders the `MainMenuTunnel.Out` and (if welcome screen) the menu-hint tunnel, wrapped in a relatively-positioned div.
  - `renderSelectedShapeActions()` (L237-L285): renders the selected-shape properties panel inside a `Section`. Branches on compact mode: compact uses `CompactShapeActions` in an Island with `padding={0}`; normal uses `SelectedShapeActions` in an Island with `padding={2}`. Both set `maxHeight: appState.height - 166px` (note: 166px is the approximate hamburger+footer reserved height — a layout invariant to preserve in any reimplementation). Pulls `app.scene.getNonDeletedElementsMap()` for `elementsMap`.
  - `renderFixedSideContainer()` (L287-L434): the top fixed bar. Computes `shouldRenderSelectedShapeActions = showSelectedShapeActions(appState, elements)` (L288-L291) and `shouldShowStats` (open AND not zen AND not viewmode AND not elementLinkSelector dialog, L293-L297). Lays out a left `Stack.Col` (canvas actions + selected-shape-actions container), a center "shapes" `Section` (toolbar Island with `HintViewer`, `PenModeButton`, `LockButton`, divider, `ShapesSwitcher`; plus a collab `LaserPointerButton` Island when collaborating), and a top-right region (`UserList` when collaborators present, host `renderTopRightUI`, the `DefaultSidebarTriggerTunnel.Out` shown only when sidebar not docked or not the default sidebar, and `Stats`). Toolbar is hidden in view mode / element-link-selector dialog.
  - `renderSidebars()` (L436-L451): renders `<DefaultSidebar __fallback>` and on dock toggle calls `trackEvent("sidebar", ...)` with desktop/mobile suffix derived from `editorInterface.formFactor`.
  - `isSidebarDocked = useAtomValue(isSidebarDockedAtom)` (L453): subscribes to docked state.
  - `layerUIJSX` (L455-L639): Assembles the full tree. Order matters: host `children` first (so host components are detected first to minimize layout shift, per comment L458-L459), then fallback tunneled defaults (DefaultMainMenu, DefaultSidebar.Trigger with `sidebarRightIcon`/library title, DefaultOverwriteConfirmDialog, fallback TTDDialog). Then conditionally: LoadingMessage (`delay={250}`), ErrorDialog, EyeDropper (desktop only), HelpDialog, ActiveConfirmDialog, ElementLinkDialog, OverwriteConfirmDialogTunnel.Out, image/JSON export dialogs, PasteChartDialog. On phone renders `<MobileMenu>`; otherwise renders the `.layer-ui__wrapper` (with width reduced by `--right-sidebar-width` when an open sidebar is docked and fits), the welcome-screen center tunnel, the fixed side container, `Footer`, a floating status stack (Toast or "scroll back to content" button), and the sidebars.
  - The EyeDropper `onChange` handler (L498-L527): for each selected element, mutates `strokeColor`/`backgroundColor` via `mutateElement(element, arrayToMap(elements), {...})`, with an alt-key swap (when `swapPreviewOnAlt`) that flips stroke<->background; then `ShapeCache.delete(element)` per element and `app.scene.triggerUpdate()`. With no selection it writes `currentItemBackgroundColor`/`currentItemStrokeColor` to appState instead. `onSelect` (L528-L533) keeps the dropper open if `keepOpenOnAlt && event.altKey`, else closes; forwards to `eyeDropperState.onSelect`.
  - "scroll back to content" button (L620-L631): on click sets appState by spreading `calculateScrollCenter(elements, appState)` — recenters the camera on content.

- `stripIrrelevantAppStateProps = (appState: AppState): UIAppState` (L652-L655): Destructures out `cursorButton`, `scrollX`, `scrollY` and returns the rest. Used so the memo comparison ignores cursor/scroll churn (these change constantly and shouldn't force UI re-render). Invariant: UI must not depend on those three props.

- `areEqual = (prevProps, nextProps): boolean` (L657-L678): Custom `React.memo` comparator. Short-circuits to false if `children` identity changed (L659-L661). Strips `canvas` and `appState` from both, then returns true iff the stripped app states are shallow-equal (with custom shallow comparators for `selectedElementIds` and `selectedGroupIds`) AND the remaining props are shallow-equal. Performance-critical: prevents re-render on cursor/scroll changes.

- `export default React.memo(LayerUI, areEqual)` (L680).

---

### packages/excalidraw/components/LibraryMenu.tsx

Purpose: The library sidebar container component — owns selected-library-item state, computes the set of "pending" (currently-selected canvas) elements to offer for adding to the library, wires keyboard (ESC) handling, and renders `LibraryMenuItems` + control buttons.

- `export const isLibraryMenuOpenAtom = atom(false)` (L58): Jotai atom tracking whether the library dropdown menu is open (shared with `LibraryMenuHeaderContent`).

- `LibraryMenuWrapper = ({ children }) => JSX` (L60-L62): Trivial wrapper `<div className="layer-ui__library">`.

- `LibraryMenuContent = memo((props) => JSX)` (L64-L173): Inner content component. Props include `pendingElements`, `onInsertLibraryItems`, `onAddToLibrary`, `setAppState`, `libraryReturnUrl`, `library: Library`, `id`, `theme`, `selectedItems`, `onSelectItems` (L65-L87).
  - Reads `[libraryItemsData] = useAtom(libraryItemsAtom)` (L88).
  - `_onAddToLibrary = useCallback((elements) => void)` (L90-L121): Inner async `addToLibrary` tracks `trackEvent("element","addToLibrary","ui")`, rejects elements whose type is in `LIBRARY_DISABLED_TYPES` (sets an `errorMessage` and returns), then prepends a new unpublished `LibraryItem` (`status: "unpublished"`, `id: randomId()`, `created: Date.now()`) to existing items, calls `onAddToLibrary()` (deselect), and `library.setLibrary(nextItems)` with a catch that sets an error toast. Side effect: persists library.
  - `libraryItems = useMemo(...)` (L123-L126): memoized slice of `libraryItemsData.libraryItems`.
  - Loading branch (L128-L142): if `status === "loading" && !isInitialized`, renders a Spinner + loading message.
  - `showBtn` (L144-L145): true when there are library items or pending elements; controls whether the bottom control buttons render.
  - Renders `LibraryMenuItems` + conditional `LibraryMenuControlButtons` (L147-L171).

- `getPendingElements = (elements, selectedElementIds) => {elements, pending, selectedElementIds}` (L175-L189): Computes `pending` via `getSelectedElements(elements, {selectedElementIds}, {includeBoundTextElement: true, includeElementsInFrames: true})`. Returns a snapshot object used as state.

- `usePendingElementsMemo = (appState, app): LibraryItem["elements"]` (L191-L258): Custom hook computing the pending elements with careful stale-state handling.
  - Initializes state from `getPendingElements` (L196-L198).
  - `selectedElementVersions = useRef(new Map())` (L200-L202): tracks element id -> version to detect content changes.
  - Effect (L204-L208) writes current pending versions into the ref map.
  - Effect (L210-L255): only recomputes when `app.state.cursorButton === "up"` and active tool is `selection` (i.e. pointer released — read non-reactively from `app.state`, see comment L213-L214 about potential staleness). If `selectedElementIds` changed (shallow), clears the version map and recomputes; otherwise compares per-id versions from `app.scene.getNonDeletedElementsMap()` and recomputes if any differs; else returns `prev` unchanged. Comment (L235-L239) explains versions are updated in a separate effect to survive React StrictMode double-render. Performance/correctness invariant: avoids recomputing pending elements mid-drag.

- `export const LibraryMenu = memo(() => JSX)` (L264-L344): The exported sidebar tab component. Pulls `useApp`, `onInsertElements`, `useAppProps`, `useUIAppState`, `useExcalidrawSetAppState`. Owns `selectedItems` state (L270), memoizes `app.library` (L271), computes `pendingElements` via the hook (L272).
  - ESC keydown effect (L274-L312): registers a capture-phase document keydown listener via `addEventListener`. On ESC, if target is inside `.${CLASSES.SIDEBAR}`: if items selected, stops propagation and clears selection; else if target is an empty writable `HTMLInputElement` (search box), stops propagation, closes the sidebar (`openSidebar: null`) and refocuses container. If target is outside the sidebar but selection exists, checks the element under `app.lastViewportPosition` and clears selection if it's over the sidebar. Cleanup returns the listener remover.
  - `onInsertLibraryItems = useCallback(...)` (L314-L320): calls `onInsertElements(distributeLibraryItemsOnSquareGrid(libraryItems))` then refocuses container — geometry detail: inserted library items are arranged on a square grid.
  - `deselectItems = useCallback(...)` (L322-L328): clears `selectedElementIds`, `selectedGroupIds`, `activeEmbeddable`.
  - Renders `<LibraryMenuContent>` wiring all the above (L330-L342).

---

### packages/excalidraw/components/LibraryMenuBrowseButton.tsx

Purpose: A single anchor link that opens the external Excalidraw libraries site, passing the editor context (target, referrer, token, theme, version) via query string.

- `LibraryMenuBrowseButton = ({ theme, id, libraryReturnUrl }) => JSX` (L7-L31): Computes `referrer = libraryReturnUrl || window.location.origin + window.location.pathname` (L16-L17). Renders an `<a>` to `${import.meta.env.VITE_APP_LIBRARY_URL}?target=${window.name || "_blank"}&referrer=...&useHash=true&token=${id}&theme=${theme}&version=${VERSIONS.excalidrawLibrary}` with `target="_excalidraw_libraries"` and label `t("labels.libraries")`. Pure presentational; no state.
- `export default LibraryMenuBrowseButton` (L33).

---

### packages/excalidraw/components/LibraryMenuControlButtons.tsx

Purpose: Layout wrapper that places the "browse libraries" button plus any extra children in a control-buttons row.

- `export const LibraryMenuControlButtons = ({ libraryReturnUrl, theme, id, style, children, className }) => JSX` (L7-L35): Renders a `<div className={clsx("library-menu-control-buttons", className)}>` with the given inline `style`, containing `<LibraryMenuBrowseButton>` and `{children}`. Pure presentational; no state, refs, or effects.

---

### packages/excalidraw/components/LibraryMenuHeaderContent.tsx

Purpose: The library header dropdown menu (load/export/publish/remove/reset) plus its container, including confirm dialogs and the publish-library flow.

- `getSelectedItems = (libraryItems, selectedItems): LibraryItems` (L33-L36): Returns library items whose id is in `selectedItems`.

- `export const LibraryDropdownMenuButton: React.FC<{...}>` (L38-L275): The presentational dropdown button. Props: `setAppState`, `selectedItems`, `library`, `onRemoveFromLibrary`, `resetLibrary`, `onSelectItems`, `appState`, `className` (L38-L56).
  - State/atoms: `[libraryItemsData] = useAtom(libraryItemsAtom)` (L57); `[isLibraryMenuOpen, setIsLibraryMenuOpen] = useAtom(isLibraryMenuOpenAtom)` (L58-L60); `showRemoveLibAlert` (L89); `showPublishLibraryDialog` (L101-L102); `publishLibSuccess` (L103-L106).
  - Derived: `itemsSelected` (L91); `items` = selected subset or all (L92-L96); `resetLabel` = "remove" vs "resetLibrary" (L97-L99).
  - `renderRemoveLibAlert = () => JSX` (L62-L87): ConfirmDialog whose copy/title depend on whether items are selected; on confirm calls `onRemoveFromLibrary()` or `resetLibrary()` and hides the alert.
  - `renderPublishSuccess = useCallback(() => JSX)` (L107-L141): Dialog showing publish success with author name and a link, plus a close ToolButton.
  - `onPublishLibSuccess = (data, libraryItems) => void` (L143-L156): Closes publish dialog, sets success state, marks selected items' `status = "published"` on a copy, and persists via `library.setLibrary`. Side effect: mutates copied items in place then saves.
  - `onLibraryImport = async () => void` (L158-L179): Calls `library.updateLibrary` with `fileOpen(...)`, `merge: true`, `openLibraryMenu: true`. Catches `AbortError` (warns and returns) else sets `importLibraryError`.
  - `onLibraryExport = async () => void` (L181-L190): Exports selected items or the full latest library via `saveLibraryAsJSON`, swallowing FS abort errors (`muteFSAbortError`) and surfacing other errors as `errorMessage`.
  - `renderLibraryMenu = () => JSX` (L192-L243): A `DropdownMenu` (open bound to `isLibraryMenuOpen`) with conditional items: Load (only when nothing selected), Export (when items exist), Publish (when items selected), and Remove/Reset (when items exist). Trigger is `DotsIcon`.
  - Return (L245-L274): wraps the menu, a `library-actions-counter` badge showing `selectedItems.length`, the remove alert, the `PublishLibrary` dialog (wired with `onSuccess`, `onError` via `window.alert`, `updateItemsInStorage`, `onRemove`), and the publish-success dialog. Note: `onError` uses `window.alert` — a stylistic landmine for a reimplementation.

- `export const LibraryDropdownMenu = ({ selectedItems, onSelectItems, className }) => JSX` (L277-L325): Container that supplies real handlers. Pulls `useApp().library`, `useLibraryCache()` (`clearLibraryCache`, `deleteItemsFromLibraryCache`), `useUIAppState`, `useExcalidrawSetAppState`, `libraryItemsAtom`.
  - `removeFromLibrary = async (libraryItems) => void` (L293-L304): Filters out selected ids, persists via `library.setLibrary` (catch -> error toast), calls `deleteItemsFromLibraryCache(selectedItems)`, then `onSelectItems([])`. Side effect: mutates persisted library and svg cache.
  - `resetLibrary = () => void` (L306-L309): `library.resetLibrary()` + `clearLibraryCache()`.
  - Renders `LibraryDropdownMenuButton` wired to those (L311-L324).

---

### packages/excalidraw/components/LibraryMenuItems.tsx

Purpose: The scrollable library item grid — handles search/filter, multi-select (with shift-range selection), drag serialization, batched rendering, and section grouping (pending / personal / Excalidraw-published).

- `const ITEMS_RENDERED_PER_BATCH = 17` (L48-L50): Odd batch size chosen deliberately so progressive rendering looks organic (per comment). Performance/visual detail.
- `const CACHED_ITEMS_RENDERED_PER_BATCH = 64` (L51-L53): Larger batch used when all svgs are already cached.

- `export default function LibraryMenuItems({...}) ` (L55-L446): The main grid component. Props: `isLoading`, `libraryItems`, `onAddToLibrary`, `onInsertLibraryItems`, `pendingElements`, `theme`, `id`, `libraryReturnUrl`, `onSelectItems`, `selectedItems` (L55-L77).
  - Refs/state: `libraryContainerRef` (L79); `scrollPosition = useScrollPosition(...)` (L80); `lastSelectedItem` (L90-L92); `searchInputValue` (L94); `searchInputRef` (L254).
  - Restore-scroll effect (L83-L87): on first render only, scrolls container to the previously saved `scrollPosition` (deps intentionally empty — documented).
  - `svgCache` from `useLibraryCache()` (L89).
  - Derived booleans: `IS_LIBRARY_EMPTY` (L96), `IS_SEARCHING` (L98).
  - `filteredItems = useMemo(...)` (L100-L112): Lowercases + `deburr`s the trimmed query; returns `[]` if empty; filters items whose `deburr(name.toLowerCase())` includes the query. Note: uses `deburr` for accent-insensitive matching — important for parity.
  - `unpublishedItems`/`publishedItems = useMemo(...)` (L114-L122): partition by `status === "published"`.
  - `onItemSelectToggle = useCallback((id, event) => void)` (L124-L173): Multi-select logic. If selecting and `event.shiftKey && lastSelectedItem`, computes a contiguous range over the ordered `[...unpublishedItems, ...publishedItems]` array using `Math.min`/`Math.max` of the two indices (supports top-down and bottom-up), and unions it with already-selected ids via a reduce. Falls back to single add if either index is -1. Updates `lastSelectedItem` on select, clears it on deselect. Non-obvious: range selection respects display order across both sections.
  - Reset-last-selected effect (L175-L181): clears `lastSelectedItem` when selection becomes empty (so subsequent shift-clicks don't form a stale range).
  - `getInsertedElements = useCallback((id) => ...)` (L183-L208): Resolves target items (selected set if id is selected, else just that id), and for each returns a copy with `elements` replaced by `duplicateElements({type:"everything", elements, randomizeSeed: true, preserveFrameChildrenOrder: true}).duplicatedElements`. Invariant (comment L196-L197, ref #6465): duplicate before insertion to confine ids/bindings per item.
  - `onItemDrag = useCallback((id, event) => void)` (L210-L223): Serializes only the item ids (`selectedItems` if the dragged id is selected, else `[id]`) into `event.dataTransfer` under `MIME_TYPES.excalidrawlibIds`. Performance: serializes ids, not bodies, to avoid drag-time race conditions (comment L211-L212).
  - `isItemSelected = useCallback((id) => boolean)` (L225-L233): membership check, false for null.
  - `onAddToLibraryClick = useCallback(...)` (L235-L237): calls `onAddToLibrary(pendingElements)`.
  - `onItemClick = useCallback((id) => void)` (L239-L246): inserts elements for the clicked id via `getInsertedElements`.
  - `itemsRenderedPerBatch` (L248-L252): chooses cached vs normal batch size based on whether `svgCache.size >= (filteredItems.length ? filteredItems : libraryItems).length`.
  - Focus effect (L255-L260): focuses the search input on next animation frame (works around tab-trigger stealing focus).
  - `JSX_whenNotSearching` (L262-L329): renders "personalLib" header, an empty-state hint (varying by whether published items exist), or `LibraryMenuSectionGrid`s for pending elements (single section with `id:null`), unpublished items, and a separate published ("excalidrawLib") grid.
  - `JSX_whenSearching` (L331-L377): renders a search header with an "esc to clear" hint, then either a filtered grid or a no-results state with a "clear search" Button. Note `onPointerDown` calls `preventDefault()` to keep focus.
  - Final return (L379-L445): container with `justifyContent` toggled by content presence; a header row with the search `TextField` (search type, cancel button hidden except on phone) and the `LibraryDropdownMenu`; a scrollable `Stack.Col` (with absolute Spinner when loading) holding the two JSX branches; and bottom `LibraryMenuControlButtons` when the library is empty.

---

### packages/excalidraw/components/LibraryMenuSection.tsx

Purpose: Renders one batched grid section of library units, progressively revealing items via React transitions to keep the UI responsive.

- `type LibraryOrPendingItem` (L13-L19): Readonly array of either a `LibraryItem` or a pending item `{ id: null; elements: readonly NonDeleted<ExcalidrawElement>[] }`.

- `interface Props` (L21-L29): `items`, `onClick(id|null)`, `onItemSelectToggle(id, MouseEvent)`, `onItemDrag(id, DragEvent)`, `isItemSelected(id|null) => boolean`, `svgCache: SvgCache`, `itemsRenderedPerBatch: number`.

- `export const LibraryMenuSectionGrid = ({ children }) => JSX` (L31-L37): Wrapper `<div className="library-menu-items-container__grid">`. Pure presentational.

- `export const LibraryMenuSection = memo(({...Props}) => JSX)` (L39-L82): Progressive renderer.
  - `[, startTransition] = useTransition()` (L49); `[index, setIndex] = useState(0)` (L50).
  - Effect (L52-L58): while `index < items.length`, schedules `setIndex(index + itemsRenderedPerBatch)` inside `startTransition` — incrementally raises the reveal threshold each render pass (low-priority transition) until all items are shown. Performance detail: this is the batching engine that prevents blocking on large libraries.
  - Render (L60-L81): maps items; items with `i < index` render a `LibraryUnit` (props: `elements`, `isPending = !item?.id && !!item?.elements`, `onClick`, `svgCache`, `id`, `selected = isItemSelected(item.id)`, `onToggle`, `onDrag`, `key = item?.id ?? i`); items beyond the threshold render an `EmptyLibraryUnit` placeholder (preserving grid height to avoid layout shift).
