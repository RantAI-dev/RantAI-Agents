# `application/sheet` — XLSX Upgrade (Financial-Model Grade)

**Status:** Design — approved approach, ready for implementation plan
**Date:** 2026-04-23
**Author:** kleopasevan (via Claude)
**Target:** Output parity with Claude.ai's `xlsx` skill — real Excel formulas, number formats, color-coded cells, multi-sheet workbooks, cell notes — without adding LibreOffice, Pyodide, or any server-side runtime dependency.

---

## 1. Context

The current `application/sheet` artifact is CSV-only in effect: the type accepts CSV or a JSON array of flat objects, coerces every value to a string, renders in TanStack Table with lexicographic sort and substring filter, and exports as `.csv`. There are no formulas, no number formats, no multi-sheet workbooks, no cell styling, and no xlsx export.

**What this means for users:**
- Asking for a financial model produces a flat list of pre-computed numbers with no ability to tweak assumptions and see results recompute.
- Asking for a budget with percentages and currency produces `0.15` and `1234.50` instead of `15.0%` and `$1,234.50`.
- "Export this to Excel" produces CSV — which Excel opens, but without formulas, formats, or multiple tabs.

**What already exists in the tree that this design leans on:**
- `xlsx@0.18.5` (SheetJS Community) — used by the RAG parsers; good for reading, thin on formatting for writing. Kept for existing use.
- Pyodide v0.27.6 — wired up for `application/python`. Considered and rejected as an execution substrate for spreadsheets (see §4).
- `generatePptx` for `application/slides` — the reference precedent for declarative-JSON-spec → binary export. This design mirrors that pattern.
- Deployment: Docker / self-hosted Node. LibreOffice is NOT in the image today; adding it is a ~1 GB image delta and a server-side recalc endpoint. This design avoids the dependency.

**The `text/document` rebuild** ([2026-04-23-text-document-design.md](./2026-04-23-text-document-design.md)) sets a precedent we follow here: one declarative spec, two rendering backends (preview + export), zero sandbox, zero code execution.

## 2. Goals and Non-Goals

### Goals

1. Match Claude.ai's `xlsx` skill on output fidelity for everything short of pivot tables and charts embedded in the xlsx.
2. Deliver a live workbook preview in the artifact panel with computed formula values, cell-level formatting, sheet tabs, and a raw-formulas toggle — something Claude's skill does not surface.
3. Ship an honest `.xlsx` file that opens in Excel, LibreOffice, Google Sheets, and Numbers with working formulas and no "press F9 to recalc" weirdness.
4. Preserve every existing CSV artifact in production. Zero visual or behavioral regression on `application/sheet` content that is not a spec.
5. Zero new runtime dependencies: no LibreOffice, no Pyodide coupling, no server-side rendering endpoint.

### Non-Goals (v1)

- **Charts embedded in the xlsx.** Users who want a chart get a better experience from `application/react` + Recharts. xlsx charts are fiddly to author via JSON and give diminishing returns. v2.
- **Conditional formatting.** v2.
- **Data validation dropdowns.** v2.
- **Pivot tables.** v2.
- **Images in cells.** v2.
- **Macros / VBA.** Never supported.
- **Pagination in the preview.** Hard cap via validator instead.
- **Inline cell editing in the preview.** Read-only, same as today.

## 3. Approach — Summary

**Evolve `application/sheet` in place, not introduce a new type.** The renderer auto-detects three content shapes: CSV (legacy), JSON array of objects (legacy), and a new JSON spec (`kind: "spreadsheet/v1"`). Existing artifacts keep the current behavior exactly. New spec content unlocks: formula evaluation, number formatting, multi-sheet workbooks, cell styling, cell notes, named ranges, merged cells, frozen panes, and real `.xlsx` export.

**Why in-place instead of a new `application/spreadsheet` type.** Two reasons:
1. The repo prefers single types with shape dispatch over narrow sibling types *when the underlying intent is the same* (tabular data). Splitting the type surface would force the LLM to make a "pick a type" decision every time a user asks for a table — that decision tends to drift to the simpler option ("the user didn't say 'model', just use sheet") and leaves the rich capability under-used.
2. Every existing sheet artifact in production stays byte-identical. No migration, no dual-render code in two places, no ambiguous type boundary for "I want a list that's also a bit smart."

**Why JSON spec instead of LLM-authored openpyxl Python.** Claude's xlsx skill works in an environment where the assistant has a shell and LibreOffice is one `apt install` away. We don't have that substrate in the browser. Trying to port the skill verbatim leads to either (a) no formula recalc in the preview (Pyodide has no LibreOffice), or (b) adding LibreOffice to the server and building a recalc endpoint (1 GB image, 30s timeout on serverless, a new service surface). A declarative JSON spec sidesteps the whole question: formulas are evaluated in-process by an MIT-licensed JS evaluator, cached values are written into the xlsx at export time, and Excel opens the file with numbers already visible.

**Why not HyperFormula.** Dual-licensed GPL-3.0 or commercial. GPL copyleft is not compatible with this codebase; commercial license is a legal/procurement ask we shouldn't force on Phase 1. We use `@formulajs/formulajs` (MIT, ~500 Excel functions, ~120 KB) plus a ~150-line in-house dep-graph resolver.

## 4. Content Shape — The JSON Spec

```jsonc
{
  "kind": "spreadsheet/v1",                       // version tag, required
  "theme": {                                      // optional
    "font": "Arial",                              // "Arial" | "Calibri" | "Times New Roman"
    "inputColor": "#0000FF",                      // blue — hardcoded inputs
    "formulaColor": "#000000",                    // black — calculations
    "crossSheetColor": "#008000",                 // green — cross-sheet refs
    "highlightFill": "#FFFF00"                    // yellow — cells needing attention
  },
  "namedRanges": {                                // optional, workbook-level
    "GrowthRate": "Assumptions!B3",
    "TaxRate":    "Assumptions!B4"
  },
  "sheets": [
    {
      "name": "Assumptions",                      // required, unique, ≤ 31 chars
      "columns": [                                // optional; length = columns rendered
        { "width": 24 },
        { "width": 14, "format": "$#,##0" }       // column-default format
      ],
      "frozen": { "rows": 1, "columns": 0 },      // optional
      "cells": [
        { "ref": "A1", "value": "Starting Revenue", "style": "header" },
        {
          "ref": "B1",
          "value": 1200000,
          "format": "$#,##0",
          "style": "input",
          "note": "Source: Q4 2025 actuals"
        },
        {
          "ref": "B3",
          "formula": "=B1*(1+GrowthRate)",
          "format": "$#,##0;($#,##0);-",
          "style": "formula"
        }
      ],
      "merges": ["A1:C1"]                         // optional
    }
  ]
}
```

### Types

```typescript
// src/lib/spreadsheet/types.ts
export const SPREADSHEET_SPEC_VERSION = "spreadsheet/v1"

export type CellStyle =
  | "header" | "input" | "formula" | "cross-sheet" | "highlight" | "note"

export type CellValue = string | number | boolean | null

export interface CellSpec {
  ref: string                 // A1 notation, required
  value?: CellValue           // mutually exclusive with `formula`
  formula?: string            // starts with "="
  format?: string             // Excel number format string
  style?: CellStyle
  note?: string               // cell comment
}

export interface ColumnSpec {
  width?: number              // Excel column width units
  format?: string             // default numFmt for all cells in column
}

export interface SheetSpec {
  name: string
  columns?: ColumnSpec[]
  frozen?: { rows?: number; columns?: number }
  cells: CellSpec[]
  merges?: string[]           // e.g. ["A1:C1"]
}

export interface SpreadsheetTheme {
  font?: "Arial" | "Calibri" | "Times New Roman"
  inputColor?: string          // hex
  formulaColor?: string
  crossSheetColor?: string
  highlightFill?: string
}

export interface SpreadsheetSpec {
  kind: typeof SPREADSHEET_SPEC_VERSION
  theme?: SpreadsheetTheme
  namedRanges?: Record<string, string>
  sheets: SheetSpec[]
}
```

### Hard caps (validator enforces)

- Max **8 sheets** per workbook
- Max **500 cells** per sheet (~50 rows × 10 columns of data — plenty for a financial model, intentionally small because this is a chat artifact, not a data warehouse)
- Max **200 formulas** per workbook
- Max **64 named ranges**
- Sheet names: alphanumeric + spaces + underscore only (no `!`, `:`, `*`, `?`, `/`, `\`, `[`, `]`)
- Cell ref syntax: `[A-Z]+[1-9][0-9]*` with optional `$` anchors; 1:1,048,576 row bound; XFD column bound (Excel's limits, not ours)

### Format strings

Excel number format syntax:
- `"$#,##0"`, `"$#,##0.00"` — currency
- `"$#,##0;($#,##0);-"` — currency with parenthesized negatives and dash for zero (Claude xlsx skill convention)
- `"0.0%"`, `"0.00%"` — percentages
- `"0.0x"` — valuation multiples
- `"yyyy-mm-dd"`, `"mmm d, yyyy"` — dates
- `"#,##0"` — plain number with thousand separator
- `"@"` — force text (preserves leading zeros on IDs)

The validator has an allowlist of the common formats above + passes unrecognized ones through with a warning. ExcelJS is forgiving on formats — malformed strings render as General in Excel rather than crashing.

### Styles

Six named styles resolve to ExcelJS style objects at export time, driven by the theme colors:

| Style name | Font color | Fill | Font weight | Purpose |
|---|---|---|---|---|
| `header` | inherit | none | bold | Row 1 / label cells |
| `input` | `theme.inputColor` | none | regular | Hardcoded user-tweakable numbers |
| `formula` | `theme.formulaColor` | none | regular | Calculated cells |
| `cross-sheet` | `theme.crossSheetColor` | none | regular | Formulas that link other sheets |
| `highlight` | inherit | `theme.highlightFill` | regular | "Check this" cells |
| `note` | `#666666` | none | italic | Inline commentary cells |

The LLM authors `"style": "input"` and never sees a color code. This is deliberate: it keeps the prompt short and prevents ad-hoc color drift across artifacts.

### Validator-enforced anti-patterns

- `#REF!`, `#NAME?` at validate-time: we parse every formula AST and check that every cell ref + named range it touches is defined in the spec.
- Circular references: dep-graph cycle detection before evaluation.
- Cell with both `value` and `formula`.
- Merges that overlap another merge or a cell that's already ranged in.
- Sheet names with forbidden characters.
- Over-cap workbooks (sheets/cells/formulas/named ranges).
- Inherited from the existing CSV validator: currency symbols or thousand separators inside numeric cells (warn), mixed date formats in date-ish columns (warn), all-identical column (warn).

## 5. Component Map

### New files (4)

| File | Responsibility | Approx. LOC |
|---|---|---|
| `src/lib/spreadsheet/types.ts` | `SpreadsheetSpec`, `SheetSpec`, `CellSpec`, `CellStyle`, `FormatString`, `SPREADSHEET_SPEC_VERSION` | ~120 |
| `src/lib/spreadsheet/parse.ts` | `detectShape(content)` → `"csv" \| "array" \| "spec"`; `parseSpec(json)` → `{ spec, errors, warnings }`; shape-specific schema checks + caps | ~200 |
| `src/lib/spreadsheet/formulas.ts` | AST parser (via `fast-formula-parser`), dep graph, topological sort, evaluator wrapping `@formulajs/formulajs`; exports `evaluateWorkbook(spec) → Map<cellRef, { value, error? }>` | ~250 |
| `src/lib/spreadsheet/generate-xlsx.ts` | `generateXlsx(spec, computedValues) → Promise<Blob>`; builds ExcelJS Workbook, applies styles, writes formulas + cached values, applies merges + named ranges | ~220 |

### Modified files (6)

| File | Change | Size impact |
|---|---|---|
| `src/features/conversations/components/chat/artifacts/renderers/sheet-renderer.tsx` | Split into three sub-views: `CsvTableView` (extracted, unchanged), `ArrayTableView` (extracted, unchanged), `SpecWorkbookView` (new). Top-level component dispatches on `detectShape`. Sheet tabs, formula toggle, A/B/C column letters, clicked-cell footer, type-aware sort all live in `SpecWorkbookView`. | ~250 → ~550 LOC |
| `src/lib/prompts/artifacts/sheet.ts` | Adds a "Shape C: JSON spec" section with the schema, a pedagogical "when to pick each shape" table, and one realistic example (3-year revenue projection: Assumptions + Projections sheets, named ranges, formatted cells). | ~120 → ~340 lines |
| `src/lib/tools/builtin/_validate-artifact.ts` | `validateSheet` branches on shape; if spec, delegates to `validateSpreadsheetSpec` from `spreadsheet/parse.ts`. CSV/array branches unchanged. | +30 lines |
| `src/features/conversations/components/chat/artifacts/artifact-panel.tsx` | `getExtension` for `application/sheet` peeks at content shape, returns `.xlsx` when spec. `handleDownload` adds a spec branch that lazy-imports `generateXlsx`. Download UI shows both `⬇ CSV` and `⬇ XLSX` buttons when spec. | ~25 lines changed |
| `src/lib/prompts/artifacts/context.ts` | One-liner summary updated: "tabular data — CSV/JSON array for flat tables, JSON spec for workbooks with formulas and formatting." | 2 lines |
| `package.json` | Adds `exceljs` (MIT, ~900 KB ungz), `@formulajs/formulajs` (MIT, ~120 KB), `fast-formula-parser` (MIT, ~40 KB). SheetJS (`xlsx`) stays for the RAG parsers. | deps |

### Files deliberately not touched

- No migration. `Artifact.content` is already `Text`; the JSON spec is just a longer string.
- No API route. Download goes through the existing panel handler, same as slides.
- No S3 key format change.
- No enum/registry changes. Type identity is still `application/sheet`.

### Bundle cost at idle

- ExcelJS: lazy-imported inside `handleDownload` for spec content only. **0 KB at idle.**
- `@formulajs/formulajs`: lazy-imported inside `SpecWorkbookView` only when content is a spec. CSV/array renders pay nothing. **0 KB at idle.**
- `fast-formula-parser`: imported by `spreadsheet/formulas.ts`, which is only loaded from `SpecWorkbookView` and the XLSX exporter. **0 KB at idle.**
- Net cold-start bundle delta: **0 KB.** Cost is deferred until the user actually opens or downloads a spec sheet.

## 6. Data Flow

### Create path (LLM → validator → DB)

```
LLM emits JSON string
  → create-artifact tool
    → validateArtifact(content, "application/sheet")
      → detectShape(content) = "spec"
      → parseSpec(json)
          - JSON.parse with good error messages
          - schema shape check
          - caps check (sheets/cells/formulas/namedRanges)
          - sheet-name character check
          - A1 ref syntax check
      → structural checks
          - no cell has both value and formula
          - merges don't overlap or split
      → semantic checks
          - build formula AST for each formula cell
          - resolve every ref + named range → error if undefined
          - build dep graph → error on cycles
      → return { ok, errors, warnings }
  → if ok: uploadFile(s3Key, content) + prisma.artifact.upsert(content: string)
  → if !ok: LLM retries with error list (existing retry loop unchanged)
```

### Read / preview path (DB → renderer)

```
Artifact.content (string) → <ArtifactRenderer />
  → lazy import renderers/sheet-renderer
  → SheetRenderer detects shape
      - "csv"   → <CsvTableView />   (existing behavior, extracted)
      - "array" → <ArrayTableView /> (existing behavior, extracted)
      - "spec"  → <SpecWorkbookView />
          1. parseSpec(content)
          2. lazy import @formulajs/formulajs + fast-formula-parser + in-house evaluator
          3. evaluateWorkbook(spec) → Map<cellRef, { value, error? }>
          4. render active sheet into TanStack table:
               - columns from spec.sheets[active].columns (or inferred from max col ref)
               - rows from max row ref
               - each cell renders format(computedValue, cell.format) OR raw formula when ƒx toggle is on
               - style-name → class mapping applies color + fill
          5. UI adds:
               - sheet tabs above table (hidden if single sheet)
               - formula toggle in toolbar
               - A/B/C column letters + 1/2/3 row numbers
               - click-a-cell footer: "{ref}: {formula} | {format} | {note}"
               - type-aware sort (numeric/date comparators for typed columns)
```

### Download path (button click → user's disk)

```
handleDownload in artifact-panel
  → if type === "application/sheet":
      shape = detectShape(content)
      if shape === "spec":
          dynamic import "@/lib/spreadsheet/generate-xlsx"
          spec = parseSpec(content)
          values = evaluateWorkbook(spec)
          blob = await generateXlsx(spec, values)
          trigger <a download="<slug>.xlsx">
      else:
          existing CSV blob path, unchanged
```

`generateXlsx` in one pass:
1. `new ExcelJS.Workbook()`, set `workbook.creator`, `workbook.created`.
2. For each sheet: `workbook.addWorksheet(name)`, apply column widths / column default formats, apply `frozen` pane.
3. For each cell: write `value` OR `{ formula, result }` where `result` is the cached computed value from our evaluator. This is what makes Excel open with numbers already visible — no F9 needed.
4. Apply style (font color, fill, bold/italic, numFmt) from the theme + style-name mapping.
5. For each merge: `sheet.mergeCells(range)`.
6. For each named range: `workbook.definedNames.add(name, ref)`.
7. `workbook.xlsx.writeBuffer()` → `new Blob([buf], { type: MIME_XLSX })`.

### Update path (user: "change the growth rate")

The existing `update-artifact` tool is shape-preserving. For spec content, the prompt instructs the LLM to emit a **full new spec** (not a cell-level patch). This matches how slides updates work today and keeps the update machinery simple. The rule: *"Preserve the source shape. Upgrade CSV/array content to JSON spec only when the request requires a capability CSV cannot express — live formulas, number formatting, multiple sheets, cell styling."*

## 7. Formula Engine

**Chosen stack:**
- `@formulajs/formulajs` (MIT, ~120 KB) — implements ~500 Excel functions purely: `SUM`, nested `IF`, `VLOOKUP`, `INDEX`/`MATCH`, `IFERROR`, `NPV`, `IRR`, `XIRR`, `PMT`, `SUMIF`, `SUMIFS`, `TEXT`, `DATE`, `EOMONTH`, `NETWORKDAYS`, `AVERAGEIFS`, `COUNTIFS`. Everything Tier B needs.
- `fast-formula-parser` (MIT, ~40 KB) — produces an AST for each formula and extracts cell refs / named range usages. Battle-tested against Excel's edge cases (`$A$1` absolute, `A:A` whole-column, `Sheet1:Sheet3!A1` 3D refs).
- ~150 lines of in-house glue for dep graph + topological sort + Formula.js dispatch.

**Why not HyperFormula:** dual-licensed GPL-3.0-or-later or commercial. GPL copyleft is incompatible with this repo's licensing posture. The commercial license is a procurement conversation we shouldn't force on Phase 1.

**Why not porting openpyxl via Pyodide:** see §3 and §8 below. Short version: Pyodide can run openpyxl, but openpyxl does not evaluate formulas — Claude's skill leans on LibreOffice to recalc. We don't have LibreOffice in the browser, and adding it to the Docker image is a 1 GB delta plus a server recalc endpoint we'd then have to operate.

**Volatile functions** (`NOW()`, `RAND()`, `TODAY()`) are evaluated once at preview / export time; the computed value is written into the xlsx as the cached result. Excel re-evaluates on open the same way it does any xlsx. Fine.

**Functions not mapped cleanly to Formula.js:** the evaluator returns `{ error: "#NAME?" }` for that cell. The preview shows `#NAME?` in red. The validator surfaces the unrecognized function as a warning at authoring time so the LLM can swap it for a supported one before shipping.

## 8. Alternatives Considered (and Why Not)

**B — LLM writes openpyxl Python executed in Pyodide.**
- Mirrors Claude's xlsx skill verbatim. Highest LLM "muscle memory."
- Rejected because: (a) Pyodide has no LibreOffice, so formulas in the preview would show as empty cells until opened in Excel; (b) server-side recalc would need LibreOffice in the Docker image (1 GB delta) plus a new API route with non-trivial timeout/memory tuning; (c) update-artifact diffs become whole-script rewrites instead of cell-level changes, costing tokens and making "change this one assumption" flows worse; (d) Pyodide cold-start (~3 s) every preview is a bad UX.

**C — New type `application/spreadsheet` in parallel to `application/sheet`.**
- Cleaner type boundaries on paper. Rejected because forcing the LLM to make a "pick a type" decision tends to default to the simpler option, leaving the rich capability under-used; and because shape dispatch inside one type is a lighter architectural cost than two full registry entries with overlapping concerns.

**D — Full replacement: one type, JSON spec only, deprecate CSV/JSON-array.**
- Cleanest long-term. Rejected because every existing sheet artifact in production would need either a migration or a legacy-render fallback, and because "simple CSV" users would be forced to author a heavier spec for a use case the simpler shape serves fine.

**E — Server-side xlsx generation** (Node route that spawns LibreOffice / runs openpyxl on a worker).
- Tempting because it moves the 900 KB ExcelJS bundle off the client. Rejected because: (a) the bundle cost is zero at idle (lazy-loaded); (b) a new API route adds a failure surface we don't need; (c) slides already do client-side binary generation and it works well; (d) it forces a round trip to the server on every download, including for pre-existing workbooks the user opens offline.

## 9. Error Handling

**Validator (create/update time):**
- Parse errors → `errors[]`, LLM retries.
- Formula refs to undefined cells → `errors[]` with the offending ref.
- Cycles → `errors[]` with the cycle path (`B3 → C3 → B3`).
- Unknown format strings → `warnings[]` (pass-through; ExcelJS is forgiving).
- Unknown style names → `errors[]` (typos are usually bugs).
- Over-cap workbooks → `errors[]`.
- Inherited CSV heuristics (currency in number cells, mixed date formats, all-identical column) → `warnings[]`.

**Renderer (preview time):**
- Invalid JSON spec → fall back to the existing `parseError` UI (amber warning + raw content panel).
- Single-cell evaluation error → cell shows `#REF!`, `#NAME?`, `#DIV/0!`, `#VALUE!` in red. Other cells keep computing. Footer shows the offending formula.
- Lazy-load failure (network drops while importing ExcelJS or Formula.js) → toast + disable Download XLSX button; CSV download remains available.
- Unsupported format string → cell shows the raw number; no crash.

**Exporter (download time):**
- Any ExcelJS write error → toast error + fall back to "Download active sheet as CSV." Never silent failure. Never a corrupt file on disk.

## 10. Testing

**New unit tests:**
- `tests/unit/spreadsheet/parse.test.ts` — shape detection on ~12 fixtures; schema validation on ~8 invalid specs; error message regression.
- `tests/unit/spreadsheet/formulas.test.ts` — dep graph ordering; cycle detection; Formula.js integration on ~15 representative formulas (`SUM`, nested `IF`, `VLOOKUP`, `XIRR`, `SUMIFS` with named range, `INDEX`/`MATCH`, `IFERROR`-wrapped `VLOOKUP`).
- `tests/unit/spreadsheet/generate-xlsx.test.ts` — round-trip: generate xlsx → read back with SheetJS → assert values, formulas, formats, merges, named ranges, column widths, frozen panes match the spec.
- `tests/unit/validate-artifact.test.ts` — extend with 6–8 spec-shape cases (happy path, undefined ref, cycle, over-cap, bad sheet name, malformed A1).

**New integration tests:**
- `tests/integration/spreadsheet-renderer.test.ts` (jsdom) — render a spec with formulas, assert computed values appear in the cells, toggle ƒx to reveal raw formulas, click a cell, verify footer shows `{ref, formula, format, note}`.

**Regression guards:**
- Existing `tests/unit/validate-artifact.test.ts` CSV/array cases stay green (zero change to behavior).
- Existing CSV round-trip tests in the renderer stay green (`SheetRenderer` dispatch must still land on `CsvTableView`).

## 11. Phasing

| Phase | Lands | User-visible? | Merge guard |
|---|---|---|---|
| **1. Spec + validator** | `spreadsheet/types.ts`, `spreadsheet/parse.ts`, `spreadsheet/formulas.ts`, validator branch, plus a minimal renderer guard that pretty-prints the JSON spec when detected (temporary, replaced in Phase 2) | No — LLM can author a spec and it survives the validator; preview shows pretty-printed JSON until Phase 2 | Unit tests green; spec content does not hit the CSV parse-error panel |
| **2. Renderer** | `SpecWorkbookView`, shape dispatch in `sheet-renderer.tsx` | Yes — spec content gets the rich preview; download still flattens to CSV | Renderer integration tests green; CSV regression tests green |
| **3. XLSX export** | `generate-xlsx.ts`, download handler branch, dual-button toolbar | Yes — button swaps to "Download XLSX" on spec content | Round-trip xlsx tests green |
| **4. Prompt rules** | Sheet prompt gains Shape C section + decision table + one seed example | Yes — the LLM actually starts emitting specs | Smoke: 50 seed prompts, validator rejection rate < 5% after tuning |

Each phase is independently mergeable. Phase 1 is safe because spec content renders as raw JSON until Phase 2 lands, which matches what happens today for unparseable CSV. Phase 4 is the lever that turns the capability on for real users — holding it until 1–3 are hardened means we don't ship a feature whose LLM behavior we haven't seen.

## 12. Success Criteria

1. Every existing CSV and JSON-array artifact in production renders identically to today (visual diff of 20 representative artifacts: no differences).
2. A financial-model prompt ("3-year revenue projection with 15% growth assumption, EBITDA margin, and a terminal value") produces a spec that:
   - validates without errors;
   - previews with correct computed values in every formula cell;
   - exports to an `.xlsx` that opens cleanly in Excel 365, LibreOffice Calc, Google Sheets, and Numbers with no recalculation required to see numbers.
3. Formula error rate at authoring time (validator rejections on first LLM attempt) < 5% after Phase 4 prompt tuning, measured across a 50-prompt smoke set covering: budgets, cap tables, loan amortization, scenario comparisons, P&Ls, cohort retention grids.
4. Bundle size at idle is unchanged (lazy-loaded imports verified via `next build` bundle analyzer).
5. No new container dependency. Same Docker image, same deploy surface.

## 13. Open Questions

- **Seed prompt set for Phase 4 tuning.** Who owns curating the 50 prompts? Suggest pulling 20 from real user traffic over the last 30 days tagged "financial model" or similar, 20 from the Claude xlsx skill's own example gallery, and 10 from finance textbook exercises. Decision needed before Phase 4 starts.
- **Locale.** Formula.js is US-English (comma arg separator). If a user's Excel is set to `;` separator, the exported xlsx still opens correctly (Excel normalizes on open), but the LLM's formula authoring should stay US-style. No action for v1; flag for v2.
- **Long-cell text wrapping in the preview.** ExcelJS supports `alignment: { wrapText: true }`. Decide whether `style` gets a `wrap` variant or whether that stays a v2 field. Suggest: not in v1 — keep the style surface small.
