## Cluster: excalidraw__components__0

This cluster contains the editor's top-of-tree React layer: the bottom-bar/properties **Actions** widgets, the **App** class (the ~13k-line monolithic editor controller that owns scene, history, pointer/keyboard handling, and all coordinate math), the typed **AppStateObserver** pub/sub utility, the **Avatar** collaborator chip, the **Button** primitive, the **ActiveConfirmDialog** atom-driven dialog, and the **BraveMeasureTextError** message component.

---

### packages/excalidraw/components/Actions.tsx

Renders the selected-shape property panels (full, compact/tablet, and mobile variants), the toolbar shape switcher, zoom/undo-redo button groups, and the exit-zen/view-mode buttons. All are stateless presentational components that delegate real work to `ActionManager.renderAction(name)`.

- **`PROPERTIES_CLASSES`** (const, L99-L102): precomputed `clsx` of `SHAPE_ACTIONS_THEME_SCOPE` + `"properties-content"`, reused by all `PropertiesPopover` instances.
- **`canChangeStrokeColor(appState: UIAppState, targetElements: ExcalidrawElement[]) => boolean`** (L104-L125): true if the active tool supports stroke color (and the common selected type isn't image/frame/magicframe) OR any target element supports stroke color. Computes `commonSelectedType` by scanning targets, nulling it on first type mismatch (L108-L116).
- **`canChangeBackgroundColor(appState, targetElements) => boolean`** (L127-L135): true if active tool has background OR any element type has background.
- **`SelectedShapeActions({ appState, elementsMap, renderAction, app })`** (L137-L316): the FULL desktop properties panel. Derives `targetElements` via `getTargetElements` (L148); detects single bound-text container (length===2 with a bound text element, L150-L157); computes booleans `showFillIcons`, `showLinkIcon`, `showLineEditorAction`, `showCropEditorAction`, `showAlignActions`. Conditionally renders stroke/background/fill/strokeWidth/strokeShape/strokeStyle/sloppiness/roundness/arrowType/font family+size/text align/vertical align/arrowhead/opacity actions, a "layers" fieldset (z-index), an "align" fieldset that **swaps left/right button order when `dir==="rtl"`** (L264-L276) so leftmost button always aligns-left, and an "actions" fieldset (duplicate/delete hidden on phone, group/ungroup/hyperlink/crop/lineEditor).
- **`CombinedShapeProperties({ appState, renderAction, setAppState, targetElements, container })`** (L318-L418): compact popover (`adjustmentsIcon` trigger) gating on `openPopup === "compactStrokeStyles"`; opens a radix `Popover` containing fill/strokeWidth/strokeStyle/sloppiness/roundness/opacity. Returns null unless selection exists or active tool is a drawing tool (L339-L350).
- **`CombinedArrowProperties({ ..., app })`** (L420-L515): compact arrow popover; the trigger icon is computed live via `getFormValue` reading each element's arrow type — `elbowed`→"elbow", `roundness`→"round", else "sharp" (L472-L499) — falling back to `currentItemArrowType` when no selection. Gated on `openPopup === "compactArrowProperties"`.
- **`CombinedTextProperties({ ..., elementsMap })`** (L517-L606): compact text popover (`TextSizeIcon`). Uses `useTextEditorFocus()` to **save caret position before opening and restore it on close** (L532, L541-L549, L567-L570, L584-L589) — critical for not losing the WYSIWYG cursor; passes `preventAutoFocusOnTouch` when editing text (L583).
- **`CombinedExtraActions({ ..., showDuplicate?, showDelete? })`** (L608-L759): compact "…" overflow popover (`DotsHorizontalIcon`) with layers/align/actions fieldsets; align order RTL-swapped again (L708-L720). Returns null while editing text/new element or with no selection (L648-L650).
- **`LinearEditorAction({ appState, renderAction, targetElements })`** (L761-L785): renders the `toggleLinearEditor` button only when a single non-elbow linear element is selected and not already editing.
- **`CompactShapeActions({ appState, elementsMap, renderAction, app, setAppState })`** (L787-L894): tablet/compact properties row composing the Combined* popovers plus dedicated stroke/background color, font-family, duplicate, and delete buttons.
- **`MobileShapeActions({ ... })`** (L896-L1039): phone variant inside an `Island`. Notable layout math: with measured `ACTIONS_WIDTH` from a ref (L913-L914), `MIN_ACTIONS=9` (7 + undo/redo), `GAP=6`, `WIDTH=32`, computes `MIN_WIDTH = 9*32 + 8*6` and decides `showDeleteOutside`/`showDuplicateOutside` based on available width thresholds (L917-L928) — responsive button promotion out of the overflow menu. Island height is `WIDTH*1.35` (L939).
- **`ShapesSwitcher({ activeTool, setAppState, app, UIOptions })`** (L1041-L1279): renders the main toolbar. Local state `isExtraToolsMenuOpen`. Maps `getToolbarTools(app)` to `ToolButton`s skipping tools disabled via `UIOptions.tools`; builds shortcut labels (`letter + "or" + numericKey`). `onPointerDown` of the selection button **toggles between selection and lasso** (L1159-L1165) and enables pen mode on pen pointer (L1155-L1157). In compact-styles mode it swaps selection/lasso for a `ToolPopover` (L1108-L1139). An "extra tools" `DropdownMenu` exposes frame/embeddable/laser/lasso plus Generate items (TTD tunnel, mermaid, magicframe). Trigger icon reflects current extra-tool selection, suppressing laser highlight while collaborating (L1192-L1211).
- **`ZoomActions({ renderAction, zoom })`** (L1281-L1295): `Stack.Col` with zoomOut/resetZoom/zoomIn in a row.
- **`UndoRedoActions({ renderAction, className })`** (L1297-L1312): tooltip-wrapped undo/redo buttons.
- **`ExitZenModeButton({ actionManager, showExitZenModeBtn })`** (L1314-L1330): button executing `actionToggleZenMode`.
- **`ExitViewModeButton({ actionManager })`** (L1332-L1344): pencil-icon button executing `actionToggleViewMode`.

Parity notes: the RTL align-button reordering, the mobile width-budget promotion of duplicate/delete, and the live arrow-type icon derivation are non-obvious behaviors. Selection button single-tap toggles selection↔lasso.

---

### packages/excalidraw/components/ActiveConfirmDialog.tsx

A jotai-atom-driven confirm dialog used for destructive editor actions (currently only "clear canvas").

- **`activeConfirmDialogAtom`** (const, L8): `atom<"clearCanvas" | null>(null)` — global state for which confirm dialog is open.
- **`ActiveConfirmDialog()`** (L10-L36): reads the atom via `useAtom`, grabs the action manager via `useExcalidrawActionManager()`. Returns null when no dialog active. For `"clearCanvas"`, renders `ConfirmDialog` whose `onConfirm` executes `actionClearCanvas` then resets the atom; `onCancel` resets the atom. No local state/refs/effects.

---

### packages/excalidraw/components/App.tsx

The monolithic editor controller (13,053 lines). Defines all React contexts/hooks the editor UI consumes, several module-level mutable singletons (pointer/gesture/panning flags), and the giant `App extends React.Component<AppProps, AppState>` class that owns the `Scene`, `History`, `Store`, `Renderer`, `Fonts`, `ActionManager`, image cache, and every pointer/keyboard/wheel/touch handler. This is THE class a Svelte/Canvas reimplementation must mirror.

#### Module-level contexts, hooks, and singletons (L502-L618)

- **`AppContext` / `AppPropsContext`** (L502-L503): contexts for the App instance (`AppClassProperties`) and its props.
- **`editorInterfaceContextInitialValue`** (L505-L514): default `EditorInterface` (`formFactor:"desktop"`, `desktopUIMode:"full"`, `isTouchScreen:false`, `canFitSidebar:false`, `isLandscape:true`, userAgent descriptor).
- **`EditorInterfaceContext`** (L515-L518).
- **`editorLifecycleEventBehavior`** (L520-L524): const config marking `editor:mount/initialize/unmount` as `cardinality:"once", replay:"last"` for the `AppEventBus`.
- **`ExcalidrawContainerContext`** (L526-L530): `{container, id}`.
- **`ExcalidrawElementsContext`** (L532-L535): readonly element array.
- **`ExcalidrawAppStateContext`** (L537-L544): default AppState w/ zeroed width/height/offsets.
- **`ExcalidrawSetAppStateContext`** (L546-L551), **`ExcalidrawActionManagerContext`** (L553-L556), **`ExcalidrawAPIContext`** (L558-L560), **`ExcalidrawAPISetContext`** (L562-L565).
- Hooks **`useApp`, `useAppProps`, `useEditorInterface`, `useStylesPanelMode` (=`deriveStylesPanelMode(useEditorInterface())`), `useExcalidrawContainer`, `useExcalidrawElements`, `useExcalidrawAppState`, `useExcalidrawSetAppState`, `useExcalidrawActionManager`, `useExcalidrawAPI`** (L567-L586): thin `useContext` wrappers.
- Module-mutable singletons (L588-L618): `didTapTwice`, `tappedTwiceTimer`, `firstTapPosition`, `isHoldingSpace`, `isPanning`, `isDraggingScrollBar`, `currentScrollBars` (`{horizontal,vertical}`), `touchTimeout`, `invalidateContextMenu`, `YOUTUBE_VIDEO_STATES` map, `MAX_EMBEDDABLE_VIEWPORT_SCALE=4`, plain-paste flags, `lastPointerUp`, and `gesture: Gesture` (`{pointers:Map, lastCenter, initialDistance, initialScale}`). These are deliberately module-scope (not class fields) so handlers attached to `window` share them across re-renders.

#### App class fields (L620-L742)

Holds `canvas`/`interactiveCanvas`, `rc: RoughCanvas`, `actionManager`, `editorInterface`, `stylesPanelMode`, `scene: Scene`, `fonts: Fonts`, `renderer: Renderer`, `visibleElements`, `resizeObserver`, `library`, `store: Store`, `history: History`, `files: BinaryFiles`, `imageCache`, `iFrameRefs`, `embedsValidationStatus`, `initializedEmbeds`, `elementsPendingErasure`, `appStateObserver = new AppStateObserver(() => this.state)`, `flowChartCreator`/`flowChartNavigator`, and a battery of `Emitter`s (`onChangeEmitter`, `onPointerDownEmitter`, `onPointerUpEmitter`, `onUserFollowEmitter`, `onScrollChangeEmitter`, `missingPointerEventCleanupEmitter`, `onRemoveEventListenersEmitter`). Cursor/pointer bookkeeping fields: `lastPointerDownEvent`, `lastPointerUpEvent`, `lastPointerUpIsDoubleClick`, `lastPointerMoveEvent`, `lastPointerMoveCoords`, `previousPointerMoveCoords`, `lastViewportPosition`. Trail helpers: `laserTrails`, `eraserTrail`, `lassoTrail`.

#### Lifecycle / API

- **`createExcalidrawAPI(): ExcalidrawImperativeAPI`** (L744-L786): assembles the public imperative API object, wiring `updateScene`, `applyDeltas`, `mutateElement`, history clear, `scrollToContent`, getters, `setActiveTool`, emitters' `.on()` subscriptions, etc.
- **`constructor(props: AppProps)`** (L788-L854): instantiates scene/store/history/renderer/fonts/actionManager/library and the API.
- **`componentDidMount()`** (L3093-L3185): registers all DOM event listeners, ResizeObserver, fonts, initial scene load.
- **`componentWillUnmount()`** (L3186-L3238): tear-down.
- **`componentDidUpdate(prevProps, prevState)`** (L3394-L3556): the reconciliation heartbeat — syncs language, fires `onChange`, flushes `appStateObserver` against `prevState`, updates cursor/scrollbars, recomputes editor interface.
- **`render()`** (L2089-L2445): calls `this.renderer.getRenderableElements({ zoom, offsetLeft/Top, scrollX/Y, width/height, editingTextElement, newElement, selectedElements, ... })` (L2102-L2116) to compute visible elements + `newElementCanvasElement`; sets `shouldBlockPointerEvents` fallback when `setPointerCapture` unsupported (L2121-L2132); renders the container, canvases, LayerUI, and overlays.

#### Coordinate / camera / zoom / scroll math (parity-critical)

- **`getEffectiveGridSize = () => NullableGridSize`** (L1254-L1258): returns `state.gridSize` only when grid mode enabled, else `null`.
- **`getTextCreationGridPoint = (x, y)`** (L1260-L1278): snaps a text-insertion point to the **top-left** grid cell via `Math.floor(coord/gridSize)*gridSize` (not nearest). Returns null when no grid.
- **`zoomCanvas = (value: number)`** (L4317-L4334): zooms about the viewport center `(width/2 + offsetLeft, height/2 + offsetTop)` using `getStateForZoom`, clamping via `getNormalizedZoom`.
- **`scrollToContent(target, opts?)`** (L4338-L4478): resolves string/element/element[] targets (element-link aware, L4373-L4399); for `fitToContent`/`fitToViewport` calls `zoomToFit`, else `calculateScrollCenter`. When `opts.animate`, drives `easeToValuesRAF` with a **custom zoom interpolation `from * Math.pow(to/from, easeOut(progress))`** (geometric, not linear — L4444-L4451) and toggles `shouldCacheIgnoreZoom`. Stores `cancelInProgressAnimation`.
- **`translateCanvas`** (private, L4487-L4493): wrapper around `setState` for user-driven scroll/zoom; cancels animation and unfollows remote user first.
- **`handleWheel`** (L12792-L12867): the wheel/zoom/scroll mux. Bails (only `preventDefault` if Ctrl/Cmd) when target isn't canvas/textarea/iframe/frame-name (L12796-L12811). With Cmd/Ctrl (pinch-zoom): clamps `deltaY` to `MAX_STEP = ZOOM_STEP*100`, `newZoom = zoom - delta/100`, then **amplifies zoom-in steps by `log10(max(1, zoom)) * -sign * min(1, absDelta/20)`** (L12830-L12836) so zooming is faster when already zoomed in, with reduced amplification for small trackpad deltas; zooms about `lastViewportPosition`. Shift+wheel → horizontal scroll `scrollX - (deltaY||deltaX)/zoom`. Plain wheel → `scrollX -= deltaX/zoom; scrollY -= deltaY/zoom`. **Scroll deltas are divided by zoom so panning feels constant in screen space.**
- **`handleCanvasPanUsingWheelOrSpaceDrag(event) => boolean`** (L8250-L8363): space-drag / middle-button / hand-tool / view-mode panning. Sets `isPanning`, grabs cursor, attaches a throttled window `pointermove` that accumulates `deltaX/Y` and pans `scrollX/Y -= delta/zoom` (L8328-L8331). Includes a Linux middle-click paste-prevention hack (L8298-L8326). Teardown restores cursor/`cursorButton` and `savePointer`.
- **`getCanvasOffsets(): {offsetLeft, offsetTop}`** (L12982-L12995): reads container `getBoundingClientRect().left/top`.
- **`updateDOMRect(cb?)`** (L12936-L12976): re-measures container width/height/offsets; only `setState` when changed (avoids render thrash).
- **`getEditorUIOffsets(): Offsets`** (L4706-L4743): computes `{top,right,bottom,left}` insets from toolbar bottom + sidebar/properties-panel rects + 16px padding, **mirrored for RTL** (L4720-L4742).
- **`savePointer(x, y, button)`** (L12904-L12928): converts viewport→scene coords and forwards collaborator pointer to `onPointerUpdate`.

#### Hit testing (hot path)

- **`getElementAtPosition(x, y, opts?)`** (L5970-L6027): returns the topmost hit element. With multiple hits, prefers a selected element if `preferSelected` (L5996-L6002); otherwise checks whether the highest-z element is hit on its *figure* (not just bounding box) using `hitElementItself` with **half the normal threshold** (L6008-L6020) — if only the bbox is hit, falls through to the second-highest element so overlapping shapes resolve precisely.
- **`getElementsAtPosition(x, y, opts?)`** (L6030-L6078): filters non-deleted elements by lock/bound-text options, runs `hitElement`, then drops elements whose containing frame doesn't contain the cursor (when frame clipping enabled, L6055-L6063), and **lifts iframe-likes to the end** so embeddables always hit-test on top (L6064-L6075). Comment marks it a hot path.
- **`getElementHitThreshold(element)`** (L6080-L6088): `max(strokeWidth/2 + 0.1, 0.85 * DEFAULT_COLLISION_THRESHOLD / zoom)`. Comment warns the 0.63 multiplier floor is a hard FP-precision boundary at high zoom — do not lower below 0.63 (here 0.85).
- **`hitElement(x, y, element, considerBoundingBox=true)`** (L6090-L6135): for selected elements with a bbox, tries `hitElementBoundingBox` first; always also tests bound text (`hitElementBoundText`) and the element figure (`hitElementItself`) with frame-name bounds when frame-like.
- **`getTextBindableContainerAtPosition(x, y)`** (L6137-L6179): front-to-back scan (highest z first) for a text-bindable container; arrows tested via `hitElementItself`, others via simple `x1<x<x2 && y1<y<y2` bbox check, skipping frames.
- **`isHittingCommonBoundingBoxOfSelectedElements(...)`** (L8941-L8964), **`isASelectedElement(...)`** (L8937-L8940).

#### Pointer / drag / resize lifecycle

- **`initialPointerDownState(event): PointerDownState`** (L8382-L8449): builds the immutable-ish drag context: `origin` (scene coords), `originInGrid` (grid-snapped unless Cmd/Ctrl or elbow-arrow-only), scrollbar-hit test, `originalElements` map of **deep copies** of every non-deleted element (for resize/undo baselines, L8409-L8414), `resize.center = ((maxX+minX)/2, (maxY+minY)/2)` from `getCommonBounds`, and `hit.hasHitCommonBoundingBoxOfSelectedElements`.
- **`handleCanvasPointerDown(event)`** (L7686-L8145): the master pointer-down router (tool dispatch, selection, panning, scrollbar, text/linear/freedraw/frame/generic element creation).
- **`onPointerMoveFromPointerDownHandler(pointerDownState)`** (L9673-L10563): returns a `withBatchedUpdatesThrottled` move handler. Converts to scene coords (L9680); handles elbow segment dragging, focus-point binding drag, linear midpoint add (uses `flushSync` to read updated state synchronously — L9844-L9855, references PR #5508), grid-snapping via `getGridPoint`, scrollbar-over move, eraser, laser trail, and resize/crop dispatch (L9781-L9790). Initializes `drag.offset` lazily on first move so it reflects post-pointerDown selection state (L9748-L9756).
- **`onPointerUpFromPointerDownHandler(...)`** (L10596-L11590): finalizes drag/resize/box-selection/element creation, binding, frame membership, etc.
- **`handlePointerMoveOverScrollbars(event, pds)`** (L10564-L10595), **`handleDraggingScrollBar(event, pds)`** (L8452-L8491): scrollbar drag (sets `isDraggingScrollBar`, attaches window listeners).
- **`maybeHandleResize(pds, event) => boolean`** (L12558-L12687): the resize/rotate engine. Refuses rotation of frames, transform of elbow arrows, and any resize during crop (L12570-L12579). Computes `resizeX/Y` from `lastCoords - resize.offset` grid-snapped; records per-frame child offsets; applies object snapping (`snapResizingElements`) when not dragging; then calls `transformElements(originalElements, handleType, selectedElements, scene, shouldRotateWithDiscreteAngle, shouldResizeFromCenter, maintainAspectRatio (inverted for images), resizeX, resizeY, center.x, center.y)` (L12653-L12668). **For images, the aspect-ratio modifier key is inverted** (L12661-L12663).
- **`maybeHandleCrop(pds, event) => boolean`** (L12466-L12556): image crop. Grid-snaps the handle position, looks up the natural image dimensions from `imageCache`, applies object snapping, and mutates via `cropElement(el, map, handleType, naturalW, naturalH, x+snap.x, y+snap.y, shiftKey ? origW/origH : undefined)` — Shift locks the original aspect ratio.
- **`maybeDragNewGenericElement(...)`** (L12349-L12465): live resize while drawing a new generic element.
- **`updateGestureOnPointerDown(event)`** (L8365-L8380): records pointers; on the 2nd pointer captures `lastCenter`, `initialScale=zoom`, `initialDistance` for pinch-zoom.
- **`onGestureStart/Change/End`** (L5642-L5703): trackpad pinch-zoom + rotate gestures.

#### Tools, text, elements, images, frames (selected)

- **`setActiveTool(...)`** (L5528-L5608), **`isToolSupported(tool)`** (L5520-L5527), **`setOpenDialog`** (L5609-L5612).
- **`startTextEditing({sceneX, sceneY, insertAtParentCenter, container, autoEdit, initialCaretSceneCoords})`** (L6181-L6365): mounts the WYSIWYG text editor.
- **`getTextWysiwygSnappedToCenterPosition(x, y, appState, container?)`** (L12869-L12902): if a container is given, computes its center (via `getContainerCenter`); if pointer within `TEXT_TO_CENTER_SNAP_THRESHOLD` (Euclidean `Math.hypot`), returns the center snapped to viewport coords — used so click-to-add-text snaps to a shape's center.
- **`createGenericElementOnPointerDown`** (L9510-L9567), **`createFrameElementOnPointerDown`** (L9568-L9600), **`handleTextOnPointerDown`** (L8965-L9008), **`handleFreeDrawElementOnPointerDown`** (L9009-L9067), **`handleLinearElementOnPointerDown`** (L9208-L9491).
- **`insertImages`** (L12010-L12071), **`initializeImage`** (L11680-L11808), **`updateImageCache`** (L11893-L11923), **`addNewImagesToImageCache`** (L11924-L11955), **`scheduleImageRefresh = throttle(...)`** (L11956-L11959, throttled).
- **`getImageNaturalDimensions`** (L11863-L11892), **`getLatestInitializedImageElement`** (L11809-L11823), **`getUncroppedWidthAndHeight`** (imported), **`startImageCropping`/`finishImageCropping`** (L6366-L6381).
- **`eraseElements`** (L11596-L11679), **`restoreReadyToEraseElements`** (L11591-L11595), **`handleEraser`** (L7532-L7546).
- **`handleAppOnDrop`** (L12072-L12197), **`loadFileToCanvas`** (L12198-L12276), **`insertClipboardContent`** (L3695-L3861), **`pasteFromClipboard`** (L3862-L3914), **`addElementsFromPasteOrLibrary`** (L3915-L4068), **`addTextFromPaste`** (L4120-L4245).
- Frame helpers: **`getTopLayerFrameAtSceneCoords`** (L6733-L6810), **`updateFrameToHighlight`** (L6811-L6818), **`maybeUpdateFrameToHighlightOnPointerMove`** (L6819-L6843), **`getFrameNameDOMId`** (L1861), **`renderFrameNames`** (L1920-L2081).
- Embeddables/iframes: **`renderEmbeddables`** (L1550-L1860), **`updateEmbeddables`** (L1515-L1549), **`updateEmbedValidationStatus`** (L1507-L1514), **`insertIframeElement`** (L9068-L9109), **`insertEmbeddableElement`** (L9110-L9162), **`handleIframeLikeElementHover`** (L1286-L1318), **`handleIframeLikeCenterClick`** (L1319-L1469), **`isIframeLikeElementCenter`** (L1485-L1506).

#### State, history, store, scene

- **`syncActionResult = withBatchedUpdates((actionResult) => ...)`** (L2771-L2855): the central applier for `ActionResult` objects from the action manager (elements + appState + storeAction).
- **`updateScene`** (L4570-L4619): public scene replacement with `captureUpdate` semantics (`IMMEDIATELY`/`NEVER`/`EVENTUALLY` undo behavior); schedules a store micro-action.
- **`applyDeltas(deltas, options): [SceneElementsMap, AppState, boolean]`** (L4621-L4640): squashes `StoreDelta`s and applies to fresh copies of elements/appState.
- **`mutateElement(element, updates, informMutation=true)`** (L4642-L4651): delegates to `scene.mutateElement` with `isDragging:false`.
- **`resetScene`** (L2883-L2895), **`resetHistory`** (L2871-L2874), **`resetStore`** (L2875-L2882), **`initializeScene`** (L2896-L3017), **`addMissingFiles`** (L4531-L4568, **re-normalizes SVG data URLs and bumps file version on change**, L4548-L4562), **`addFiles`** (L4520-L4529).
- Getters **`getSceneElementsIncludingDeleted`**, **`getSceneElementsMapIncludingDeleted`**, **`getSceneElements`**, **`onInsertElements`**, **`getName`** (L2446-L2465, L5633-L5641).

#### Keyboard / clipboard / touch

- **`onKeyDown`** (L4746-L5334): the giant keyboard router — tool shortcuts, arrow-key element nudging (`ELEMENT_TRANSLATE_AMOUNT` / `ELEMENT_SHIFT_TRANSLATE_AMOUNT`), space-to-pan (`isHoldingSpace`), grid snapping, flowchart nav, etc.
- **`onKeyUp`** (L5335-L5519), **`onKeyDownFromPointerDownHandler`** (L9649-L9659), **`onKeyUpFromPointerDownHandler`** (L9660-L9672).
- **`onCut`/`onCopy`** (L3589-L3612), **`onTouchStart`/`onTouchEnd`** (L3618-L3694), **`isDoubleClick`** (L1470-L1484), **`isTouchScreenMultiTouchGesture`** (L5626-L5632), **`onTouchMove`/`handleTouchMove`** (L7547-L7550), **`maybeOpenContextMenuAfterPointerDownOnTouchDevices`** (L8208-L8232).
- **`handleCanvasDoubleClick`** (L6406-L6610), **`handleCanvasClick`** (L6611-L6625), **`handleCanvasContextMenu`** (L12277-L12348).
- Static **`resetTapTwice()`** (L3613-L3617): clears the module `didTapTwice` flag (double-tap detection).

#### Bind mode, magic, eyedropper, misc

- **`handleSkipBindMode`** (L927-L1013), **`resetDelayedBindMode`** (L1014-L1033), **`handleDelayedBindModeChange`** (L1034-L1240): the delayed arrow-binding state machine (uses `BIND_MODE_TIMEOUT`).
- **`onMagicFrameGenerate`** (L2546-L2640), **`updateMagicGeneration`** (L2504-L2541), **`onMagicframeToolSelect`** (L2652-L2713), **`setPlugins`** (L2542-L2545), **`onIframeSrcCopy`** (L2641-L2651).
- **`openEyeDropper({type})`** (L2714-L2757), **`dismissLinearEditor`** (L2758-L2770).
- **`refreshEditorInterface`** (L3025-L3054), **`getFormFactor`** (L3018-L3024), **`reconcileStylesPanelMode`** (L3055-L3074), **`setDesktopUIMode`** (L3075-L3082), **`toggleOverscrollBehavior`** (L2082-L2088).
- **`onResize`/`onFullscreenChange`/`onScroll`/`onBlur`/`onUnload`** (L3239-L3260, L3577-L3588, L2856-L2870), **`addEventListeners`/`removeEventListeners`** (L3265-L3393).
- **`getContextMenuItems(type)`** (L12689-L12790): returns the canvas vs element context-menu action arrays (z-index actions only on desktop, L12739-L12748).
- **`refresh`** (L12978-L12980), **`updateLanguage`** (L12999-L13005), **`watchState = () => {}`** (L12997).

#### Test hook (module-level, L13011-L13052)

- **`createTestHook()`** (L13026-L13052): in test/dev env, defines `window.h` with live getters for `elements` (returns `scene.getElementsIncludingDeleted()`; setter calls `scene.replaceAllElements(syncInvalidIndices(...))`) and `scene`. Called immediately at module load (L13052).

Parity summary for App.tsx: the load-bearing math is in zoom (`getStateForZoom` about a viewport anchor; the log10 zoom-step amplification in `handleWheel`; geometric zoom easing in `scrollToContent`), pan (always `delta/zoom` so screen-space speed is constant), grid snapping (`getGridPoint` for most, but `Math.floor`-based top-left snap for text creation), hit-test thresholds (`0.85*COLLISION/zoom`, halved for the top element when overlapping), and the deep-copied `originalElements` baseline that every resize/crop reads from. Selection↔lasso single-tap toggle and the image aspect-ratio key inversion are easy-to-miss behaviors.

---

### packages/excalidraw/components/AppStateObserver.ts

A typed, overloaded subscribe/await utility that fires callbacks (or resolves promises) when `AppState` changes match a selector or predicate — used by the App for "wait until X" flows. No React; plain class.

- **Types (L3-L60)**: `StateChangeSelector` (a key, key[], or `(appState)=>unknown` function), `StateChangePredicateOptions` (`{predicate, callback?, once?}`), `StateChangeArg`, internal `StateChangeListener`, `NormalizedStateChange`, and the heavily-overloaded **`OnStateChange`** call signature — supports key+callback (returns unsubscribe), key-only (returns `Promise<value>`), key[]-variants, selector-fn variants, and predicate-object variants.
- **`class AppStateObserver`** (L62-L208):
  - **`constructor(private readonly getState: () => AppState)`** (L65): stores a live state accessor.
  - **`isStateChangePredicateOptions(propOrOpts): propOrOpts is StateChangePredicateOptions`** (L67-L75): type guard — object, not array, has `"predicate"`.
  - **`subscribe(listener): UnsubscribeCallback`** (L77-L84): pushes a listener; returns a closure that filters it back out.
  - **`normalize(propOrOpts, callback?, opts?): NormalizedStateChange`** (L86-L135): turns any selector form into `{predicate, getValue, callback, once, matchesImmediately}`. For predicate-objects, `matchesImmediately = predicateFn(getState())` is evaluated up front (L110); for fns, predicate is `selector(next)!==selector(prev)`; for arrays, `keys.some(k => next[k]!==prev[k])`; for a single key, `next[key]!==prev[key]`.
  - **`onStateChange: OnStateChange`** (L137-L181): the public API (assigned as a field so `this` is bound). If a callback is given and the predicate already matches, it `queueMicrotask`s the callback (deferred, not sync — L152-L155) and, if `once`, returns a no-op unsubscribe; otherwise subscribes. With no callback it returns a resolved promise (immediate match) or a new promise that resolves once on first match. Side effect: pushes into `this.listeners`.
  - **`flush(prevState: AppState)`** (L183-L203): the driver — called by App on each state change. Iterates listeners, evaluates `predicate(state, prevState)`, fires `callback(getValue(state), state)` on match, and **drops `once` listeners** by rebuilding the array (L194-L201). Early-returns if no listeners.
  - **`clear()`** (L205-L207): empties listeners.

Invariant: `flush` must be called with the *previous* state so key-diff predicates work; immediate-match callbacks are intentionally microtask-deferred to avoid re-entrancy during render.

---

### packages/excalidraw/components/Avatar.tsx

A collaborator avatar chip: shows an image if available, falling back to the name's initial on a colored background.

- **`AvatarProps`** (type, L8-L14): `{ onClick, color, name, src?, className? }`.
- **`Avatar({ color, onClick, name, src, className })`** (L16-L42): functional component. State: `error` (`useState(false)`) tracks image load failure. Computes `shortName = getNameInitial(name)`, `loadImg = !error && src`, and applies `{background: color}` style only when not showing an image (L25-L26). Renders an `<img>` with `referrerPolicy="no-referrer"` and `onError={() => setError(true)}` (so a broken image gracefully degrades to the initial), else the initial text. Event handler: `onClick` passed through to the wrapper div.

---

### packages/excalidraw/components/BraveMeasureTextError.tsx

A static error-message component shown when Brave's aggressive fingerprinting blocks `measureText`, instructing the user how to fix it. Types/logic-free.

- **`BraveMeasureTextError()`** (L3-L41): renders 4 `<p>` blocks via the `Trans` i18n component (keys `errors.brave_measure_text_error.line1..4`), injecting bold spans and links (docs FAQ anchor, GitHub new-issue, Discord). `data-testid="brave-measure-text-error"`. No props, state, or handlers. Default-exported (L43).

---

### packages/excalidraw/components/Button.tsx

A generic design-system button wrapping native `<button>`, adding an `onSelect` callback and a `selected` active state.

- **`ButtonProps`** (interface, L8-L19): extends native button props; adds `type?` (`"button"|"submit"|"reset"`), required **`onSelect: () => any`**, `selected?`, `children`, `className?`.
- **`Button({ type="button", onSelect, selected, children, className="", ...rest })`** (L26-L46): renders a `<button>` whose `onClick` is `composeEventHandlers(rest.onClick, () => onSelect())` — so a passed-through `onClick` runs first, then `onSelect` (L36-L38). Class is `clsx("excalidraw-button", className, { selected })`. Spreads all remaining native props. No internal state/refs.
