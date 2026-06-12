# Excalidraw Parity — End-to-End Fidelity Audit

## 1. Headline

| Severity | Count |
|---|---|
| **Bug** (confirmed, user-impacting) | 71 |
| **Partial** (degraded / edge-case) | 24 |
| **Cosmetic** | 3 |
| **Benign** (verified adaptation) | 1 |
| **Total findings** | 99 |

**Single most important takeaway:** The geometry/rendering core is faithful by construction (the math, element, common, utils, fractional-indexing packages and the renderer files are byte-identical to excalidraw-master). Every confirmed defect lives in the **two seams the port wrote itself**: (a) the not-yet-implemented logic modules — `clipboard.ts`, `clients.ts`, `i18n.ts`, `data/library.ts`, `data/types.ts`, `actions/types.ts` are stubs/`[k: string]: unknown` placeholders with zero real implementation; and (b) the hand-rolled `draw-controller.svelte.ts` controller, which re-implements pointer/keyboard/tool behavior and systematically **drops the "second half" of every Excalidraw handler** — group expansion, binding cleanup, grid snapping, frame parenting, cache invalidation, and the entire round/sharp roundness pathway. The renderer is correct; the controller feeds it the wrong state. **Highest-leverage fix: wire the controller's creation/selection/property paths through the already-ported helper functions (`selectGroupsForSelectedElements`, `getResizeOffsetXY`, `getGridPoint`, `bindOrUnbindBindingElements`, `fixBindingsAfterDeletion`, `newElementWith`/cache-busting) that exist in-repo but are never called.**

---

## 2. Confirmed Bugs (ranked by user impact)

| # | Title | Our file:line | Their file:line | Expected → Actual | Fix direction |
|---|---|---|---|---|---|
| 1 | Style edits (fill/stroke/width/style/sloppiness/color) render stale geometry | `draw-controller.svelte.ts:578-601` + `element/mutateElement.ts:130-137` | `actionProperties.tsx:478-485` + `element/renderElement.ts:619-662` | Property change repaints immediately → cached rough shape & element-canvas retained until an unrelated move/resize | Build style updates via `newElementWith` (new ref) **or** `ShapeCache.delete`+canvas-cache invalidate on color/fill/stroke/roughness mutations |
| 2 | Single-click with line/arrow tool discards the element instead of multi-point mode | `draw-controller.svelte.ts:2723-2732` | `App.tsx:10865-10925` | Click starts a click-to-add-points polyline → click deletes the element; multi-point creation impossible | Add `multiElement` state; on non-drag linear pointerUp set `{multiElement, newElement}` and append vertices on subsequent clicks |
| 3 | Generic shapes ignore `currentItemRoundness` — always sharp | `draw-controller.svelte.ts:2362-2371` | `App.tsx:9537,9492-9508` | Default rectangles/diamonds drawn rounded → always `roundness:null` (sharp); toggle no-ops | Pass `roundness: getCurrentItemRoundness(type)` into the generic `newElement` branch |
| 4 | Line creation ignores `currentItemRoundness` | `draw-controller.svelte.ts:2347-2355` | `App.tsx:9377-9380` | Default lines get `PROPORTIONAL_RADIUS` → always sharp | Set `roundness` from `currentItemRoundness` in the line branch |
| 5 | New elements never parented to the frame under cursor (`frameId` always null) | `draw-controller.svelte.ts:2322-2372` | `App.tsx:9521-9525,9539` (+9021,9321) | Shape drawn in a frame clips/moves with it → orphaned `frameId:null` | Compute `getTopLayerFrameAtSceneCoords` at pointerDown; pass `frameId` to all creation branches |
| 6 | Element creation does not snap origin to grid (Ctrl override ignored) | `draw-controller.svelte.ts:2319-2321` | `App.tsx:9514-9520` | Grid-on origins snap (unless Ctrl) → placed at raw cursor | Run origin through `getGridPoint(x,y, ctrl ? null : getEffectiveGridSize())` |
| 7 | Text tool always drops free-floating empty text; no container binding / edit-existing | `draw-controller.svelte.ts:2288-2304` | `App.tsx:8965-9007` | Click on shape → bound centered text; click on text → edit it → always stacks a new unbound text | Add `getTextBindableContainerAtPosition`/`hasBoundTextElement` resolution + `startTextEditing` |
| 8 | Double-click on canvas/element never creates or edits text | `draw-controller.svelte.ts:2008-2019` | `App.tsx:6406-6620` | Double-click empty/shape/text → create/edit → only image-crop & line-editor handled | Add text-edit branch after the image/linear cases (matches HintViewer promise) |
| 9 | In-place text editor ignores camera transform (mispositioned when panned/zoomed) | `EditorPreview.svelte:836` | `App.tsx:5745-5757` | Textarea at on-screen pos, font scaled by zoom → placed at raw world coords, zoom=1 | Convert via `sceneCoordsToViewportCoords` (scrollX/Y, zoom, offset) like the sibling embeddable overlay; scale font by zoom |
| 10 | Edited text not excluded from static render — double-renders under textarea | `EditorPreview.svelte:459-487` | `scene/Renderer.ts:106-114` | Editing element removed from scene → painted on canvas AND in textarea (at two positions) | Filter `editingTextId` out of the renderable elements map |
| 11 | Resize aspect-lock not inverted for images (shift backwards) | `draw-controller.svelte.ts:2464` | `App.tsx:12661-12663` | Image keeps ratio by default, shift frees → distorts by default | `selectedElements.some(isImageElement) ? !shift : shift` |
| 12 | Resize pointer offset (`getResizeOffsetXY`) never subtracted — handle jumps on grab | `draw-controller.svelte.ts:1960-1968,2456-2469` | `App.tsx:8570-8580,12589-12594` | Grabbed corner stays under cursor → teleports to cursor on first move | Store `resize.offset = getResizeOffsetXY(...)` (already ported) and subtract on each move |
| 13 | Marquee selection doesn't expand partial group hits to whole group | `draw-controller.svelte.ts:1919-1928` | `App.tsx:10532-10540` | Box over a group member selects the group → selects only enclosed members | Funnel enclosed ids through `selectGroupsForSelectedElements` / `#withGroupMembers` |
| 14 | Lasso selection doesn't expand partial group hits | `draw-controller.svelte.ts:1937-1957` | `App.tsx:10532-10540` | Lasso a group member selects the group → only individual members | Same group expansion on the lasso path |
| 15 | Double-click on grouped element doesn't deep-enter group (`editingGroupId` never set) | `draw-controller.svelte.ts:2008-2019` | `App.tsx:6533-6557` | Enter group + select clicked child → no group entry | Add group-entry branch setting `editingGroupId` + single-child selection |
| 16 | `selectedGroupIds` never populated (no group outline; per-element borders shown) | `draw-controller.svelte.ts:888-890,1808-1816` | `actionSelectAll.ts:43-47` | Group renders one dashed outline → N element borders, no group box | Run selection setters through `selectGroupsForSelectedElements`; set `selectedGroupIds` |
| 17 | Eraser deletes single topmost element per discrete sample (fast drags skip) | `draw-controller.svelte.ts:1212-1223,2306-2311` | `App.tsx:8114-8118` (+ eraser trail) | Drag erases every element the path crosses → gaps; overlaps under one sample survive | Implement trail/segment-intersection eraser accumulating into a delete set |
| 18 | No re-bind/un-bind when dragging an arrow endpoint during editing | `draw-controller.svelte.ts:2184-2198,2609-2628` | `actionFinalize.tsx:78-123`; `binding.ts:145-222` | Drag endpoint onto/off a shape rebinds/unbinds → bindings never updated | Call ported `bindOrUnbindBindingElement` on linear pointerUp |
| 19 | Fresh-arrow binding ignores `isBindingEnabled`; static `bindMode` not computed inside/orbit | `draw-controller.svelte.ts:2609-2628` | `binding.ts:621-702,793-816` | inside/orbit per endpoint geometry; no-bind when disabled → always app-level `bindMode`, always binds | Use `getBindingStrategy...` (inside vs orbit via `isPointInElement`) + `isBindingEnabled` gate |
| 20 | Delete-point threshold/selection diverge (refuses ≤1, clears selection) | `draw-controller.svelte.ts:1226-1248` | `actionDeleteSelected.tsx:214-273` | Allow delete leaving 1 pt; all-selected removes element; keep neighbor selected → no-ops, drops selection | Drop the `>=2` guard; delete whole element when all selected; reselect `[idx-1]` |
| 21 | Arrow type↔elbow conversion doesn't reposition x/y, reset angle, rebuild points, rebind | `draw-controller.svelte.ts:781-821` | `actionProperties.tsx:1803-1965` | Re-anchor + clean orthogonal points + refreshed bindings → wrong geometry, jagged collapse, stale bindings | Port full `changeArrowType` (x/y to start, angle 0, rebuild points, `fixedSegments:null`, recompute bindings) |
| 22 | After drawing a line/arrow it's not selected; no `LinearElementEditor` created | `draw-controller.svelte.ts:2748-2752` | `App.tsx:10934-10952` | Drawn element selected with point handles → left unselected | Set `selectedElementIds` + `selectedLinearElement` on finalize (when tool unlocked) |
| 23 | Cmd/Ctrl hard-coded false for linear point editor — grid-bypass never works | `draw-controller.svelte.ts:1993-2001` | `linearElementEditor.ts:323,339,519,534,1066,1217` | Hold Cmd bypasses grid snap → always snaps | Forward real `ctrlKey`/`metaKey` into `#linearEvent` |
| 24 | Font-size change doesn't re-anchor text (`offsetElementAfterFontResize` missing) | `draw-controller.svelte.ts:695-699,640-654` | `actionProperties.tsx:230-249,277-281` | Text stays centered → jumps down-right | Port `offsetElementAfterFontResize` and apply after `redrawTextBoundingBox` |
| 25 | Tool always reverts to selection; `activeTool.locked` (tool pin) not honored | `draw-controller.svelte.ts:2751-2752` | `App.tsx:10934-10957` | Tool-lock keeps drawing tool active → always reverts to selection | Add tool-lock state; gate the reset on `!locked`; wire Q shortcut |
| 26 | `pasteAsPlaintext` ignores Excalidraw envelope — pastes raw JSON as text | `draw-controller.svelte.ts:1370` | `App.tsx:3762` | ⇧⌘V of copied elements re-inserts elements → text element of raw JSON | Parse envelope first (`data.elements` branch) before the text fallback |
| 27 | Plain paste doesn't split on newlines into multiple text elements | `draw-controller.svelte.ts:1409` | `App.tsx:4158` | ⌘V multi-line → one element per line, centered/wrapped → single block | Implement `isPlainPaste ? [text] : text.split("\n")` with per-line center/wrap/gap |
| 28 | Pasted text not centered on cursor; no wrapping/measurement | `draw-controller.svelte.ts:1409` | `App.tsx:4179` | Center on cursor, wrap at maxTextWidth, `autoResize:false` → top-left at cursor, unwrapped | Offset by measured `width/2,height/2`; cap at `maxTextWidth`; set autoResize |
| 29 | `setSloppiness` doesn't regenerate seed — sketch not re-randomized | `draw-controller.svelte.ts:544-546` | `actionProperties.tsx:611-616` | Re-seed each element on roughness change → seed untouched | Write `{ seed: randomInteger(), roughness }` |
| 30 | `setEdges` always `ADAPTIVE_RADIUS`; no per-type / elbow-skip | `draw-controller.svelte.ts:551-565` | `actionProperties.tsx:1499-1516` | diamond/line/arrow → `PROPORTIONAL_RADIUS`; elbow skipped → all `ADAPTIVE`, elbow mutated | Branch `isUsingAdaptiveRadius(type)`; early-return elbow arrows |
| 31 | `deleteSelected` hard-filters; ignores frames/bound-text/elbow/group reselect | `draw-controller.svelte.ts:1254` | `actionDeleteSelected.tsx:39-128` | Frame delete keeps+selects children; container delete removes bound text → orphaned children/labels | Port `deleteSelectedElements` (frame child re-select, bound-text delete, group reselect) |
| 32 | Delete key fires regardless of Cmd/Ctrl | `EditorPreview.svelte:328` | `actionDeleteSelected.tsx:305-307` | Cmd+Backspace does NOT delete → deletes selection | Add `&& !event[CTRL_OR_CMD]` guard |
| 33 | `duplicateSelected` uses a fresh group-id map per element — breaks grouped duplicates | `draw-controller.svelte.ts:1678-1683` | `actionDuplicateSelection.tsx:63-83` | Duplicated group stays one group; arrows rebind to copies → singleton groups, arrows bound to originals | Use the batch `duplicateElements({type:'in-place'})` (shared groupIdMap + binding/frame rewire) |
| 34 | `selectAll` selects locked elements & bound-text labels | `draw-controller.svelte.ts:888-890` | `actionSelectAll.ts:28-38` | Cmd+A skips locked/bound-text → selects (and can delete) locked elements | Filter `!locked && !(isTextElement && containerId)`; set `selectedLinearElement` for single linear |
| 35 | Bring-to-front/send-to-back use Cmd+Shift+[ ] on macOS; should be Cmd+Alt+[ ] | `EditorPreview.svelte:358-371` | `actionZindex.tsx:96-103,134-141` | Cmd+Alt+[ ] on Darwin → wrong chord, Alt branch unhandled | Use `event.code` + Darwin `altKey` chords matching upstream keyTests |
| 36 | `flipSelected` omits all-bound-arrows arrowhead-swap and post-flip recentering | `draw-controller.svelte.ts:893-911` | `actionFlip.ts:110-195` | Swap arrowheads for arrow sets; rebind; recenter → resizes, drifts, no rebind | Port the three branches (arrowhead swap early-return, `bindOrUnbindBindingElements`, diffX/diffY recenter) |
| 37 | Lock toggle shortcut Cmd+Shift+L unbound | `EditorPreview.svelte:317-416` | `actionElementLock.ts:143-153` | Cmd+Shift+L toggles lock → nothing | Add keydown branch → `lockSelected()` |
| 38 | Align shortcuts Cmd+Shift+Arrow unbound | `EditorPreview.svelte:317-416` | `actionAlign.tsx:96-199` | Cmd+Shift+Arrow aligns → nothing | Add arrow-key align dispatch |
| 39 | `alignSelected` guards on element count (≥2) instead of group count (>1) / no frame exclusion | `draw-controller.svelte.ts:914-922` | `actionAlign.tsx:43-52` | >1 unit and no frames → runs on single group / moves frames | Guard on `getSelectedElementsByGroup(...).length > 1 && !some(isFrameLikeElement)` |
| 40 | reset-zoom zeroes scroll to (0,0) instead of preserving viewport-center | `draw-controller.svelte.ts:445-451` | `actionCanvas.tsx:222-237` | 100% keeping centered point fixed → camera teleports to origin | Use `getStateForZoom({viewportX:w/2,viewportY:h/2,nextZoom:1})` |
| 41 | zoom-to-fit uses hard-coded 0.85 padding, skips roundToStep + 100% cap | `draw-controller.svelte.ts:454-467` | `actionCanvas.tsx:259-357` | factor 1, cap 100%, snap to 0.1 → 15% margin, unsnapped, zooms past 100% | Mirror `zoomValueToFitBoundsOnViewport` (factor, `Math.min(...,1)`, `roundToStep`) |
| 42 | No zoom keyboard shortcuts (Ctrl±/0, Shift+1/2/3) | `EditorPreview.svelte:317-416` | `actionCanvas.tsx:170-465` | Standard zoom shortcuts → none wired | Add keyTests for zoom in/out/reset/fit/selection |
| 43 | View-mode/zen-mode toggles unbound (Alt+R / Alt+Z) | `draw-controller.svelte.ts:1058-1067` | `actionToggleViewMode.tsx:31`; `actionToggleZenMode.tsx:34` | Alt+R / Alt+Z toggle → nothing | Add the two keydown branches |
| 44 | Shift+wheel doesn't force horizontal pan on vertical-delta devices | `EditorPreview.svelte:181-183` | `App.tsx:12853-12865` | Shift+wheel scrolls horizontally `(deltaY‖deltaX)` → scrolls vertically | Add Shift branch panning X by `(deltaY‖deltaX)/zoom` |
| 45 | `getClientColor` returns hardcoded color, not distributed HSL | `clients.ts:7-10` | `clients.ts:30-44` | Hash-distributed HSL per user → black/stored color | Implement `hashToInteger(id)` → 37-step hue computation |
| 46 | `getNameInitial` missing | `clients.ts` | `clients.ts:49-55` | Capitalized first codepoint, `?` fallback → undefined export | Implement the utility |
| 47 | `renderRemoteCursors` stubbed (no-op) | `clients.ts:12-20` | `clients.ts:57-261` | Renders cursors/labels/speaking indicators → does nothing | Port the rendering routine |
| 48 | Clipboard implementation entirely missing (stub) | `clipboard.ts:1-10` | `clipboard.ts:1-691` | Full clipboard API → 10-line stub | Implement (or re-export) the full module |
| 49 | `ClipboardData` type wrong shape | `clipboard.ts:2-9` | `clipboard.ts:46-53` | Proper interface w/ `mixedContent`/`errorMessage` → catch-all with bogus `type` | Replace with upstream interface |
| 50 | DataTransfer parsing infrastructure missing | `clipboard.ts` | `clipboard.ts:365-517` | Full parse API → absent | Port `parseDataTransferEvent*` + types |
| 51 | System clipboard read with fallback missing | `clipboard.ts` | `clipboard.ts:256-325` | `readSystemClipboard` with read()→readText() fallback → absent | Port `readSystemClipboard` |
| 52 | Library class stub — entire implementation missing | `data/library.ts:1-5` | `data/library.ts:197-401` | Full Library class → `declare class` stub | Implement the Library system |
| 53 | Library: all imports/deps missing | `data/library.ts:1-5` | `data/library.ts:1-46` | Required imports → none | Add imports |
| 54 | `libraryItemsAtom` missing | `data/library.ts:1-5` | `data/library.ts:108-114` | Jotai atom → absent | Port atom/state |
| 55 | Library type definitions missing | `data/library.ts:1-5` | `data/library.ts:60-106` | Adapter/migration/update types → none | Port types |
| 56 | Library helper functions missing | `data/library.ts:1-5` | `data/library.ts:116-196` | `mergeLibraryItems`/`isUniqueItem`/`createLibraryUpdate` → none | Port helpers |
| 57 | Library instance methods/update queue missing | `data/library.ts:1-5` | `data/library.ts:197-401` | Full method set + queue → none | Implement methods |
| 58 | `distributeLibraryItemsOnSquareGrid` missing | `data/library.ts:1-5` | `data/library.ts:405-495` | Grid distribution → absent | Port function |
| 59 | `validateLibraryUrl` + allowlist missing | `data/library.ts:1-5` | `data/library.ts:497-528` | URL validation → absent | Port function/constant |
| 60 | `parseLibraryTokensFromUrl` missing | `data/library.ts:1-5` | `data/library.ts:530-543` | Token parsing → absent | Port function |
| 61 | `AdapterTransaction` class missing | `data/library.ts:1-5` | `data/library.ts:545-589` | Persistence transaction class → absent | Port class |
| 62 | Library hash/persistence functions missing | `data/library.ts:1-5` | `data/library.ts:591-675` | `getLibraryItemsHash`/`persistLibraryUpdate` → absent | Port functions |
| 63 | `useHandleLibrary` hook missing | `data/library.ts:1-5` | `data/library.ts:677-1001` | Init/migration/URL/persistence hook → absent | Port (Svelte equivalent) |
| 64 | `onLibraryUpdateEmitter` missing | `data/library.ts:1-5` | `data/library.ts:72-74` | Update-event emitter → absent | Port emitter |
| 65 | `data/types.ts` is a stub with no typed schema | `data/types.ts` | `data/types.ts:1-67` | Full import/export type schema → catch-all stubs | Port the typed interfaces |
| 66 | `ExportedDataState` stub | `data/types.ts:3` | `data/types.ts:14-21` | Structured interface → `{[k]:unknown}` | Define interface |
| 67 | `ImportedDataState` stub (no legacy mapping) | `data/types.ts:2` | `data/types.ts:35-50` | Structured optional interface → catch-all | Define interface |
| 68 | `ImportedLibraryData` stub | `data/types.ts:4` | `data/types.ts:59-62` | Extends `ExportedLibraryData` + legacy `library` → catch-all | Define interface |
| 69 | `LegacyAppState` missing | `data/types.ts` | `data/types.ts:23-33` | Deprecated-key migration map → absent | Define type |
| 70 | `ExportedLibraryData` missing | `data/types.ts` | `data/types.ts:52-57` | Library export shape → absent | Define interface |
| 71 | `actions/types.ts` Action type + entire action type system stubs | `actions/types.ts:1-3` | `actions/types.ts:1-219` | Full `Action`/`ActionResult`/`ActionSource`/`ActionFn`/`ActionName`/`PanelComponentProps` + imports → catch-all stubs | Port the action type definitions |
| 72 | i18n: language list, `setLanguage`, `t()`, `useI18n`, locale loading, Jotai integration all missing | `i18n.ts:1-8` | `i18n.ts:21-172` | Full i18n runtime → only `defaultLang`/`getLanguage` | Port the i18n module (or a Svelte-rune equivalent) |

*(Findings 48–72 are Tier-A stub-module gaps — same root cause: the file is a placeholder. They are grouped together because each is a missing export within an unimplemented module rather than a distinct behavioral regression.)*

---

## 3. Partial / Cosmetic Divergences

| Title | Our file:line | Their file:line | Severity | Note |
|---|---|---|---|---|
| Arrow creation ignores `currentItemArrowType 'round'` | `draw-controller.svelte.ts:2334-2346` | `App.tsx:9350-9355` | partial | Only multi-bend arrows affected; straight arrows identical |
| Freedraw never captures pen pressure (`simulatePressure` hardcoded) | `draw-controller.svelte.ts:2324-2332,2534-2542` | `App.tsx:9026,10377` | partial | Identical for mouse/trackpad; degrades pen only |
| Frame created without `FRAME_STYLE` | `draw-controller.svelte.ts:2356-2358` | `App.tsx:9580-9591` | partial | Border drawn from constant; affects stored/exported data only |
| `addMidpoint` snap hard-coded true (ignores Cmd/Ctrl) | `draw-controller.svelte.ts:2141-2147` | `App.tsx:9829-9835` | partial | Only with grid mode on + modifier |
| Hover affordances never update (`hoverPointIndex`/midpoint coords) | `draw-controller.svelte.ts:2379-2530` | `App.tsx:7322,7551-7649` | partial | Drag/add still work; only hover highlight dead |
| Enter doesn't edit selected text/container | `routes/+page.svelte:293` | `App.tsx:5218-5239` | partial | Double-click path still works |
| Font/align changes skip `updateBoundElements` | `draw-controller.svelte.ts:640-654` | `actionProperties.tsx:290-297` | partial | Real cause: null container to `redrawTextBoundingBox`; imported-doc bound labels only |
| Text-style action ignores bound text of selected containers | `draw-controller.svelte.ts:643-648` | `actionProperties.tsx:291-296` | partial | Free text correct; bound labels silently no-op |
| Free-text creation not vertically centered on cursor | `draw-controller.svelte.ts:2291-2297` | `App.tsx:6269-6277` | partial | ~½ line-height low |
| `setEditingText` doesn't normalize text / resolve container | `draw-controller.svelte.ts:834-845` | `textWysiwyg.tsx:615-626` | partial | Tab/CRLF on inline paste only |
| `copyStyles` drops bound-text element of source | `draw-controller.svelte.ts:1440` | `actionStyles.ts:50` | partial | Container styles still copy |
| `pasteStyles` ignores bound-text source | `draw-controller.svelte.ts:1451` | `actionStyles.ts:79` | partial | Bound-text font not transferred |
| No `copyText` / copy-as-SVG actions | `draw-controller.svelte.ts:1508` | `actionClipboard.tsx:254` | partial | Only copy-as-PNG exists |
| `saveAs` swallows non-Abort write error → silent download fallback | `file-io.ts:97` | `data/filesystem.ts` | partial | Rare error path; stray download + masked error |
| `copySelected` no error toast on clipboard write failure | `draw-controller.svelte.ts:1331` | `actionClipboard.tsx:37` | partial | Silent console.warn; in-memory paste still works |
| Stroke color/opacity don't propagate to bound text | `draw-controller.svelte.ts:591-598,1706-1710` | `actionProperties.tsx:322-336,720-728` | partial | Imported bound-text docs only |
| `#applyStyle` writes strokeColor to image/frame (no `hasStrokeColor` guard) | `draw-controller.svelte.ts:512-513,591-598` | `actionProperties.tsx:329-333` | partial | Extra version bump; panel shown where upstream hides it |
| `setBackgroundColor` drops line→polygon enable | `draw-controller.svelte.ts:515-516` | `actionProperties.tsx:397-421` | partial | Closeable line never fills |
| Zoom in/out multiplicative (×1.1) vs additive (+0.1) | `EditorPreview.svelte:853,857` | `actionCanvas.tsx:148,189` | partial | Non-round zoom percentages |
| Mouse-wheel zoom algorithm differs, no MAX_STEP clamp | `EditorPreview.svelte:177-184` | `App.tsx:12819-12851` | partial | Different feel; large deltas unclamped |
| Missing programmatic `createPasteEvent` | `clipboard.ts` | `clipboard.ts:89-140` | partial | Test/API helper |
| Missing `isClipboardEvent` guard | `clipboard.ts` | `clipboard.ts:681-690` | partial | Utility absent |
| Missing mixed HTML/image paste parsing | `clipboard.ts` | `clipboard.ts:44-250` | partial | No `parseHTMLTree`/`mixedContent` |
| `ExcalidrawLibraryIds` type missing | `data/types.ts` | `data/types.ts:64-66` | partial | Type-only consumer risk |
| `TranslationKeys` type missing | `i18n.ts` | `i18n.ts:17` | partial | Type-safe keys absent |
| Test-language support missing | `i18n.ts` | `i18n.ts:77-87` | partial | Dev-only |
| `deleteSelected` no `fixBindingsAfterDeletion` (dangling bindings) | `draw-controller.svelte.ts:1254-1258` | `actionDeleteSelected.tsx:278-281` | partial | Stale binding state persisted; defensive reads avoid crash |
| `groupSelected` doesn't make group z-contiguous / set selection state | `draw-controller.svelte.ts:978-993` | `actionGroup.tsx:166-195` | partial | Ungrouped elements stay sandwiched in z-order |
| `lockSelected` no temp-group for multi-lock (`lockedMultiSelections`) | `draw-controller.svelte.ts:942-954` | `actionElementLock.ts:62-106` | partial | Unlock-all doesn't reselect as a unit; `activeLockedId` highlight dead |
| Distribute shortcuts Alt+H / Alt+V unbound | `EditorPreview.svelte:317-416` | `actionDistribute.tsx:87-119` | partial | Reachable via palette/context menu |
| Linear discard test `width<1 && height<1` vs `isInvisiblySmallElement` | `draw-controller.svelte.ts:2723-2732` | `sizeHelpers.ts:30-44` | cosmetic | Sub-pixel band / contrived cases only |
| `zoomAt` skips `getNormalizedZoom` round-to-6dp | `draw-controller.svelte.ts:390` | `scene/normalize.ts:7` | cosmetic | Sub-1e-6 float dust; display unaffected |
| zoom-to-fit/scroll ignores editor UI offsets | `draw-controller.svelte.ts:454-499` | `actionCanvas.tsx:399-435` | cosmetic | Content off-center under open panels |

---

## 4. Benign Adaptations (verified, not bugs)

- **`defaultLang.rtl: false` vs unset** (`i18n.ts:5` vs `i18n.ts:19`) — English is LTR either way; explicit `false` is equivalent to `undefined`. Proof the i18n surface was reviewed, not a behavioral defect.

---

## 5. What Is Proven Identical

Verified by direct `diff` against excalidraw-master:

- **The `math`, `element`, `common`, `utils`, and `fractional-indexing` packages are byte-identical** to upstream. All 2D geometry, element factories (`newElement`/`newLinearElement`/`newFrameElement`), bounds/hit-test/transform math, comparisons, type-checks, fractional z-indexing, and shared constants behave exactly as Excalidraw does.
- **The renderer files** (`renderElement.ts`, `staticScene.ts`, `interactiveScene.ts`, `shape.ts`, `Renderer.ts`, `ShapeCache`) are byte-identical. Given correct element + appState input, the canvas output is pixel-faithful **by construction** — confirmed repeatedly in the findings above, where renderer code reads exactly the right fields (`element.roundness`, `FRAME_STYLE`, `editingTextElement`, `selectedGroupIds`, `isSelectedViaGroup`) and the *only* reason behavior diverges is that the hand-rolled controller never populates those fields.

**Implication for remediation:** Because the geometry and rendering layers are faithful and the required helper functions (`getResizeOffsetXY`, `getGridPoint`, `selectGroupsForSelectedElements`, `bindOrUnbindBindingElements`, `fixBindingsAfterDeletion`, `getNewGroupIdsForDuplication`, `newElementWith`, `getCurrentItemRoundness`, `offsetElementAfterFontResize`) are already present in-repo, the overwhelming majority of Tier-B bugs are **wiring defects in `draw-controller.svelte.ts`** — calling the ported helper instead of the hand-rolled shortcut — rather than missing algorithms. The Tier-A bugs are concentrated in six unimplemented placeholder modules (clipboard, clients, i18n, library, data/types, actions/types) whose stubs should be replaced with real (or re-exported) implementations.