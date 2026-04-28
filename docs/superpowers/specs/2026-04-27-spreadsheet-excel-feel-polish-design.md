# Spreadsheet Artifact — Excel-Feel Polish Design

**Status:** Approved direction 2026-04-27 after side-by-side screenshot analysis vs Claude.ai File Builder.
**Goal:** Bring `application/sheet` panel preview to 90-100% visual + presentational parity with Claude.ai's xlsx artifact preview while keeping current architectural strengths (typed JSON spec, streaming, manual edit, click-cell formula).

---

## 1. Background

User reported the panel preview "kurang professional" vs Claude.ai. Side-by-side screenshot comparison (`docs/artifact-plans/{data,chart}-tabs-preview*.png`) confirmed:

- **Same paradigm** as ours: read-only grid with A/B/C column letters + row numbers + sheet tabs.
- **Different visual polish**: Excel-like chrome (color coding, currency formatting, bold section headers, yellow highlights, right-aligned numerics, bottom sheet tabs, default Arial font).
- **Charts tab missing** in our build — Claude has separate Data/Charts tab toggle that renders bar/line charts from spec data.

Stack difference (Python+openpyxl+LibreOffice vs our Node+ExcelJS+local evaluator) is **not** a target for this rebuild — both produce real .xlsx; the user's perception gap is preview UI, not generation.

## 2. Architectural decisions (locked)

| Decision | Choice | Rationale |
|---|---|---|
| Paradigm | Keep custom React grid (not server-render image) | Claude.ai uses same paradigm; preserves streaming + click-cell affordances |
| Cell coordinates | Keep A/B/C + row numbers visible | Matches Claude.ai screenshots; explicit confirmation |
| Read-only display | Keep (already read-only) | Matches Claude.ai |
| Color coding | Always auto-apply skill rules | Universal; no opt-in toggle |
| Number format engine | `numfmt` npm library (MIT, ~10KB) | Battle-tested Excel format string parser |
| Default font | Arial enforced via theme.font | Skill mandate |
| Sheet tabs position | Bottom (move from current top) | Excel pattern + matches Claude |
| Formula bar | Top of grid (move from footer) | Excel + Claude pattern |
| Charts tab | Add Data/Charts toggle when spec has charts | Closes the visible Claude feature |
| Chart library | Recharts (already in repo via React artifact) | No new dep; matches existing stack |
| Sticky row labels | Yes (left col sticky on horizontal scroll) | Excel pattern |
| Frozen panes visual | Render `frozen.rows/columns` from spec | Schema field already there, currently unrendered |

## 3. Visual polish targets (Phase A)

### 3.1 Color coding — auto-apply per skill rules

For each cell, classify and apply text color at render time:

```ts
type ColorClass = "input" | "formula" | "cross-sheet" | "external" | "header" | "default"

function classifyCell(cell: CellSpec): ColorClass {
  if (cell.style === "header") return "header"           // user-set wins
  if (cell.style === "highlight") return "default"        // bg yellow handled separately
  if (!cell.formula) return "input"                       // plain value
  if (/'\[.*\]/.test(cell.formula)) return "external"     // refs external file
  if (/\b[A-Za-z_][\w ]*!/.test(cell.formula))            // refs Sheet!A1
    return "cross-sheet"
  return "formula"                                        // default formula
}
```

Color mapping (skill values):
| Class | Text color (hex) |
|---|---|
| input | `#0000FF` (blue) |
| formula | `#000000` (black) |
| cross-sheet | `#008000` (green) |
| external | `#FF0000` (red) |
| header | inherit + bold |
| default | inherit |

`style: "highlight"` adds `background-color: #FFFF00` (yellow) regardless of text class. Section headers (`style: "header"`) add `font-weight: 700` + 12.5pt instead of 11pt.

### 3.2 Auto-alignment

Apply at render time based on cell value type **unless** explicit `align` field set:

| Value type | Default alignment |
|---|---|
| number | right |
| boolean | center |
| string | left |
| null/undefined | left |

Currency / percentage / date formats inherit numeric alignment.

### 3.3 Number format engine — `numfmt` library

Replace the local `formatCellValue` (current ad-hoc JS) with `numfmt`:

```ts
import { format as nfFormat } from "numfmt"
const display = nfFormat("$#,##0;($#,##0);-", value)  // → "$1,234" / "($1,234)" / "-"
```

Supports the full Excel format-string spec: positive;negative;zero;text sections, currency, percentage, scientific, date/time, conditional, color codes (we ignore color codes — color comes from our coding system).

Edge cases:
- Empty cells → render as `""` (no zero placeholder)
- Number with no format → use `numfmt`'s "General" handling
- Non-numeric value with numeric format → fallback to raw text

### 3.4 Excel chrome elements

- **Header background**: `linear-gradient(to bottom, #f9fafb, #f3f4f6)` (Tailwind `from-gray-50 to-gray-100`)
- **Gridlines**: 1px solid `#d4d4d4` (Tailwind `border-gray-300` close enough)
- **Active cell ring**: 2px solid `#1a73e8` (or `outline-blue-600`)
- **Active row + column header highlight**: `bg-blue-100`
- **Cell padding**: tightened from `py-1 px-3` (8px/12px) to `py-0.5 px-2` (2px/8px) for Excel density
- **Default font**: applied via `font-family: Arial, sans-serif` on `<table>`, override per spec.theme.font

### 3.5 Top formula bar

Replace footer-based cell info with Excel-style top bar:

```
┌──────────────┬───────────────────────────────────────┐
│   [B5]   ▼   │  ƒx  =SUM(B2:B4)                     │
└──────────────┴───────────────────────────────────────┘
```

- Name Box (left, ~96px wide): cell ref + dropdown chevron (read-only chevron — purely visual)
- ƒx icon + formula/value display (right, monospace, italic if formula, plain if value)
- Empty when no cell selected

### 3.6 Sticky row labels

`<td>` for row numbers gets `position: sticky; left: 0; z-index: 5; background: <header-gradient>`. Same z-index treatment as the top header so they overlap correctly.

### 3.7 Bottom sheet tabs

Move existing top tabs to bottom. Pattern:
- `bg-white border-t shrink-0`
- Each tab: rounded-top, white-active with `border-b-2 border-blue-600`, gray-400 inactive
- Scroll horizontally if many sheets

### 3.8 Frozen panes visual

If `sheet.frozen.rows = N`: `<tr>` at row N gets `border-bottom: 2px solid #999`.
If `sheet.frozen.columns = M`: every `<td>` at col M gets `border-right: 2px solid #999`.

## 4. Charts tab (Phase B)

### 4.1 Schema extension

Add to `src/lib/spreadsheet/types.ts`:

```ts
export interface ChartAxis {
  title?: string
  format?: string  // numfmt format string for tick labels
}

export interface ChartSeriesSpec {
  name: string
  range: string  // "Sheet1!B2:B6"
  color?: string  // hex; auto-cycle from palette if absent
}

export interface ChartSpec {
  id: string
  title?: string
  type: "bar" | "line" | "pie" | "area"
  categoryRange: string  // x-axis labels, e.g. "Sheet1!A2:A6"
  series: ChartSeriesSpec[]
  xAxis?: ChartAxis
  yAxis?: ChartAxis
  stacked?: boolean
}

export interface SpreadsheetSpec {
  // ...existing fields...
  charts?: ChartSpec[]  // NEW
}

export const SPREADSHEET_CAPS = {
  // ...existing...
  maxCharts: 8,  // NEW
} as const
```

### 4.2 Chart resolver

`src/lib/spreadsheet/chart-data.ts` — resolve a `ChartSpec` to a Recharts-compatible data array by reading values via the existing `WorkbookValues`:

```ts
export interface ResolvedChartData {
  rows: Array<Record<string, string | number>>  // [{ category, series1, series2, ... }, ...]
  series: Array<{ name: string; color: string }>
}

export function resolveChartData(
  chart: ChartSpec,
  values: WorkbookValues,
): ResolvedChartData
```

Handles range parsing (`Sheet1!A2:A6`), missing values (skip row), and color cycling.

### 4.3 Chart renderer component

`src/features/conversations/components/chat/artifacts/renderers/sheet-chart-view.tsx`:
- Lists charts; each rendered via Recharts (`<BarChart>`, `<LineChart>`, etc.)
- Centered title; legend at top; responsive sizing
- Empty state when chart spec resolves to 0 rows

### 4.4 Tab toggle integration

In `SpecWorkbookView`:
- If `spec.charts` is empty → no toggle, single Data view (current)
- If present → top-level tab toggle "Data | Charts" before sheet tabs/grid
- Charts view replaces grid; sheet tabs hidden in Charts view

### 4.5 LLM prompt update

`src/lib/prompts/artifacts/sheet.ts` Shape C section gains a chart subsection:

```
**Charts (optional)**: emit `charts: [...]` for visual presentations:
- type: "bar" / "line" / "pie" / "area"
- categoryRange + series ranges (Sheet1!A2:A6 syntax)
- one chart per visual
- prefer charts for: trend over time, comparison, distribution
- panel auto-adds Data/Charts tab toggle when charts present
```

Plus a worked example showing Revenue Trajectory bar chart.

### 4.6 Native xlsx chart export

`generate-xlsx.ts` extended: when `spec.charts` present, emit ExcelJS native chart objects so downloaded `.xlsx` opens with real Excel charts (not just data tables).

## 5. Components and file structure

### New files

```
src/lib/spreadsheet/
├── format.ts                      # wrapper around numfmt with our defaults
├── cell-classify.ts               # color coding logic
└── chart-data.ts                  # resolve ChartSpec → Recharts data

src/features/conversations/components/chat/artifacts/renderers/
├── sheet-chart-view.tsx           # NEW Charts tab component
├── sheet-formula-bar.tsx          # NEW top formula bar (extracted from inline)
└── sheet-spec-view.tsx            # MAJOR rewrite

tests/unit/spreadsheet/
├── format.test.ts                 # currency/percent/date format cases incl. Excel "$#,##0;($#,##0);-"
├── cell-classify.test.ts          # input/formula/cross-sheet/external rules
└── chart-data.test.ts             # range parsing + Recharts data shape

tests/unit/renderers/
└── sheet-spec-view.test.tsx       # color coding rendered, sticky col, sheet tabs at bottom
```

### Modified files

```
src/lib/spreadsheet/types.ts                # add ChartSpec types + maxCharts cap
src/lib/spreadsheet/parse.ts                # validate ChartSpec
src/lib/spreadsheet/styles.ts               # extend resolveCellStyle with classifyCell output
src/lib/spreadsheet/generate-xlsx.ts        # emit native ExcelJS charts when spec has charts
src/lib/prompts/artifacts/sheet.ts          # chart usage rules + worked example
package.json                                # add `numfmt` dep
```

## 6. Data flow

### Render flow (per panel mount)

1. `parseSpec(content)` — Zod-validates spec, surfaces errors via amber banner
2. `evaluateWorkbook(spec)` — local Kahn's-sort formula eval, populates `WorkbookValues`
3. If `spec.charts` present → user sees Data/Charts tab toggle; default Data
4. Data view: render grid via `<SpecWorkbookView>` with new chrome
5. Charts view: render each chart via `<SheetChartView>` using `resolveChartData()`
6. Cell click → set `selectedRef`, formula bar updates
7. Sheet tab click → switch active sheet, reset selection

### Color classification (per cell render)

1. `classifyCell(cell)` returns one of `input` / `formula` / `cross-sheet` / `external` / `header` / `default`
2. Maps to Tailwind classes via `colorClassToClassName`
3. Combined with format-string-rendered display value
4. Auto-align inferred from value type

### Download (unchanged)

- "Download XLSX" button → `generateXlsx(spec)` → blob download
- Charts now render natively in the .xlsx output
- Numeric values flow through current path; formats come from `cell.format` field

## 7. Testing strategy

| Layer | Test |
|---|---|
| Format | Currency `$#,##0;($#,##0);-` for 1234 / -1234 / 0 → `$1,234` / `($1,234)` / `-`. Percent `0.0%` for 0.15 → `15.0%`. Multiple `0.0x` for 12.5 → `12.5x`. Date format. Edge: empty/null/non-numeric. |
| Cell classify | Plain value → input. Has formula → formula. Formula `=Sheet2!A1` → cross-sheet. Formula `='[ext.xlsx]Sheet1'!A1` → external. `style: header` overrides. `style: highlight` keeps text color, adds yellow bg. |
| Chart data resolver | Resolves `Sheet1!A2:A6` to 5 rows. Multi-series. Missing values skip. Color cycle. |
| sheet-spec-view render | Color classes on cell `<td>`. Sticky left col. Bottom sheet tabs (not top). Formula bar populates on cell click. Frozen-pane border at correct row/col. |
| chart view render | Bar/line/pie render via Recharts. Empty chart spec → empty state. |
| Generate xlsx | Native chart object embedded when spec has charts. |

## 8. Out of scope

- Range selection (drag to select multiple cells) — interaction model overhaul, not in current paradigm
- Copy/paste cell ranges — same
- Fill handle — same
- Status bar at bottom (cell count, sum/avg) — defer; Claude doesn't show this either per screenshots
- Cell hyperlinks rendered as clickable in preview — defer
- Conditional formatting — schema gap, large effort
- Pivot tables — schema gap, large effort

## 9. Effort estimate

- Phase A (visual polish): ~1.5 days
- Phase B (Charts tab): ~1.5 days
- Total: ~3 days, single-track

Tests + manual smoke included in estimate.

## 10. Migration / compatibility

- All changes are additive to the spec (`charts` field optional)
- Existing artifacts without `charts` show no Data/Charts toggle — render exactly as before, just with new visual polish
- No DB migration required
- No breaking change to LLM prompt — Shape A/B (CSV) still works; Shape C gains optional `charts` field
- Old artifacts with `style: "highlight"` already render yellow bg today — visual is unchanged for that path

## 11. Confidence rate

Target: 90-100% match with Claude.ai File Builder visual.

Phase A alone: ~85% (closes color coding + chrome + format + sheet tabs).
Phase A + B: ~95% (adds Charts tab, the most visible Claude-only feature).

Remaining gap not closed by this design:
- Conditional formatting (Claude has openpyxl support; we'd need schema extension — out of scope)
- Image-embedded cells — out of scope
- Charts: pivot, scatter, advanced types — Phase B implements bar/line/pie/area; advanced types are out of scope
