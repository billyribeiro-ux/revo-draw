## Cluster: excalidraw__components__11

This cluster covers the icon library, two export dialogs (image + JSON), the app-localization bootstrap wrapper, an inline-icon span helper, the generic "Island" floating-panel container, and the laser-pointer toolbar toggle.

---

### packages/excalidraw/components/icons.tsx

The project-wide SVG icon library: a single 2494-line module that exports ~203 named icon constants plus a handful of factory/helper functions, all built around one `createIcon` factory. Most icons are vendored Tabler / FontAwesome path data wrapped in `<svg>`.

- **`iconFillColor(theme: Theme) => string`** (L16) — Returns the literal CSS var `"var(--icon-fill-color)"` regardless of `theme`. The `theme` param is vestigial (kept for call-site symmetry); the actual light/dark switch happens in CSS. Pure, no side effects.

- **`handlerColor(theme: Theme) => string`** (L18-L19, internal) — Returns `"#fff"` for `THEME.LIGHT`, else `"#1e1e1e"`. Used to fill the small selection-handle rects inside `GroupIcon`/`UngroupIcon` so they invert with theme. Pure.

- **`type Opts`** (L21-L25, internal type) — `{ width?: number; height?: number; mirror?: true } & React.SVGProps<SVGSVGElement>`. The drawing/option bag passed to `createIcon`.

- **`createIcon(d: string | React.ReactNode, opts: number | Opts = 512) => JSX.Element`** (L27-L51) — THE factory. If `opts` is a number it's treated as `{ width: opts }`; `height` defaults to `width` (square viewBox). Produces `<svg aria-hidden="true" focusable="false" role="img" viewBox="0 0 {width} {height}">` with `className=clsx({"rtl-mirror": mirror})` and spreads remaining SVG props. If `d` is a string it is wrapped in `<path fill="currentColor" d={d}/>`; otherwise `d` (a JSX node/`<g>`) is rendered as-is. Key parity detail: viewBox is `0 0 width height`, `mirror:true` only adds the `rtl-mirror` CSS class (RTL flip is done in CSS, not in the matrix). Pure, returns a React element.

- **`tablerIconProps: Opts`** (L53-L61, internal const) — Default props for Tabler-sourced icons: `width/height 24`, `fill:"none"`, `strokeWidth:2`, `stroke:"currentColor"`, round linecap/linejoin. The de-facto base style for the majority of icons.

- **`modifiedTablerIconProps: Opts`** (L63-L70, internal const) — Like above but `20×20` and no explicit `strokeWidth`.

- **`arrowheadPreviewIconProps: Opts`** (L72-L75, internal const) — `40×20` viewBox used by the arrowhead-preview icons (wide rectangle, not square).

- **Simple icon constants** (~L80-L753, L792-L987, L1674+, L2468-end) — ~180 `export const <Name>Icon = createIcon(<g>...</g>, props)` definitions (e.g. `PlusPromoIcon` L80, `LibraryIcon` L92, `PlusIcon` L105, `DotsIcon` L115, `DotsHorizontalIcon` L126, `PinIcon` L137, `polygonIcon` L147, ... `chevronRight` L2471, `settingsIcon` L2480). Each is a static JSX element holding vendored SVG path data; no logic beyond the `createIcon` call. Comments above each cite the source (`// tabler-icons: <name>`).

- **`arrowBarToTopJSX`** (L755-L763, internal const) — Shared `<g>` path fragment (arrow-bar-to-top glyph) reused by both `BringToFrontIcon` and `SendToBackIcon`.

- **`arrownNarrowUpJSX`** (L765-L772, internal const) — Shared `<g>` up-arrow fragment reused by `BringForwardIcon`/`SendBackwardIcon`.

- **`BringForwardIcon`** (L774) / **`SendBackwardIcon`** (L776-L781) — Same `arrownNarrowUpJSX` glyph; `SendBackward` adds `style.transform: "rotate(180deg)"`. Parity note: the down-variant is produced by a CSS rotate transform, not by separate path data.

- **`BringToFrontIcon`** (L783) / **`SendToBackIcon`** (L785-L790) — Same pattern using `arrowBarToTopJSX`; `SendToBack` rotates 180deg.

- **`GroupIcon = React.memo(({ theme }: { theme: Theme }) => createIcon(...))`** (L990-L1018) — A *theme-parameterised* icon (memoized component, not a static element). Draws two overlapping rounded rectangles (hand-authored path data, viewBox `182×182`, `mirror:true`) plus four corner selection-handle `<rect>`s filled with `handlerColor(theme)` and stroked with `iconFillColor(theme)`. The doubled/zig-zag `d` strings are intentional hatching. Side effect: none; re-renders only when `theme` changes (memo).

- **`UngroupIcon = React.memo(({ theme }) => createIcon(...))`** (L1020-L1045+) — Same construction as `GroupIcon` but with five handle rects positioned to imply the two rectangles are independent (ungrouped). Theme-driven handle colors.

- **`StrokeStyleSolidIcon = React.memo(({ theme }: { theme: Theme }) => ...)`** (L1189) — Theme-parameterised stroke-style preview icon (uses `iconFillColor(theme)`/`handlerColor(theme)` for the swatch). Same memo pattern.

- **Arrowhead preview icons** — all `React.memo(({ flip = false }: { flip?: boolean }) => createIcon(<g transform={flip ? "translate(40, 0) scale(-1, 1)" : ""}>...</g>, arrowheadPreviewIconProps))`:
  - `ArrowheadNoneIcon` (L1295-L1311) — line + an "x" at opacity 0.3 meaning "no arrowhead".
  - `ArrowheadArrowIcon` (L1313-L1328), `ArrowheadTriangleIcon` (L1330-), `ArrowheadTriangleOutlineIcon` (L1346), `ArrowheadCircleIcon` (L1364), `ArrowheadCircleOutlineIcon` (L1379), `ArrowheadDiamondIcon` (L1395), `ArrowheadDiamondOutlineIcon` (L1411), `ArrowheadBarIcon` (L1429), and the ER-cardinality set `ArrowheadCardinalityOneIcon` (L1445), `...ManyIcon` (L1461), `...OneOrManyIcon` (L1477), `...ExactlyOneIcon` (L1493), `...ZeroOrOneIcon` (L1509), `...ZeroOrManyIcon` (L1526).
  - **Geometry / parity detail:** the `flip` prop mirrors the glyph horizontally with the matrix `translate(40,0) scale(-1,1)` — i.e. reflect across X then translate by the 40px icon width to keep it in-frame. This is how the same icon serves both the start- and end-arrowhead pickers. A Canvas reimplementation must reproduce that exact mirror-about-center-x behavior.

- **`FontFamilyCodeIcon = codeIcon`** (L1674) — A pure re-export alias of the existing `codeIcon` constant.

- **Text-vertical-align icons** — `TextAlignTopIcon` (L1723), `TextAlignBottomIcon` (L1741), `TextAlignMiddleIcon` (L1759), each `React.memo(({ theme }) => createIcon(...))`, theme-parameterised swatch icons (use the same handler/fill color helpers).

- **`emptyIcon`** (L2468) — `export const emptyIcon = <div style={{ width: "1rem", height: "1rem" }} />`. A 16×16 invisible placeholder for menu alignment (NOT an SVG).

**Overall parity note:** the file is ~95% static SVG path data. The only "logic" worth porting is (a) `createIcon`'s viewBox/`rtl-mirror`-class behavior, (b) the `flip` horizontal-mirror matrix on arrowhead previews, (c) the `theme`→color swap in `GroupIcon`/`UngroupIcon`/stroke-style/text-align icons via `iconFillColor`/`handlerColor`, and (d) the 180° CSS-rotate trick for the z-index down-variants.

---

### packages/excalidraw/components/ImageExportDialog.tsx

A modal dialog that renders a live PNG/SVG preview of the scene and lets the user toggle export settings (selection-only, background, dark mode, embed scene, scale) before exporting/copying. (426 lines.)

- **`ErrorCanvasPreview = () => JSX.Element`** (L43-L53, exported) — Stateless fallback shown when preview rendering fails (canvas too big); renders three localized `t(...)` strings. No props, no side effects.

- **`type ImageExportModalProps`** (L55-L63, internal) — `{ appStateSnapshot: Readonly<UIAppState>; elementsSnapshot: readonly NonDeletedExcalidrawElement[]; files: BinaryFiles; actionManager: ActionManager; onExportImage: AppClassProperties["onExportImage"]; name: string; exportWithDarkMode: boolean }`.

- **`ImageExportModal(props: ImageExportModalProps) => JSX.Element`** (L65-L352, internal component) — The body of the dialog.
  - **Local state (`useState`):** `projectName` (init `name`), `exportSelectionOnly` (init `hasSelection`), `exportWithBackground` (init `appStateSnapshot.exportBackground`), `embedScene` (init `appStateSnapshot.exportEmbedScene`), `exportScale` (init `appStateSnapshot.exportScale`), `renderError: Error | null`.
  - **Refs:** `previewRef` (`HTMLDivElement` holding the rendered `<canvas>`), `previewRenderRequestIdRef` (monotonically increasing int used to discard stale async renders).
  - **`hasSelection`** (L74-L77) — `isSomeElementSelected(elementsSnapshot, appStateSnapshot)`; gates the "only selected" toggle.
  - **`{ exportedElements, exportingFrame }`** (L108-L112) — `prepareElementsForExport(elementsSnapshot, appStateSnapshot, exportSelectionOnly)`; recomputed every render based on the selection toggle.
  - **Effect #1 (L95-L106):** `useCopyStatus`'s `resetCopyStatus()` runs whenever any export setting changes, so the "copied" button state resets immediately rather than waiting for its timeout.
  - **Effect #2 — the live preview (L114-L190):** reads `previewRef`'s `offsetWidth/offsetHeight`; bails if no node or zero width. Increments `previewRenderRequestIdRef` to get a `requestId`; defines `isStaleRequest()` comparing `requestId !== previewRenderRequestIdRef.current`. Calls `exportToCanvas({ elements: exportedElements, appState: {...snapshot, overridden settings}, files, exportPadding: DEFAULT_EXPORT_PADDING, maxWidthOrHeight: Math.max(maxWidth, maxHeight), exportingFrame })`. On success it validates via `canvasToBlob(canvas)` (catching `CANVAS_POSSIBLY_TOO_BIG` → rethrow localized error), then if not stale clears `renderError` and `previewNode.replaceChildren(canvas)`. On error (if not stale) logs and sets `renderError`. **Cleanup** bumps `previewRenderRequestIdRef.current += 1` so an in-flight render's results are discarded. **Performance/parity detail:** this is a request-id race-guard for async canvas renders — the latest request wins; `maxWidthOrHeight` is the larger of the preview box's two dimensions so the preview fits the container.
  - **Render:** preview pane + (when `nativeFileSystemSupported` is false) a project-name `<input>` that both sets local `projectName` and fires `actionChangeProjectName`. Settings section renders `ExportSetting`-wrapped `Switch`es for selection/background/dark-mode/embed-scene (each calls `actionManager.executeAction(...)`) and a `RadioGroup` for `exportScale` over `EXPORT_SCALES` (label `${scale}×`). Three `FilledButton`s: export PNG (`EXPORT_IMAGE_TYPES.png`), export SVG (`.svg`), and — gated on `probablySupportsClipboardBlob || isFirefox` — copy-PNG-to-clipboard (`.clipboard`, awaits then calls `onCopy()`).

- **`type ExportSettingProps`** (L354-L359, internal) — `{ label: string; children: React.ReactNode; tooltip?: string; name?: string }`.

- **`ExportSetting(props: ExportSettingProps) => JSX.Element`** (L361-L385, internal) — Layout wrapper: a `<label htmlFor={name}>` showing the label and an optional `Tooltip` with `helpIcon`, plus a content div for the control (children). Presentational only.

- **`ImageExportDialog(props) => JSX.Element`** (L387-L426, exported) — Props: `{ appState: UIAppState; elements; files; actionManager; onExportImage; onCloseRequest: () => void; name }`. **Key invariant:** on first render it takes immutable snapshots via `useState(() => ({ appStateSnapshot: cloneJSON(appState), elementsSnapshot: cloneJSON(elements) }))` so the exported content can't change while the dialog is open. Wraps `ImageExportModal` in `<Dialog size="wide" title={false}>`.

---

### packages/excalidraw/components/InitializeApp.tsx

A bootstrap wrapper that loads the requested locale before rendering its children, showing a loading splash meanwhile. (31 lines.)

- **`interface Props`** (L11-L15) — `{ langCode: Language["code"]; children: React.ReactElement; theme?: Theme }`.

- **`InitializeApp(props: Props) => React.ReactElement`** (L17-L31, exported) — Owns one state, `loading` (init `true`). An `useEffect` keyed on `props.langCode` resolves the matching `Language` from `languages` (falling back to `defaultLang`), then `await setLanguage(currentLang)` and `setLoading(false)`. Renders `<LoadingMessage theme={props.theme}/>` while loading, else `props.children`. Side effect: async i18n load; invariant: children are gated until the locale is set.

---

### packages/excalidraw/components/InlineIcon.tsx

A tiny presentational wrapper that renders an icon inline with surrounding text. (26 lines.)

- **`InlineIcon({ className, icon, size = "1em" }) => JSX.Element`** (L1-L26, exported) — Props: `{ className?: string; icon: React.ReactNode; size?: string }` (default `size` `"1em"`). Renders a `<span>` with fixed inline styling: `width: size`, `height: "100%"`, `margin: "0 0.5ex 0 0.5ex"`, `display: "inline-flex"`, `lineHeight: 0`, `verticalAlign: "middle"`, `flex: "0 0 auto"`. **Parity note:** the `0.5ex` horizontal margins and `verticalAlign: middle` are what keep the icon optically centered on the text baseline. No state/effects.

---

### packages/excalidraw/components/Island.tsx

The generic floating rounded-panel container used throughout the UI (toolbars, side panels). (23 lines.)

- **`IslandProps`** (L6-L11, internal type) — `{ children: React.ReactNode; padding?: number; className?: string | boolean; style?: object }`.

- **`Island = React.forwardRef<HTMLDivElement, IslandProps>(...)`** (L13-L23, exported) — Forwards a ref to its root `<div>` so callers (e.g. popovers measuring position) can read its DOM node. Applies `clsx("Island", className)` and sets the CSS custom property `--padding` to the numeric `padding` prop (consumed by `Island.scss`), merging any `style` override after. Purely presentational; no state. **Parity detail:** padding is driven through the `--padding` CSS var, not an inline `padding` property.

---

### packages/excalidraw/components/JSONExportDialog.tsx

The "Save to disk / Export to link / custom UI" dialog for the `.excalidraw` JSON format. (142 lines.)

- **`type ExportCB`** (L24-L27, exported type) — `(elements: readonly NonDeletedExcalidrawElement[], scale?: number) => void`.

- **`JSONExportModal(props) => JSX.Element`** (L29-L101, internal component) — Props: `{ appState; setAppState: React.Component<any, UIAppState>["setState"]; files; elements; actionManager; onCloseRequest; exportOpts: ExportOpts; canvas: HTMLCanvasElement }`. No own state. Renders up to three cards inside `.ExportDialog--json`:
  - **Save-to-disk card** (L52-L72, gated on `exportOpts.saveFileToDisk`) — lime `Card` with `exportToFileIcon`; if `!nativeFileSystemSupported` also renders the `changeProjectName` action UI; its `ToolButton` runs `actionManager.executeAction(actionSaveFileToDisk, "ui")`.
  - **Export-to-link card** (L73-L95, gated on `exportOpts.onExportToBackend`) — pink `Card` with `LinkIcon`; on click `trackEvent("export","link",ui (${getFrame()}))`, `await onExportToBackend(elements, appState, files)`, then `onCloseRequest()`; on error sets `appState.errorMessage` via `setAppState`. **Event-handler detail:** errors are surfaced into app state, not swallowed.
  - **Custom UI** (L96-L97) — if `exportOpts.renderCustomUI` is provided, delegates to `renderCustomUI(elements, appState, files, canvas)`.

- **`JSONExportDialog(props) => JSX.Element`** (L103-L142, exported) — Props mirror the modal's plus controls visibility. `handleClose` is a `useCallback` (dep `setAppState`) that sets `openDialog: null`. Renders the `Dialog` + `JSONExportModal` only when `appState.openDialog?.name === "jsonExport"`. Dialog title is `t("buttons.export")`.

---

### packages/excalidraw/components/LaserPointerButton.tsx

The laser-pointer toolbar toggle, implemented as a styled checkbox label. (43 lines.)

- **`type LaserPointerIconProps`** (L9-L15, internal) — `{ title?: string; name?: string; checked: boolean; onChange?(): void; isMobile?: boolean }`.

- **`DEFAULT_SIZE: ToolButtonSize`** (L17, internal const) — `"small"`; drives the `ToolIcon_size_small` class.

- **`LaserPointerButton(props: LaserPointerIconProps) => JSX.Element`** (L19-L43, exported) — A controlled `<label>` containing a checkbox `<input>` (`checked={props.checked}`, `onChange={props.onChange}`, `aria-label={props.title}`, `data-testid="toolbar-LaserPointer"`) plus the `laserPointerToolIcon`. Classes via `clsx`: base `ToolIcon ToolIcon__LaserPointer`, size class, and `is-mobile` when `props.isMobile`. The `title` is forced to a string with a template literal (`` `${props.title}` ``), so an undefined title renders the literal `"undefined"`. No internal state — fully controlled by the parent.
