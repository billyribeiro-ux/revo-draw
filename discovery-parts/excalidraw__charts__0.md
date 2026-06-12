## Cluster: excalidraw__charts__0

This cluster is the "paste spreadsheet → generate chart elements" subsystem. Given delimited text (TSV/CSV/semicolon) parsed into a `Spreadsheet`, it emits arrays of native Excalidraw elements (rectangles, lines, ellipses, text) laid out as bar / line / radar charts. All geometry is hand-computed in element/world space; there is no charting library. Everything is deterministic given a `colorSeed` (color choice is the only randomness, and it is seedable).

Cross-file coordinate convention (critical for parity): the caller passes `(x, y)` as the chart's **bottom-left origin** of the plot area. Y grows downward (screen space), so bars/lines are positioned with `y - height` style math to extend *upward* from the baseline `y`. Radar uses a center derived from `(x, y)` and standard `cos/sin` polar placement.

---

### packages/excalidraw/charts/charts.types.ts

Types-only module defining the data contract between the parser and the renderers.

- `ChartElements` (type alias, L3): `readonly NonDeletedExcalidrawElement[]` — the return shape of every renderer.
- `Spreadsheet` (interface, L5-L9): `{ title: string | null; labels: string[] | null; series: SpreadsheetSeries[] }`. `labels` are the x-axis / radar-axis category names; `series` are one-or-more value rows.
- `SpreadsheetSeries` (interface, L11-L14): `{ title: string | null; values: number[] }` — one data series (one line / one bar-cluster member / one radar polygon).
- `ParseSpreadsheetResult` (discriminated union, L16-L18): `{ ok: false; reason: string } | { ok: true; data: Spreadsheet }`. `reason` is a human-readable parse-failure string.

No functions; pure type declarations.

---

### packages/excalidraw/charts/charts.constants.ts

Centralizes layout magic-numbers, the shared `commonProps` element defaults, and two Cartesian-layout types so the properties dialog shows stable values across a selected chart group.

- Cartesian sizing constants (L10-L23): `CARTESIAN_BASE_SLOT_WIDTH = 44`, `CARTESIAN_BAR_SLOT_EXTRA_PER_SERIES = 22`, `CARTESIAN_BAR_SLOT_EXTRA_MAX = 66`, `CARTESIAN_LINE_SLOT_WIDTH = 48`, `CARTESIAN_GAP = 14`, `CARTESIAN_BAR_HEIGHT = 304`, `CARTESIAN_LINE_HEIGHT = 320`. Label-fitting tunables: `CARTESIAN_LABEL_ROTATION = 5.87` (radians, cast `as Radians` — note: ~336°, i.e. a small negative/clockwise tilt mod 2π), `CARTESIAN_LABEL_MIN_WIDTH = 28`, `CARTESIAN_LABEL_SLOT_PADDING = 4`, `CARTESIAN_LABEL_AXIS_CLEARANCE = 2`, `CARTESIAN_LABEL_MAX_WIDTH_BUFFER = 10`, `CARTESIAN_LABEL_ROTATED_WIDTH_BUFFER = 10`, `CARTESIAN_LABEL_OVERFLOW_PREFERENCE_BUFFER = 8`.
- Legacy/bar+radar shared constants (L25-L27): `BAR_GAP = 12`, `BAR_HEIGHT = 256` (used as radar diameter base), `GRID_OPACITY = 10` (percentage opacity for faint grid/guide lines).
- Radar constants (L29-L38): `RADAR_GRID_LEVELS = 4`, `RADAR_LABEL_OFFSET = BAR_GAP*2 = 24`, `RADAR_PADDING = BAR_GAP*2 = 24`, `RADAR_SINGLE_SERIES_LOG_SCALE_THRESHOLD = 100` (max/min ratio above which a single-series radar switches to log scale), `RADAR_AXIS_LABEL_MAX_WIDTH = 140`, `RADAR_AXIS_LABEL_ALIGNMENT_THRESHOLD = 0.35` (cos/sin cutoff for left/center/right & vertical nudge decisions), `RADAR_AXIS_LABEL_CLEARANCE = BAR_GAP/2 = 6`, `RADAR_LEGEND_SWATCH_SIZE = 20`, `RADAR_LEGEND_ITEM_GAP = BAR_GAP*2 = 24`, `RADAR_LEGEND_TEXT_GAP = BAR_GAP = 12`.
- `commonProps` (const object, L42-L54, `as const`): shared element defaults — `fillStyle: "hachure"`, `fontFamily: DEFAULT_FONT_FAMILY`, `fontSize: DEFAULT_FONT_SIZE`, `opacity: 100`, `roughness: 1`, `strokeColor: COLOR_PALETTE.black`, `roundness: null`, `strokeStyle: "solid"`, `strokeWidth: 1`, `verticalAlign: VERTICAL_ALIGN.MIDDLE`, `locked: false`. Spread into every `newElement`/`newTextElement`/`newLinearElement` call; the explicit comment (L40-L41) notes stability for grouped-selection property display.
- `CartesianChartType` (type, L56): `"bar" | "line"`.
- `CartesianChartLayout` (type, L58-L63): `{ slotWidth: number; gap: number; chartHeight: number; xLabelMaxWidth: number }` — the computed per-chart layout passed around the helpers.

---

### packages/excalidraw/charts/charts.parse.ts

Parses pasted delimited text into a validated `Spreadsheet`, auto-detecting delimiter, header presence, single/multi-column shapes, and "wide" (transposed) data.

- `tryParseNumber(s: string): number | null` (L6-L13, `@private` exported for testing): regex `^([-+]?)[$€£¥₩]?([-+]?)([\d.,]+)[%]?$` tolerates a leading currency symbol (between two optional sign groups) and a trailing `%`. Strips thousands commas before `parseFloat`. Returns `null` on no match. Notable: it accepts a sign on *either* side of the currency symbol via `match[1] || match[2]`, and does NOT divide percentages by 100 (the `%` is just stripped).
- `isNumericColumn(lines: string[][], columnIndex: number)` (internal, L15-L16): true iff every row *after the first* parses as a number in that column. Used only for the 1-column path; deliberately ignores row 0 (potential header).
- `tryParseCells(cells: string[][]): ParseSpreadsheetResult` (L21-L129, `@private` exported for testing): main shape dispatcher on `numCols = cells[0].length`.
  - `numCols > 2` branch (L24-L78): header detected when *every* row-0 cell is non-numeric (L25). Validates all value cells (columns ≥1) of data rows are numeric (L32-L37). "Wide format" special case (L42-L59): if `numValueCols > rows.length`, transpose — each row becomes a series (`title` = first cell), columns become `labels` (from header). Title rule: single series → that series' title; else header's top-left cell. Otherwise (L61-L77) standard "tall" multi-series: each column-1..n is a series titled by header cell (fallback `"Series N"`), `labels` from column 0.
  - `numCols === 1` branch (L80-L103): requires the whole column to be numeric (post-header), header = first cell unparseable. Needs ≥2 values else `"Less than two rows"`. Produces a single unlabeled series.
  - `numCols === 2` branch (L105-L128): header detected from cell `[0][1]` being non-numeric; needs ≥2 rows; validates column-1 numeric; `labels` from column 0, one series from column 1.
  - Failure reasons returned: `"No data rows"`, `"Value is not numeric"`, `"Less than two rows"`, `"Less than 2 rows"`.
- `tryParseSpreadsheet(text: string): ParseSpreadsheetResult` (L131-L174): entry point. `parseDelimitedLines` (L133-L138) normalizes `\r\n?`→`\n`, drops blank lines, splits each line on the delimiter and trims cells. Scores three candidate delimiters `["\t", ",", ";"]` (L142-L148) by column-count consistency. Selection priority (L152-L155): consistent-with->1-column → else consistent → else first candidate; tab > comma > semicolon ties resolved by array order. Then re-checks all rows share `numColsFirstLine` (L163-L171, reason `"All rows don't have same number of columns"`), and delegates to `tryParseCells`. Empty input → `"No values"`.

---

### packages/excalidraw/charts/charts.helpers.ts

Shared layout/color/label engine used by all three renderers: palette selection, value scaling, radar axis-label placement, Cartesian axis labels with rotation-aware fitting, the legend builder, and the base elements (title, axes, grid, y-labels).

- `bgColors` (module const, L69): `getAllColorsSpecificShade(DEFAULT_CHART_COLOR_INDEX)` — the fixed palette array all charts pick from. Computed once at import.
- `getSpreadsheetDimensionCount(spreadsheet)` (internal, L71-L72): `labels.length ?? series[0].values.length ?? 0`.
- `isSpreadsheetValidForChartType(spreadsheet: Spreadsheet | null, chartType: ChartType)` (exported, L74-L92): null → false; requires ≥2 dimensions for any chart; radar additionally requires ≥3.
- `getSeriesAwareSlotWidth(baseSlotWidth, seriesCount)` (internal, L94-L106): widens each x-slot when multiple series share it. Extra = `min(CARTESIAN_BAR_SLOT_EXTRA_MAX, (seriesCount-1)*CARTESIAN_BAR_SLOT_EXTRA_PER_SERIES)`; 0 for ≤1 series.
- `getCartesianChartLayout(chartType: CartesianChartType, seriesCount): CartesianChartLayout` (exported, L108-L137): branches line vs bar to pick base slot width and chartHeight (line 48/320, bar 44/304). `xLabelMaxWidth = slotWidth + CARTESIAN_GAP*3 + CARTESIAN_LABEL_MAX_WIDTH_BUFFER`. `gap` always `CARTESIAN_GAP`.
- `getChartDimensions(spreadsheet, layout)` (exported, L139-L148): `chartWidth = (slotWidth+gap)*N + gap` where N = `series[0].values.length`; `chartHeight = layout.chartHeight + gap*2`.
- `getRadarDimensions()` (exported, L150-L154): square `BAR_HEIGHT + RADAR_PADDING*2 = 256+48 = 304` on both axes.
- `getCircularDistance(firstIndex, secondIndex, paletteSize)` (internal, L156-L163): circular (wrap-around) distance on the palette ring: `min(|a-b|, paletteSize-|a-b|)`.
- `getSeriesColors(seriesCount, colorOffset): readonly string[]` (exported, L165-L216): greedy maximum-spread palette picker. Starts at `colorOffset mod paletteSize`, then repeatedly adds the unused palette index whose minimum circular distance to already-chosen indices is greatest (tie-break: larger average distance) until it has `min(seriesCount, paletteSize)` unique colors; final array cycles those indices for `seriesCount` entries. Returns `[]` for non-positive count or empty palette. Notable: deterministic given the offset; ensures visually distinct series colors.
- `getColorOffset(colorSeed?: number)` (exported, L218-L233): if no/NaN seed → `Math.floor(Math.random()*len)` (the ONLY nondeterminism in the cluster). Else hashes the seed's decimal string with a `hash = hash*31 + charCode | 0` rolling hash, returns `|hash| % paletteSize`. Empty palette → 0.
- `getBackgroundColor(colorOffset)` (exported, L235-L236): `bgColors[colorOffset]`.
- `getRadarValueScale(series, _labelsLength)` (exported, L238-L263): builds `{ renderSteps: false, normalize(value, axisIndex) }`. `max = max(1, ...allValues)` (negatives clamped to 0). Enables log scale only when single-series AND `max/minPositive >= 100`; then `normalize = log10(v+1)/log10(max+1)`, else linear `v/max`. Output range [0,1]. Note `renderSteps` is hard-coded false, so the concentric grid rings in the radar renderer are effectively never drawn.
- `shouldWrapRadarText(text)` (internal, L265): true if trimmed text contains whitespace (i.e. multi-word labels are wrap-eligible).
- `getRadarDisplayText(text, fontString, maxWidth)` (exported, L267-L275): wraps multi-word text to `maxWidth` via `wrapText`, else returns text unchanged. Used for radar axis labels, radar title, and legend labels.
- `createRadarAxisLabels(labels, angles, centerX, centerY, radius, backgroundColor): { axisLabels, axisLabelTopY, axisLabelBottomY }` (exported, L277-L364): places one text element per axis just outside the ring. Per label: computes a `baseLabelWidth = min(140, radius*(labels>8?0.56:0.72))`, takes the longest single word's width as a floor, picks `textAlign` from `cos` vs ±0.35 threshold (right side→left-align, left side→right-align, top/bottom→center). **Math detail (L326-L335):** the radial offset projects the text's half-extents onto the axis direction (`|cos|*centerHalfWidth + |sin|*halfHeight`) so the box clears the ring regardless of orientation; anchor = center + dir*(radius + offset + clearance). A `yNudge` of ±BAR_GAP/3 is applied for top/bottom labels (L337-L342). Returns the min top-Y and max bottom-Y across labels for downstream title/legend placement. `verticalAlign: "middle"`.
- `createSeriesLegend(series, seriesColors, centerX, minLegendTopY, fallbackLegendY, backgroundColor): ChartElements` (exported, L366-L473): returns `[]` for ≤1 series. Builds a horizontally-centered "pill": measures each item (swatch + gap + label width), computes `legendY = max(fallbackLegendY, minLegendTopY + maxHalfHeight + RADAR_LABEL_OFFSET)`. Emits a rounded transparent-bg rectangle pill (L416-L430, `ROUGHNESS.architect`, `ROUNDNESS.PROPORTIONAL_RADIUS`), then per series a solid-filled colored swatch rectangle + a left-aligned black label text (L434-L470), advancing `cursorX` by `item.width + RADAR_LEGEND_ITEM_GAP`. Used by bar, line, and radar.
- `ellipsifyTextToWidth(text, maxWidth, fontString, lineHeight)` (internal, L475-L495): truncates char-by-char from the end appending `"..."` until it fits; degenerate fallback `"x..."` or original.
- `wrapOrEllipsifyTextToWidth(...)` (internal, L497-L524): returns `{ wrapped, text }`. If text already fits → no change. If multi-word AND no single word exceeds maxWidth AND maxWidth ≥ approx min line width → wrap; otherwise ellipsify.
- `getRotatedBoundingBox(width, height, angle)` (internal, L526-L537): axis-aligned bounding box of a rotated rect — `{ width: w*|cos|+h*|sin|, height: w*|sin|+h*|cos| }`. Used for fitting rotated x-labels.
- `CartesianAxisLabelSpec` (type, L539-L546): `{ originalText, text, wrapped, metrics, rotatedWidth, rotatedHeight }`.
- `isEllipsifiedLabel(text)` (internal, L548): true if text contains `"..."`.
- `getCartesianAxisLabelSpec(label, maxLabelWidth, maxRotatedWidth, fontString, lineHeight): CartesianAxisLabelSpec` (internal, L550-L672): the x-label fitting optimizer. Generates candidate widths from `maxWidth` down to `minWidth` in steps of 4 (always including `minWidth`); for each it wraps-or-ellipsifies, measures, and computes the rotated bbox at `CARTESIAN_LABEL_ROTATION`. Ranks candidates by `getRank` (L570-L581: prefer non-ellipsified, then more visible chars, then fewer lines, then smaller rotated height) via `shouldPrefer` (L583-L599). Tracks best fitting (overflow ≤ 0), best overflowing (any), and best overflowing non-ellipsified. Final choice (L658-L671): a fitting spec if any; else prefer the non-ellipsified overflow if its overflow is within `CARTESIAN_LABEL_OVERFLOW_PREFERENCE_BUFFER` (8px) of the best overflow; else the smallest-overflow spec. This is the most parity-sensitive algorithm in the file.
- `getRotatedTextElementBottom(element: NonDeletedExcalidrawElement)` (exported, L674-L686): for non-text returns `y+height`; for text returns `y + height/2 + rotatedBBoxHeight/2` (the bottom edge of the rotated label). Used to find where x-labels end so the legend sits below them.
- `chartXLabels(spreadsheet, x, y, backgroundColor, layout): ChartElements` (exported, L688-L743): one rotated text element per `labels` entry (empty array if no labels). `maxRotatedWidth = max(1, slotWidth + gap - SLOT_PADDING*2 + ROTATED_WIDTH_BUFFER)`. centerX per index = `x + index*(slotWidth+gap) + gap + slotWidth/2`. `labelY = axisY + AXIS_CLEARANCE + (rotatedHeight - metricsHeight)/2`. Elements get `angle: CARTESIAN_LABEL_ROTATION`, `textAlign:"center"`, `verticalAlign:"top"`, and `autoResize: !wrapped` (wrapped labels keep their original text as `originalText`).
- `chartYLabels(spreadsheet, x, y, backgroundColor, layout, maxValue?)` (internal, L745-L772): two text elements — `"0"` at bottom-left (`x-gap, y-gap`, right-aligned) and `maxValue.toLocaleString()` at top-left (`y - chartHeight - minLabel.height/2`). `maxValue` defaults to `max(...series[0].values)`.
- `chartLines(spreadsheet, x, y, backgroundColor, layout)` (internal, L774-L815): three linear elements — bottom x-axis (horizontal, width `chartWidth`), left y-axis (vertical, points `(0,0)`→`(0,-chartHeight)`), and a faint dotted "max" gridline at `y - layout.chartHeight - gap` (opacity `GRID_OPACITY`).
- `chartBaseElements(spreadsheet, x, y, backgroundColor, layout, maxValue?, debug?)` (exported, L818-L865): assembles the chart frame: optional centered title (`FONT_SIZES.xl`, `Lilita One`, placed above the plot), an optional translucent debug rectangle (only when `debug` true), then `chartXLabels`, `chartYLabels`, and `chartLines`. The comment at L817 links the original geometry derivation. `maxValue` defaults to `max(...series[0].values)`.

---

### packages/excalidraw/charts/charts.bar.ts

Renders a (clustered) bar chart as `ChartElements`.

- `renderBarChart(spreadsheet: Spreadsheet, x: number, y: number, colorSeed?: number): ChartElements` (L20-L103): the only export.
  - Layout & scale (L26-L36): `getCartesianChartLayout("bar", series.length)`; `max = max(1, ...all clamped-non-negative values)`; resolves `colorOffset`, `backgroundColor`, and per-series `seriesColors`.
  - Clustering math (L37-L51): for multi-series, `interBarGap = max(1, floor(gap/(series+1)))`, `barWidth = max(2, (slotWidth - interBarGap*(series-1))/series)`; single series uses the full `slotWidth`. `clusterWidth` and `clusterOffset = (slotWidth - clusterWidth)/2` center the cluster within its slot.
  - Bars (L53-L76): `series[0].values.flatMap(categoryIndex → series.map(seriesIndex → rectangle))`. `barHeight = (value/max)*chartHeight`; value clamped `>=0`. Color: multi-series uses the series color (solid fill + matching stroke); single series uses `backgroundColor` with `commonProps.fillStyle` (hachure) and default stroke. Position: `x = x + categoryIndex*(slotWidth+gap) + gap + clusterOffset + seriesIndex*(barWidth+interBarGap)`, `y = y - barHeight - gap` (extends upward from baseline). `width=barWidth, height=barHeight`.
  - Frame & legend (L78-L100): `chartBaseElements(...isDevEnv())` (debug rect only in dev), recomputes `chartXLabels` to find `xLabelsBottomY = max(y+gap/2, ...rotatedLabelBottoms)`, and builds a centered `createSeriesLegend` at `x + chartWidth/2`, anchored below the x-labels (fallback `y + gap*5`).
  - Output order (L102): `[...baseElements, ...bars, ...seriesLegend]`. Note `chartXLabels` is effectively computed twice (once inside `chartBaseElements`, once here for the legend Y), a redundancy worth flagging for a reimplementation.

---

### packages/excalidraw/charts/charts.line.ts

Renders a multi-series line chart (polyline per series + dots + dotted value guides) as `ChartElements`.

- `renderLineChart(spreadsheet: Spreadsheet, x: number, y: number, colorSeed?: number): ChartElements` (L24-L130): the only export.
  - Layout & scale (L30-L35): `getCartesianChartLayout("line", series.length)`; `max = max(1, ...all values)` (note: NOT clamped to non-negative, unlike bar).
  - Lines (L37-L62): one `newLinearElement` (type `"line"`) per series. Points are `LocalPoint`s `(valueIndex*(slotWidth+gap), -(value/max)*chartHeight)` — note negative Y so higher values rise. Element placed at `x + gap + slotWidth/2`, `y - gap`; `width`/`height` derived from point min/max extents; `strokeColor = seriesColors[i]`, `strokeWidth: 2`, transparent background.
  - Dots (L64-L81): one solid `ellipse` per data point at `cx = valueIndex*(slotWidth+gap) + gap/2`, `cy = -(value/max)*chartHeight + gap/2`; element x/y offset by `slotWidth/2`, `-gap*2`; size `gap × gap`. Colored per series.
  - Guides (L83-L103): per category, `guideValues = max over series of value` (clamped ≥0); a dotted vertical line from the baseline up to the highest point at that category, opacity `GRID_OPACITY`. Height `cy = (value/max)*chartHeight + gap/2 + gap`, drawn at `y - cy` with points `(0,0)→(0,cy)`.
  - Frame & legend (L105-L127): identical pattern to bar — `chartBaseElements(...isDevEnv())`, `xLabelsBottomY`, centered `createSeriesLegend`.
  - Output order (L129): `[...baseElements, ...lines, ...guides, ...dots, ...seriesLegend]`.

---

### packages/excalidraw/charts/charts.radar.ts

Renders a radar/spider chart as `ChartElements`, or `null` if the spreadsheet is invalid for radar.

- `renderRadarChart(spreadsheet: Spreadsheet, x: number, y: number, colorSeed?: number): ChartElements | null` (L41-L199): the only export.
  - Validation (L47-L49): returns `null` unless `isSpreadsheetValidForChartType(spreadsheet, "radar")` (needs ≥3 dimensions).
  - Setup (L51-L66): labels default to `Value N` when absent; `normalize`/`renderSteps` from `getRadarValueScale`; colors as elsewhere. Geometry: `centerX = x + chartWidth/2`, `centerY = y - chartHeight/2`, `radius = BAR_HEIGHT/2 = 128`. **Angles (L64-L66):** `angle_i = -π/2 + 2π*i/N`, i.e. axis 0 points straight up, going clockwise (screen Y-down).
  - Axis labels (L68-L75): delegated to `createRadarAxisLabels`, returning top/bottom Y bounds.
  - Title (L77-L107): optional, `Lilita One` `FONT_SIZES.xl`, wrapped to `chartWidth + RADAR_LABEL_OFFSET*2`, positioned above the topmost axis label (`axisLabelTopY - RADAR_LABEL_OFFSET - titleHeight/2`).
  - Grid rings (L109-L136): `renderSteps ? RADAR_GRID_LEVELS concentric polygons : []`. Because `getRadarValueScale` hard-codes `renderSteps:false`, this branch is currently dead and produces no rings. Each ring is a closed polygon (`polygon:true`, first point repeated at end) at radius `radius*(level+1)/RADAR_GRID_LEVELS`.
  - Spokes (L138-L154): one faint line per axis from center to `(cos*radius, sin*radius)`, `polygon` absent (open line), opacity `GRID_OPACITY`.
  - Series polygons (L156-L180): per series, point radius = `normalize(value, axisIndex)*radius`; closed polygon (`polygon:true`, first point repeated), `strokeColor = seriesColors[i]`, `strokeWidth: 2`, transparent fill. Missing values default to 0.
  - Legend (L182-L189): centered `createSeriesLegend` below the axis labels (fallback `y + BAR_GAP*5`).
  - Output order (L191-L198): `[...title?, ...axisLabels, ...radarGridLines, ...spokes, ...seriesPolygons, ...seriesLegend]`.
  - Parity note: all radar linear elements set `width`/`height` to bounding extents but the actual shape is fully defined by `points` in local space relative to `(centerX, centerY)`.
