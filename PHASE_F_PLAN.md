# Phase F — Icons / SVGs as first-class composable properties

**Status:** PLAN — awaiting confirmation before parallel execution
**Owner:** Billy + Claude (4 sub-agents)
**Date:** 2026-05-31
**Predecessors:** Phase A (interaction primitives — done), the 9-fix L7 audit response (done)
**Successors:** Phase E (semantic-vocabulary expansion for dashboards/webapps), Phase G (collab — deferred indefinitely until single-user is solid)

---

## 1. Goal (single sentence)

Every element type can carry an embedded Phosphor icon, rendered in its natural slot per type;
arbitrary SVG markup can be placed as a standalone `svg` element; the Markdown export carries
icons through to the spec so Claude Code generates SvelteKit components with the correct
`phosphor-svelte` imports and inline SVG.

## 2. Why this work, not the alternative

LayoutForge's mission per `CLAUDE.md` and the operator's restated framing: **"sketch a webapp /
dashboard / app prototype, hand the Markdown export to Claude Code, get back working SvelteKit."**

Two candidate next workstreams:

- **Phase E** — add ~20 new semantic element types (`stat-card`, `badge`, `progress`, `avatar`,
  `breadcrumb`, `pagination`, `stepper`, `accordion`, `alert`, `tooltip`, `checkbox`, `radio`,
  `toggle`, `slider`, `select`, `section-header`, `hero`, `feature-grid`, `testimonial`,
  `cta-section`).
- **Phase F** — icon/SVG infrastructure on every existing element type.

**Phase F is load-bearing FIRST** because: every Phase E type that would matter (stat-card,
nav-item, search-input, badge, list-row, breadcrumb) visually requires an icon. Without an icon
system, the Phase E types ship as iconless wireframes and the AI receiving the Markdown spec
loses the strongest visual signal — "this is a TrendingUp KPI tile, not a generic card." Build
icons → then Phase E inherits them composably with zero per-type duplication.

## 3. Current state (what already exists)

Inventoried before planning:

| Asset | Location | What it does |
|---|---|---|
| Offline Phosphor icon set | `src/lib/icons/offline-iconify.ts` | ~9,000 icons bundled, lazy-loaded chunk, fully offline (no CDN). Search-ranked. |
| `IconPicker.svelte` | `src/lib/ui/IconPicker.svelte` | Modal picker, search input, 240-result grid, click-to-place flow. |
| `IconElement` standalone type | `src/lib/elements/types.ts:223` | Place a Phosphor icon as its own element on the canvas. `iconName` + `svgPath` + `viewBox`. |
| `ButtonElement.iconName/iconSvgPath` | `src/lib/elements/types.ts:155` (legacy field shape) | Leading icon on a button. Now deprecated in favor of the unified field. |
| Renderer `drawIcon` | `src/lib/canvas/renderer.ts:674` | Paints a Phosphor `svgPath` via Canvas2D `Path2D`, scaled into element bbox. |
| `PhIcon.svelte` | `src/lib/ui/PhIcon.svelte` | DOM-side icon rendering for UI chrome (toolbar, inspector). |

**Architectural foundation already shipped in this session (safe to keep):**

| Change | File | Status |
|---|---|---|
| `IconRef` interface — single value-object shape for `{name, svgPath, viewBox}` | `src/lib/elements/types.ts` | DONE |
| `BaseElement.icon?: IconRef` — every element can carry one | `src/lib/elements/types.ts:124` | DONE |
| `ButtonElement.iconName/iconSvgPath` marked `@deprecated` | `src/lib/elements/types.ts:155` | DONE — compat preserved, new code reads/writes `el.icon` |

These compile clean (`pnpm check` = 0/0 last we ran it).

## 4. Architectural decisions (load-bearing, frozen)

| # | Decision | Rationale |
|---|---|---|
| A1 | `icon?: IconRef` lives on `BaseElement`, not duplicated per type | Composable. Phase E gets icon support for free. Avoids 20 future copies of `iconName/iconSvgPath`. |
| A2 | `IconRef` carries `name` + `svgPath` + `viewBox` inline | Document is fully self-contained on disk — no icon-set lookup needed to render an old `.lfdoc`. Same shape `IconElement` already uses. |
| A3 | `ButtonElement.iconName/iconSvgPath` deprecated but readable; `migrate.ts` normalises on load | Don't break existing `.lfdoc` files. |
| A4 | `svg` is a NEW standalone element type, distinct from icons | Icons compose INTO host elements (decoration). SVGs are standalone (logo, custom illustration). Different storage, different intent. |
| A5 | Renderer paints embedded icons in **element-natural slots**, not a generic top-left badge for every element | Each element type has a canonical icon position (card header / input leading / nav brand / tab leading / etc.). Generic top-left is the FALLBACK for slot-less types. |
| A6 | Markdown export emits `Icon: ph:<name>` as a structured property line | Claude Code can `import { TrendingUp } from 'phosphor-svelte'` deterministically. No inline-glyph hacks. |
| A7 | Icon picker reuses existing `IconPicker.svelte` — no new UI library | The picker already has 9000+ icons offline, ranked search, previews. Wire it to a new attach mode. |
| A8 | **Future-collab compatibility:** `IconRef` is a value object (no aliasing); all icon mutations go through `commands.patch()` so history coalescing handles them. Adding presence/CRDT later doesn't require touching this layer. | Operator: "no collab now, yes in the future." Don't paint a corner. |
| A9 | User-pasted SVG is sanitized via DOMParser before storage — strip `<script>`, event handlers, `javascript:` URLs | Bundled Phosphor set is trusted. User input is not. XSS prevention is non-negotiable. |

## 5. Confirmed UX decisions (operator-locked)

| # | Decision | Source |
|---|---|---|
| U1 | **Drag-from-picker-onto-canvas** is the primary attach UX (in addition to inspector button) | Operator answered "Inspector + drag-from-picker-onto-canvas" |
| U2 | **Inspector "Paste SVG markup…" action** for arbitrary SVG | Operator answered "Inspector 'Paste SVG markup…' action (Recommended)" |
| U3 | No new keyboard chord for icon attach (deferred — can add `⌘⇧I` later if desired) | Implicit from U1: drag is the power-user fast path |
| U4 | Auto-detect SVG on `⌘V` paste is OUT — explicit Inspector action only | Implicit from U2 — avoid surprising users who paste structured SVG copied from another design tool |

### U1 detail: drag-from-picker UX

- Open IconPicker (toolbar icon-tool, or `⌘⇧K` if we add it later, or inspector "Icon" button).
- Each icon cell is draggable. `pointerdown` on a cell + drag > 6px starts a drag-attach gesture.
- During drag: a floating cursor preview shows the icon glyph following the pointer.
- On `pointerup`:
  - If the pointer is over an existing element (`hitTestPoint` returns non-null) → attach: `commands.patch(hitId, { icon: ref })`, history label "Attach icon".
  - Else (over empty canvas) → place a standalone `IconElement` at the drop point (existing behavior).
- Click-without-drag still attaches to the currently-selected element via `commands.patch(selectedIds, { icon: ref })`, with `Attach icon` history label.
- Picker closes after attach.

### U2 detail: paste-SVG UX

- Inspector shows "Paste SVG markup…" button when an `svg` element is selected, OR a "+ SVG" button under the Add menu in the toolbar.
- Click → modal with a `<textarea>` accepting SVG markup.
- On commit:
  1. Parse with `new DOMParser().parseFromString(value, 'image/svg+xml')`.
  2. If parse error or no `<svg>` root → toast "Invalid SVG markup."
  3. Strip `<script>` elements, `on*` attributes, `href="javascript:..."` from the parsed tree (XSS prevention per A9).
  4. Extract viewBox (or compute from width/height fallback).
  5. Extract inner body markup.
  6. Create `SvgElement` at the current cursor world position with the sanitized body.

## 6. Detailed work breakdown (8 deliverables)

### D1 — Renderer integration

**Owner agent:** R (Renderer + new SVG type)
**Files owned:** `src/lib/canvas/renderer.ts`, `src/lib/elements/defaults.ts`, `src/lib/elements/types.ts` (only the new `SvgElement` interface + union extension)

**What to build:**

1. Add helper `function drawEmbeddedIcon(ctx, icon, x, y, size, zoom, color)` in `renderer.ts` — paints an `IconRef` body's primary path via `Path2D` at a given world point, with the given color (default `INK`). Scaling derives from `icon.viewBox`.
2. Update each existing element paint function to call `drawEmbeddedIcon` in its natural slot when `el.icon` is set:

| Element draw fn | Slot semantics | Position | Size |
|---|---|---|---|
| `drawCard` | Header glyph (top-left of card, before label) | `(el.x + 14/zoom, el.y + 14/zoom)` | `18/zoom` |
| `drawInput` | Leading edge (push placeholder text right) | `(el.x + 12/zoom, el.y + el.height/2 - 8/zoom)` | `16/zoom` |
| `drawNav` | Replaces the dot accent | `(el.x + 14/zoom, cy - 8/zoom)` | `16/zoom` |
| `drawSidebar` | First-item glyph row (subsequent rows still get dots) | `(el.x + pad + 4/zoom, y - 6/zoom)` | `14/zoom` |
| `drawList` | First-row bullet | `(el.x + pad + 1/zoom, y - 6/zoom)` | `12/zoom` |
| `drawTabs` | Leading edge of first tab | `(tx + 8/zoom, el.y + tabH/2 - 7/zoom)` | `14/zoom` |
| `drawModal` | Before title | `(el.x + 22/zoom, el.y + 18/zoom)` | `16/zoom` |
| `drawButton` | Leading edge (reads `el.icon` first, falls back to legacy `iconName/iconSvgPath`) | `(el.x + 12/zoom, el.y + el.height/2 - 7/zoom)` | `14/zoom` |
| `drawFrame`, `drawContainer`, `drawDivider`, `drawImage`, `drawText`, `drawChart`, `drawTable` | Fallback: top-left badge | `(el.x + 8/zoom, el.y + 8/zoom)` | `14/zoom` |
| `drawIcon` (standalone) | NO CHANGE — IconElement's body IS the icon; do not paint a composed icon on top | — | — |

3. Add new `drawSvg(ctx, el, zoom)` paint function — same technique as `drawIcon` but reads `el.body` (raw SVG inner markup) and uses `el.viewBox`. Renders via `Path2D` constructed from each `<path d="...">` extracted from the body.

4. Add `'svg'` to the `switch(el.type)` dispatch in `drawElement`.

**API contract for other agents:**

- `IconRef` is `{ name: string, svgPath: string, viewBox: string }`.
- `SvgElement extends BaseElement` with `type: 'svg'`, `body: string`, `viewBox: string`.

**Acceptance:**

- `pnpm exec tsc --noEmit` clean
- `pnpm run check` 0/0
- Existing renderer tests (none directly, but the e2e probe + browser-interact still pass)

---

### D2 — New `svg` element type

**Owner agent:** R (same as D1 — they share `types.ts` and `defaults.ts`)
**Files owned:** `src/lib/elements/types.ts`, `src/lib/elements/defaults.ts`

**What to build:**

```ts
export interface SvgElement extends BaseElement {
	type: 'svg';
	/** Sanitized inner SVG markup (between <svg>...</svg>). User-provided content; validated and
	 * stripped of <script>, event handlers, javascript: URLs at the input boundary (RightPanel
	 * paste handler) — what reaches storage is always safe to render via Path2D parsing. */
	body: string;
	/** Source viewBox (auto-extracted from the pasted markup; falls back to "0 0 100 100"). */
	viewBox: string;
}
```

- Add `'svg'` to `SEMANTIC_TYPES` array at `types.ts:14`.
- Add `SvgElement` to the `Element` union at `types.ts:236`.
- Add to `ElementByType` map at `types.ts:255`.
- `createElement('svg', init)` in `defaults.ts` — default `body: ''`, `viewBox: '0 0 100 100'`, default size 120×120.

**Acceptance:**

- TypeScript compiles
- A round-trip test (in-memory): create svg element, serialize, deserialize, deep-equal

---

### D3 — Inspector "Icon" affordance (drag-attach)

**Owner agent:** I (Inspector)
**Files owned:** `src/lib/ui/RightPanel.svelte`, `src/routes/+page.svelte` (the attach handler only)

**What to build:**

1. In `RightPanel.svelte`, render a "Icon" row for the selected element: shows the current icon glyph + name when set, else "Add icon". Click → opens `IconPicker` in attach mode.

2. Add an attach handler in `+page.svelte` (similar to `openIconReplace` but more general):

```ts
function openIconAttachPicker(): void {
	iconAttachMode = 'attach';
	iconPickerOpen = true;
}
function onIconAttached(icon: { name; svgPath; viewBox }) {
	const sel = scene.selection;
	if (sel.size === 0) return;
	const ref = { name: icon.name, svgPath: icon.svgPath, viewBox: icon.viewBox };
	for (const id of sel) commands.patch(id, { icon: ref }, 'Attach icon');
}
```

3. Add an `×` remove button on the inspector row when an icon is set. Removes via `commands.patch(id, { icon: undefined })`.

4. **Drag-from-picker** (U1):
   - In `IconPicker.svelte`, make each `.icon-cell` `draggable` (HTML5 drag-and-drop). On `dragstart`, set `dataTransfer.setData('application/x-layoutforge-icon', JSON.stringify(ref))` and a tiny `setDragImage` of the glyph.
   - In `Canvas.svelte`, add `dragover` (prevent default) and `drop` listeners. On drop:
     - Parse `application/x-layoutforge-icon` from `dataTransfer`.
     - World point = `camera.toWorld(localPoint(e))`.
     - `hitTestPoint(scene.ordered, world)` — if hit, `commands.patch(hit.id, { icon: ref }, 'Attach icon')`; close picker.
     - Else, place a standalone `IconElement` at world via `commands.createAt('icon', { x, y, width, height, ...ref })`.
   - The picker stays open during drag; closes after a successful drop.

**Acceptance:**

- CDP probe: open picker programmatically, simulate click-cell, assert selected element gets `icon` set.
- CDP probe: simulate dragstart + drop on a card → that card's `icon` is set.

---

### D4 — Inspector "Paste SVG markup" action

**Owner agent:** I (same as D3)
**Files owned:** `src/lib/ui/RightPanel.svelte`

**What to build:**

1. Selected element type is `svg` → Inspector shows "Edit SVG markup" button (renames empty default action to "Paste SVG…").
2. Click → modal opens with a `<textarea>` (autofocus, monospace font).
3. Commit button calls a sanitizer:

```ts
function pasteSvgMarkup(markup: string): { body: string; viewBox: string } | null {
	const doc = new DOMParser().parseFromString(markup, 'image/svg+xml');
	if (doc.querySelector('parsererror')) return null;
	const root = doc.querySelector('svg');
	if (!root) return null;
	// Strip <script>, on* attributes, javascript: URLs.
	for (const s of root.querySelectorAll('script')) s.remove();
	root.querySelectorAll('*').forEach((el) => {
		for (const attr of [...el.attributes]) {
			if (attr.name.toLowerCase().startsWith('on')) el.removeAttribute(attr.name);
			if (/^(href|xlink:href)$/i.test(attr.name) && /^javascript:/i.test(attr.value)) el.removeAttribute(attr.name);
		}
	});
	const viewBox = root.getAttribute('viewBox') ?? '0 0 100 100';
	const body = root.innerHTML;
	return { body, viewBox };
}
```

4. On commit: `commands.patch(selectedId, { body, viewBox }, 'Edit SVG')`.

5. Also surface "+ SVG" in the toolbar / Add menu so the user can create an `svg` element from scratch (then paste body into it).

**Acceptance:**

- Sanitizer test: malicious SVG (`<svg><script>alert(1)</script><a href="javascript:..."/></svg>`) → reaches storage stripped of `<script>` and `javascript:` URLs.

---

### D5 — Markdown export carries icons

**Owner agent:** E (Export)
**Files owned:** `src/lib/export/to-markdown.ts`

**What to build:**

1. Per-element emission: after the existing `Style:` / `Layout:` lines, if `el.icon` is set (or for `ButtonElement` legacy `iconName`), emit:

```
Icon: ph:trending-up
```

Where `ph:trending-up` is `el.icon.name` (already prefixed in storage).

2. For `SvgElement`:

```
- SvgElement {width}×{height}
  Inline SVG (custom illustration; viewBox: 0 0 100 100)
```

The full body is NOT inlined in the Markdown (too noisy); the spec tells Claude Code "there's a custom illustration here" with the viewBox so it can generate a placeholder `<svg viewBox="...">` or import the file.

3. **Determinism**: emission order is fixed — `Icon:` line appears immediately after `Style:` and before the children block. Existing determinism test fixture has no icons, so the existing test is unaffected. New test fixture (D7) covers icon emission determinism explicitly.

**Acceptance:**

- Existing `to-markdown.test.ts` 14 tests still pass.
- New `icon-export.test.ts` proves icon emission is byte-stable across two runs (shasum).

---

### D6 — Backward-compat migration

**Owner agent:** E (same as D5 — they share serialization concerns)
**Files owned:** `src/lib/persistence/migrate.ts`

**What to build:**

In `migrateDocument()`, add a normalisation pass: for any element where `iconName` and `iconSvgPath` are set but `icon` is not, populate:

```ts
el.icon = { name: el.iconName, svgPath: el.iconSvgPath, viewBox: '0 0 256 256' };
```

Keep `iconName/iconSvgPath` readable (don't delete) so old code paths still work; new code reads `el.icon`.

**Acceptance:**

- Migration test: a `.lfdoc` with old-shape Button → migrate → assert `el.icon.name === el.iconName`, byte-stable on re-save.

---

### D7 — Tests (unit + integration)

**Owner agent:** T (Tests + probes)
**Files owned:** new files only — `src/lib/export/icon-export.test.ts`, `src/lib/elements/svg-element.test.ts`, `src/lib/persistence/migrate-icons.test.ts`

**What to write:**

1. **`icon-export.test.ts`** — fixture: 3 elements (card, nav, input) each with an icon. Compile twice, assert byte-identical (shasum). Negative: same fixture without icons → no `Icon:` lines appear.

2. **`svg-element.test.ts`** — create `SvgElement`, serialize to JSON, deserialize, deep-equal. Sanitizer unit test (malicious markup stripped).

3. **`migrate-icons.test.ts`** — load a synthetic legacy Button JSON (with `iconName + iconSvgPath`), run migrate, assert `el.icon` populated and byte-stable re-save.

**Acceptance:**

- All new tests pass alongside existing 64.

---

### D8 — CDP probe

**Owner agent:** T (same as D7)
**Files owned:** new file `scripts/probe-icons.mjs`

**What to script:**

1. Open dev app, wait for canvas mount.
2. Create a card via `commands.createAt('card', ...)`.
3. Programmatically set `el.icon` via `commands.patch(id, { icon: { name: 'ph:trending-up', svgPath: '<known-path>', viewBox: '0 0 256 256' } })`.
4. Read back `scene.get(id).icon` — assert deep equality with the input.
5. Open IconPicker via `editor.tool = 'icon'`; search "trending"; click first result via dispatch; assert `selectedElement.icon.name === 'ph:trending-up'`.
6. Create an `svg` element via `commands.createAt('svg', { x, y, width: 100, height: 100, body: '<rect width="100" height="100" fill="red"/>', viewBox: '0 0 100 100' })`. Assert `scene.get(id).body` round-trips and renderer doesn't throw.
7. (Optional) Sample the canvas pixel grid at the icon's expected screen location — assert non-zero ink (proves the icon actually painted).

**Acceptance:**

- `node scripts/probe-icons.mjs` exits 0 with all PASS lines.

---

## 7. Parallel execution plan (4 sub-agents, zero file conflicts)

| Agent | Owned files | Deliverables | Estimated tokens | Estimated wall time |
|---|---|---|---|---|
| **R** | `renderer.ts`, `defaults.ts`, `types.ts` (only `SvgElement` interface + union extension) | D1 (renderer integration), D2 (svg element type) | ~50k | ~3 min |
| **E** | `to-markdown.ts`, `migrate.ts` | D5 (icon export), D6 (migration) | ~40k | ~2 min |
| **I** | `RightPanel.svelte`, `IconPicker.svelte` (drag handlers), `Canvas.svelte` (drop handler), `+page.svelte` (attach handler) | D3 (inspector + drag-from-picker), D4 (paste-SVG modal) | ~60k | ~4 min |
| **T** | `src/lib/export/icon-export.test.ts`, `src/lib/elements/svg-element.test.ts`, `src/lib/persistence/migrate-icons.test.ts`, `scripts/probe-icons.mjs` | D7 (tests), D8 (probe) | ~40k | ~3 min |

**Conflicts by design: zero.** Every file is owned by exactly one agent. Where files would naturally collide (renderer.ts contains both element paint paths AND new svg drawing), one agent owns the whole file.

**API surface that the parallel agents must agree on (frozen now):**

```ts
// In types.ts (already shipped):
export interface IconRef { name: string; svgPath: string; viewBox: string; }

// BaseElement.icon?: IconRef        — already shipped
// ButtonElement.iconName/iconSvgPath — deprecated, compat shim

// Coming from Agent R:
export interface SvgElement extends BaseElement {
	type: 'svg';
	body: string;
	viewBox: string;
}
// SEMANTIC_TYPES will include 'svg'
// Element union will include SvgElement
// ElementByType will include svg: SvgElement
```

Agents E, I, T must read this contract from the plan, not from each other's output.

**Execution order:**

1. Spawn R + E + I + T concurrently with self-contained briefs.
2. Wait for all four to return (notifications land in chat).
3. Run verification gates sequentially (Section 8).
4. If any gate fails, dispatch a targeted fix agent.

## 8. Verification gates

All must pass before declaring Phase F complete:

| Gate | Command | Pass criterion |
|---|---|---|
| 1. TypeScript strict | `pnpm exec tsc --noEmit` | exit 0, zero output |
| 2. Svelte-check | `pnpm run check` | `0 ERRORS 0 WARNINGS` |
| 3. Unit tests | `pnpm test` | All existing 64 + new ~6 pass |
| 4. Production build | `pnpm build` | exit 0, Vite 8 / Rolldown clean |
| 5. Existing CDP — gestures | `node scripts/e2e.mjs` | 21/21 PASS |
| 6. Existing CDP — arrange | `node scripts/probe-arrange.mjs` | 7/7 PASS |
| 7. Existing CDP — Phase A | `node scripts/probe-phase-a.mjs` | 7/7 PASS |
| 8. New CDP — icons | `node scripts/probe-icons.mjs` | All PASS (incl. drag-attach) |
| 9. svelte MCP autofixer | On every changed `.svelte` file | `"issues": []` |
| 10. Visual smoke | Launch `pnpm tauri dev`, manually drag an icon onto a card from the picker, see it render | Single subjective check — operator confirms |

## 9. Risk register

| Risk | Mitigation |
|---|---|
| Export determinism breaks because icon emission ordering varies | New fixture explicitly orders icon emission AFTER existing fields; existing determinism test fixture has no icons (unaffected). |
| `ButtonElement`'s deprecated `iconName/iconSvgPath` and new `icon` get out of sync over time | Renderer reads ONLY `el.icon`; migrate.ts populates it on load; never write to the old fields. |
| User-pasted SVG contains script tags / XSS vector | Validate body via DOMParser, strip `<script>` / event handlers / `javascript:` URLs at the paste boundary (D4 sanitizer). Bundled Phosphor set is trusted; user-pasted SVG is not. |
| Drag-and-drop from picker fights canvas pointer events | Use HTML5 drag-and-drop (`dragstart` / `drop`) which is separate from canvas pointer streams — they don't interfere. Drop handler reads from `dataTransfer`. |
| Rendering icon at extreme zoom-out renders sub-pixel path (invisible) | Existing `drawIcon` already handles via `screenDistanceToWorld`; new `drawEmbeddedIcon` inherits the same scaling. Below 0.5px → don't paint. |
| Markdown export bloats with icon body markup | Export emits `Icon: ph:<name>` only — body markup stays in the document, the spec just references the icon by name so Claude Code re-imports from `phosphor-svelte`. |
| Picker remains open after drag-attach, blocking next click on canvas | On successful drop, close picker (set `iconPickerOpen = false`). |

## 10. Explicitly NOT doing in Phase F

- **No new keyboard chord** for icon attach (deferred — operator picked drag UX, not chord).
- **No auto-detect SVG on ⌘V** (operator chose explicit Inspector action).
- **No icon rotation/scaling per-element-icon** beyond the natural slot size. The host element's icon is decorative-at-fixed-size, not a transform target. (User wanting a rotated icon can use a standalone `IconElement` or `SvgElement`.)
- **No icon picker re-architecture** — reusing existing `IconPicker.svelte`.
- **No new icon sets beyond Phosphor** — `@iconify-json/ph` is the bundled set; adding `lucide` / `heroicons` is a separate decision.
- **No "icon library" panel** (browse + favorites + recent) — that's a Phase E/G concern.
- **No collab consideration in this phase beyond keeping the data model clean** (A8).

## 11. Out-of-scope follow-ups (next phases)

- **Phase E** — semantic vocabulary expansion: `stat-card`, `badge`, `progress`, `avatar`, `breadcrumb`, `pagination`, `stepper`, `accordion`, `alert`, `tooltip`, `checkbox`, `radio`, `toggle`, `slider`, `select`, `section-header`, `hero`, `feature-grid`, `testimonial`, `cta-section`. Will inherit icon support from Phase F automatically.
- **Phase G** — Library panel: pre-built compound components (Login Form, Sidebar Layout, Stat-Card Row) the user drags onto canvas. The biggest prototyping speed-up.
- **Phase H** — Collaboration: deferred per operator. Architecture stays clean (A8) so this is additive.
- **Phase I** — Additional icon sets (Lucide, Heroicons, Tabler). Each adds ~1MB bundled.
- **Phase J** — Image-element image-cropping (Excalidraw parity, low priority for current product mission).

## 12. Sign-off checklist (operator)

Before I spawn the 4 sub-agents, confirm:

- [ ] Scope (Sections 1–2) is right
- [ ] Architectural decisions (Section 4 A1–A9) are right
- [ ] UX decisions (Section 5) match what you asked for
- [ ] Verification gates (Section 8) are the right bar
- [ ] Risks (Section 9) are reasonable
- [ ] Out-of-scope items (Section 10–11) are correctly deferred

If yes → reply "go" and I dispatch all four agents in parallel with self-contained briefs.

If anything needs to change → call it out, I update this doc, then proceed.
