## Cluster: excalidraw__charts__1

### packages/excalidraw/charts/index.ts

Public barrel/dispatch module for the charts subsystem: it re-exports the chart parsing/validation API and provides the single entry point that routes a parsed spreadsheet to the correct chart renderer.

This file is almost entirely re-exports plus one small dispatch function. It contains no internal logic beyond the renderer selection.

**Imports / wiring (L1-L12):**
- Type-only import of `ChartType` from `@excalidraw/element/types` (L1).
- Renderer imports: `renderBarChart` from `./charts.bar` (L3), `renderLineChart` from `./charts.line` (L4), `renderRadarChart` from `./charts.radar` (L10). These three are the only chart renderers wired here; the dispatch (below) covers `"line"`, `"radar"`, and a bar-chart default.
- Parser imports `tryParseCells`, `tryParseNumber`, `tryParseSpreadsheet` from `./charts.parse` (L5-L9).
- Type-only import of `ChartElements`, `Spreadsheet` from `./charts.types` (L12).

**Re-exports (types, L14-L19):** pure type re-exports from `./charts.types` — `ParseSpreadsheetResult`, `Spreadsheet`, `SpreadsheetSeries`, `ChartElements`. No runtime value; these are TypeScript interfaces/types defined elsewhere in the cluster `excalidraw__charts__0`.

**Re-export (validation, L21):** `isSpreadsheetValidForChartType` re-exported from `./charts.helpers` (runtime function; defined in `charts.helpers.ts`, not in this file).

**Re-export (parsers, L22):** `tryParseCells`, `tryParseNumber`, `tryParseSpreadsheet` re-exported as runtime values (defined in `charts.parse.ts`).

**Functions defined in this file:**

- `renderSpreadsheet(chartType: ChartType, spreadsheet: Spreadsheet, x: number, y: number, colorSeed?: number): ChartElements | null` — **(L24-L38)**. The single public dispatcher that converts a parsed `Spreadsheet` into chart elements at a given canvas position.
  - **Algorithm / behavior:** Pure branch-on-type dispatch. If `chartType === "line"` it delegates to `renderLineChart(spreadsheet, x, y, colorSeed)` (L31-L33); if `chartType === "radar"` it delegates to `renderRadarChart(spreadsheet, x, y, colorSeed)` (L34-L36); otherwise (default / e.g. `"bar"`) it delegates to `renderBarChart(spreadsheet, x, y, colorSeed)` (L37). The bar renderer is the fallthrough default — any `ChartType` value that is neither `"line"` nor `"radar"` produces a bar chart.
  - **Inputs:** `chartType` selects the renderer; `spreadsheet` is the parsed data model (labels + series); `x`, `y` are the world-space top-left anchor coordinates where the generated chart elements are positioned; `colorSeed` is an optional numeric seed forwarded verbatim to the chosen renderer to deterministically pick the chart's color palette/background.
  - **Outputs:** Returns `ChartElements | null`. The `null` is propagated from the underlying renderers (this function never itself returns `null`; the `| null` reflects each renderer's return type).
  - **Side effects:** None in this function — it is a pure pass-through. All element construction (and any randomness keyed by `colorSeed`) happens inside the delegated renderers in cluster `excalidraw__charts__0`.
  - **Invariants:** `x`/`y` and `colorSeed` are passed through unmodified and in the same argument order to every renderer, so coordinate-space and seeding semantics are identical across chart types. No coordinate transforms, geometry math, or mutation occur here.
  - **Parity note (for the Svelte/Canvas reimplementation):** The only behavior to preserve here is the routing rule itself — `"line" → line`, `"radar" → radar`, everything else → bar — and the strict argument-forwarding order `(spreadsheet, x, y, colorSeed)`. There is no non-obvious math, geometry, or performance concern in this file; all such detail lives in `charts.bar.ts` / `charts.line.ts` / `charts.radar.ts` / `charts.parse.ts` (cluster `excalidraw__charts__0`).
