## Cluster: excalidraw__(root)__2

This cluster contains the package's public entry points (`index.tsx`, `index-node.ts`), two trail/animation helpers tied to the laser-pointer and mermaid features, a runtime polyfill module, and two ambient type-declaration files.

---

### packages/excalidraw/index-node.ts

Purpose: A standalone Node.js script (not a library export) demonstrating headless server-side PNG rendering of Excalidraw elements using the `node-canvas` package.

- Top-level script body — no exported functions/classes.
  - Imports `getDefaultAppState` (from `./appState`) and `exportToCanvas` (from `./scene/export`), and `require`s Node's `fs` and the `canvas` npm package (`registerFont`, `createCanvas`). L1-L6.
  - Defines a hard-coded `elements` array of three element-like literals (a `diamond`, an `ellipse`, and a `text` element "test"), each carrying raw geometry (`x/y/width/height`), stroke/fill style, `roughness`, `opacity`, and a `seed`. The text element also has `text`, `font: "20px Virgil"`, and `baseline: 22`. L8-L57.
  - Registers two fonts from `./public/*.woff2` (Virgil, Cascadia) into node-canvas. L59-L60.
  - Calls `exportToCanvas(elements as any, {...getDefaultAppState(), offsetTop:0, offsetLeft:0, width:0, height:0}, {} /* files */, { exportBackground: true, viewBackgroundColor: "#ffffff" }, createCanvas)` — note it passes `createCanvas` as the 5th `createCanvasFn` argument so the export pipeline uses node-canvas instead of a DOM `<canvas>`. L62-L77.
  - Streams the resulting canvas to `test.png` via `(canvas as any).createPNGStream().pipe(out)` and logs on `finish`. L79-L84.
  - Performance/coord note: this is the parity reference for the headless export path — geometry is consumed in element/world space and the AppState's `offset*`/`width`/`height` are zeroed so export bounds are computed purely from element extents.

---

### packages/excalidraw/index.tsx

Purpose: The main public entry point of `@excalidraw/excalidraw` — defines the memoized `<Excalidraw>` wrapper component, an API-provider context wrapper, the host-facing `useExcalidrawStateValue` hook, and re-exports the entire public API surface.

- `polyfill()` — invoked at module top level (L43) to install Array/Element polyfills before anything else runs (imported from `./polyfill`).

- `ExcalidrawAPIProvider = ({ children }: { children: React.ReactNode }) => JSX` — L50-L63.
  - Stateless context wrapper that lets `useExcalidrawAPI()` (and the hooks built on it) work *outside* the `<Excalidraw>` tree.
  - Owns local state `[api, setApi]` (`ExcalidrawImperativeAPI | null`, initial `null`) via `useState`. L55.
  - Renders nested `ExcalidrawAPIContext.Provider value={api}` over `ExcalidrawAPISetContext.Provider value={setApi}`. L56-L62.

- `ExcalidrawBase = (props: ExcalidrawProps) => JSX` — L65-L230. The real implementation behind the memoized export.
  - Destructures ~40 props off `ExcalidrawProps` including defaults: `isCollaborating = false`, `langCode = defaultLang.code`, `detectScroll = true`, `handleKeyboardGlobally = false`, `autoFocus = false`. L66-L106.
  - Builds a normalized `UIOptions` object: merges `DEFAULT_UI_OPTIONS.canvasActions` with caller's `canvasActions`, and forces `tools.image = props.UIOptions?.tools?.image ?? true`. L108-L121. (Comment at L110-L111 flags this as a FIXME because doing the normalization here breaks the memo resolver's same-value comparison.)
  - If `canvasActions?.export` is set, resolves `export.saveFileToDisk` from caller value or default. L123-L127.
  - If `UIOptions.canvasActions.toggleTheme === null && theme === undefined`, sets `toggleTheme = true`. L129-L134.
  - Builds `normalizedImageOptions` from `imageOptions` falling back to `DEFAULT_IMAGE_OPTIONS.maxFileSizeBytes` / `maxWidthOrHeight`. L136-L141.
  - Refs/context: reads `setExcalidrawAPI` from `ExcalidrawAPISetContext` (L143); keeps `onExcalidrawAPIRef` (a `useRef`) always pointing at the latest `onExcalidrawAPI` callback (L145-L146).
  - `handleExcalidrawAPI = useCallback((api) => { setExcalidrawAPI?.(api); onExcalidrawAPIRef.current?.(api); }, [setExcalidrawAPI])` — fans the API object out to both the context setter and the host callback. L148-L154.
  - Mount `useEffect` (L156-L179): (a) dynamically imports `canvas-roundrect-polyfill` (async, fire-and-forget); (b) registers a non-passive `touchmove` listener `handleTouchMove` that calls `event.preventDefault()` when `event.scale` is a number `!== 1` — this blocks iOS pinch-zoom outside the content area; (c) cleanup removes the listener. Empty dep array → runs once.
  - Renders `EditorJotaiProvider store={editorJotaiStore}` → `InitializeApp langCode theme` → `App {...}` wired with all the forwarded props, `onExcalidrawAPI={handleExcalidrawAPI}`, `UIOptions` (normalized), `aiEnabled={aiEnabled !== false}` (defaults true), `imageOptions={normalizedImageOptions}`, and `{children}`. L181-L229.

- `areEqual = (prevProps: ExcalidrawProps, nextProps: ExcalidrawProps): boolean` — L232-L302. Custom `React.memo` comparator.
  - Short-circuits `false` if `children` references differ. L233-L236.
  - Strips `initialData`, `UIOptions` (default `{}`), `imageOptions` out of both prop objects into `prev`/`next` rest. L238-L249.
  - Compares `UIOptions`: returns false if key counts differ (L259-L261); otherwise `every` key must match — `getFormFactor` is always treated equal (functions); `canvasActions` is compared key-by-key, and for the `export` sub-key only `saveFileToDisk` is compared by reference. L263-L289.
  - Compares `imageOptions` by resolving each of `maxWidthOrHeight`/`maxFileSizeBytes` against defaults and `===`. L291-L299.
  - Returns `isUIOptionsSame && isImageOptionsSame && isShallowEqual(prev, next)`. Note `initialData` is deliberately excluded from comparison (intentional: it is only consumed on first render). L301.

- `export const Excalidraw = React.memo(ExcalidrawBase, areEqual)` with `displayName = "Excalidraw"`. L304-L305.

- Re-export block (L307-L420): re-exports the public API from internal modules and sibling packages, including (selected) `getSceneVersion`, `hashElementsVersion`, `hashString`, `getNonDeletedElements`, `getTextFromElements`, `isInvisiblySmallElement` (from `@excalidraw/element`); `defaultLang`, `useI18n`, `languages` (from `./i18n`); `restoreAppState/restoreElement/restoreElements/restoreLibraryItems` (`./data/restore`); `reconcileElements` (`./data/reconcile`); `exportToCanvas/exportToBlob/exportToSvg/exportToClipboard` (`@excalidraw/utils/export`); `serializeAsJSON/serializeLibraryAsJSON` (`./data/json`); `loadFromBlob/loadSceneOrLibraryFromBlob/loadLibraryFromBlob` (`./data/blob`); `mergeLibraryItems/getLibraryItemsHash` (`./data/library`); constants/utils `FONT_FAMILY/THEME/MIME_TYPES/ROUNDNESS/DEFAULT_LASER_COLOR/UserIdleState/normalizeLink/sceneCoordsToViewportCoords/viewportCoordsToSceneCoords/getFormFactor/throttleRAF` (`@excalidraw/common`); `mutateElement/newElementWith/bumpVersion/CaptureUpdateAction` (`@excalidraw/element`); `parseLibraryTokensFromUrl/useHandleLibrary` (`./data/library`); components `Sidebar/Button/Footer/MainMenu/Ellipsify/WelcomeScreen/LiveCollaborationTrigger/Stats/DefaultSidebar/TTDDialog/TTDDialogTrigger/TTDStreamFetch/DiagramToCodePlugin/CommandPalette`; hooks `useEditorInterface/useStylesPanelMode/useExcalidrawAPI` and `ExcalidrawAPIContext`; bounds helpers `getCommonBounds/getVisibleSceneBounds/convertToExcalidrawElements` (`@excalidraw/element`), `elementsOverlappingBBox/isElementInsideBBox/elementPartiallyOverlapsWithOrContainsBBox` (`@excalidraw/utils/withinBounds`); `zoomToFitBounds` (`./actions/actionCanvas`); `getDataURL` (`./data/blob`); `isElementLink/isLinearElement` (`@excalidraw/element`); `Fonts` (`./fonts/Fonts`); `setCustomTextMetricsProvider` (`@excalidraw/element`); chart parsing `renderSpreadsheet/tryParseSpreadsheet/isSpreadsheetValidForChartType` (`./charts`); plus the `TTDPersistenceAdapter/SavedChat/SavedChats` types.

- `useExcalidrawStateValue(...)` — L433-L449, with three overload signatures (L433-L441):
  - Overload 1 `(prop: K extends keyof AppState): AppState[K] | undefined`.
  - Overload 2 `(props: T[]): AppState | undefined`.
  - Overload 3 `<T>(selector: (appState: AppState) => T): T | undefined`.
  - Implementation delegates to internal `_useAppStateValue(selector as any, false)` — the trailing `false` is the "require API ready" flag, so the host hook can return `undefined` during the first render before the API is wired. L442-L449.
  - Invariant noted in the comment block (L422-L432): `prop`/`selector` is memoized and will NOT change after the first render.

- `export { _useOnAppStateChange as useOnExcalidrawStateChange }` — re-exports the appState-change subscription hook under a public name. L452.

---

### packages/excalidraw/laserTrails.ts

Purpose: Implements `LaserTrails`, the controller that renders the local user's laser-pointer trail plus per-collaborator laser trails on the interactive SVG overlay, with time/length-based opacity decay.

- `class LaserTrails implements Trail` — L12-L135.
  - Fields: `public localTrail: AnimatedTrail`; `private collabTrails = new Map<SocketId, AnimatedTrail>()`; `private container?: SVGSVGElement`. L13-L15.
  - `constructor(private app: App)` — creates `localTrail` with `getTrailOptions()` spread plus `fill: () => DEFAULT_LASER_COLOR`. L17-L22.

  - `private getTrailOptions(): Partial<LaserPointerOptions>` — L24-L43. Returns shared trail config:
    - `simplify: 0`, `streamline: 0.4`.
    - `sizeMapping: (c) => number` — the decay math (L28-L41): `DECAY_TIME = 1000` ms, `DECAY_LENGTH = 50`. Computes `t = max(0, 1 - (performance.now() - c.pressure) / DECAY_TIME)` (time-based fade where `c.pressure` is repurposed as a creation timestamp) and `l = (DECAY_LENGTH - min(DECAY_LENGTH, c.totalLength - c.currentIndex)) / DECAY_LENGTH` (position-along-trail fade), then returns `Math.min(easeOut(l), easeOut(t))`. Notable: the laser trail fades both by age and by distance from the trail head, taking the minimum of the two eased values.

  - `startPath(x: number, y: number): void` — delegates to `localTrail.startPath`. L45-L47.
  - `addPointToPath(x: number, y: number): void` — delegates to `localTrail.addPointToPath`. L49-L51.
  - `endPath(): void` — delegates to `localTrail.endPath`. L53-L55.
  - `start(container: SVGSVGElement)` — stores `container` and starts `localTrail` in it. L57-L60.
  - `stop()` — stops `localTrail`, calls `stopCollabTrails()` (no arg → removes all), clears `container`. L62-L66.

  - `private stopCollabTrails(collaborators?: App["state"]["collaborators"])` — L68-L77. Iterates `collabTrails`; for any keyed socket not present in the passed `collaborators` map, stops that trail and deletes it from the map. With no argument, every collab trail is removed (since `collaborators?.get` is `undefined`).

  - `updateCollabTrails(collaborators: App["state"]["collaborators"])` — L79-L134. Per-frame reconciliation of remote laser trails:
    - First prunes departed collaborators via `stopCollabTrails(collaborators)`. L80.
    - Bails out early if there's no `container` or `collaborators.size === 0`. L82-L84.
    - For each collaborator: skips `isCurrentUser` (their trail is `localTrail`). L86-L90.
    - Lazily creates a new `AnimatedTrail` for unseen sockets with `fill: () => collaborator.pointer?.laserColor || getClientColor(key, collaborator)`, starts it in `container`, and stores it. L95-L106.
    - If the collaborator's pointer tool is `"laser"`: reads `buttonDown`/`buttonUp` from `collaborator.button` and `hasTrail = trail.hasCurrentTrail`. L108-L112.
      - On button-down with no existing trail → `startPath(pointer.x, pointer.y)`. L113-L116.
      - Adds a point only if it's not a duplicate of the last point (`!trail.hasLastPoint(...)`) while button is down. L118-L125.
      - On button-up with an existing trail → adds the final point and `endPath()`. L127-L131.
  - Coord note: all `x/y` here are pointer coordinates in the collaborator's shared/scene space as received over the network; the AnimatedTrail/SVG layer handles the screen transform.

---

### packages/excalidraw/mermaid.ts

Purpose: A single heuristic to guess whether a pasted/typed string is a mermaid diagram definition.

- `isMaybeMermaidDefinition = (text: string): boolean` — L2-L33.
  - Holds a list of 19 known mermaid `chartTypes` (flowchart, graph, sequenceDiagram, classDiagram, stateDiagram, stateDiagram-v2, erDiagram, journey, gantt, pie, quadrantChart, requirementDiagram, gitGraph, C4Context, mindmap, timeline, zenuml, sankey, xychart, block). L3-L24.
  - Dynamically builds a `RegExp` that optionally allows a leading `%%{...}%%` directive, then a word-boundary match against any chart type, each optionally followed by `-beta`: `^(?:%%{.*?}%%[\s\n]*)?\b(?:\s*flowchart(-beta)?|...)\b`. L26-L30.
  - Returns `re.test(text.trim())`. L32. Pure function, no side effects.

---

### packages/excalidraw/polyfill.ts

Purpose: Installs runtime polyfills for newer Array/Element methods so the editor (and especially the test environment) works on older runtimes; exported as a default function called once at app entry.

- `polyfill = (): void` (default export) — L1-L121. Guards each install behind a feature-presence check, defining methods as non-enumerable, writable, configurable own properties:
  - `Array.prototype.at(n)` — L2-L24. Implements relative indexing: `n = Math.trunc(n) || 0`; if `n < 0` add `this.length`; OOB returns `undefined`; else `this[n]`.
  - `Array.prototype.findLast(predicate, thisArg?)` — L26-L44. Reverses a shallow copy and `find`s, mapping the reversed index back to the original index (`this.length - index - 1`) when calling the predicate.
  - `Array.prototype.findIndex(predicate, thisArg?)` — L46-L65. Forward loop returning the first matching index or `-1`.
  - `Array.prototype.findLastIndex(predicate, thisArg?)` — L67-L87. Reverses a copy, `findIndex`s with original-index remapping, then converts back to the original index (`this.length - index - 1`), or `-1`.
  - `Array.prototype.toReversed()` — L89-L98. Returns `this.slice().reverse()` (non-mutating).
  - `Array.prototype.toSorted(compareFn?)` — L100-L112. Returns `this.slice().sort(compareFn)` (non-mutating).
  - `Element.prototype.replaceChildren(...nodes)` — L114-L119. Clears `innerHTML` then `append(...nodes)`.
  - Side effects: mutates global `Array.prototype` / `Element.prototype`. `eslint-disable` is set at L4 because it patches prototypes.

---

### packages/excalidraw/pwacompat.d.ts

Purpose: Ambient module declaration only — no runtime code, no functions.

- `declare module "pwacompat";` (L1) — lets TypeScript import the untyped `pwacompat` package without error.

---

### packages/excalidraw/react-app-env.d.ts

Purpose: Ambient triple-slash type reference only — no runtime code, no functions.

- `/// <reference types="react-scripts" />` (L1) — pulls in the Create-React-App / `react-scripts` ambient types (e.g. for asset imports and `process.env`).
