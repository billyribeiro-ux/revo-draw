# Excalidraw / Excalidraw+ & Miro — Complete Feature & API Reference

> **Purpose.** An exhaustive reference of what Excalidraw (open source), Excalidraw+ (hosted paid
> tier), and Miro (enterprise SaaS) actually do — every tool, feature, AI capability, integration,
> pricing tier, export format, keyboard shortcut, and developer-facing API — assembled as a spec
> against which a competing infinite-canvas app (e.g. LayoutForge / revo-draw) can be measured.
>
> **Compiled:** 2026-05-30. Pricing and AI-credit figures are time-sensitive (verified against live
> vendor pages on that date). Built via a fan-out / fetch / adversarially-verify research pass over
> primary sources (official docs, GitHub, npm, developer portals). Claims that survived 3-vote
> verification are unanimous (3-0) except the Excalidraw+ base price (2-1). Sources listed at the end.

---

## 0. TL;DR — the two products are different *kinds* of thing

| | **Excalidraw** | **Excalidraw+** | **Miro** |
|---|---|---|---|
| Model | Open source (MIT) | Hosted SaaS on top of OSS | Closed-source enterprise SaaS |
| Core artifact | Hand-drawn-style sketches/diagrams | Same + cloud scenes | Collaborative "boards" (infinite whiteboard) |
| Distribution | npm `@excalidraw/excalidraw`, self-host | excalidraw.com hosted app | miro.com web/desktop/mobile apps |
| Developer surface | Full programmatic React API, open file format | Same as core | REST API v2 + Web SDK v2 + Live Embed + Webhooks (gated to paid/Enterprise) |
| Real-time collab | Basic (E2E-encrypted rooms, self-hostable) | Yes (managed) | Deep, enterprise-grade |
| Positioning | The embeddable open building block | Personal/team hosted sketching | The enterprise collaboration & integration benchmark |

**Strategic read for a competitor:** Excalidraw is the *embeddable open primitive* to match on
developer-experience and file-format openness; Miro is the *feature breadth + integration depth*
benchmark to match on collaboration, AI, and platform extensibility.

---

# PART 1 — EXCALIDRAW (open source core)

## 1.1 What it is

- A **virtual hand-drawn-style whiteboard**. Open source, MIT-licensed.
- Shipped as an npm package: **`@excalidraw/excalidraw`** (v0.18.1 at time of writing), MIT.
- A **client-only React component** — it does **not** support server-side rendering (must be
  dynamically imported / client-gated in SSR frameworks like Next.js).
- Requires **React** (peer dependency). It is a component, not a standalone library you can run headless.
- File format is **open**: `.excalidraw` (scene) and `.excalidrawlib` (library), both plain JSON.

## 1.2 Drawing / canvas tools (the editor)

Core toolset built into the editor:

- **Shapes:** rectangle, diamond (rhombus), ellipse.
- **Lines & arrows:** arrow, line (multi-point; editable points).
- **Arrow binding:** arrows bind to shapes and follow them when moved (live connectors).
- **Freehand drawing:** free-draw / pencil (perfect-freehand based smoothing).
- **Text:** standalone text + text bound inside containers (shapes).
- **Images:** insert raster images (stored as embedded file data in the scene).
- **Frames:** group/region containers.
- **Embeds:** embeddable iframes (validated/rendered via props — see API).
- **Eraser** tool.
- **Selection** tool + **Hand/pan** tool.
- **Laser pointer** (presentation).

Canvas behaviors:

- **Infinite canvas** with **pan** and **zoom** (zoom-to-fit, zoom-to-selection).
- **Undo / redo** (full history stack; clearable via API).
- **Grid mode**, **zen mode**, **view (read-only) mode**.
- **Snapping / alignment**, distribute, align.
- **Layers / z-order:** bring to front/back, forward/backward.
- **Grouping**, locking, duplication.
- **Styling:** stroke color, background/fill, fill style (hachure/cross-hatch/solid), stroke width,
  stroke style (solid/dashed/dotted), sloppiness (roughness), edges (sharp/round), opacity, font
  family (hand-drawn/normal/code), font size, text align, arrowheads, layout.
- **Element linking:** link a canvas element to another scene element or external URL.
- **Live collaboration** trigger (rooms; E2E-encrypted in the hosted app).
- **Command palette** (Cmd/Ctrl-/).
- **Find on canvas** (Cmd/Ctrl-F text search), and a stats panel.
- **Libraries:** import/install reusable shape sets from `libraries.excalidraw.com`.

## 1.3 Export / import formats

- **Export:** PNG, SVG, copy-to-clipboard (PNG/SVG/JSON). Export with background, dark mode,
  scene-embed (embeds scene JSON into the PNG/SVG so it can be re-opened), padding/scale control.
- **Save/Load:** `.excalidraw` JSON scene files; `.excalidrawlib` library files.
- **Programmatic:** all of the above exposed via utility functions (below).

## 1.4 Keyboard shortcuts (high-signal subset)

Open the full in-app cheat sheet with **`Shift + /` (?)** or the **?** button bottom-right.
(Windows shown; on macOS use **Cmd** for Ctrl and **Option** for Alt.)

**Tools**

| Key | Tool | Key | Tool |
|---|---|---|---|
| `V` / `1` | Selection | `A` / `5` | Arrow |
| `H` | Hand (pan) | `L` / `6` | Line |
| `R` / `2` | Rectangle | `P` / `7` | Draw (freehand) |
| `D` / `3` | Diamond | `T` / `8` | Text |
| `O` / `4` (`E`) | Ellipse | `9` | Insert image |
| `F` | Frame | `K` | Laser pointer |
| `Eraser` | `0` / `E` | | |

**Editing & view**

| Action | Shortcut |
|---|---|
| Duplicate | `Ctrl+D` or `Alt+drag` |
| Undo / Redo | `Ctrl+Z` / `Ctrl+Y` (or `Ctrl+Shift+Z`) |
| Edit line/arrow points | `Ctrl+Enter` |
| Group / Ungroup | `Ctrl+G` / `Ctrl+Shift+G` |
| Align (with arrows) | `Ctrl+Shift+ <arrow>` |
| Zoom in / out | `Ctrl++` / `Ctrl+-`; reset `Ctrl+0`; fit `Shift+1` |
| Command palette | `Ctrl+/` |
| Text search on canvas | `Ctrl+F` |
| Create link | `Ctrl+K` |
| Shortcuts dialog | `Shift+/` (`?`) |

## 1.5 Architecture / extension points

- Monorepo on GitHub (`excalidraw/excalidraw`); the publishable package is `@excalidraw/excalidraw`.
- Rendering is **Canvas 2D** with the hand-drawn aesthetic via `roughjs` + `perfect-freehand`.
- The component is **controlled-ish**: you feed `initialData`, react to `onChange`, and drive it
  imperatively through the `excalidrawAPI` callback.
- **No SSR.** Client-only. Self-hostable; the collab server (`excalidraw-room`) is a separate repo.

## 1.6 Programmatic API — three categories: **Props**, **Children Components**, **Utils**

### 1.6.1 Component **Props**

| Prop | Type | Notes |
|---|---|---|
| `initialData` | `object \| null \| Promise<object\|null>` | Scene to load (`elements`, `appState`, `files`, `libraryItems`, `scrollToContent`). |
| `excalidrawAPI` | `(api) => void` | Callback handing you the imperative API object (see §1.6.3). **Replaced the old `ref` in v0.17.0.** |
| `isCollaborating` | `boolean` | Collaboration-mode flag. |
| `onChange` | `(elements, appState, files) => void` | Fires on any update. |
| `onPointerUpdate` | `fn` | Pointer-coordinate changes (used for collab cursors). |
| `onPointerDown` / (via API also up) | `fn` | Pointer press. |
| `onScrollChange` | `fn` | Canvas scroll/pan. |
| `onPaste` | `fn` | Paste into scene (return false to prevent default). |
| `onLibraryChange` | `fn` | Library updated. |
| `onLinkOpen` | `fn` | Element link clicked. |
| `generateLinkForSelection` | `fn` | Override element-link URL generation. |
| `langCode` | `string` | UI language (default `en`). |
| `renderTopRightUI` | `fn` | Inject custom UI top-right. |
| `renderCustomStats` | `fn` | Custom stats panel. |
| `viewModeEnabled` | `boolean` | Read-only. |
| `zenModeEnabled` | `boolean` | Distraction-free. |
| `gridModeEnabled` | `boolean` | Grid on/off. |
| `theme` | `"light" \| "dark"` | Theme. |
| `name` | `string` | Drawing name (used in exports). |
| `UIOptions` | `object` | Customize UI: `canvasActions` (toggle each menu action), `tools` (e.g. disable `image`), `dockedSidebarBreakpoint`, `welcomeScreen`. |
| `detectScroll` | `boolean` | Recompute offsets on ancestor scroll (default true). |
| `handleKeyboardGlobally` | `boolean` | Bind keys to `document` (default false). |
| `autoFocus` | `boolean` | Focus on mount (default false). |
| `generateIdForFile` | `fn` | Override image file-id generation. |
| `validateEmbeddable` | `boolean \| string[] \| RegExp[] \| fn` | Allowlist/validate embed URLs. |
| `renderEmbeddable` | `fn` | Custom iframe/embed renderer. |
| `renderScrollbars` | `boolean` | Scrollbars (default false). |
| `libraryReturnUrl` | `string` | Return URL for library.excalidraw.com installs. |

### 1.6.2 **Children Components** (composable UI slots)

Passed as children to `<Excalidraw>`:

- **`<MainMenu>`** — with `MainMenu.Item`, `MainMenu.ItemLink`, `MainMenu.ItemCustom`,
  `MainMenu.Group`, `MainMenu.Separator`, `MainMenu.DefaultItems.*` (LoadScene, SaveToActiveFile,
  Export, SaveAsImage, Help, ClearCanvas, ToggleTheme, ChangeCanvasBackground, etc.).
- **`<WelcomeScreen>`** — `WelcomeScreen.Center` (Logo, Heading, Menu with Hints/Items),
  `WelcomeScreen.Hints.*` (MenuHint, ToolbarHint, HelpHint).
- **`<Sidebar>`** — custom docked/floating sidebar: `Sidebar.Header`, `Sidebar.Tabs`,
  `Sidebar.Tab`, `Sidebar.TabTriggers`, `Sidebar.TabTrigger`, `Sidebar.Trigger`.
- **`<Footer>`** — custom footer content.
- **`<LiveCollaborationTrigger>`** — the collab button.

### 1.6.3 **`excalidrawAPI`** — imperative methods

| Method | Params | Does |
|---|---|---|
| `updateScene` | `{elements?, appState?, collaborators?, captureUpdate?}` | Mutate the live scene. |
| `updateLibrary` | `{libraryItems, merge?, prompt?, openLibraryMenu?, defaultStatus?}` | Update libraries. |
| `addFiles` | `BinaryFileData[]` | Add image/file blobs to the scene file cache. |
| `resetScene` | `{resetLoadingState?}` | Clear scene. |
| `getSceneElements` | — | Non-deleted elements. |
| `getSceneElementsIncludingDeleted` | — | All elements incl. deleted. |
| `getAppState` | — | Current app state. |
| `getFiles` | — | Files in scene. |
| `getName` | — | Drawing name. |
| `scrollToContent` | `target?, {fitToContent?, animate?, duration?}` | Move viewport to elements. |
| `refresh` | — | Recompute offsets. |
| `setToast` | `{message, closable?, duration?} \| null` | Show toast. |
| `setActiveTool` | `{type, locked?}` | Set active tool. |
| `setCursor` / `resetCursor` | `string` / — | Cursor control. |
| `toggleSidebar` | `{name, tab?, force?}` | Open/close sidebar. |
| `onChange` / `onPointerDown` / `onPointerUp` / `onScrollChange` | callbacks | Subscribe to events (returns unsubscribe). |
| `history.clear` | — | Clear undo/redo. |
| `id` | — | Instance id. |

### 1.6.4 **Utils** (standalone, importable from the package)

**Serialization / load**
- `serializeAsJSON(elements, appState, files, type)` → `.excalidraw` JSON string (drops deleted + transient state).
- `serializeLibraryAsJSON(libraryItems)` → `.excalidrawlib` JSON string.
- `loadFromBlob(blob, localAppState, localElements, fileHandle?)` → restored scene.
- `loadLibraryFromBlob(blob, defaultStatus)` → library.
- `loadSceneOrLibraryFromBlob(blob, …)` → scene or library.

**Export**
- `exportToCanvas({elements, appState, files, getDimensions, maxWidthOrHeight?, exportPadding?})` → `<canvas>`.
- `exportToBlob({…canvas args, mimeType="image/png", quality=0.92})` → `Promise<Blob>`.
- `exportToSvg({elements, appState, exportPadding?, metadata?, files})` → `Promise<SVGSVGElement>`.
- `exportToClipboard({…canvas args, type: "png"|"svg"|"json"})` → copies to clipboard.
- Relevant `appState` export flags: `exportBackground`, `viewBackgroundColor`, `exportWithDarkMode`, `exportEmbedScene`.

**Elements / geometry**
- `isInvisiblySmallElement`, `isLinearElement`, `getNonDeletedElements`, `getFreeDrawSvgPath`.
- `getCommonBounds(elements)` → `[minX, minY, maxX, maxY]`.
- `getSceneVersion(elements)`, `mutateElement`.
- `sceneCoordsToViewportCoords` / `viewportCoordsToSceneCoords`.
- `elementsOverlappingBBox`, `isElementInsideBBox`, `elementPartiallyOverlapsWithOrContainsBBox`.

**Library / i18n / hooks**
- `mergeLibraryItems`, `parseLibraryTokensFromUrl`, `useHandleLibrary` (hook).
- `useEditorInterface` (device/formFactor/touch), `useI18n` (`{langCode, t}`), `defaultLang`, `languages`.

### 1.6.5 **Element Skeleton API** — `convertToExcalidrawElements`

- A high-level authoring API: you describe elements in a terse "skeleton" form (e.g. `{type:"rectangle", x, y, label:{text}}`, `{type:"arrow", start:{id}, end:{id}}`) and
  `convertToExcalidrawElements(skeleton)` expands them into full Excalidraw elements with generated
  ids, bindings, container/label wiring, etc. This is the recommended way to *generate* scenes
  programmatically (used by text-to-diagram / Mermaid import).
- Companion package **`@excalidraw/mermaid-to-excalidraw`** converts Mermaid syntax → skeleton → elements.

### 1.6.6 File-format schema (interop notes)

- `.excalidraw` JSON top level: `{ type:"excalidraw", version, source, elements[], appState{}, files{} }`.
- Each element: `id, type, x, y, width, height, angle, strokeColor, backgroundColor, fillStyle,
  strokeWidth, strokeStyle, roughness, opacity, seed, version, versionNonce, isDeleted, boundElements,
  groupIds, frameId, roundness, link, locked` + type-specific fields (e.g. `points` for linear,
  `text/fontSize/fontFamily/textAlign/containerId` for text, `fileId` for images).
- `files` map: `fileId → {mimeType, id, dataURL, created}` (base64 data URLs embedded).
- `.excalidrawlib`: `{ type:"excalidrawlib", version, libraryItems[] }`.

---

# PART 2 — EXCALIDRAW+ (hosted paid tier)

Excalidraw+ is the **commercial hosted layer** on top of the open-source editor. The base
Excalidraw app stays **free forever**; Excalidraw+ adds cloud, AI, and team features.

## 2.1 Pricing (verified 2026-05-30)

| Plan | Price | Notes |
|---|---|---|
| **Free** | $0 forever | The open editor, local storage. |
| **Plus** | **$6 / user / month billed annually** (**$7 monthly**, ~14% off) | **14-day free trial.** |

> The base-price claim (≈$6/$7) passed verification 2-1 (it has shifted over time and across
> annual/monthly framing); treat the *structure* (annual cheaper than monthly, ~14% off, 14-day
> trial) as solid and re-check the exact number against the live pricing page.

## 2.2 Free vs Plus — what each unlocks

| Capability | Free | Plus |
|---|---|---|
| Infinite canvas, all drawing tools | ✅ | ✅ |
| Scenes (saved canvases) | **1 scene**, local storage | **Unlimited cloud scenes + folders** |
| Cloud storage / sync across devices | ❌ | ✅ |
| **AI** | **Limited** | **Extended — ~100 requests/day** |
| AI: Text-to-diagram | limited | ✅ |
| AI: Wireframe-to-code (diagram→code) | limited | ✅ |
| AI: bring-your-own-key (BYOK) | — | ✅ |
| Export PNG / SVG / JSON / shareable links | ✅ | ✅ |
| Export **PDF / PPTX** | ❌ | ✅ |
| **Real-time collaboration** | basic rooms | ✅ managed |
| Invite via link, view-only sharing | — | ✅ |
| Voice + screen-share | — | ✅ |
| Comments | — | ✅ |
| Live presentations / present mode | — | ✅ |

## 2.3 Excalidraw+ AI features (detail)

- **Text-to-diagram:** natural-language prompt → diagram (via Mermaid/skeleton pipeline).
- **Wireframe-to-code:** turn a drawn wireframe into front-end code.
- **Diagram-as-code / Mermaid import.**
- **BYOK:** supply your own model API key.
- **Rate limit:** ~**100 AI requests/day** on Plus (free tier is materially more limited).

---

# PART 3 — MIRO

## 3.1 What it is

Closed-source enterprise collaboration SaaS — an "innovation workspace" built on an infinite
collaborative whiteboard ("board"). Web, desktop, and mobile apps. Three commercial tiers (plus
a free tier): **Free → Business (+ AI Workflows) → Enterprise**.

## 3.2 Pricing & tiers (verified 2026-05-30)

| Tier | Price | Headline limits / unlocks |
|---|---|---|
| **Free** | $0 | Unlimited members; **3 editable boards**; 5,000+ (now 7,000+) templates; 160+ (now 250+) integrations (Zoom, Slack, Google Drive, Sketch, etc.); **~10 AI credits**. |
| **Business** (a.k.a. Business + AI Workflows) | **$20 / member / month billed annually** ($25 monthly) | **Unlimited boards**; 3,900+ advanced shapes (UML, AWS, Azure, GCP, ERD), **Mermaid** diagrams; **bi-directional sync** with Jira / Azure DevOps / Asana; **Miro MCP** server; **~50 AI credits**; **AI Workflows** (Sidekicks + Flows); private boards; advanced diagramming. |
| **Enterprise** | Custom (from **30 members**) | Everything in Business + **REST APIs, Web SDKs, Enterprise APIs**, **SCIM** provisioning, **SSO (SAML)**, **2FA**, **data residency** (EU base; US/AU as paid add-ons), advanced security/governance (Enterprise Guard), audit logs, centralized admin. |

> Caveats: AI-credit numbers and integration/template counts drift; "Business" is currently branded
> "Business + AI Workflows"; US/AU data residency are paid Enterprise add-ons.

## 3.3 Miro feature catalog (non-developer)

**Canvas & visual**
- Infinite canvas; **frames**; drawing/pen tools; sticky notes; shapes; text; tables; images;
  documents (**Miro Docs**); embeds.
- **Smart diagramming:** 3,900+ shapes incl. UML, AWS, Azure, GCP, ERD; auto-layout; connectors;
  **Mermaid** text-to-diagram; flowcharts; org charts; **mind maps**; wireframing.
- **Customer-journey maps**, roadmaps, **Kanban** boards.

**Planning / structured work**
- **Planner / Timeline** (project scheduling), **Tables**, **Goals**, **Portfolios**, roadmaps,
  estimation.

**Collaboration**
- Real-time multi-cursor presence; **comments**; **@mentions**; **video chat**; **voting**;
  **timer**; **Spotlight / attention management** (bring everyone to your view).
- **Interactive presentations / slides** (turn a board into a deck).
- **Talktrack:** record async interactive video walkthroughs of a board (clickable hotspots).
- **Workshops:** live facilitation kit (timer + voting + tools).

**Templates & content**
- **7,000+ templates** spanning brainstorming, agile ceremonies, design, strategy, research.

**AI (Miro AI / Miro Assist)**
- **AI sticky notes** (generate notes), **AI clustering** (auto-group), **AI synthesis** (themes +
  action items / summaries of dense boards), **text-to-diagram**, **image generation**,
  **summarize board**, **custom diagram/framework generation** from existing work.
- **AI Sidekicks** (role-specific AI personas) and **AI Flows / AI Workflows** (multi-step
  automations) — Business tier. AI usage metered in **AI credits** (≈10 free / ≈50 Business).
- **Miro MCP** server (Business+) — exposes Miro to AI agents/LLMs via Model Context Protocol.

**Integrations**
- **250+ apps** (Jira, Asana, Slack, Figma, Microsoft Teams, Confluence, Google Workspace, Zoom,
  Notion, Azure DevOps, etc.). **Bi-directional Jira/Azure DevOps/Asana cards** (Business+).

**Security / governance (Enterprise)**
- SSO/SAML, SCIM, 2FA, data residency, Enterprise Guard, DLP/eDiscovery, audit logs, centralized admin.

## 3.4 Miro developer platform

Two complementary surfaces (you usually combine them): **Web SDK** runs *inside* the board (a
custom app/panel manipulating the live canvas); **REST API** runs *outside* (server-to-server CRUD
on boards/items). Plus **Live Embed**, **Webhooks**, and **OAuth 2.0**.

### 3.4.1 Web SDK v2 (root `window.miro`)

**Board / items — `miro.board.*`**
- **Create:** `createShape`, `createStickyNote`, `createText`, `createCard`, `createAppCard`,
  `createConnector`, `createFrame`, `createImage`, `createEmbed`, `createPreview`, `createTag`,
  `createMindmapNode` (experimental).
- **Read/query:** `get()` (all/filtered items), `getById()`, `getSelection()`, `getInfo()` (board metadata).
- **Mutate/persist:** every item exposes `.sync()` to persist property changes; `remove()` to delete.
- **Z-order:** `bringToFront()`, `sendToBack()`.
- **Selection:** `select()`, `deselect()`.
- **Users:** `getUserInfo()`, `getOnlineUsers()`.
- **App data (board-scoped KV):** `setAppData()`, `getAppData()`; collection-based key-value
  **storage** with change listeners.
- `findEmptySpace()` (experimental) — find free placement region.

**Viewport — `miro.board.viewport.*`**
- `get()`, `set()`, `zoomTo()`, `getZoom()`, `setZoom()`.

**UI — `miro.board.ui.*`**
- `openModal()` / `closeModal()`, `openPanel()` / `closePanel()`, `canOpenModal()`, `canOpenPanel()`.
- `on(event, handler)` for UI events: **`icon:click`** (toolbar/app icon), **`selection:update`**, etc.

**Events / collaboration / experimental**
- `miro.board.events.on(...)` — item lifecycle (`items:create`, etc.).
- `miro.board.collaboration` — collaborative features.
- `miro.board.experimental` — preview APIs (mind-map nodes, bulk ops, etc.).

**App surfaces (how a Web SDK app shows up):** custom toolbar icon → opens a **panel** (sidebar
iframe) or **modal**; **app cards** as interactive board items; **app panels** for settings/content.

### 3.4.2 REST API v2 (`https://api.miro.com/v2`)

Auth: **OAuth 2.0** authorization-code flow, scope-based; `Authorization: Bearer <token>`,
`Accept`/`Content-Type: application/json`. Token context via `GET /api/v2/access-token-context`;
revoke via `POST /api/v2/revoke-token`.

**Boards** — `/boards`
- `POST /boards` create · `GET /boards` list (requires `team_id`) · `GET /boards/{id}` ·
  `PATCH /boards/{id}` update (name/description/policies/team) · `DELETE /boards/{id}` ·
  `POST /boards/{id}/copy` duplicate.

**Items (generic)** — `/boards/{id}/items`
- `GET` all (filter `?type=`) · `GET /{itemId}` · `DELETE /{itemId}`.

**Type-specific item endpoints** (each supports create/get/update/delete):
- `/app-cards`, `/cards`, `/connectors`, `/documents` (from `documentUrl`), `/embeds` (`previewUrl`),
  `/frames`, `/images` (`imageUrl`), `/shapes`, `/sticky_notes`, `/texts`.
- **Connectors:** `startItem`/`endItem` + `shape` (straight / elbowed / curved).

**Tags / Groups** — `/tags` (create/manage, attach to items); item grouping.

**Board members & sharing** — `/boards/{id}/members`
- `POST` share by email + role · `GET` list · `GET /{memberId}` · `PATCH` role · `DELETE`.

**Org / Teams (Enterprise)** — `/orgs/{orgId}/teams`
- Team CRUD; `POST/GET /{teamId}/members`, `GET/PATCH/DELETE /{teamId}/members/{memberId}`.

**Enterprise extras**
- **Board exports** (async export jobs), **Organizations**, **Audit logs** (`/audit-logs`,
  cursor-based pagination, `ASC`/`DESC`), **SCIM** provisioning.

**Webhooks** — subscribe to real-time board/item-change notifications.

**Experimental** — **Mind maps** (nodes), **Bulk operations** (batch item create/update).

**v2 vs v1 changes to note:** polymorphic Widget API replaced by **type-specific endpoints**;
connectors no longer separate "connections"; field renames (`text`→`content`, `shapeType`→`shape`);
cursor-based pagination in audit logs.

**Rate limits:** documented as enforced (credit/level-based per endpoint); not enumerated on the
overview page — check the live reference per endpoint.

### 3.4.3 Other developer extension points
- **Live Embed SDK** — embed an interactive Miro board in your own product.
- **App Marketplace** — distribute apps publicly; install across teams.
- **OAuth scopes** gate every capability (boards:read/write, etc.).

---

# PART 4 — Side-by-side & competitor implications (LayoutForge / revo-draw)

| Dimension | Excalidraw (+) | Miro | What a competitor must decide |
|---|---|---|---|
| Openness | Open source, open file format | Closed | Open `.lfdoc`/JSON format is already a differentiator vs Miro; matches Excalidraw's strength. |
| Aesthetic | Hand-drawn (rough.js) | Clean/precise | Pick a lane; semantic-layout app likely wants precise. |
| Canvas tech | Canvas 2D, hand-rolled | Proprietary | Hand-rolled Canvas 2D (LayoutForge's approach) is viable — Excalidraw proves it. |
| Programmatic API | Rich, documented, React | Web SDK + REST | An embeddable component API + open format is the high-leverage moat. |
| Collaboration | Basic→managed | Best-in-class | Hardest to match; local-first single-user (LayoutForge) sidesteps this deliberately. |
| AI | text→diagram, wireframe→code | broad (sidekicks/flows/MCP) | text→diagram and "export a spec for an LLM" is a credible wedge. |
| Export | PNG/SVG/JSON/PDF/PPTX | board exports, integrations | LayoutForge's **Markdown-spec export** is a novel third category neither fully owns. |
| Extensibility | children components, props, utils | apps/panels/marketplace | Component-level slots (à la Excalidraw children) are cheaper to ship than a marketplace. |

**Net:** match **Excalidraw** on *open format + clean programmatic/embed API*; treat **Miro** as the
*aspirational feature/integration ceiling* (collaboration, AI breadth, app platform) rather than a
near-term parity target — especially for a deliberately **local-first, single-user** product.

---

## Sources (primary unless noted)

**Excalidraw / Excalidraw+**
- https://plus.excalidraw.com/pricing
- https://plus.excalidraw.com/plus
- https://github.com/excalidraw/excalidraw
- https://www.npmjs.com/package/@excalidraw/excalidraw
- https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api
- https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/props
- https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/props/excalidraw-api
- https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/utils
- https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/utils/export
- https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/excalidraw-element-skeleton
- https://docs.excalidraw.com/docs/@excalidraw/excalidraw/integration
- https://deepwiki.com/excalidraw/excalidraw/10.2-component-props-and-api *(secondary)*
- Keyboard shortcuts: https://csswolf.com/excalidraw-keyboard-shortcuts-pdf/ , https://www.solomonsignal.com/launch-school/tutorials/excalidraw-keyboard-shortcuts *(secondary; cross-checked with in-app `?` dialog)*

**Miro**
- https://miro.com/pricing/
- https://miro.com/features/
- https://developers.miro.com/
- https://developers.miro.com/docs/web-sdk-reference-guide
- https://developers.miro.com/docs/rest-api-reference-guide
- https://developers.miro.com/docs/miro-web-sdk-vs-rest-apis
- https://developers.miro.com/docs/app-panels-and-modals
- https://developers.miro.com/docs/app-card-use-cases
- https://github.com/Avi-141/excalidraw-to-miro *(secondary; interop reference)*

> **Open items deliberately not fully enumerated** (would need per-endpoint deep dives): complete
> Miro REST endpoint request/response schemas + exact rate-limit numbers; full Miro OAuth scope list;
> exhaustive Miro template catalog; exact current Excalidraw+ price and AI-credit-to-action mapping.
> Re-verify all pricing/credit figures against live pages before relying on them — they drift.
