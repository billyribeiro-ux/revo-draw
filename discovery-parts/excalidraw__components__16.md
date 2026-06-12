## Cluster: excalidraw__components__16

This cluster contains seven UI building-block components from the Excalidraw editor: a search input, two radio-style selectors, a slider, a scrollable list wrapper, the full text-search menu (the only logic-heavy file), and an accessibility section wrapper.

### packages/excalidraw/components/QuickSearch.tsx

A small forwardRef text input with a leading search icon that normalizes (trim + lowercase) its value and forwards it via `onChange`.

- `QuickSearch = React.forwardRef<HTMLInputElement, QuickSearchProps>(({ className, placeholder, onChange }, ref) => JSX)` — L14-L29.
  - Renders a wrapper `div.QuickSearch__wrapper` (class merged via `clsx`), the imported `searchIcon` (L18), and an `<input type="text">` whose `ref` is the forwarded ref.
  - Behavior: on every input event it calls `onChange(e.target.value.trim().toLowerCase())` (L24) — the consumer receives an already-normalized search term; raw whitespace/case never escapes this component.
  - Props (`QuickSearchProps`, L8-L12): `className?: string`, `placeholder: string`, `onChange: (term: string) => void`.
  - No internal state, refs, or effects. Pure controlled-by-parent input. Side effect: none beyond the `onChange` callback.

### packages/excalidraw/components/RadioGroup.tsx

A generic native-radio-button group rendering one labeled radio per choice, with an `active` class on the selected choice.

- Exported types:
  - `RadioGroupChoice<T> = { value: T; label: React.ReactNode; ariaLabel?: string }` (L5-L9).
  - `RadioGroupProps<T> = { choices: RadioGroupChoice<T>[]; value: T; onChange: (value: T) => void; name: string }` (L11-L16).
- `RadioGroup = function <T>({ onChange, value, choices, name }: RadioGroupProps<T>)` — L18-L46.
  - Maps each `choice` to a `div.RadioGroup__choice` whose `active` class is set when `choice.value === value` (L28-L30); `key` is `String(choice.value)` (L31); `title` is the `ariaLabel`.
  - Each contains a native `<input type="radio" name={name}>` with `checked={choice.value === value}` and `onChange={() => onChange(choice.value)}` (L34-L40), followed by the choice `label`.
  - Invariant: selection is purely controlled by the `value` prop; equality is strict `===` identity, so non-primitive `T` values must be referentially stable. No internal state/refs/effects.

### packages/excalidraw/components/RadioSelection.tsx

A generic option selector that renders either icon buttons (`type: "button"`) or icon radio inputs (`type: "radio"`, default), driven by a discriminated-union prop shape.

- `RadioSelection = <T extends Object>(props) => JSX` — L7-L59.
  - Props (L8-L28): `options: { value: T; text: string; icon: JSX.Element; testId?: string; active?: boolean }[]`, `value: T | null`, `type?: "radio" | "button"`. The union (L19-L27) adds, for `"radio"`, `group: string` + `onChange: (value: T) => void`; for `"button"`, `onClick: (value, event) => void`.
  - Behavior: iterates `options`. When `props.type === "button"` renders a `ButtonIcon` (L33-L40) keyed by `option.text`, `active` defaulting to `option.active ?? props.value === option.value`, `onClick={(event) => props.onClick(option.value, event)}`. Otherwise renders a `<label>` (L42-L55) with `active` class when `props.value === option.value`, containing a native `<input type="radio" name={props.group}>` (`checked` on identity match, `onChange` calls `props.onChange(option.value)`) and the `option.icon`.
  - Invariant: `active`-state defaults to identity equality (`props.value === option.value`) but can be overridden per-option via `option.active`. No internal state/refs/effects. Stateless presentational component.

### packages/excalidraw/components/Range.tsx

A styled native range slider with a floating value bubble whose horizontal position and gradient fill track are computed in a layout effect.

- Exported type `RangeProps` (L5-L15): `label: React.ReactNode`, `value: number`, `onChange: (value: number) => void`, `min?: number` (default 0), `max?: number` (default 100), `step?: number` (default 10), `minLabel?: React.ReactNode` (default `min`), `hasCommonValue?: boolean` (default true), `testId?: string`.
- `Range = ({ label, value, onChange, min, max, step, minLabel, hasCommonValue, testId }: RangeProps) => JSX` — L17-L79.
  - Refs: `rangeRef` (the `<input type="range">`, L28) and `valueRef` (the floating `.value-bubble` div, L29).
  - `useEffect` (L31-L48) — runs when `[max, min, value]` change. Non-obvious geometry/math for parity:
    - Reads `inputWidth = rangeElement.offsetWidth` (L35).
    - Reads CSS custom property `--slider-thumb-size` via `getComputedStyle(...).getPropertyValue(...)`, parsed with `parseFloat`, defaulting to `16` if NaN/empty (L36-L41).
    - `progress = ((value - min) / (max - min || 1)) * 100` (L42) — percentage along the track; the `|| 1` guards divide-by-zero when `max === min`.
    - `position = (progress / 100) * (inputWidth - thumbWidth) + thumbWidth / 2` (L43-L44) — pixel x-position of the bubble accounting for the thumb's half-width inset at both ends so the bubble centers over the thumb rather than the track edges.
    - Sets `valueElement.style.left = "${position}px"` (L45) and builds a CSS `linear-gradient(to right, ...)` two-color track that switches from `--color-slider-track` to `--button-bg` exactly at `progress%` (L46) to render the filled portion.
  - Render (L50-L78): a `label.control-label` containing the `label`, then a `.range-wrapper` with the `<input type="range">`. The input's inline style sets `--color-slider-track` to `undefined` when `hasCommonValue` is true, else `var(--button-bg)` (L55-L59) — i.e. when there is no common value across a multi-select, the track is rendered flat. `onChange` coerces the string value with `+event.target.value` (L65-L67). The `.value-bubble` shows `value` only when `value !== min` (else `null`, L73). A `.zero-label` shows `minLabel` (L75).
  - Performance/coordinate note: bubble positioning is DOM-measured (`offsetWidth`) every value change, in screen pixels; a Canvas reimplementation would need the rendered slider's pixel width and thumb size to match this positioning formula.

### packages/excalidraw/components/ScrollableList.tsx

A thin wrapper that renders its children as a `role="menu"` scroll container, or a placeholder when there are no children.

- `ScrollableList = ({ className, placeholder, children }: ScrollableListProps) => JSX` — L12-L24.
  - Props (`ScrollableListProps`, L6-L10): `className?: string`, `placeholder: string`, `children: React.ReactNode`.
  - `isEmpty = !Children.count(children)` (L17) — uses React's `Children.count` so it correctly counts fragments/arrays of children rather than truthiness.
  - Renders `div.ScrollableList__wrapper[role="menu"]` (class merged via `clsx`); when empty shows `<div className="empty">{placeholder}</div>`, otherwise the `children` (L20-L22). No state/refs/effects.

### packages/excalidraw/components/SearchMenu.tsx

The full in-canvas text search feature: a debounced searcher over text elements and frame names, with match preview generation, per-line geometry computation for on-canvas highlights, keyboard navigation, and viewport auto-scroll/zoom to the focused match.

Module-level state and constants:
- `searchQueryAtom = atom<string>("")` (L55) — jotai atom holding the raw input string.
- `searchItemInFocusAtom = atom<number | null>(null)` (L56, exported) — index of the currently focused match.
- `SEARCH_DEBOUNCE = 350` (L58) — debounce ms for `handleSearch`.
- Types: `SearchMatchItem` (L60-L71: `element`, `searchQuery`, `index`, `preview` `{indexInSearchQuery, previewText, moreBefore, moreAfter}`, `matchedLines`), `SearchMatches` (L73-L76: `nonce: number | null`, `items: SearchMatchItem[]`), and the branded `SearchQuery = string & { _brand: "SearchQuery" }` (L78).

- `SearchMenu = () => JSX` — L80-L437. The main component.
  - Hooks/context: `useApp()` (L81), `useExcalidrawSetAppState()` (L82). `searchInputRef` (L84). Atoms: `inputValue`/`setInputValue` (searchQueryAtom, L86), `focusIndex`/`setFocusIndex` (searchItemInFocusAtom, L98). State: `isSearching` (L89), `searchMatches` (L91-L94, `{nonce, items}`). Refs: `searchedQueryRef` (last completed query, L95) and `lastSceneNonceRef` (scene nonce when last searched, L96). `elementsMap = app.scene.getNonDeletedElementsMap()` (L99). `searchQuery = inputValue.trim()` branded (L87).
  - Effect — re-search on query/scene change (L101-L139): when not currently searching, if `searchQuery` differs from `searchedQueryRef.current` OR the scene nonce changed, it nulls `searchedQueryRef`, calls `handleSearch(...)` and on callback stores matches with a fresh `randomInteger()` nonce, records the completed query + scene nonce, and pushes `searchMatches` into appState (`focusedId: null`, mapping each item to `{id, focus: false, matchedLines}`) or `null` when empty.
  - `goToNextItem = () => void` (L141-L151): advances `focusIndex` cyclically `(focusIndex + 1) % length`; `null` → `0`.
  - `goToPreviousItem = () => void` (L153-L165): decrements cyclically, wrapping to `length - 1` when going below 0; `null` → `0`.
  - Effect — sync focus into appState (L167-L190): when `focusIndex` changes, sets `searchMatches.focusedId` to the focused match's id and flips each match's `focus` flag so exactly the focused index is `true`. Returns `null` if there are no `state.searchMatches`.
  - Effect — auto-scroll/zoom to focused match (L192-L261): builds a throwaway `newTextElement` (`matchAsElement`) positioned at the match's first matched line offset (L199-L211), using frame font metrics for frames (`FRAME_STYLE.nameFontSize` / `FONT_FAMILY.Assistant`) else the element's own. Computes `isTextTiny = fontSize * zoomValue < FONT_SIZE_LEGIBILITY_THRESHOLD (14)` (L213-L217). If the match is not completely in viewport (via `isElementCompletelyInViewport`, passing canvas dims divided by `window.devicePixelRatio`, the scroll/zoom/offset appState, the elements map, and editor UI offsets) OR is tiny, it picks `zoomOptions`: `{fitToContent}` if legible, else `{fitToViewport, maxZoom: round(14/fontSize, 1)}` to bring the text up to ~14px (rounded to nearest 10%), then calls `app.scrollToContent(matchAsElement, {animate, duration: 300, ...zoomOptions, canvasOffsets})`. Key coordinate-space detail: canvas width/height are converted from device pixels to CSS pixels by dividing by DPR before the viewport check.
  - Effect — cleanup on unmount (L263-L273): resets `focusIndex`, both refs, clears `searchMatches` in appState, and `setIsSearching(false)`.
  - `stableState = useStable({ goToNextItem, goToPreviousItem, searchMatches })` (L275-L279) — stable identity wrapper so the keydown listener (registered once) always sees fresh values.
  - Effect — global keydown listener (L281-L342): registered on `window` with `{capture: true, passive: false}` (L338-L341, comment notes capture is needed to beat App.tsx's own handlers and avoid firing on initial open). ESCAPE (when no dialog/popup) closes the sidebar (`openSidebar: null`); CTRL/CMD+F focuses+selects the search input (unless already focused); when the event target is inside `.layer-ui__search` and there are matches, ENTER and ARROW_DOWN call `goToNextItem`, ARROW_UP calls `goToPreviousItem` (each `stopPropagation`).
  - `matchCount` (L344-L348): pluralized result-count label via `t("search.singleResult"|"search.multipleResults")`.
  - Render (L350-L436): `div.layer-ui__search` containing a `TextField` (L353-L388) bound to `inputValue`; its `onChange` sets input value, flips `isSearching=true`, and runs `handleSearch` immediately (in addition to the debounce inside `handleSearch`), updating matches, focus index, refs, appState, then `setIsSearching(false)`. A `.layer-ui__search-count` block (L391-L427) shows `focusIndex+1 / matchCount` or just `matchCount`, plus next/previous `Button`s (using `collapseDownIcon`/`upIcon`), and a "no match" message when a query was searched but yielded nothing. Finally the `MatchList` (L429-L434).

- `ListItem = (props: { preview, searchQuery, highlighted, onClick? }) => JSX` — L439-L478.
  - Builds a 5-segment `preview` array (L445-L456): leading `"..."` if `moreBefore`, the text before the match, the matched substring (sliced by `indexInSearchQuery` .. `+ searchQuery.length`), the text after, trailing `"..."` if `moreAfter`.
  - Renders `div.layer-ui__result-item` (`active` class when `highlighted`), with a `ref` callback that calls `scrollIntoView({behavior: "auto", block: "nearest"})` when highlighted (L465-L469) — auto-scrolls the focused item into the list viewport. The preview maps segments to fragments, wrapping segment index 2 (the match) in `<b>` (L472-L474).

- `MatchListProps` interface (L480-L485): `matches`, `onItemClick`, `focusIndex`, `searchQuery`.
- `MatchListBase = (props: MatchListProps) => JSX` — L487-L540.
  - `frameNameMatches`/`textMatches` are `useMemo`-filtered partitions of `props.matches.items` by `isFrameLikeElement`/`isTextElement` (L488-L497).
  - Renders a "Frames" section then a "Texts" section, each with a title icon (`frameToolIcon`/`TextIcon`) and a list of `ListItem`s. Important index bookkeeping: frame items use index `index`; text items use `index + frameNameMatches.length` for both `highlighted` comparison and `onItemClick`, so the flat `focusIndex` aligns with the frames-first ordering produced by `handleSearch` (L507-L535).
- `areEqual = (prevProps, nextProps) => boolean` (L542-L547): memo comparator — re-renders only when `matches.nonce` or `focusIndex` changes (the nonce is the change signal, not deep item comparison).
- `MatchList = memo(MatchListBase, areEqual)` (L549).

- `getMatchPreview = (text, index, searchQuery) => {indexInSearchQuery, previewText, moreBefore, moreAfter}` — L551-L598.
  - Generates a windowed text preview around the match: keeps `WORDS_BEFORE = 2` words before and `WORDS_AFTER = 5` after. Determines `isQueryCompleteBefore` (substring before match ends with space) and `isQueryCompleteAfter` (substring after doesn't start with space) to decide word boundaries (L563, L584). Clamps the before-string to `MAX_ALLOWED_CHARS = 20` by slicing from the end (L573-L578). `indexInSearchQuery` is the length of the before-string (where the match starts in `previewText`); `moreBefore`/`moreAfter` flag truncation.
- `normalizeWrappedText = (wrappedText: string, originalText: string): string` — L600-L633.
  - Reconstructs spacing lost by word-wrapping: splits the wrapped text into lines, and for each line, locates the next line in the original (from a running `originalIndex`); if the gap is larger than the current line length it pads the current line with spaces to preserve original character offsets, so subsequent index math against `originalText` stays aligned. Returns the re-joined normalized text.
- `getMatchedLines = (textElement: ExcalidrawTextElement, searchQuery: SearchQuery, index: number) => SearchMatch["matchedLines"]` — L635-L740.
  - Core on-canvas highlight geometry. Normalizes the wrapped text (L640-L643), splits into lines, and builds `lineIndexRanges` of `{line, startIndex, endIndex, lineNumber}` covering the full character index space (L647-L665). Then walks lines from the match's `startIndex`, slicing `remainingQuery` across line boundaries (a match can span multiple wrapped lines). For each touched line it:
    - measures the text before the match on that line with `measureText(textToStart, getFontString(textElement), lineHeight)` to get `offsetX`, explicitly zeroing width for the empty string (L692-L702, comment notes `measureText` returns non-zero width for `""`);
    - for non-left alignment, adds horizontal slack: `(width - lineLength)/2` for center, `width - lineLength` for right (L704-L716);
    - measures the matched word for `width`/`height` (L718-L722);
    - computes `offsetY = lineNumber * offset.height` (L725) and pushes `{offsetX, offsetY, width, height, showOnCanvas: true}`.
  - Coordinate space: all offsets are element-local (relative to the text element's x/y); `offsetY` stacks by line height. This is the parity-critical geometry for drawing search highlights.
- `getMatchInFrame = (frame: ExcalidrawFrameLikeElement, searchQuery, index, zoomValue): SearchMatch["matchedLines"]` — L742-L781.
  - Computes the highlight rect for a match inside a frame's name. Uses frame font (`FRAME_STYLE.nameFontSize`, `FONT_FAMILY.Assistant`, `getLineHeight`). `offsetX` is the measured width of the name prefix (zeroed for empty); `offsetY = -offset.height - FRAME_STYLE.strokeWidth` (L769) places the highlight above the frame (frame names render above the frame box). `showOnCanvas` is true only if the match fits horizontally: `offsetX + width <= frame.width * zoomValue` (L778) — note the comparison is against frame width scaled by zoom.
- `escapeSpecialCharacters = (string: string) => string` — L783-L785: escapes regex metacharacters (`.*+?^${}()|[]\-`) so the search term is treated literally.
- `handleSearch = debounce((searchQuery, app, cb) => void, SEARCH_DEBOUNCE)` — L787-L876.
  - The debounced search engine. Early-returns `cb([], null)` for empty query. Collects non-deleted elements, filters into `texts` and `frames`, sorts both by `y` ascending (L807-L808). Builds a global case-insensitive regex from the escaped query (L812) and iterates `regex.exec` to find every occurrence in each text element's `originalText` (L814-L832) and each frame's name (`frame.name ?? getDefaultFrameName(frame)`, L834-L859), building `SearchMatchItem`s with preview + matched-line geometry; items with zero matched lines are skipped. Final ordering puts all frame matches before text matches (`[...frameMatches, ...textMatches]`, L866). Computes initial `focusIndex` as the first match whose element id is in `app.visibleElements` (L861-L871) and invokes `cb(matchItems, focusIndex)`.
  - Performance/invariant notes: a single `RegExp` with the `g` flag is reused across the loop, so its `lastIndex` advances correctly within one element's text but is implicitly reset between elements because `regex.exec` returns `null` at end-of-string (terminating each `while`). Frames-first ordering must be mirrored by `MatchListBase`'s index offset math.

### packages/excalidraw/components/Section.tsx

An accessibility wrapper that renders a `<section>` with a visually-hidden translated `<h2>` heading and `aria-labelledby`, supporting either plain children or a render-prop that receives the header node.

- `Section: React.FC<{ heading: "canvasActions" | "selectedShapeActions" | "shapes"; children?: React.ReactNode | ((heading: React.ReactNode) => React.ReactNode); className?: string }>` — L7-L30.
  - Gets `id` from `useExcalidrawContainer()` (L12) to build a unique heading id `${id}-${heading}-title`.
  - Builds `header` as `<h2 className="visually-hidden" id=...>` with text `t("headings.${heading}")` (L13-L17).
  - Renders `<section {...props} aria-labelledby=...>` (L19); if `children` is a function it calls `children(header)` (render-prop, letting the consumer place the header), otherwise renders `header` followed by `children` (L20-L27).
  - No state/refs/effects. The `heading` prop is constrained to three known section keys, ensuring the i18n key always resolves.
