## Cluster: excalidraw__components__10

This cluster covers seven files in `packages/excalidraw/components/`: the help button + help dialog, the canvas hint viewer, a higher-order component that resolves host/fallback render races, the hyperlink popover plus its geometry helpers, and a generic keyboard-navigable icon picker.

---

### packages/excalidraw/components/HelpButton.tsx

Purpose: A tiny presentational `<button>` rendering the help icon that opens the help dialog.

- `HelpButton(props: HelpButtonProps)` — L11-L21. Stateless functional component returning a `<button className="help-icon">`. Wires `onClick={props.onClick}`, `title` to the translated `helpDialog.title` plus `" — ?"` (the `?` keyboard shortcut), and `aria-label` to the title. Renders `{HelpIcon}` (imported JSX icon) as its child.
- `HelpButtonProps` (type, L5-L9): `{ name?: string; id?: string; onClick?(): void }`. Note `name`/`id` are declared but not consumed by the component body.

No state/refs/effects. Pure render.

---

### packages/excalidraw/components/HelpDialog.tsx

Purpose: The full keyboard-shortcuts reference dialog, organized into Tools / View / Editor islands, plus a header of external resource links.

- `Header()` — L19-L58. Stateless component rendering four external `<a className="HelpDialog__btn">` links (docs.excalidraw.com, plus.excalidraw.com/blog, github issues, YouTube), each with `target="_blank"` and a leading icon (`ExternalLinkIcon`, `GithubIcon`, `youtubeIcon`). Labels are i18n via `t(...)`.
- `Section(props: { title: string; children: React.ReactNode })` — L60-L65. Wraps children in `<h3>{title}</h3>` + a `HelpDialog__islands-container` div.
- `ShortcutIsland(props: { caption: string; children: React.ReactNode; className?: string })` — L67-L76. Renders a titled island column: `HelpDialog__island` with optional extra className, an `<h4>` caption, and a content div.
- `intersperse(as: JSX.Element[][], delim: string | null)` — generator, L78-L87. Yields each element of `as`, prefixing every element after the first with `delim` (skips delim when null is falsy-yielded — note it still `yield delim` even when null, which renders nothing). Used to insert the localized "or" separator between alternative shortcut key groups.
- `upperCaseSingleChars(str: string)` — L89-L91. Uppercases the first standalone single lowercase letter via regex `/\b[a-z]\b/` and `toUpperCase()`. Used so single-letter keys (e.g. "v") display as "V".
- `Shortcut({ label, shortcuts, isOr = true })` — L93-L120. Props: `label: string`, `shortcuts: string[]`, `isOr?: boolean`. For each shortcut string, splits on `"+"` into keys; special-cases a trailing `"++"` (the literal `+` key) by slicing off the last two chars and appending a `"+"` key (L102-L105). Maps each key to a `<ShortcutKey>` with `upperCaseSingleChars`. Renders the label and the interspersed key groups; separator is the localized `helpDialog.or` when `isOr`, else `null` (keys shown as a sequence, e.g. for chord/click sequences).
- `ShortcutKey(props: { children: React.ReactNode })` — L122-L124. Renders a `<kbd className="HelpDialog__key">` spreading props.
- `HelpDialog({ onClose }: { onClose?: () => void })` — L126-L514. The exported dialog. Owns one memoized handler `handleClose` (`React.useCallback`, L127-L131) that calls `onClose` if provided. Renders a `<Dialog onCloseRequest={handleClose} title=… className="HelpDialog">` containing `<Header/>` and one `<Section>` holding three `<ShortcutIsland>`s:
  - Tools island (L142-L256): drawing tools mapped to `KEYS.*` and numeric keys, plus edit/text/crop/lock/link/convert shortcuts. Uses `getShortcutKey(...)` to localize chords (`CtrlOrCmd+Enter`, etc.).
  - View island (L257-L328): zoom, zoom-to-fit/selection, page movement, zen/snap/grid/view/theme/stats toggles, search, and command palette. Command palette branches on `isFirefox` to show one vs. two shortcuts via `getShortcutFromShortcutName("commandPalette", 1)` (L319-L326).
  - Editor island (L329-L509): flowchart create/navigate, canvas move, clear/delete/cut/copy/paste, select, z-index, alignment, duplicate, lock, undo/redo, group, flip, stroke/background/font toggles, font size. Several entries branch on platform: `isDarwin` for send-to-back/bring-to-front modifiers (L408-L422), `isWindows` for redo (L463-L472), and gates `copyAsPng` behind `probablySupportsClipboardBlob || isFirefox` (L391-L398).

No refs/effects beyond the `useCallback`. Notable detail for parity: shortcut display strings come from `getShortcutKey`/`getShortcutFromShortcutName`, which platform-localize Cmd vs Ctrl glyphs; the `"++"` trailing-plus and single-char-uppercase handling are the only non-trivial string transforms.

---

### packages/excalidraw/components/HintViewer.tsx

Purpose: Computes and renders the contextual one-line hint shown at the bottom of the canvas based on the current tool, selection, and interaction state.

- `HintViewerProps` (interface, L25-L30): `{ appState: UIAppState; isMobile: boolean; editorInterface: EditorInterface; app: AppClassProperties }`.
- `getTaggedShortcutKey(key: string | string[])` — L32-L35. Wraps a key (or `+`-joined array of keys) in `<kbd>…</kbd>` markup using `getShortcutKey` for localization. Returns a string containing the literal `<kbd>` tags, later parsed back into JSX by the component.
- `getHints({ appState, isMobile, editorInterface, app }): null | string | string[]` — L37-L237. The core decision tree, evaluated top-to-bottom (first match wins). Order matters for parity:
  1. Search dismiss hint when the default sidebar's search tab is open with matches (L46-L54).
  2. `null` when a sidebar is open but cannot fit (L56-L58).
  3. Eraser revert hint when `isEraserActive` (L60-L64).
  4. Computes `selectedElements` via `app.scene.getSelectedElements(appState)` (L66).
  5. Arrow bind modifiers when dragging a linear arrow point (L69-L77).
  6. Arrow/line tool hints, with a multi-point (`multiElement !== null`) branch (L79-L92).
  7. Freedraw / text / embeddable tool hints (L94-L104).
  8. Resize hints when `isResizing` with mouse and a single selection — special lock-angle case for 2-point linear elements, and an image-specific variant (L106-L126).
  9. Rotate hint when `isRotating` with mouse (L128-L132).
  10. Text-element-selected and text-editing hints (L134-L145).
  11. Crop-editor enter/leave hints (L147-L158).
  12. Selection-tool sub-tree (L160-L234): deep box select, disable-snapping while dragging in grid mode (`isGridModeEnabled(app)`), canvas panning (non-mobile, empty selection), line-editor states (point selected vs. nothing selected, line vs. arrow info), and bind-text/create-flowchart hints for text-bindable containers (returns an array of two hints for flowchart nodes, L218-L229 — note both branches return the same `[bindTextToElement, createFlowchart]`).
  13. `null` fallback (L236).
- `HintViewer({ appState, isMobile, editorInterface, app })` — L239-L274. Exported component. Calls `getHints(...)`; returns `null` if no hint. Joins array hints by stripping a trailing period (`/\. ?$/`) and joining with `", "` (L256-L258). Then splits the hint string on the `<kbd>…</kbd>` pattern (`/(<kbd>[^<]+<\/kbd>)/g`) and rebuilds it as JSX, converting every odd-indexed (matched) segment into a real `<kbd>` element extracting the inner text via `/^<kbd>([^<]+)<\/kbd>$/` (L260-L267). Renders inside `<div className="HintViewer"><span>…</span></div>`.

No state/refs/effects — purely derived from props each render. Parity note: the `<kbd>` round-trip through markup strings is how localized shortcut glyphs get embedded in i18n template strings and re-extracted as DOM nodes.

---

### packages/excalidraw/components/hoc/withInternalFallback.tsx

Purpose: Higher-order component that ensures a "host" instance and a "fallback" instance of the same named component never render simultaneously across Excalidraw multi-instance scenarios, using a shared Jotai counter.

- `withInternalFallback<P>(componentName: string, Component: React.FC<P>)` — L6-L76. Returns `WrapperComponent`. Creates a per-wrapper Jotai `atom(0)` (`renderAtom`, L10) acting as a mount counter shared via the tunnels Jotai store.
  - `WrapperComponent: React.FC<P & { __fallback?: boolean }>` (L12-L71):
    - State/store: subscribes to `renderAtom` via `useTunnels().tunnelsJotai.useAtom` (L17-L21) only for the setter (rerenders).
    - Ref `metaRef` (`useRef`, L24-L31): `{ preferHost: boolean; counter: number }`. Tracked as a ref rather than atom state due to multi-instance scenarios.
    - `useLayoutEffect` (L33-L51): on mount increments the shared counter and mirrors it into `meta.counter`; on unmount decrements, and when the counter reaches 0 resets `meta.preferHost = false`. Dependency `[setCounter]`.
    - Render-time logic (L53-L68): if not `__fallback`, marks `preferHost = true`. Returns `null` (suppresses render) when either (a) counter is uninitialized AND this is the fallback AND a host is preferred, OR (b) counter > 1 AND this is the fallback (host already mounted). Otherwise renders `<Component {...props} />`.
  - Sets `WrapperComponent.displayName = componentName` (L73).

Invariant: at most one of host/fallback renders at a time; the layout-effect-initialized counter plus the `preferHost` flag avoid a one-frame double-render. Side effect: mutates the shared atom counter on mount/unmount.

---

### packages/excalidraw/components/hyperlink/helpers.ts

Purpose: Geometry + hit-testing helpers for the link handle icon that floats above an element, plus the two prebuilt external/element link SVG `<img>` assets.

- `DEFAULT_LINK_SIZE = 12` — L17. Base pixel size of the link handle.
- `EXTERNAL_LINK_IMG` — L19-L22. A detached `<img>` whose `src` is a URL-encoded inline SVG (feather external-link icon, stroke `#1971c2`). Used by the renderer to draw the link badge.
- `ELEMENT_LINK_IMG` — L24-L27. Same pattern; a tabler "arrow-big-right" SVG for element-to-element links.
- `getLinkHandleFromCoords([x1, y1, x2, y2]: Bounds, angle: Radians, appState: Pick<UIAppState, "zoom">): Bounds` — L29-L59. Computes the world-space rect `[x, y, width, height]` of the link handle. Sizes are divided by `max(zoom, 1)` so the handle stays a constant on-screen size when zoomed out but scales when zoomed in (L35-L42). Positions the handle at the element's top-right (same anchor as the `ne` resize handle): `x = x2 + dashedLineMargin - centeringOffset`, `y = y1 - dashedLineMargin - linkMarginY + centeringOffset` (L45-L46). Then rotates the handle center about the element's bounding-box center `(centerX, centerY)` by `angle` using `pointRotateRads`, and returns the un-centered top-left plus width/height (L48-L58). `centeringOffset = (size-8)/(2*zoom)`, `dashedLineMargin = 4/zoom`.
- `isPointHittingLinkIcon(element, elementsMap, appState, [x, y]: GlobalPoint)` — L61-L80. Computes the handle rect via `getElementAbsoluteCoords` + `getLinkHandleFromCoords`, then tests whether world point `(x,y)` lies within the handle expanded by `threshold = 4/zoom` on all sides. Returns boolean.
- `isPointHittingLink(element, elementsMap, appState, [x, y]: GlobalPoint, isMobile: boolean)` — L82-L105. Returns `false` if the element has no link or is currently selected (L89-L91). In view mode on non-mobile, returns `true` if the point hits the element's bounding box (whole element is the link target). Otherwise delegates to `isPointHittingLinkIcon`.

Coordinate-space note: all hit-testing here is in world space; thresholds and handle dimensions are scaled by `appState.zoom.value` to keep screen-constant sizing. The rotation math (rotate about bbox center) must be matched exactly for parity since the handle follows element rotation.

---

### packages/excalidraw/components/hyperlink/Hyperlink.tsx

Purpose: The floating hyperlink popover UI (view link / edit link input / link-to-element / remove), plus module-level tooltip + auto-hide logic for the link badge.

Module constants/state:
- `POPUP_WIDTH = 380`, `POPUP_HEIGHT = 42`, `POPUP_PADDING = 5`, `SPACE_BOTTOM = 85`, `AUTO_HIDE_TIMEOUT = 500` — L55-L59. Popover layout + auto-hide delay.
- `IS_HYPERLINK_TOOLTIP_VISIBLE` (let, L61) — module-global flag tracking tooltip visibility.
- `embeddableLinkCache: Map<id, string>` — L63-L66. Caches the previous link for embeddable elements so resizing-on-link-change only happens when the link actually changed.

- `Hyperlink({ element, scene, setAppState, onLinkOpen, setToast, updateEmbedValidationStatus })` — L68-L354. The exported popover component.
  - Props: `element: NonDeletedExcalidrawElement`, `scene: Scene`, `setAppState` (React setState typed), `onLinkOpen` (from `ExcalidrawProps`), `setToast` (toast or null), `updateEmbedValidationStatus(element, status)`.
  - Hooks/state: `elementsMap = scene.getNonDeletedElementsMap()` (L88); `appState`/`appProps`/`editorInterface` from context hooks (L89-L91); `inputVal` state seeded from `element.link` (L95); `inputRef` (L96); `isEditing` derived from `appState.showHyperlinkPopup === "editor"` (L97).
  - `handleSubmit` (`useCallback`, L99-L180): normalizes the input via `normalizeLink`; fires `trackEvent("hyperlink","create")` for new links. For embeddable elements: clears `activeEmbeddable` if it's this element; if no link, mutates link to null and marks invalid; if link fails `embeddableURLValidator(link, appProps.validateEmbeddable)`, toasts "unableToEmbed", caches the old link, stores the link, marks invalid; if valid, computes embed link via `getEmbedLink`, toasts on `URIError`, and — only when the link changed (`embeddableLinkCache` comparison) — resizes the element to the embed's aspect ratio (video uses intrinsic `w/h` ratio, choosing the larger dimension as the driver), then marks valid and clears the cache. For non-embeddable elements just mutates `{ link }`.
  - `useLayoutEffect` (L182-L186): on unmount, calls `handleSubmit()` — i.e. committing the link when the popover closes.
  - `useEffect` (L188-L196): when editing and not on phone/touch, auto-selects the input text.
  - `useEffect` (L198-L227): registers a window `pointermove` listener; when not editing, debounces hiding the popover by `AUTO_HIDE_TIMEOUT` if `shouldHideLinkPopup` returns true. Cleans up listener and pending timeout.
  - `handleRemove` (`useCallback`, L229-L233): tracks delete, mutates link to null, hides popover.
  - `onEdit` (L235-L238): tracks edit, sets `showHyperlinkPopup: "editor"`.
  - Render (L239-L353): early-returns `null` when a context menu / dragging / resizing / rotating / open menu / view mode is active (L240-L249). Positions the container at `getCoordsForPopover` `(x, y)` with fixed width/padding. Renders either: an `<input>` (editing) that stops propagation, prevents Cmd/Ctrl+K, and on Enter/Escape submits + switches to "info" mode; an `<a>` (has link) with `target` chosen by `isLocalLink`, dispatching a wrapped `EXCALIDRAW_LINK` custom event to `onLinkOpen` and honoring `defaultPrevented`; or an empty-link placeholder. Buttons: Edit (`FreedrawIcon`), link-to-element (opens `elementLinkSelector` dialog), and Remove (`TrashIcon`, only when there's a link and not embeddable).
- `getCoordsForPopover(element, appState, elementsMap)` — L356-L369. Computes viewport coords of the element's top-center via `sceneCoordsToViewportCoords`, then offsets by `appState.offsetLeft/Top`, centers horizontally (`- POPUP_WIDTH/2`), and lifts it up by `SPACE_BOTTOM`. Returns `{ x, y }` in container-relative pixels.
- `getContextMenuLabel(elements, appState)` — L371-L382. Returns the i18n key for the context-menu link entry: `editEmbed` for embeddables, else `edit` if the first selected element has a link, else `create`.
- `HYPERLINK_TOOLTIP_TIMEOUT_ID` (let, L384) and `showHyperlinkTooltip(element, appState, elementsMap)` — L385-L397. Debounced (`HYPERLINK_TOOLTIP_DELAY`) call to `renderTooltip`; clears any pending timeout first.
- `renderTooltip(element, appState, elementsMap)` — L399-L442. No-op without a link. Gets the shared tooltip div, sets its text (`goToElement` for element links, else the URL), computes the link-handle rect via `getLinkHandleFromCoords`, converts to viewport coords, positions the tooltip above the handle via `updateTooltipPosition`, tracks the event, and sets `IS_HYPERLINK_TOOLTIP_VISIBLE = true`.
- `hideHyperlinkToolip()` — L443-L451. Clears the pending tooltip timeout and, if visible, removes the visible class and resets the flag. (Note the typo "Toolip" in the exported name.)
- `shouldHideLinkPopup(element, elementsMap, appState, [clientX, clientY]: GlobalPoint): Boolean` — L453-L495. Determines whether the popover should auto-hide given the pointer's client coords. Converts to scene coords; `threshold = 15/zoom`. Returns `false` (keep open) if the point hits the element's bounding box, or lies in the vertical corridor between the element top and `SPACE_BOTTOM` above it (`x1..x2`, `y1-SPACE_BOTTOM..y1`), or lies within `threshold` of the popover rect (computed from `getCoordsForPopover` + popup dimensions, in client/viewport space). Otherwise returns `true`.

Coordinate-space note: the popover position is computed in scene space then mapped to viewport via `sceneCoordsToViewportCoords`; `shouldHideLinkPopup` mixes scene-space tests (element/corridor, threshold `/zoom`) with viewport/client-space tests (popover rect) — important to replicate the dual-space comparison for parity.

---

### packages/excalidraw/components/IconPicker.tsx

Purpose: A generic, keyboard-navigable popover icon picker (used for stroke styles, arrowheads, etc.) built on radix-ui `Popover`, supporting visible + collapsible "more options" hidden sections.

Module constants/types:
- `moreOptionsAtom = atom(false)` — L17. Jotai atom persisting the "more options" expanded state across opens.
- `PICKER_COLUMNS = 4` — L18. Grid width used for arrow-key row/column navigation.
- `DEFAULT_SECTION_NAME = "default"` — L19. Section name rendered without a heading.
- `Option<T>` (type, L21-L26): `{ value: T; text: string; icon: JSX.Element; keyBinding: string | null }`.
- `PickerSection<T>` (type, L28-L31): `{ name: string; options: readonly Option<T>[] }`.

- `flattenOptions<T>(sections)` — L33-L34. `flatMap` of all sections' options into one flat array.
- `findOption<T>(sections, predicate)` — L36-L48. Returns the first option across all sections matching `predicate`, else `null`.
- `hasOption<T>(sections, predicate)` — L50-L53. Boolean: any option in any section matches.
- `getNavigationRows<T>(sections)` — L55-L65. Builds a 2D array of rows by chunking each section's options into groups of `PICKER_COLUMNS`. Sections do not share rows (each section's chunks are independent). Drives up/down arrow navigation.
- `Picker<T>({ visibleSections, hiddenSections = [], value, label, onChange, onClose })` — L67-L284. The popover content.
  - State/refs: `container` from `useExcalidrawContainer()` (used as radix `collisionBoundary`); `showMoreOptions` from `moreOptionsAtom` (L82-L83). `allSections`/`allOptions` flatten visible+hidden; `navigationRows` recomputed from visible + (hidden if expanded) (L84-L89).
  - `handleKeyDown(event)` — L91-L189. Keyboard handling: (1) keybinding char (no meta/alt/ctrl) selects the matching option (L92-L101); (2) Tab/Shift+Tab cycles forward/backward through `allOptions` with modulo wrap (L101-L106); (3) arrow keys navigate (L107-L181) — left/right cycle linearly (RTL-aware via `getLanguage().rtl`), up/down move between `navigationRows` keeping the column (clamped to `min(column, row.length-1)`), with modulo wrap and `stopImmediatePropagation`; (4) Escape/Enter close (L182-L186). Always stops propagation at the end (L187-L188).
  - `useEffect` (L191-L195): if the current `value` lives in a hidden section, auto-expands "more options".
  - `renderOptions(options)` — L197-L234. Renders a `picker-content` grid of `<button>`s; each marks `active` when its value matches, calls `onChange(option.value)` on click, shows a title with optional uppercase keybinding, and — for the active option — focuses itself via a `setTimeout(…, 0)` ref callback (L217-L224) to render focus correctly after mount.
  - `renderSections(sections)` — L236-L248. Renders default-named sections without a heading (React.Fragment) and others wrapped in a `picker-section` with a label.
  - Returns a radix `<Popover.Content>` (`side="bottom"`, `align="start"`, offsets 12, z-index var) containing visible sections and, when hidden sections exist, a `<Collapsible>` ("more options") that toggles `moreOptionsAtom`.
- `IconPicker<T>({ value, label, visibleSections, hiddenSections, onChange })` — L286-L333. Exported trigger+popover wrapper.
  - State: `isActive` (`React.useState(false)`) controlling the radix `Popover.Root` open state.
  - `selectedOption` (`useMemo`, L300-L305): looks up the option matching `value` in visible then hidden sections.
  - Renders a `Popover.Trigger` showing the selected option's icon; when active, renders `<Picker>` with `onClose` setting `isActive=false`.

Performance/parity notes: navigation is index-based over a flattened option list with modulo wrap; up/down uses the chunked `navigationRows` (4-column grid) with column clamping when the target row is shorter. The active-button focus uses a 0ms timeout to defer focus past the render. `moreOptionsAtom` persistence means the expanded state survives reopening the picker within a session.
