## Audit: footer-zoom

Scope: bottom-left zoom (%/+/−) + undo/redo island cluster. Compared OUR web shell footer
(`src/routes/+page.svelte` lines 564–612, styles 752–832) against Excalidraw's `Footer.tsx`,
`Actions.tsx` (ZoomActions/UndoRedoActions), `actionCanvas.tsx` (zoomIn/zoomOut/resetZoom) and
`actionHistory.tsx` (undo/redo) plus `styles.scss`/`theme.scss`.

### Matchable findings

| Title | Severity | Our ref | Excal ref | Proposed fix |
|---|---|---|---|---|
| Zoom-out button never disabled at MIN_ZOOM | behavior | `src/routes/+page.svelte:566-573` | `actionCanvas.tsx:205` (`disabled={appState.zoom.value <= MIN_ZOOM}`) | Bind `disabled={editor.zoomPercent <= 5}` (our MIN_ZOOM 0.05 from `camera.svelte.ts:23`) so the control greys out at the floor — `.x-icon-btn:disabled` (line 769) already styles it. Add a derived in the script: `const atMinZoom = $derived(zoomPct <= 5)`. |
| Zoom-in button never disabled at MAX_ZOOM | behavior | `src/routes/+page.svelte:582-589` | `actionCanvas.tsx:164` (`disabled={appState.zoom.value >= MAX_ZOOM}`) | Bind `disabled={zoomPct >= 800}` (our MAX_ZOOM 8 from `camera.svelte.ts:24`) so the in-button greys out at the ceiling. |
| Reset-zoom button is disabled-styled-as-active even at 100% — fine, but no `disabled` at 100% | cosmetic | `src/routes/+page.svelte:574-581` | `actionCanvas.tsx:239-252` (reset is always enabled in Excalidraw) | No change needed for parity — Excalidraw keeps reset enabled at 100% too. (Listed only to confirm our behavior matches; not a defect.) |
| Undo/redo tooltips include shortcut text; Excalidraw shows label only | cosmetic | `src/routes/+page.svelte:595,604` (`title="Undo  ⌘Z"`, `title="Redo  ⇧⌘Z"`) | `Actions.tsx:1306,1309` wrap with `<Tooltip label={t("buttons.undo")}>` and the ToolButton has NO `title` → tooltip is just "Undo"/"Redo" | For exact parity drop the shortcut: `title="Undo"` / `title="Redo"`. (Borderline — our richer tooltip is arguably better UX; treat as low-priority.) |
| Zoom tooltip shortcut uses bare `⌘−`/`⌘+`; Excalidraw renders the full `Ctrl/Cmd` chord | cosmetic | `src/routes/+page.svelte:568,584` | `actionCanvas.tsx:162,203` (`${t("buttons.zoomIn")} — ${getShortcutKey("CtrlOrCmd++")}`) | Excalidraw uses an em-dash separator " — " before the shortcut. Match the separator: `title="Zoom out — ⌘−"` / `title="Zoom in — ⌘+"`. The current two-space separator diverges from the consistent " — " pattern used across Excalidraw button titles. |
| Zoom reset `aria-label` is verbose; Excalidraw uses the plain label | a11y | `src/routes/+page.svelte:577` (`aria-label="Reset zoom to 100%"`) | `actionCanvas.tsx:245` (`aria-label={t("buttons.resetZoom")}` → "Reset zoom") | Set `aria-label="Reset zoom"` to match Excalidraw's screen-reader text exactly. (Minor; our version is more descriptive.) |
| Zoom + undo/redo are two side-by-side Islands; Excalidraw stacks them vertically in one footer-left column | visual | `src/routes/+page.svelte:564-611` (two sibling `.x-island`: `.zoom-island` then `.undo-island`, `.x-bottom` is `display:flex; gap` horizontal) | `Footer.tsx:37-53` + `Actions.tsx:1288-1294` (`Stack.Col gap={2}` → ZoomActions row on top, UndoRedoActions row below) | Excalidraw renders zoom as one row and undo/redo as a second row **beneath** it (a vertical Stack.Col, gap 2), both inside the footer-left. Our horizontal two-island layout is a deliberate compaction; if strict parity is wanted, change `.x-bottom` to `flex-direction: column; align-items: flex-start` and the undo island sits under the zoom island. (Recommend keeping ours — flag only.) |
| Undo/redo island uses 2px inter-button gap; Excalidraw separates undo↔redo group from zoom by `0.6em` | visual | `src/routes/+page.svelte:592-611` + `.x-island gap:2px` (line 738) | `styles.scss:549-556` (`.undo-redo-buttons { margin-inline-start: 0.6em; }`) | The 0.6em (~9.6px) gap between the zoom group and the undo/redo group is the canonical separator. Ours uses `var(--space-2)` on `.x-bottom` (line 829) between the two islands — verify that resolves to ~8–10px; if `--space-2` is smaller, bump the inter-island gap to ~0.6rem to match. |

### By-design divergences (do NOT fix)

- **No HelpButton / `?` in footer-right.** Excalidraw's `Footer.tsx:64` renders a HelpButton opening the shortcuts dialog; we have no shortcuts dialog (different product, Markdown-spec tool). Out of scope.
- **No zen-mode transition classes / ExitZenModeButton.** `Footer.tsx:32-35,69-72` — we have no zen mode.
- **No `FooterCenterTunnel` slot.** `Footer.tsx:56` — that's a host-app embedding API; N/A for a single-user desktop app.
- **No view-mode gating of undo/redo.** `Footer.tsx:44` hides undo/redo in view mode; we have no view mode.
- **Different zoom step.** We zoom by ×1.2 multiplicative (`editor.svelte.ts:945-948`); Excalidraw adds a fixed `ZOOM_STEP = 0.1` (`actionCanvas.tsx:148`). Multiplicative zoom is a reasonable, intentional choice for an infinite semantic canvas.
- **Different MIN/MAX zoom range.** Ours is 0.05–8 (`camera.svelte.ts:23-24`); Excalidraw is 0.1–30 (`constants.ts:303-304`). Intentional product tuning; the only matchable item is wiring the *disabled* state to our own limits (above), not adopting Excalidraw's numeric range.
- **Reset zoom recenters on viewport center, not scene content.** Both ours (`editor.svelte.ts:958-959`) and Excalidraw (`actionCanvas.tsx:226-233`) recenter on viewport center at zoom=1 — these already match; no action.
- **Phosphor zoom-in/out/undo/redo icons vs Excalidraw's hand-drawn icon set.** Icon-set divergence is mandated by our Phosphor-only rule. Not a fix.
