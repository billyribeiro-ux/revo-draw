## Cluster: excalidraw__wysiwyg

This cluster contains a single file: the WYSIWYG text editor that overlays an HTML `<textarea>` on top of the canvas so the user can type/edit element text directly in-place, kept visually and geometrically in sync with the underlying text element (and any container it is bound to).

### packages/excalidraw/wysiwyg/textWysiwyg.tsx

Purpose: Creates and manages a transient, absolutely-positioned `<textarea>` overlay ("wysiwyg") that mirrors the geometry, font, color, alignment, and rotation of an Excalidraw text element while it is being edited, handling paste, indentation, font-size/zoom keyboard actions, blur/submit lifecycle, caret placement from a click point, and container auto-grow/shrink. Note: this is NOT a React component (`.tsx` only for the JSX-style imports/types); it is a single imperative factory function plus pure helpers.

Top-level module structure: imports (L1-L76), then five module-scope helper functions, then the exported `textWysiwyg` factory which closes over many inner functions.

- `getTransform(width: number, height: number, angle: number, appState: AppState, maxWidth: number, maxHeight: number)` → `string` (CSS transform), L78-L97.
  - Computes the CSS `transform` string applied to the textarea so it scales with camera zoom and rotates with the element. Converts the radian `angle` to degrees (`degree = 180 * angle / Math.PI`, L87). Computes `translateX/translateY` as the offset needed to re-center the element after scaling: `(width * (zoom - 1)) / 2` (L88-L89), because the textarea is scaled about its center but positioned by its top-left. When the element is wider/taller than `maxWidth`/`maxHeight` and zoom ≠ 1, it clamps the translate to `(maxWidth/maxHeight * (zoom - 1)) / 2` (L90-L95) so an overflowing editor doesn't drift.
  - Returns `translate(...px,...px) scale(zoom) rotate(deg)`. Coordinate-space note: this is the bridge from world-space element geometry to screen-space CSS; the left/top are set separately in viewport coords, and this transform layers zoom + rotation on top. Important parity detail: order is translate → scale → rotate, and rotation uses CSS `deg`, not radians.

- `getLineDirection(text: string, offset: number)` → `"rtl" | "ltr"`, L99-L108.
  - Determines text directionality of the single hard line (delimited by `\n`) that contains `offset`. Finds the hard-line start via `lastIndexOf("\n", offset-1) + 1` (L100) and the hard-line end via `indexOf("\n", offset)` (L101), slices that substring (L102-L105), and returns `isRTL(hardLineText) ? "rtl" : "ltr"`. Pure; used to set the mirror element's `dir` for accurate caret hit-testing of RTL text.

- `getCaretBoundaryOffsets(text: string)` → `number[]`, L110-L120.
  - Builds the list of valid caret offsets in `text`, starting at `[0]` and accumulating after each Unicode code point. Iterates `Array.from(text)` (L114) so multi-code-unit characters (surrogate pairs/emoji) advance the offset by `char.length` (L115) rather than by 1, ensuring caret offsets land on character boundaries, not inside surrogate pairs. Returns offsets `[0, ..., text.length]`.

- `getLineCaretOffsetFromNativeLayout({ text, font, lineHeightPx, direction, targetX })` → `number | null`, L122-L194.
  - Given a single line of text and a horizontal target X (relative to line start), measures the real browser layout to find the caret offset whose pixel X is closest to `targetX`. Params destructured from an object (L122-L134); `font` is `ReturnType<typeof getFontString>`, `direction` is `"ltr" | "rtl"`.
  - Guard: returns `null` if there's no text, no `document.body`, or `document.createRange` is unavailable (L135-L137) — i.e. non-DOM/test environments.
  - Builds an off-screen mirror `<div>` (L140-L160): position `fixed` top/left 0, `opacity 0`, `pointerEvents none`, `whiteSpace: "pre"`, matching `font` and `lineHeight`, with `dir = direction`. Appends a text node and inserts into `document.body`.
  - For every caret offset (from `getCaretBoundaryOffsets`), sets a zero-width `Range` at that offset and reads `range.getBoundingClientRect().left` (L163-L173), bailing to `null` if a rect left is non-finite (L168-L170). Always removes the mirror in `finally` (L176-L178) — side effect cleanup invariant.
  - Computes `leftEdge = Math.min(...positions)` (L180) to normalize for RTL/centered layouts, then scans all offsets for the one minimizing `|positions[i] - leftEdge - targetX|` (L184-L191), returning that offset. Performance/coordinate note: this does N synchronous `getBoundingClientRect()` reads (forced layout) per click-to-caret, N = number of caret boundaries on the clicked line; acceptable because it runs once on editor open, not per frame.

- `type SubmitHandler = () => void` (L196) — the return type of the factory; calling it submits/commits the edit.

- `export const textWysiwyg = ({...}): SubmitHandler` — the main factory, L198-L1022. Destructured params (L198-L226):
  - `id`: element id; `onChange?(nextOriginalText)`; `onSubmit({ viaKeyboard, nextOriginalText })`; `getViewportCoords(x,y) => [vx,vy]` (world→viewport); `element: ExcalidrawTextElement`; `canvas: HTMLCanvasElement`; `excalidrawContainer: HTMLDivElement | null`; `app: App`; `autoSelect = true`; `initialCaretSceneCoords = null` (world-space click point used to place the caret on open).
  - Contract (doc comment L211-L216): the editor only deals with `originalText`; the wrapped/displayed `text` is derived from it elsewhere.
  - Closure state: `currentTextLayout` (L227-L236) — snapshot of `{angle, font, height, lineHeightPx, textAlign, width, x, y}` captured each style update, used for caret math; `LAST_THEME` (L258); `editable` (the textarea, L426); `whiteSpace`/`wordBreak` strings (L435-L436); `pendingInitialSelection` (L517-L528); `submittedViaKeyboard` (L784); `isDestroyed` (L988); `observer` (L999).

  Inner functions/handlers (all closures over `editable`, `app`, `element`, etc.):

  - `textPropertiesUpdated(updatedTextElement, editable)` → `boolean`, L238-L256. Compares the element's font family/size against the textarea's current inline styles; returns `true` if they diverge (so the original-container-height cache should be refreshed). Strips quotes from `editable.style.fontFamily` (L245) before comparing via `getFontFamilyString`; compares `${fontSize}px` to `editable.style.fontSize` (L252). Returns `false` if either inline style is unset (L242-L244).

  - `updateWysiwygStyle()` → `void`, L260-L424. The core re-layout routine; re-reads the (possibly mutated) element from `app.scene` and rewrites every relevant textarea style. Sets `LAST_THEME` (L261). Bails if element missing (L266-L268).
    - Starts with `coordX/coordY` = element x/y, `width`/`height` = element w/h, `maxWidth`/`maxHeight` = element w/h (L272-L286).
    - Container branch (L288-L358): if bound to a container — for arrow containers, repositions to `LinearElementEditor.getBoundTextElementPosition` (L289-L298). Manages `originalContainerCache`: refreshes it when font props changed, else reads/initializes it (L304-L318). Computes `maxWidth = getBoundTextMaxWidth`, `maxHeight = getBoundTextMaxHeight` (L320-L324).
      - Auto-grow: if non-arrow container and text `height > maxHeight`, mutates container height to `computeContainerDimensionForBoundText(height, type)`, calls `updateBoundElements`, and **returns early** (L327-L335) — re-layout will re-trigger via the scene update subscription.
      - Auto-shrink: if container is taller than its original cached height and text now fits, shrinks it back (L336-L348).
      - Else: recompute bound-text position via `computeBoundTextPosition` (L349-L357).
    - `[viewportX, viewportY] = getViewportCoords(coordX, coordY)` (L359) — world→screen.
    - Unbounded width clamp: with no container, `maxWidth = (appState.width - 8 - viewportX) / zoom` and `width = min(width, maxWidth)` (L361-L363) so the editor never runs off the right edge (8px margin, divided by zoom because width is in world units). Bounded case adds `0.5` to width to avoid clipping (L365).
    - `height *= 1.05` (L369) — 5% buffer comment notes this prevents the wysiwyg "jumping".
    - `editorMaxHeight = (appState.height - viewportY) / zoom` (L375-L376) keeps the editor inside the viewport vertically.
    - Writes the full style block (L377-L401): `font`, then `lineHeight` (comment L379: must be set *after* font), `width/height/left/top` in px, the `transform` from `getTransform`, `textAlign`, `verticalAlign`, theme-aware `color` (dark mode runs `applyDarkModeFilter(strokeColor)`, L395-L398), `opacity = element.opacity/100`, `maxHeight`.
    - Captures `currentTextLayout` snapshot incl. `lineHeightPx = getLineHeightInPx(fontSize, lineHeight)` (L402-L414).
    - `editable.scrollTop = 0` (L415); in test env re-sets `fontFamily` explicitly (comment L416-L417). Finally mutates the element's `{x: coordX, y: coordY}` in the scene (L422) so element and editor stay co-located. Side effects: scene mutations, DOM style writes; invariant: element x/y is kept equal to the computed editor world coords.

  - Textarea creation/config (L426-L463): creates `<textarea>`, sets `dir="auto"`, `tabIndex=0`, `dataset.type="wysiwyg"`, `wrap="off"` (prevent Safari wrapping, L431-L432), class `excalidraw-wysiwyg`. Chooses `whiteSpace`/`wordBreak`: `pre-wrap`/`break-word` when bound to container or `autoResize` is false, else `pre`/`normal` (L438-L441). Applies a static style block (absolute positioning, transparent bg, hidden overflow, `zIndex: var(--zIndex-wysiwyg)`, `boxSizing: content-box`, etc., L442-L461). Sets `editable.value = element.originalText` (L462) and calls `updateWysiwygStyle()` once (L463).

  - `getCaretIndexFromInitialSceneCoords()` → `number | null`, L465-L515. Converts a world-space click point into a caret index in the text. Returns `null` if no initial coords/layout (L466-L468). Geometry: computes the element's rotation center `(x + width/2, y + height/2)` (L471-L474), then **un-rotates** the click point about that center by `-layout.angle` via `pointRotateRads` (L475-L479) to get axis-aligned local coords; subtracts `layout.x/y` to get `localX/localY` (L480-L481). Wraps the text with `getWrappedTextLines` (full width when `pre-wrap`, else `Infinity`, L482-L486). Picks line index = `clamp(floor(localY / lineHeightPx), 0, lines.length-1)` (L487-L490). Computes the line's start X based on `textAlign` (center → `(width - lineWidth)/2`, right → `width - lineWidth`, left → 0, L494-L499), giving `relativeX = localX - lineStartX` (L500). If the line is empty returns `line.start` (L502-L504); otherwise delegates to `getLineCaretOffsetFromNativeLayout` and returns `line.start + (offset || 0)` (L506-L514). This is the most parity-sensitive piece: rotation handling, alignment-aware line origin, and native sub-line caret measurement.

  - `pendingInitialSelection` IIFE (L517-L528): runs `getCaretIndexFromInitialSceneCoords()`; if non-null, stores `{start, end}` collapsed at that caret (so a click-to-edit places the cursor where clicked rather than selecting all).

  - `editable.onpaste` (only if `onChange` set), L531-L613. Async paste handler. Synchronously reads MIME types first (comment L532-L533, FF requires preventDefault in same tick). If clipboard holds excalidraw element MIME types (L544-L547), `preventDefault()`, parses the transfer, and on success inserts only the **text** of those elements at the current selection, recomputes caret to `selectionStart + text.length`, dispatches a synthetic `input` event, and returns (L548-L578) — so pasting excalidraw shapes into text yields plain text. Otherwise falls back to plain-text MIME (L581-L590), normalizes it; if bound to a container, pre-wraps `editable.value + text` to the container's max width and sets the textarea width to the measured `getTextWidth` so layout doesn't flicker (L591-L612).

  - `editable.oninput` (only if `onChange`), L615-L626. Normalizes `editable.value`; if normalization changed it, restores `selectionStart/End` to the prior `selectionStart` (so the cursor doesn't jump to end, comment L620-L621). Calls `onChange(editable.value)`.

  - `editable.onkeydown` (L629-L678). Routes shortcuts: zoom in/out/reset (no shift) via `actionZoomIn/Out`/`actionResetZoom` `keyTest`, each followed by `updateWysiwygStyle()` (L630-L641); decrease/increase font size (L642-L645); `ESCAPE` → set `submittedViaKeyboard` and `handleSubmit()` (L646-L649); save-to-active-file shortcut → submit then run that action (L650-L653); `Ctrl/Cmd+Enter` → submit, but bail on IME composition (`isComposing`/keyCode 229, L654-L660); `Tab` or `Ctrl/Cmd+[`/`]` → `indent()`/`outdent()` (shift or `[` outdents) then dispatch synthetic `input` to trigger resize (L661-L677). All branches `preventDefault()` where they consume the key.

  - `TAB_SIZE = 4`, `TAB = "    "`, `RE_LEADING_TAB = /^ {1,4}/` (L680-L682) — indentation constants.

  - `indent()` → `void`, L683-L699. Inserts a 4-space TAB at the start of every selected line (iterating start indices from `getSelectedLinesStartIndices`, L685-L693), then adjusts `selectionStart += TAB_SIZE` and `selectionEnd += TAB_SIZE * numLines` (L697-L698) to preserve the selection.

  - `outdent()` → `void`, L701-L743. For each selected line, removes up to one leading TAB-width of spaces (via `RE_LEADING_TAB`, L708-L719), tracking which lines lost a tab. Then carefully restores selection: `selectionStart` is reduced by `TAB_SIZE` (clamped to the last removed-tab index) only if the caret was after that tab, else left unchanged (L724-L737); `selectionEnd = max(selectionStart, selectionEnd - TAB_SIZE * removedTabs.length)` (L738-L741). Invariant: never produces a negative or inverted selection.

  - `getSelectedLinesStartIndices()` → `number[]` (reverse order), L745-L773. Returns the absolute start indices of every line touched by the current selection, **in reverse order** (so callers can splice without index drift). Snaps `selectionStart` back to its line start by subtracting the count of non-newline chars before it (`/[^\n]*$/`, L752-L755). Splits the selected slice on `\n` and reduces to cumulative start indices: each line's start = prev start + prev line length + 1 (for the `\n`), first line = adjusted `selectionStart` (L759-L772). Then `.reverse()`.

  - `stopEvent(event)` → `void`, L775-L780. If the event target is the canvas, `preventDefault()` + `stopPropagation()`. Used as the capture-phase `wheel` listener so scrolling over the canvas while editing doesn't leak.

  - `handleSubmit()` → `void`, L785-L839. The commit/teardown path; also the function returned by the factory. Guards against double-submit via `isDestroyed` (L787-L789), sets `isDestroyed = true`, and runs `cleanup()` **before** `onSubmit` (comment L792-L794: prevents an infinite blur→onSubmit→refocus loop). Re-reads the element (L796-L801). If bound to a container:
    - non-empty trimmed text: ensures the container's `boundElements` includes this text id (appends if absent, L808-L816); if it's an arrow container, `bumpVersion(container)` to invalidate stale label-bounds cache (comment L817-L819).
    - empty text: strips text entries from `container.boundElements` (L821-L830).
    - Either way, `redrawTextBoundingBox(updateElement, container, app.scene)` (L832).
    - Finally calls `onSubmit({ viaKeyboard: submittedViaKeyboard, nextOriginalText: editable.value })` (L835-L838).

  - `cleanup()` → `void`, L841-L862. Detaches `onblur/oninput/onkeydown`, disconnects the `ResizeObserver`, removes the `resize`/`wheel`(capture)/`pointerdown`(capture)/`pointerup`/`blur`/`beforeunload` window listeners, calls the three unsubscribe closures (`unbindUpdate`, `unsubOnChange`, `unbindOnScroll`), and removes the textarea from the DOM. Invariant: every listener/subscription registered later is torn down here.

  - `bindBlurEvent(event?: MouseEvent)` → `void`, L864-L901. Re-arms blur-to-submit and refocuses the textarea, deferred via `setTimeout` so the initiating pointerdown's pointerup doesn't immediately blur (comment L866-L869). Inspects the event target's classes/closest-ancestors to detect interaction with the properties popover (`properties-trigger`/`.properties-content`, L872-L877) or the shape-actions menu (`CLASSES.SHAPE_ACTIONS_MENU` / `.compact-shape-actions-island`, L878-L881); if so, it keeps submit disabled and does NOT steal focus back (L886-L888). Otherwise sets `editable.onblur = handleSubmit`, refocuses, and applies `pendingInitialSelection` (the click-derived caret) once via `setSelectionRange`, then clears it (L890-L899).

  - `temporarilyDisableSubmit()` → `void`, L903-L909. Clears `onblur`, adds a one-shot `pointerup` → `bindBlurEvent` listener, and a `blur` → `handleSubmit` fallback for the alt-tab edge case (comment L906-L907). Used while the user interacts with menus/popovers so editing isn't committed.

  - `onPointerDown(event: MouseEvent)` → `void`, L912-L962. Global capture-phase pointerdown handler. If middle/wheel button (`POINTER_BUTTON.WHEEL`): if the target is the textarea itself, `preventDefault()` and start a canvas pan via `app.handleCanvasPanUsingWheelOrSpaceDrag`; then `temporarilyDisableSubmit()` and return (L916-L925). If the target is inside the shape-actions/zoom menus or properties trigger/content (and not itself a writable element), `temporarilyDisableSubmit()` (L927-L945). Else, if the target is the canvas and not a test env, schedule `handleSubmit()` on the next animation frame (so a tap outside on mobile submits but doesn't immediately create a new text element; comment L946-L961).

  - `unsubOnChange = app.onChangeEmitter.on(...)`, L964-L969. On any scene change, if `app.state.theme !== LAST_THEME`, re-run `updateWysiwygStyle()` (FIXME note L964: theme isn't yet emitted via Store).

  - `unbindUpdate = app.scene.onUpdate(...)`, L971-L980. On scene updates: re-layout via `updateWysiwygStyle()` and refocus the textarea unless a `.properties-content` popup is open (L974-L979).

  - `unbindOnScroll = app.onScrollChangeEmitter.on(() => updateWysiwygStyle())`, L982-L984. Keep editor aligned while the canvas scrolls/pans.

  - Initialization tail (L986-L1021): declares `isDestroyed = false` (L988); if `autoSelect` and no pending click-caret, `editable.select()` (selects all, L990-L994); calls `bindBlurEvent()` (L995). Sets up a `ResizeObserver` on the canvas (preferred over window `resize`, comment L997-L998) to re-layout, falling back to a window `resize` listener (L999-L1007). Stops pointerdown propagation off the textarea itself (L1009). Registers the global capture-phase `pointerdown` → `onPointerDown` inside a `requestAnimationFrame` (comment L1011-L1012: avoid catching the originating pointerdown) (L1013-L1015), and a `beforeunload` → `handleSubmit` (L1016). Finally appends the textarea into `.excalidraw-textEditorContainer` within `excalidrawContainer` (L1017-L1019) and returns `handleSubmit` (L1021).

Coordinate-space / parity notes worth flagging for a Svelte/Canvas reimplementation:
- The editor lives in screen/viewport space: `left/top` are viewport pixels (from `getViewportCoords`), while `width/height` are world units, and zoom+rotation are applied via the CSS `transform` (translate→scale→rotate, angle in degrees). The element's world `x/y` is continuously kept equal to the computed editor coords (L422).
- Click-to-caret (L465-L515) un-rotates the click about the element center, maps to a wrapped line by `floor(localY / lineHeightPx)`, computes an alignment-aware line-origin X, then uses real DOM `Range.getBoundingClientRect()` measurements (L122-L194) to resolve the sub-line offset — replicating this without the DOM mirror requires equivalent per-glyph text metrics.
- Container-bound text drives auto-grow/auto-shrink of the container height (L326-L348) and uses `originalContainerCache` to know the baseline height to shrink back to.
- The 5% height buffer (L369), `0.5px` bound-width pad (L365), and `appState.width - 8` right margin (L362) are empirical anti-jitter constants to preserve for visual parity.
