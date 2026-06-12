export const meta = {
  name: 'parity-audit-e2e',
  description: 'End-to-end fidelity audit: revo-draw port vs excalidraw-master, core-first',
  whenToUse: 'Prove behavioral identity between the port and Excalidraw and surface real bugs',
  phases: [
    { title: 'TierA-LogicDrift', detail: 'classify diffs in ported logic files as benign vs bug' },
    { title: 'TierB-WebBehavior', detail: 'trace src/lib/x handlers vs excalidraw App.tsx + actions' },
    { title: 'Verify', detail: 'adversarially confirm each finding is a real divergence' },
    { title: 'Synthesize', detail: 'rank confirmed bugs, write report' },
  ],
}

const ROOT = '/Users/billyribeiro/development/revo-draw'

// ---- Schemas -------------------------------------------------------------
const FINDINGS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['findings'],
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'ourLocation', 'theirLocation', 'severity', 'category', 'evidence', 'expected', 'actual'],
        properties: {
          title: { type: 'string', description: 'one-line description of the divergence' },
          ourLocation: { type: 'string', description: 'our file:line, e.g. src/lib/x/draw-controller.svelte.ts:412' },
          theirLocation: { type: 'string', description: 'excalidraw-master file:line of the reference behavior' },
          severity: { type: 'string', enum: ['bug', 'partial', 'cosmetic', 'benign'] },
          category: { type: 'string' },
          evidence: { type: 'string', description: 'the concrete code difference proving divergence' },
          expected: { type: 'string', description: 'what excalidraw does' },
          actual: { type: 'string', description: 'what our port does' },
        },
      },
    },
  },
}

const VERDICT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['isReal', 'reasoning', 'correctedSeverity'],
  properties: {
    isReal: { type: 'boolean', description: 'true if this is a genuine behavioral divergence that would manifest as a user-visible difference or wrong result' },
    reasoning: { type: 'string', description: 'why it is or is not real; cite the actual code you read' },
    correctedSeverity: { type: 'string', enum: ['bug', 'partial', 'cosmetic', 'benign'] },
  },
}

// ---- Tier A: ported-logic drift classification ---------------------------
phase('TierA-LogicDrift')

const DRIFTED_FILES = [
  { our: 'src/lib/excalidraw/clipboard.ts',     their: 'excalidraw-master/packages/excalidraw/clipboard.ts' },
  { our: 'src/lib/excalidraw/clients.ts',       their: 'excalidraw-master/packages/excalidraw/clients.ts' },
  { our: 'src/lib/excalidraw/i18n.ts',          their: 'excalidraw-master/packages/excalidraw/i18n.ts' },
  { our: 'src/lib/excalidraw/data/library.ts',  their: 'excalidraw-master/packages/excalidraw/data/library.ts' },
  { our: 'src/lib/excalidraw/data/types.ts',    their: 'excalidraw-master/packages/excalidraw/data/types.ts' },
  { our: 'src/lib/excalidraw/actions/types.ts', their: 'excalidraw-master/packages/excalidraw/actions/types.ts' },
]

const tierA = await parallel(DRIFTED_FILES.map((pair) => () =>
  agent(
    `You are auditing a faithful port of Excalidraw. The port lives at ${ROOT}.
Compare these two files and classify EVERY semantic difference (ignore import-path rewrites, type annotations added for TS-strict, comment/whitespace changes, and monorepo-vs-relative path changes — those are benign):
  OURS:   ${ROOT}/${pair.our}
  THEIRS: ${ROOT}/${pair.their}

Read BOTH files fully. Run a diff in your head function-by-function. For each difference that could change runtime BEHAVIOR or RESULT (not just syntax), emit a finding. A difference that is a deliberate, correct platform adaptation (e.g. browser clipboard API instead of monorepo helper, localStorage instead of IndexedDB) with EQUIVALENT behavior is severity "benign" — still report it so we have a record, but mark benign. A difference that drops a feature, changes a computation, or breaks an invariant is "bug" or "partial".
Return findings via the schema. If truly nothing diverges behaviorally, return an empty findings array.`,
    { label: `tierA:${pair.our.split('/').pop()}`, phase: 'TierA-LogicDrift', schema: FINDINGS_SCHEMA, agentType: 'Explore' }
  )
))

const tierAFindings = tierA.filter(Boolean).flatMap((r) => r.findings || [])
log(`Tier A: ${tierAFindings.length} raw findings from ${DRIFTED_FILES.length} drifted logic files`)

// ---- Tier B: web-behavior fidelity (src/lib/x vs App.tsx + actions) ------
phase('TierB-WebBehavior')

const DOMAINS = [
  {
    key: 'tools-creation',
    desc: 'tool selection + element creation (rectangle, diamond, ellipse, line, arrow, freedraw, text, image, frame, eraser, laser, hand, lasso)',
    ours: 'src/lib/x/draw-controller.svelte.ts (pointer-down creation paths), src/routes/x/+page.svelte',
    theirs: 'excalidraw-master/packages/excalidraw/components/App.tsx (handleCanvasPointerDown, newElement paths), packages/element/src/newElement.ts',
  },
  {
    key: 'selection-transform',
    desc: 'select/marquee/drag-move/resize(8 handles)/rotate/aspect-lock/alt-center/15deg-snap/multi-transform/deep-select-groups',
    ours: 'src/lib/x/draw-controller.svelte.ts (selection + resize + rotate + drag), src/lib/element/resizeElements.ts, transformHandles.ts',
    theirs: 'excalidraw-master/packages/excalidraw/components/App.tsx (pointer move/resize), packages/element/src/resizeElements.ts, transformHandles.ts, dragElements.ts',
  },
  {
    key: 'linear-binding',
    desc: 'line/arrow create, multi-point editor (add/move/delete point), finalize, arrow<->shape binding + re-route, elbow arrows, arrowheads',
    ours: 'src/lib/x/draw-controller.svelte.ts (linear paths), src/lib/element/linearElementEditor.ts, binding.ts, elbowArrow.ts',
    theirs: 'excalidraw-master/packages/element/src/linearElementEditor.ts, binding.ts, elbowArrow.ts; App.tsx linear handlers',
  },
  {
    key: 'text',
    desc: 'text create, in-place edit, auto-resize, font family/size, text align, vertical align, bound/container text, arrow labels, dbl-click-to-edit',
    ours: 'src/lib/x/draw-controller.svelte.ts (text paths), src/lib/x/TextControls.svelte, src/lib/element/textElement.ts, textWrapping.ts',
    theirs: 'excalidraw-master/packages/element/src/textElement.ts, textWrapping.ts, textMeasurements.ts; App.tsx text editor, components/actions text actions',
  },
  {
    key: 'clipboard-io',
    desc: 'OS clipboard copy/paste, paste-as-plaintext, copy/paste styles, export-to-clipboard, save/open .excalidraw',
    ours: 'src/lib/x/clipboard.ts, src/lib/x/file-io.ts, src/lib/x/draw-controller.svelte.ts (clipboard handlers)',
    theirs: 'excalidraw-master/packages/excalidraw/clipboard.ts, actions/actionClipboard.ts, data/json.ts, data/index.ts',
  },
  {
    key: 'properties',
    desc: 'stroke/background color, fill style, stroke width/style, sloppiness, edges, opacity, color shade-ramp picker',
    ours: 'src/lib/x/StyleControls.svelte, src/lib/x/ColorPicker.svelte, src/lib/x/draw-controller.svelte.ts (style mutation)',
    theirs: 'excalidraw-master/packages/excalidraw/actions/actionProperties.tsx, components/ColorPicker/*, packages/common/src/colors.ts',
  },
  {
    key: 'canvas-view',
    desc: 'pan, zoom in/out, zoom-to-fit, zoom-to-selection, reset zoom, grid, theme, view mode, zen mode, scroll-to-content, canvas bg color, snapping toggles',
    ours: 'src/lib/x/draw-controller.svelte.ts (camera/view), src/routes/x/+page.svelte',
    theirs: 'excalidraw-master/packages/excalidraw/actions/actionCanvas.tsx, actionToggleViewMode.tsx, actionToggleZenMode.tsx, scene/zoom.ts, scroll.ts',
  },
  {
    key: 'actions-keyboard',
    desc: 'delete/dup/copy/cut/select-all/group/ungroup/lock/align/distribute/flip/z-order, tool-letter shortcuts, all keydown handling',
    ours: 'src/lib/x/draw-controller.svelte.ts (keydown), src/routes/x/+page.svelte, src/lib/element/groups.ts, align.ts, distribute.ts',
    theirs: 'excalidraw-master/packages/excalidraw/actions/* (actionGroup, actionAlign, actionDistribute, actionFlip, actionElementLock, actionDuplicate, actionZindex), App.tsx onKeyDown',
  },
]

// Pipeline: each domain is reviewed, then its findings verified as soon as that review lands.
const tierB = await pipeline(
  DOMAINS,
  (d) => agent(
    `You are auditing revo-draw, a Svelte 5 port of Excalidraw, for BEHAVIORAL fidelity. The port re-implements Excalidraw's React UI/action behavior inside src/lib/x/ (a Svelte controller). Excalidraw's original is in excalidraw-master/. Repo root: ${ROOT}.

FEATURE DOMAIN: ${d.desc}

Compare our implementation against Excalidraw's reference behavior:
  OUR FILES:        ${d.ours}
  REFERENCE FILES:  ${d.theirs}

Method:
1. Read the reference files to learn EXACTLY what Excalidraw does for this domain — the algorithm, the edge cases, the order of operations, the constants/thresholds.
2. Read our files and find the corresponding logic in the draw-controller / components.
3. Report every place our behavior DIVERGES: missing edge cases, different thresholds/constants, wrong order of operations, dropped steps, off-by-one, inverted conditions, state not reassigned, handlers that swallow errors. These are the "web version bugs" the user is hitting.
4. For each, give the precise our file:line and their file:line, what excalidraw does (expected) vs what we do (actual), and the code evidence.

Be concrete and skeptical — only report divergences you can prove from the code you actually read. Ignore pure styling/markup differences unless they cause a user-visible behavior bug. Return via schema; empty array if this domain is faithful.`,
    { label: `review:${d.key}`, phase: 'TierB-WebBehavior', schema: FINDINGS_SCHEMA }
  ),
  // verify stage — runs per-domain as soon as its review completes
  (review, domain) => {
    const findings = (review && review.findings) || []
    if (!findings.length) return []
    return parallel(findings.map((f) => () =>
      agent(
        `Adversarially verify this claimed parity divergence in revo-draw (Svelte port of Excalidraw). Repo root: ${ROOT}.
Domain: ${domain.key}

CLAIM: ${f.title}
  Our location:   ${f.ourLocation}
  Their location: ${f.theirLocation}
  Expected (excalidraw): ${f.expected}
  Actual (ours):         ${f.actual}
  Evidence cited:        ${f.evidence}

Open BOTH cited locations and read the surrounding code. Default to skeptical: try to REFUTE the claim. The claim is only "real" if our port genuinely produces a different runtime behavior or result than excalidraw-master for some realistic user action. Reject it if: the cited code doesn't say what's claimed, the difference is benign/equivalent, the feature is intentionally out-of-scope (collab/AI/i18n), or the reviewer misread. Set correctedSeverity. Return via schema.`,
        { label: `verify:${domain.key}`, phase: 'Verify', schema: VERDICT_SCHEMA }
      ).then((v) => ({ ...f, domain: domain.key, verdict: v }))
    ))
  }
)

const verifiedB = tierB.flat().filter(Boolean)
const confirmedB = verifiedB.filter((f) => f.verdict && f.verdict.isReal)
log(`Tier B: ${confirmedB.length} confirmed divergences (of ${verifiedB.length} reviewed)`)

// ---- Synthesize ----------------------------------------------------------
phase('Synthesize')

const all = [
  ...tierAFindings.map((f) => ({ ...f, tier: 'A-logic', verdict: { isReal: f.severity !== 'benign', correctedSeverity: f.severity } })),
  ...confirmedB.map((f) => ({ ...f, tier: 'B-web', severity: f.verdict.correctedSeverity || f.severity })),
]

const report = await agent(
  `You are the lead auditor. Below is the full set of confirmed parity findings comparing revo-draw (Svelte port) to excalidraw-master, across the ported-logic layer (Tier A) and the re-implemented web behavior (Tier B).

Write a markdown report titled "Excalidraw Parity — End-to-End Fidelity Audit". Structure:
1. Headline: counts by severity (bug / partial / cosmetic / benign), and the single most important takeaway.
2. A table of CONFIRMED BUGS ranked by user impact, each with: title, our file:line, their file:line, expected vs actual, and a one-line fix direction.
3. PARTIAL/cosmetic divergences (briefer table).
4. Benign adaptations (one-line each — proof the layer was checked, not bugs).
5. What is PROVEN IDENTICAL: note that the math/element/common/utils/fractional-indexing packages and the renderer files are byte-identical to excalidraw-master (verified by diff), so visual rendering and core geometry are faithful by construction.

Findings JSON:
${JSON.stringify(all, null, 2)}

Output ONLY the markdown report.`,
  { label: 'synthesize', phase: 'Synthesize' }
)

return { report, confirmedBugCount: all.filter((f) => f.verdict.correctedSeverity === 'bug').length, all }
