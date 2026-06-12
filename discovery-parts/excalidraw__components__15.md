## Cluster: excalidraw__components__15

This cluster covers seven React/TSX UI components from `packages/excalidraw/components/`: a trivial paragraph wrapper, the chart-paste dialog (with live SVG previews), the pen-mode toggle button, the legacy positioned `Popover` (viewport-fitting + focus trapping), the editable project-name input, the Radix-based `PropertiesPopover`, and the library-publishing dialog (with a canvas-composited preview image generator).

### packages/excalidraw/components/Paragraph.tsx

A one-line presentational wrapper that renders its children inside a `<p class="excalidraw__paragraph">`.

- `Paragraph(props: { children: React.ReactNode; style?: React.CSSProperties }) => JSX.Element` — L1-L10. Pure stateless function component; renders a `<p>` with class `excalidraw__paragraph` and an optional inline `style`. No state, no effects, no side effects.

### packages/excalidraw/components/PasteChartDialog.tsx

A modal `Dialog` shown when the user pastes spreadsheet-like data; renders live SVG previews of bar/line/radar charts (and optionally plain text) and inserts the chosen rendering as elements onto the canvas.

- Type aliases (L23-L25): `OnPlainTextPaste = (rawText: string) => void`; `OnInsertChart = (chartType: ChartType, elements: ChartElements) => void`.
- `getChartTypeLabel(chartType: ChartType) => string` — L27-L38. Maps a `ChartType` to a translated label via `t("labels.chartType_*")`; falls through to returning the raw `chartType` string for unknown types. Pure.
- `ChartPreviewBtn(props: { spreadsheet: Spreadsheet | null; chartType: ChartType; colorSeed: number; onClick: OnInsertChart }) => JSX.Element` — L40-L114. Renders a clickable preview button for one chart type.
  - Refs/state: `previewRef` (HTMLDivElement holding the SVG), `chartElements` state (`ChartElements | null`), `theme` from `useUIAppState()`.
  - `useLayoutEffect` (L52-L95): bails (clearing state) if no spreadsheet; otherwise calls `renderSpreadsheet(chartType, spreadsheet, 0, 0, colorSeed)` to build elements, stores them in state, then asynchronously calls `exportToSvg(elements, {exportBackground:false, viewBackgroundColor:"#fff", exportWithDarkMode: theme==="dark"}, null, {skipInliningFonts:true})`, removes the `.style-fonts` node from the SVG, and replaces the preview node's children with the SVG. Cleanup clears the preview node. Deps: `[spreadsheet, chartType, colorSeed, theme]`. Side effects: async DOM mutation of `previewRef`. Coordinate detail: chart is rendered at world origin (0,0); preview SVG is unscaled and font-inlining is skipped for speed.
  - Click handler (L104-L108): if `chartElements` exist, invokes `onClick(chartType, chartElements)`.
- `PlainTextPreviewBtn(props: { rawText: string; onClick: OnPlainTextPaste }) => JSX.Element` — L116-L174. Same preview pattern but for a single text element.
  - Refs/state: `previewRef`, `theme` from `useUIAppState()`.
  - `useLayoutEffect` (L123-L157): bails if `rawText` empty; builds `newTextElement({text:rawText, x:0, y:0})`, async-exports it to SVG (same options as above), strips `.style-fonts`, and swaps it into the preview node. Cleanup clears the node. Deps: `[rawText, theme]`.
  - Click handler (L164-L166): calls `onClick(rawText)`.
- `PasteChartDialog({ data: Spreadsheet; rawText: string; onClose: () => void }) => JSX.Element` — L176-L270. The exported dialog.
  - Hooks: `useApp()` for `onInsertElements`/`focusContainer`; `colorSeed` state initialized to `Math.random()` (drives palette of all previews so reshuffle re-randomizes colors).
  - `handleReshuffleColors` (`useCallback`, L188-L190): sets `colorSeed` to a new `Math.random()` — forces all preview effects to re-render with new colors.
  - `handleClose` (`useCallback`, L192-L196): calls `onClose` if present.
  - `handleChartClick(chartType, elements)` (L198-L203): inserts elements, fires `trackEvent("paste","chart",chartType)`, closes, refocuses container.
  - `handlePlainTextClick(rawText)` (L205-L215): re-creates a fresh `newTextElement` from `rawText` (note: not reusing the preview's element), inserts it, tracks `"plaintext"`, closes, refocuses.
  - Render (L217-L269): `Dialog` (size `"regular"`, `autofocus={false}`) with a custom title containing a reshuffle button (`bucketFillIcon`, keyboard-activatable via Enter/Space on a `role="button" tabIndex={0}` div). Body maps over `["bar","line","radar"]`, skipping any type for which `isSpreadsheetValidForChartType(data, chartType)` is false, rendering a `ChartPreviewBtn` per valid type; appends a `PlainTextPreviewBtn` when `rawText` is truthy.

### packages/excalidraw/components/PenModeButton.tsx

A checkbox-styled toolbar toggle for stylus/pen mode that renders only when a pen has been detected.

- `PenModeIconProps` type (L9-L17): `{ title?, name?, checked: boolean, onChange?(): void, zenModeEnabled?: boolean, isMobile?: boolean, penDetected: boolean }`.
- `DEFAULT_SIZE: ToolButtonSize = "medium"` constant — L19.
- `PenModeButton(props: PenModeIconProps) => JSX.Element | null` — L21-L48. Returns `null` immediately if `!props.penDetected` (L22-L24). Otherwise renders a `<label>` with classes `ToolIcon ToolIcon__penMode ToolIcon_size_medium` (plus `is-mobile` when `props.isMobile`), wrapping a controlled checkbox `<input>` (`checked={props.checked}`, `onChange={props.onChange}`, `aria-label={props.title}`) and the `PenModeIcon`. Note: `zenModeEnabled` is declared in props but unused in render. Stateless.

### packages/excalidraw/components/Popover.tsx

A legacy absolutely-positioned popover that focus-traps Tab navigation, optionally clamps itself inside the viewport, and closes on outside pointerdown.

- `Props` type (L10-L21): `{ top?, left?, children?, onCloseRequest?(event: PointerEvent): void, fitInViewport?: boolean, offsetLeft?, offsetTop?, viewportWidth?, viewportHeight?, className? }`.
- `Popover({ children, left, top, onCloseRequest, fitInViewport=false, offsetLeft=0, offsetTop=0, viewportWidth=window.innerWidth, viewportHeight=window.innerHeight, className }) => JSX.Element` — L23-L157.
  - Refs: `popoverRef` (the popover div, `tabIndex={-1}`); `lastInitializedPosRef` (`{top,left} | null`) used as a StrictMode double-run guard.
  - Focus-trap effect (`useEffect`, deps `[]`, L37-L86): on mount, focuses the container unless focus is already nested inside it. Installs a `keydown` listener implementing a manual Tab cycle using `queryFocusableElements(container)`: when focus is on the container it jumps to first (or last if shift) focusable; wraps from last→first on Tab and first→last on Shift+Tab; calls `preventDefault()` + `stopImmediatePropagation()` on the wrap cases. Cleanup removes the listener.
  - Viewport-fit effect (`useLayoutEffect`, L93-L138): only runs when `fitInViewport` and `top`/`left` are non-null. Measures the popover via `getBoundingClientRect()`. StrictMode guard: skips if `lastInitializedPosRef` already equals the current `{top,left}`. Horizontal logic (L110-L118): if `width >= viewportWidth` it pins width to viewport, `left=0`, enables `overflowX:scroll`; else if `left + width - offsetLeft > viewportWidth` it clamps `left = viewportWidth - width - 10` (10px margin); else uses `left`. Vertical logic (L120-L128) mirrors it: full-height case pins `height = viewportHeight - 20`, `top=10`, `overflowY:scroll`; overflow case clamps `top = viewportHeight - height`; else uses `top`. Deps: `[top,left,fitInViewport,viewportWidth,viewportHeight,offsetLeft,offsetTop]`. Coordinate detail: positions are in screen/client px; the `offsetLeft`/`offsetTop` subtractions account for a parent offset when deciding overflow.
  - Outside-close effect (`useEffect`, deps `[onCloseRequest]`, L140-L150): on document `pointerdown`, if the event target is not inside the popover, calls `onCloseRequest(event)` wrapped in `unstable_batchedUpdates`. Cleanup removes the listener.
  - Render (L152-L156): `<div class={clsx("popover", className)} ref tabIndex={-1}>{children}</div>`.

### packages/excalidraw/components/ProjectName.tsx

An editable text input for the document/file name, committing changes on blur or Enter.

- `Props` type (L10-L15): `{ value: string; onChange: (value: string) => void; label: string; ignoreFocus?: boolean }`.
- `ProjectName(props: Props) => JSX.Element` — L17-L57.
  - Hooks/state: `id` from `useExcalidrawContainer()`; local `fileName` state seeded from `props.value` (uncontrolled-vs-prop drift note: state is only initialized once, so external `props.value` changes do not re-sync the input).
  - `handleBlur(event: any)` (L21-L29): unless `props.ignoreFocus`, calls `focusNearestParent(event.target)` to return focus to the canvas; then if the input value differs from `props.value`, fires `props.onChange(value)`. Side effect: focus movement.
  - `handleKeyDown(event: React.KeyboardEvent<HTMLElement>)` (L31-L39): on Enter, `preventDefault()`; bails if the event is an IME composition (`isComposing` or `keyCode === 229`); otherwise blurs the input (which triggers the commit via `handleBlur`).
  - Render (L41-L56): a `<label htmlFor="filename">` showing `${label}:` and a `<input type="text" class="TextInput" id={`${id}-filename`}>` (controlled by `fileName`, updated on `onChange`). Note: label `htmlFor="filename"` does not match the actual element id (`${id}-filename`).

### packages/excalidraw/components/PropertiesPopover.tsx

A `React.forwardRef` wrapper around Radix `Popover.Content` (in an `Island`) that positions the editor's properties panel responsively and manages focus return on close.

- `PropertiesPopoverProps` interface (L10-L21): `{ className?, container: HTMLDivElement | null, children: ReactNode, style?: object, onClose: () => void, onKeyDown?, onPointerLeave?, onFocusOutside?, onPointerDownOutside?, preventAutoFocusOnTouch?: boolean }`. The `onFocusOutside`/`onPointerDownOutside` types reuse Radix `Popover.PopoverContentProps`.
- `PropertiesPopover = React.forwardRef<HTMLDivElement, PropertiesPopoverProps>((props, ref) => JSX.Element)` — L23-L102.
  - Hook: `useEditorInterface()`; derives `isMobilePortrait = formFactor === "phone" && !isLandscape` (L43-L44) which switches popover `side` from `"right"` to `"bottom"` and `align` from `"start"` to `"center"`.
  - Renders `Popover.Portal` (into `container`) → `Popover.Content` with `data-prevent-outside-click`, `alignOffset={-16}`, `sideOffset={20}`, `collisionBoundary={container}`, and inline style setting `zIndex: var(--zIndex-ui-styles-popup)` plus a phone-only `marginLeft: 0.5rem`.
  - `onOpenAutoFocus` (L66-L71): if `preventAutoFocusOnTouch && isTouchScreen`, `preventDefault()` to avoid mobile keyboard popup.
  - `onCloseAutoFocus` (L72-L85): `stopPropagation()` + `preventDefault()` (so the trigger isn't refocused); if a `container` exists and the active element is not interactive (`!isInteractive(document.activeElement)`), focus the container; then call `onClose()`.
  - Wraps children in `Island padding={3} style={style}` and adds a styled `Popover.Arrow` (20x10, filled with `--popup-bg-color`, with drop-shadow). Pass-throughs: `onPointerLeave`, `onKeyDown`, `onFocusOutside`, `onPointerDownOutside`.

### packages/excalidraw/components/PublishLibrary.tsx

A dialog for submitting library items to the Excalidraw libraries backend; composites a JPEG preview image on a canvas and POSTs a multipart form.

- `PublishLibraryDataParams` interface (L29-L36): `{ authorName, githubHandle, name, description, twitterHandle, website }` (all `string`).
- `generatePreviewImage(libraryItems: LibraryItems) => Promise<File>` — L38-L105. Composites all library items into a grid bitmap and returns a resized JPEG `File`.
  - Constants: `MAX_ITEMS_PER_ROW = 6`, `BOX_SIZE = 128`, `BOX_PADDING = round(BOX_SIZE/16)` = 8, `BORDER_WIDTH = max(round(BOX_SIZE/64), 2)` = 2.
  - Geometry/math: rows via `chunk(libraryItems, 6)`. Canvas width = `rows[0].length*BOX_SIZE + (rows[0].length+1)*(BOX_PADDING*2) - BOX_PADDING*2`; height analogous over `rows.length` (L48-L55). Fills white background. For each item, renders it to a canvas with `exportToCanvas({elements, files:null, maxWidthOrHeight:BOX_SIZE})`, computes `rowOffset = floor(index/6)*(BOX_SIZE+BOX_PADDING*2)` and `colOffset = (index%6)*(BOX_SIZE+BOX_PADDING*2)`, draws the item centered within its box (`colOffset + (BOX_SIZE-width)/2 + BOX_PADDING`, same for row/height), then strokes a `#ced4da` border rect (L80-L95). Finally wraps the canvas blob in a `File` and calls `resizeImageFile(..., {outputType: MIME_TYPES.jpg, maxWidthOrHeight: 5000})`. Side effects: creates a detached `<canvas>`, async export per item. Performance note: serial `await exportToCanvas` per item (no parallelism).
- `SingleLibraryItem({ libItem, appState, index, onChange, onRemove }) => JSX.Element` — L107-L199. One row in the publish form.
  - Refs: `svgRef` (div for the SVG preview), `inputRef` (name input, unused beyond ref).
  - `useEffect` (deps `[libItem.elements, appState]`, L123-L141): async-exports the item to SVG with `viewBackgroundColor:"#fff"`, `exportBackground:true`, `skipInliningFonts:true`, and sets `node.innerHTML = svg.outerHTML`. Side effect: innerHTML injection.
  - Render: optional "published" status badge, the SVG preview, a remove `ToolButton` (`onClick={onRemove.bind(null, libItem.id)}`), a required name `<input defaultValue={libItem.name}>` that calls `onChange(value, index)`, and an `error` span.
- `PublishLibrary({ onClose, libraryItems, appState, onSuccess, onError, updateItemsInStorage, onRemove }) => JSX.Element` — L201-L539 (default export, L541). The main dialog.
  - State: `libraryData` (`PublishLibraryDataParams`, all empty), `isSubmitting` (boolean), `clonedLibItems` (a `.slice()` copy of `libraryItems`).
  - `useEffect` (deps `[]`, L234-L241): hydrates `libraryData` from `EditorLocalStorage.get(EDITOR_LS_KEYS.PUBLISH_LIBRARY)` if present.
  - `useEffect` (deps `[libraryItems]`, L247-L249): re-clones `libraryItems` into `clonedLibItems` when the prop changes.
  - `onInputChange(event: any)` (L251-L256): merges `{[name]: value}` into `libraryData` (form-field binding by `name` attribute).
  - `onSubmit(event: React.FormEvent<HTMLFormElement>) => Promise<void>` (L258-L340): `preventDefault()`, sets `isSubmitting`. Validates each item has a `name`, building an `erroredLibItems` array with per-item `error` strings; if any error, writes them back to `clonedLibItems`, clears submitting, and returns. Otherwise calls `generatePreviewImage`, builds an `ExportedLibraryData` (`type`, `version` from `VERSIONS.excalidrawLibrary`, `source` from `getExportSource()`, `libraryItems`), JSON-stringifies it into a Blob, assembles a `FormData` (lib blob, preview image + type, title/author/github/name/description/twitter/website), and POSTs to `${VITE_APP_LIBRARY_BACKEND}/submit`. On `response.ok`: deletes the local-storage draft and calls `onSuccess({url, authorName, items})`; on non-ok, parses/throws an error message. Both the rejection branch and `.catch` log and call `onError(err)` and clear submitting. Side effects: network POST, local-storage delete.
  - `renderLibraryItems() => JSX.Element` (L342-L362): maps `clonedLibItems` to `SingleLibraryItem`s; the per-row `onChange` mutates a sliced copy's `name` at `index` and sets it back into state.
  - `onDialogClose` (`useCallback`, deps `[clonedLibItems, onClose, updateItemsInStorage, libraryData]`, L364-L368): persists items via `updateItemsInStorage(clonedLibItems)`, saves `libraryData` to local storage, then `onClose()`.
  - Derived: `shouldRenderForm = !!libraryItems.length`; `containsPublishedItems = libraryItems.some(status === "published")`.
  - Render (L376-L538): a `Dialog`; when items exist, a `<form onSubmit={onSubmit}>` with `Trans`-linked notes, an optional republish warning, the rendered items, and labeled inputs for name/description/author/github/twitter/website (website has a `pattern="https?://.+"`), plus a save-names button (`onDialogClose`) and a submit button (`isLoading={isSubmitting}`). When no items, shows the `atleastOneLibItem` message.
