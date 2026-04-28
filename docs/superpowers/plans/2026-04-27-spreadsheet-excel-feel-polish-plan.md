# Spreadsheet Excel-Feel Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the `application/sheet` panel preview look 90-95% like Claude.ai's xlsx artifact preview while keeping the existing typed-JSON spec, ExcelJS generation, streaming, and click-cell affordances intact.

**Architecture:** Custom React grid (`SpecWorkbookView`) gains Excel-feel chrome — color coding, real Excel number formats via the `numfmt` library, top formula bar with Name Box, sticky row labels, bottom sheet tabs, frozen panes visualization, Arial font, tighter density. Schema additively gains an optional `charts: ChartSpec[]` field that surfaces a Data/Charts tab toggle and renders bar/line/pie/area visualizations via Recharts. ExcelJS generator emits native chart objects so the downloaded `.xlsx` carries the same charts.

**Tech Stack:** Next.js 15 + React + TypeScript, Tailwind CSS, Zod, ExcelJS (existing), Recharts (already in repo), `numfmt` (NEW), vitest, bun.

**Spec reference:** `docs/superpowers/specs/2026-04-27-spreadsheet-excel-feel-polish-design.md`

**Branch:** create a fresh branch off `main` named `feat/spreadsheet-excel-feel-polish`. Do NOT execute on `main` directly.

---

## File Structure

### New files

```
src/lib/spreadsheet/
├── format.ts                     # numfmt wrapper with our default handling
├── cell-classify.ts              # color coding: input | formula | cross-sheet | external | header
└── chart-data.ts                 # resolveChartData(spec, values) → Recharts data shape

src/features/conversations/components/chat/artifacts/renderers/
├── sheet-formula-bar.tsx         # top formula bar component (Name Box + ƒx + display)
└── sheet-chart-view.tsx          # Charts tab — Recharts bar/line/pie/area renderer

# Tests
tests/unit/spreadsheet/
├── format.test.ts
├── cell-classify.test.ts
└── chart-data.test.ts

tests/unit/renderers/
└── sheet-spec-view-render.test.tsx
```

### Modified files

```
src/lib/spreadsheet/types.ts                # add ChartSpec types + maxCharts cap
src/lib/spreadsheet/parse.ts                # validate ChartSpec via Zod
src/lib/spreadsheet/styles.ts               # extend resolveCellStyle with classifyCell output
src/lib/spreadsheet/generate-xlsx.ts        # emit native ExcelJS charts when spec.charts
src/lib/prompts/artifacts/sheet.ts          # charts subsection + worked example
src/features/conversations/components/chat/artifacts/renderers/sheet-spec-view.tsx  # major rewrite
package.json                                # add `numfmt` dep
```

---

## Branch setup (run once before Task 1)

```bash
cd /home/shiro/rantai/RantAI-Agents
git switch main
git pull origin main
git switch -c feat/spreadsheet-excel-feel-polish
```

Verify clean:
```bash
git status --short
```
Pre-existing dirty files (`.gitignore`, `packages/rantaiclaw`, etc.) untouched.

---

## Task 1: Install `numfmt` dependency

**Files:**
- Modify: `package.json`
- Modify: `bun.lock`

- [ ] **Step 1: Add the dep**

```bash
cd /home/shiro/rantai/RantAI-Agents
bun add numfmt
```

- [ ] **Step 2: Verify install**

```bash
node -e 'const n = require("numfmt"); console.log(typeof n.format)'
```
Expected: `function`

- [ ] **Step 3: Commit**

```bash
git add package.json bun.lock
git commit-sulthan -m "chore(spreadsheet): add numfmt dependency for Excel format string parsing"
```

---

## Task 2: Format helper — Excel format string engine

**Files:**
- Create: `src/lib/spreadsheet/format.ts`
- Create: `tests/unit/spreadsheet/format.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/spreadsheet/format.test.ts
import { describe, it, expect } from "vitest"
import { formatNumber } from "@/lib/spreadsheet/format"

describe("formatNumber", () => {
  it("renders currency with parens for negatives and dash for zero per Excel spec", () => {
    const fmt = "$#,##0;($#,##0);-"
    expect(formatNumber(1234, fmt)).toBe("$1,234")
    expect(formatNumber(-1234, fmt)).toBe("($1,234)")
    expect(formatNumber(0, fmt)).toBe("-")
  })

  it("renders percentage with 1 decimal", () => {
    expect(formatNumber(0.15, "0.0%")).toBe("15.0%")
  })

  it("renders multiples format (valuation)", () => {
    expect(formatNumber(12.5, "0.0x")).toBe("12.5x")
  })

  it("returns empty string for null/undefined values", () => {
    expect(formatNumber(null as unknown as number, "0.00")).toBe("")
    expect(formatNumber(undefined as unknown as number, "0.00")).toBe("")
  })

  it("falls back to value as string for non-numeric input with numeric format", () => {
    expect(formatNumber("hello" as unknown as number, "$#,##0")).toBe("hello")
  })

  it("handles missing format with General-style output", () => {
    expect(formatNumber(1234.567, undefined)).toBe("1234.567")
    expect(formatNumber(0, undefined)).toBe("0")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bunx vitest run tests/unit/spreadsheet/format.test.ts
```
Expected: FAIL with `Cannot find module '@/lib/spreadsheet/format'`.

- [ ] **Step 3: Implement format.ts**

```ts
// src/lib/spreadsheet/format.ts
import { format as numfmtFormat } from "numfmt"

/**
 * Render a numeric cell value through an Excel format string.
 *
 * Why a wrapper instead of using `numfmt` directly:
 *  - Empty / null / undefined → "" (numfmt returns "0" for null, ugly)
 *  - Non-numeric value with numeric format → return as string (avoid throw)
 *  - Missing format → coerce to "General"-style stringification
 */
export function formatNumber(
  value: number | string | boolean | null | undefined,
  format: string | undefined,
): string {
  if (value === null || value === undefined || value === "") return ""
  if (typeof value !== "number") {
    if (typeof value === "boolean") return value ? "TRUE" : "FALSE"
    return String(value)
  }
  if (!format) {
    // General format — drop trailing zeros if integer
    return Number.isInteger(value) ? String(value) : String(value)
  }
  try {
    return numfmtFormat(format, value) as string
  } catch {
    return String(value)
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bunx vitest run tests/unit/spreadsheet/format.test.ts
```
Expected: PASS — 6/6.

- [ ] **Step 5: Commit**

```bash
git add src/lib/spreadsheet/format.ts tests/unit/spreadsheet/format.test.ts
git commit-sulthan -m "feat(spreadsheet): formatNumber wrapper around numfmt with our defaults"
```

---

## Task 3: Cell classifier — color coding rules

**Files:**
- Create: `src/lib/spreadsheet/cell-classify.ts`
- Create: `tests/unit/spreadsheet/cell-classify.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/spreadsheet/cell-classify.test.ts
import { describe, it, expect } from "vitest"
import { classifyCell } from "@/lib/spreadsheet/cell-classify"
import type { CellSpec } from "@/lib/spreadsheet/types"

const cell = (overrides: Partial<CellSpec> = {}): CellSpec => ({
  ref: "A1",
  ...overrides,
})

describe("classifyCell", () => {
  it("plain value with no formula → input (blue)", () => {
    expect(classifyCell(cell({ value: 1234 }))).toBe("input")
  })

  it("cell with formula referencing same sheet → formula (black)", () => {
    expect(classifyCell(cell({ formula: "=SUM(A1:A5)" }))).toBe("formula")
  })

  it("formula referencing another sheet → cross-sheet (green)", () => {
    expect(classifyCell(cell({ formula: "=Assumptions!B5" }))).toBe("cross-sheet")
    expect(classifyCell(cell({ formula: "=SUM(Revenue!B2:B6)" }))).toBe("cross-sheet")
  })

  it("formula referencing external file → external (red)", () => {
    expect(classifyCell(cell({ formula: "='[budget.xlsx]Sheet1'!A1" }))).toBe("external")
    expect(classifyCell(cell({ formula: "='[other.xlsx]Q4'!B5" }))).toBe("external")
  })

  it("explicit style: header takes precedence", () => {
    expect(classifyCell(cell({ style: "header", value: "Year" }))).toBe("header")
    expect(classifyCell(cell({ style: "header", formula: "=A1" }))).toBe("header")
  })

  it("explicit style: highlight does not change text class (caller adds yellow bg separately)", () => {
    expect(classifyCell(cell({ style: "highlight", value: 0.125 }))).toBe("input")
    expect(classifyCell(cell({ style: "highlight", formula: "=B2*0.1" }))).toBe("formula")
  })

  it("empty cell defaults to default", () => {
    expect(classifyCell(cell({}))).toBe("default")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bunx vitest run tests/unit/spreadsheet/cell-classify.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement cell-classify.ts**

```ts
// src/lib/spreadsheet/cell-classify.ts
import type { CellSpec } from "./types"

export type ColorClass = "input" | "formula" | "cross-sheet" | "external" | "header" | "default"

const EXTERNAL_REF = /'\[[^\]]+\][^']+'!/   // matches '[file.xlsx]Sheet'!
const SHEET_REF = /\b[A-Za-z_][\w ]*!/      // matches Sheet1! (no quotes)

/**
 * Skill-mandated financial-model color rules:
 *  - blue (input):       plain value, no formula
 *  - black (formula):    formula in same sheet
 *  - green (cross-sheet): formula references another sheet within workbook
 *  - red (external):     formula references another workbook file
 *
 * `style: "header"` always wins (renders bold+larger).
 * `style: "highlight"` only adds yellow background — color class derives from
 * value/formula presence as if highlight wasn't set.
 */
export function classifyCell(cell: CellSpec): ColorClass {
  if (cell.style === "header") return "header"
  if (!cell.formula) {
    if (cell.value !== undefined && cell.value !== null && cell.value !== "") {
      return "input"
    }
    return "default"
  }
  // Has a formula — discriminate by reference target.
  if (EXTERNAL_REF.test(cell.formula)) return "external"
  if (SHEET_REF.test(cell.formula)) return "cross-sheet"
  return "formula"
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bunx vitest run tests/unit/spreadsheet/cell-classify.test.ts
```
Expected: PASS — 7/7.

- [ ] **Step 5: Commit**

```bash
git add src/lib/spreadsheet/cell-classify.ts tests/unit/spreadsheet/cell-classify.test.ts
git commit-sulthan -m "feat(spreadsheet): classifyCell — auto color coding (input/formula/cross-sheet/external)"
```

---

## Task 4: Extend styles.ts with class-name resolver

**Files:**
- Modify: `src/lib/spreadsheet/styles.ts`
- Modify: `tests/unit/spreadsheet/styles.test.ts` (or create if absent)

- [ ] **Step 1: Read current styles.ts to see its shape**

```bash
cat src/lib/spreadsheet/styles.ts | head -40
```

Note the existing `resolveCellStyle(name, theme)` signature and what it returns (`{ classNames: string }` based on caller in sheet-spec-view).

- [ ] **Step 2: Write a failing test for the new helper**

Create or append to `tests/unit/spreadsheet/styles.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { colorClassToClassName } from "@/lib/spreadsheet/styles"

describe("colorClassToClassName", () => {
  it("input → blue text", () => {
    expect(colorClassToClassName("input")).toContain("text-")
    expect(colorClassToClassName("input")).toMatch(/blue|0000ff/i)
  })

  it("formula → black/default text (no color override)", () => {
    expect(colorClassToClassName("formula")).toBe("")
  })

  it("cross-sheet → green text", () => {
    expect(colorClassToClassName("cross-sheet")).toMatch(/green|008000/i)
  })

  it("external → red text", () => {
    expect(colorClassToClassName("external")).toMatch(/red|ff0000/i)
  })

  it("header → bold + slightly larger", () => {
    const c = colorClassToClassName("header")
    expect(c).toMatch(/font-bold|font-semibold/)
  })

  it("default → empty", () => {
    expect(colorClassToClassName("default")).toBe("")
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

```bash
bunx vitest run tests/unit/spreadsheet/styles.test.ts
```
Expected: FAIL — `colorClassToClassName` not exported.

- [ ] **Step 4: Add `colorClassToClassName` to styles.ts**

Append to `src/lib/spreadsheet/styles.ts`:

```ts
import type { ColorClass } from "./cell-classify"

/**
 * Map a ColorClass to Tailwind utility classes for cell text styling.
 * Background-color (highlight yellow) is applied separately by caller.
 */
export function colorClassToClassName(c: ColorClass): string {
  switch (c) {
    case "input":
      return "text-blue-700"          // ~#0000FF, but Tailwind picks the closest semantic
    case "cross-sheet":
      return "text-green-700"         // ~#008000
    case "external":
      return "text-red-600"           // ~#FF0000
    case "header":
      return "font-bold text-base"    // bold + slightly larger than default text-sm
    case "formula":
    case "default":
      return ""
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
bunx vitest run tests/unit/spreadsheet/styles.test.ts
```
Expected: PASS — all 6.

- [ ] **Step 6: Commit**

```bash
git add src/lib/spreadsheet/styles.ts tests/unit/spreadsheet/styles.test.ts
git commit-sulthan -m "feat(spreadsheet): colorClassToClassName helper for cell text styling"
```

---

## Task 5: Top formula bar component

**Files:**
- Create: `src/features/conversations/components/chat/artifacts/renderers/sheet-formula-bar.tsx`

(Frontend component — no automated test in this plan; visual smoke at end.)

- [ ] **Step 1: Implement formula bar**

```tsx
// src/features/conversations/components/chat/artifacts/renderers/sheet-formula-bar.tsx
"use client"

import { ChevronDown, FunctionSquare } from "@/lib/icons"

interface Props {
  /** the active cell ref, e.g. "B5", or null when nothing selected */
  selectedRef: string | null
  /** the active cell's formula (with leading `=`) or its raw display value */
  formulaOrValue: string | null
}

/**
 * Excel-style top formula bar.
 *
 * Layout:
 *   ┌──────────────┬──────────────────────────────────┐
 *   │  [B5]   ▼   │  ƒx  =SUM(B2:B4)                │
 *   └──────────────┴──────────────────────────────────┘
 *
 * Name Box on the left (96px) shows the active cell ref. The dropdown chevron
 * is purely visual — there is no actual jump-to-name list (Claude.ai also
 * shows it as decorative). On the right, a ƒx icon then a monospace display
 * of the active formula (italicised) or value (plain). Empty when no cell
 * is selected.
 */
export function SheetFormulaBar({ selectedRef, formulaOrValue }: Props) {
  const isFormula =
    typeof formulaOrValue === "string" && formulaOrValue.startsWith("=")
  return (
    <div className="flex items-stretch h-9 border-b shrink-0 text-xs">
      <div className="flex items-center gap-1 px-2 min-w-[96px] border-r bg-muted/40">
        <span className="font-mono text-foreground">
          {selectedRef ?? ""}
        </span>
        <ChevronDown className="h-3 w-3 text-muted-foreground/60 ml-auto" />
      </div>
      <div className="flex items-center gap-2 px-2 flex-1 bg-background">
        <FunctionSquare className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
        <span
          className={
            "font-mono text-foreground truncate " +
            (isFormula ? "italic" : "")
          }
        >
          {formulaOrValue ?? ""}
        </span>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

```bash
bunx tsc --noEmit -p tsconfig.json 2>&1 | grep sheet-formula-bar | head
```
Expected: empty.

- [ ] **Step 3: Commit**

```bash
git add src/features/conversations/components/chat/artifacts/renderers/sheet-formula-bar.tsx
git commit-sulthan -m "feat(panel): SheetFormulaBar — Excel-style top formula bar with Name Box + ƒx"
```

---

## Task 6: Major rewrite of `SpecWorkbookView`

This is the largest task. The goal is to replace the current top-tabs/footer layout with the Excel-feel layout: top formula bar, grid with sticky row labels + color-coded cells + auto-aligned numerics + frozen panes visual + tighter density, bottom sheet tabs.

**Files:**
- Modify: `src/features/conversations/components/chat/artifacts/renderers/sheet-spec-view.tsx`

- [ ] **Step 1: Read the file to confirm current state**

```bash
cat src/features/conversations/components/chat/artifacts/renderers/sheet-spec-view.tsx
```

Reference: ~258 lines as of plan creation. The key external API is the `<SpecWorkbookView>` component with props `{ content, title, onDownloadXlsx }`. This contract MUST stay stable — `sheet-renderer.tsx` and any panel-level callers depend on it.

- [ ] **Step 2: Replace the whole file**

```tsx
"use client"

import { useState, useMemo, useEffect } from "react"
import { AlertTriangle, Download, FunctionSquare } from "@/lib/icons"
import {
  type SpreadsheetSpec,
  type WorkbookValues,
  type CellStyleName,
} from "@/lib/spreadsheet/types"
import { parseSpec } from "@/lib/spreadsheet/parse"
import { resolveCellStyle, colorClassToClassName } from "@/lib/spreadsheet/styles"
import { classifyCell } from "@/lib/spreadsheet/cell-classify"
import { formatNumber } from "@/lib/spreadsheet/format"
import { SheetFormulaBar } from "./sheet-formula-bar"

interface SpecWorkbookViewProps {
  content: string
  title?: string
  onDownloadXlsx: () => void
}

interface CellEntry {
  ref: string
  row: number
  col: number
  value?: unknown
  formula?: string
  format?: string
  style?: CellStyleName
  note?: string
}

function refToRowCol(ref: string): { row: number; col: number } {
  const m = ref.replace(/\$/g, "").match(/^([A-Z]+)([0-9]+)$/)
  if (!m) return { row: 0, col: 0 }
  let col = 0
  for (let i = 0; i < m[1].length; i++) col = col * 26 + (m[1].charCodeAt(i) - 64)
  return { row: parseInt(m[2], 10), col }
}

function colToLetter(col: number): string {
  let s = ""
  let c = col
  while (c > 0) {
    const r = (c - 1) % 26
    s = String.fromCharCode(65 + r) + s
    c = Math.floor((c - 1) / 26)
  }
  return s
}

function cellAlignmentClass(value: unknown): string {
  if (typeof value === "number") return "text-right"
  if (typeof value === "boolean") return "text-center"
  return "text-left"
}

export function SpecWorkbookView({ content, onDownloadXlsx }: SpecWorkbookViewProps) {
  const [activeSheet, setActiveSheet] = useState(0)
  const [selectedRef, setSelectedRef] = useState<string | null>(null)
  const [values, setValues] = useState<WorkbookValues | null>(null)
  const [evalError, setEvalError] = useState<string | null>(null)

  // Reset selection / active-sheet when the underlying content changes.
  useEffect(() => {
    setActiveSheet(0)
    setSelectedRef(null)
  }, [content])

  const parsed = useMemo(() => parseSpec(content), [content])
  const spec: SpreadsheetSpec | null = parsed.ok ? parsed.spec! : null

  useEffect(() => {
    if (!spec) return
    let cancelled = false
    ;(async () => {
      try {
        const { evaluateWorkbook } = await import("@/lib/spreadsheet/formulas")
        if (cancelled) return
        setValues(evaluateWorkbook(spec))
      } catch (err) {
        if (!cancelled) {
          setEvalError(err instanceof Error ? err.message : String(err))
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [spec])

  if (!spec) {
    return (
      <div className="p-4">
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2.5 text-amber-500">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span className="text-sm font-medium">Invalid spreadsheet spec</span>
          </div>
          <ul className="px-4 py-2 border-t border-amber-500/20 text-xs text-amber-500/80 list-disc list-inside">
            {parsed.errors.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        </div>
      </div>
    )
  }

  const sheet = spec.sheets[activeSheet]
  const cellsWithPos: CellEntry[] = sheet.cells.map((c) => ({
    ...c,
    ...refToRowCol(c.ref),
  }))
  const maxRow = cellsWithPos.reduce((acc, c) => Math.max(acc, c.row), 1)
  const maxCol = cellsWithPos.reduce((acc, c) => Math.max(acc, c.col), 1)
  const cellMap = new Map<string, CellEntry>()
  for (const c of cellsWithPos) {
    cellMap.set(c.ref.replace(/\$/g, ""), c)
  }

  const selectedCell = selectedRef ? cellMap.get(selectedRef) : null
  const formulaBarText: string | null = selectedCell
    ? selectedCell.formula
      ? selectedCell.formula
      : selectedCell.value !== undefined && selectedCell.value !== null
        ? String(selectedCell.value)
        : ""
    : null

  const fontFamily = spec.theme?.font ?? "Arial"
  const frozenRows = sheet.frozen?.rows ?? 0
  const frozenCols = sheet.frozen?.columns ?? 0
  const activeRow = selectedRef ? refToRowCol(selectedRef).row : null
  const activeCol = selectedRef ? refToRowCol(selectedRef).col : null

  return (
    <div className="flex flex-col h-full">
      {/* Top formula bar — Excel pattern */}
      <SheetFormulaBar selectedRef={selectedRef} formulaOrValue={formulaBarText} />

      {/* Toolbar (compact) */}
      <div className="flex items-center gap-2 px-4 py-1.5 border-b shrink-0 bg-muted/20 text-xs text-muted-foreground">
        <FunctionSquare className="h-3.5 w-3.5 opacity-60" />
        <span className="tabular-nums flex-1">
          {sheet.name} · {sheet.cells.length} cells
        </span>
        <button
          type="button"
          onClick={onDownloadXlsx}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md hover:text-foreground hover:bg-muted transition-colors"
        >
          <Download className="h-3.5 w-3.5" />
          XLSX
        </button>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-auto" style={{ fontFamily }}>
        <table className="text-sm border-collapse">
          <thead className="sticky top-0 z-10">
            <tr>
              <th className="sticky left-0 z-20 w-10 px-1 py-0.5 text-xs text-muted-foreground font-normal border-r-2 border-b-2 border-gray-300 bg-gradient-to-b from-gray-50 to-gray-100" />
              {Array.from({ length: maxCol }, (_, i) => (
                <th
                  key={i}
                  className={
                    "px-2 py-0.5 text-xs font-normal border-r border-b-2 border-gray-300 whitespace-nowrap bg-gradient-to-b from-gray-50 to-gray-100 text-center " +
                    (activeCol === i + 1 ? "bg-blue-100 text-blue-900 font-semibold" : "text-muted-foreground")
                  }
                  style={{
                    width: sheet.columns?.[i]?.width
                      ? sheet.columns[i].width! * 7 + 16
                      : undefined,
                  }}
                >
                  {colToLetter(i + 1)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: maxRow }, (_, r) => (
              <tr key={r}>
                <td
                  className={
                    "sticky left-0 z-10 w-10 px-1 py-0.5 text-xs text-muted-foreground text-right border-r-2 border-b border-gray-300 bg-gradient-to-b from-gray-50 to-gray-100 " +
                    (activeRow === r + 1 ? "!bg-blue-100 !text-blue-900 !font-semibold" : "")
                  }
                >
                  {r + 1}
                </td>
                {Array.from({ length: maxCol }, (_, c) => {
                  const ref = `${colToLetter(c + 1)}${r + 1}`
                  const cell = cellMap.get(ref)
                  const qualified = `${sheet.name}!${ref}`
                  const evaluated = values?.get(qualified)
                  const userStyle = resolveCellStyle(cell?.style, spec.theme)
                  const colorClass = cell ? classifyCell(cell) : "default"
                  const colorClassName = colorClassToClassName(colorClass)
                  const isSelected = selectedRef === ref
                  const isHighlight = cell?.style === "highlight"
                  const rawValue = cell?.formula ? evaluated?.value : cell?.value
                  const alignment = cellAlignmentClass(rawValue)

                  const displayText = (() => {
                    if (!cell) return ""
                    if (evaluated?.error) return `#${evaluated.error}!`
                    return formatNumber(
                      rawValue as number | string | boolean | null | undefined,
                      cell.format ?? sheet.columns?.[c]?.format,
                    )
                  })()

                  const frozenRowBorder =
                    frozenRows > 0 && r + 1 === frozenRows ? "border-b-2 border-b-gray-500" : ""
                  const frozenColBorder =
                    frozenCols > 0 && c + 1 === frozenCols ? "border-r-2 border-r-gray-500" : ""

                  return (
                    <td
                      key={c}
                      onClick={() => setSelectedRef(ref)}
                      className={
                        "px-2 py-0.5 text-sm border-r border-b border-gray-200 cursor-cell whitespace-nowrap " +
                        alignment + " " +
                        colorClassName + " " +
                        userStyle.classNames + " " +
                        (isHighlight ? "bg-yellow-200/80 " : "") +
                        (evaluated?.error ? "text-red-600 " : "") +
                        frozenRowBorder + " " +
                        frozenColBorder + " " +
                        (isSelected ? "outline outline-2 outline-blue-600 outline-offset-[-2px]" : "")
                      }
                      title={cell?.note}
                    >
                      {displayText}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Bottom sheet tabs — Excel pattern */}
      {spec.sheets.length > 0 && (
        <div className="flex items-center gap-0.5 px-2 py-1 border-t shrink-0 overflow-x-auto bg-muted/20">
          {spec.sheets.map((s, i) => (
            <button
              key={s.name}
              type="button"
              onClick={() => { setActiveSheet(i); setSelectedRef(null) }}
              className={
                "px-3 py-1 text-xs rounded-t-md whitespace-nowrap transition-colors " +
                (i === activeSheet
                  ? "bg-background border border-b-0 border-gray-300 font-medium text-foreground"
                  : "text-muted-foreground hover:bg-muted/60")
              }
            >
              {s.name}
            </button>
          ))}
        </div>
      )}

      {evalError && (
        <div className="px-4 py-2 text-xs text-amber-500 border-t shrink-0">
          Formula eval failed: {evalError}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Typecheck**

```bash
bunx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "sheet-spec-view|sheet-formula-bar|cell-classify|format" | head
```
Expected: empty (no errors in these files).

- [ ] **Step 4: Run any existing renderer tests**

```bash
bunx vitest run src/features/conversations/components/chat/artifacts/renderers/__tests__/ 2>&1 | tail -10
```
Expected: existing tests still pass.

- [ ] **Step 5: Commit**

```bash
git add src/features/conversations/components/chat/artifacts/renderers/sheet-spec-view.tsx
git commit-sulthan -m "$(cat <<'EOF'
refactor(panel): SpecWorkbookView Excel-feel chrome

- top formula bar with Name Box + ƒx + monospace display (replaces footer cell info)
- bottom sheet tabs (moved from top), Excel-style rounded-top with active border
- color-coded cells via classifyCell + colorClassToClassName
- numfmt-based formatNumber for real Excel format string fidelity
- auto-align numbers right / booleans center / text left
- sticky left-column row labels + sticky top-row column letters
- active row + column header highlighted on cell selection
- frozen panes rendered as 2px gray border at row N / col M boundary
- yellow background for cells with style: "highlight"
- default font Arial via theme.font, applied to grid <table>
- tighter cell padding (py-0.5 px-2) for Excel-like density
EOF
)"
```

---

## Task 7: ChartSpec types + parser validation

**Files:**
- Modify: `src/lib/spreadsheet/types.ts`
- Modify: `src/lib/spreadsheet/parse.ts`
- Modify: `tests/unit/spreadsheet/parse.test.ts` (or create if absent)

- [ ] **Step 1: Inspect current types.ts and parse.ts**

```bash
grep -n "SpreadsheetSpec\|SPREADSHEET_CAPS\|export interface\|z.object" src/lib/spreadsheet/types.ts src/lib/spreadsheet/parse.ts | head -20
```

- [ ] **Step 2: Write failing test for chart parsing**

Append to `tests/unit/spreadsheet/parse.test.ts` (create if missing — match style of any existing parse tests):

```ts
import { describe, it, expect } from "vitest"
import { parseSpec } from "@/lib/spreadsheet/parse"

describe("parseSpec — charts", () => {
  it("accepts a spec with a single bar chart", () => {
    const spec = JSON.stringify({
      kind: "spreadsheet/v1",
      sheets: [{
        name: "Data",
        cells: [
          { ref: "A1", value: "Year" }, { ref: "B1", value: "Revenue" },
          { ref: "A2", value: 2024 }, { ref: "B2", value: 100 },
          { ref: "A3", value: 2025 }, { ref: "B3", value: 150 },
        ],
      }],
      charts: [{
        id: "rev-trend",
        title: "Revenue Trajectory",
        type: "bar",
        categoryRange: "Data!A2:A3",
        series: [{ name: "Revenue", range: "Data!B2:B3" }],
      }],
    })
    const r = parseSpec(spec)
    expect(r.ok).toBe(true)
    expect(r.spec?.charts).toHaveLength(1)
    expect(r.spec?.charts?.[0].type).toBe("bar")
  })

  it("rejects unknown chart type", () => {
    const spec = JSON.stringify({
      kind: "spreadsheet/v1",
      sheets: [{ name: "S", cells: [{ ref: "A1", value: 1 }] }],
      charts: [{ id: "x", type: "tornado", categoryRange: "S!A1:A1", series: [{ name: "x", range: "S!A1:A1" }] }],
    })
    const r = parseSpec(spec)
    expect(r.ok).toBe(false)
    expect(r.errors.some((e) => /chart|type/i.test(e))).toBe(true)
  })

  it("enforces maxCharts cap", () => {
    const charts = Array.from({ length: 9 }, (_, i) => ({
      id: `c${i}`, type: "bar" as const,
      categoryRange: "S!A1:A1", series: [{ name: "x", range: "S!A1:A1" }],
    }))
    const spec = JSON.stringify({
      kind: "spreadsheet/v1",
      sheets: [{ name: "S", cells: [{ ref: "A1", value: 1 }] }],
      charts,
    })
    const r = parseSpec(spec)
    expect(r.ok).toBe(false)
    expect(r.errors.some((e) => /charts|9/i.test(e))).toBe(true)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

```bash
bunx vitest run tests/unit/spreadsheet/parse.test.ts -t "charts"
```
Expected: FAIL — `charts` field unknown / not validated.

- [ ] **Step 4: Add ChartSpec types to types.ts**

Append to `src/lib/spreadsheet/types.ts`:

```ts
export interface ChartAxis {
  title?: string
  format?: string
}

export interface ChartSeriesSpec {
  name: string
  range: string
  color?: string
}

export type ChartType = "bar" | "line" | "pie" | "area"

export interface ChartSpec {
  id: string
  title?: string
  type: ChartType
  categoryRange: string
  series: ChartSeriesSpec[]
  xAxis?: ChartAxis
  yAxis?: ChartAxis
  stacked?: boolean
}
```

Update `SpreadsheetSpec` to include `charts?: ChartSpec[]`. Update `SPREADSHEET_CAPS` with `maxCharts: 8`.

```ts
export const SPREADSHEET_CAPS = {
  maxSheets: 8,
  maxCellsPerSheet: 500,
  maxFormulasPerWorkbook: 200,
  maxNamedRanges: 64,
  maxSheetNameLength: 31,
  maxCharts: 8,                 // NEW
} as const
```

- [ ] **Step 5: Add Zod validation for charts in parse.ts**

In `src/lib/spreadsheet/parse.ts`, find the existing Zod schema for `SpreadsheetSpec`. Add a Zod schema for `ChartSpec`:

```ts
const ChartAxisZ = z.object({
  title: z.string().optional(),
  format: z.string().optional(),
})

const ChartSeriesZ = z.object({
  name: z.string(),
  range: z.string(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
})

const ChartSpecZ = z.object({
  id: z.string().min(1),
  title: z.string().optional(),
  type: z.enum(["bar", "line", "pie", "area"]),
  categoryRange: z.string().min(1),
  series: z.array(ChartSeriesZ).min(1),
  xAxis: ChartAxisZ.optional(),
  yAxis: ChartAxisZ.optional(),
  stacked: z.boolean().optional(),
})
```

Add to the SpreadsheetSpec Zod schema:
```ts
charts: z.array(ChartSpecZ).max(SPREADSHEET_CAPS.maxCharts).optional()
```

Make sure error messages on the `.max()` look like `Too many charts (max 8)` if Zod gives that — append a refine if needed.

- [ ] **Step 6: Run tests to verify pass**

```bash
bunx vitest run tests/unit/spreadsheet/parse.test.ts
```
Expected: all parse tests pass (existing + 3 new).

- [ ] **Step 7: Commit**

```bash
git add src/lib/spreadsheet/types.ts src/lib/spreadsheet/parse.ts tests/unit/spreadsheet/parse.test.ts
git commit-sulthan -m "feat(spreadsheet): ChartSpec schema + Zod validation + maxCharts cap"
```

---

## Task 8: chart-data resolver

**Files:**
- Create: `src/lib/spreadsheet/chart-data.ts`
- Create: `tests/unit/spreadsheet/chart-data.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/spreadsheet/chart-data.test.ts
import { describe, it, expect } from "vitest"
import { resolveChartData } from "@/lib/spreadsheet/chart-data"
import type { ChartSpec, WorkbookValues } from "@/lib/spreadsheet/types"

function vmap(entries: Array<[string, number | string]>): WorkbookValues {
  const m = new Map()
  for (const [k, v] of entries) m.set(k, { value: v })
  return m
}

describe("resolveChartData", () => {
  const chart: ChartSpec = {
    id: "rev",
    type: "bar",
    categoryRange: "Data!A2:A4",
    series: [
      { name: "Revenue", range: "Data!B2:B4" },
      { name: "EBITDA",  range: "Data!C2:C4" },
    ],
  }

  it("zips category column with series columns into row objects", () => {
    const values = vmap([
      ["Data!A2", 2024], ["Data!A3", 2025], ["Data!A4", 2026],
      ["Data!B2", 100],  ["Data!B3", 150],  ["Data!B4", 200],
      ["Data!C2", 30],   ["Data!C3", 50],   ["Data!C4", 80],
    ])
    const r = resolveChartData(chart, values)
    expect(r.rows).toEqual([
      { category: 2024, Revenue: 100, EBITDA: 30 },
      { category: 2025, Revenue: 150, EBITDA: 50 },
      { category: 2026, Revenue: 200, EBITDA: 80 },
    ])
    expect(r.series.map((s) => s.name)).toEqual(["Revenue", "EBITDA"])
    expect(r.series[0].color).toMatch(/^#[0-9a-f]{6}$/i)
  })

  it("uses provided series color when set", () => {
    const c2: ChartSpec = {
      ...chart,
      series: [{ name: "x", range: "Data!B2:B4", color: "#abcdef" }],
    }
    const r = resolveChartData(c2, vmap([
      ["Data!A2", 2024], ["Data!B2", 1],
      ["Data!A3", 2025], ["Data!B3", 2],
      ["Data!A4", 2026], ["Data!B4", 3],
    ]))
    expect(r.series[0].color).toBe("#abcdef")
  })

  it("skips rows where category is missing", () => {
    const r = resolveChartData(chart, vmap([
      ["Data!A2", 2024], ["Data!B2", 100], ["Data!C2", 30],
      // A3 missing
      ["Data!A4", 2026], ["Data!B4", 200], ["Data!C4", 80],
    ]))
    expect(r.rows.map((row) => row.category)).toEqual([2024, 2026])
  })

  it("handles single-cell categoryRange", () => {
    const r = resolveChartData(
      { ...chart, categoryRange: "Data!A2:A2", series: [{ name: "x", range: "Data!B2:B2" }] },
      vmap([["Data!A2", "Q1"], ["Data!B2", 50]]),
    )
    expect(r.rows).toEqual([{ category: "Q1", x: 50 }])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bunx vitest run tests/unit/spreadsheet/chart-data.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement chart-data.ts**

```ts
// src/lib/spreadsheet/chart-data.ts
import type { ChartSpec, WorkbookValues } from "./types"

export interface ResolvedChartData {
  rows: Array<Record<string, string | number>>
  series: Array<{ name: string; color: string }>
}

const PALETTE = [
  "#1a73e8",   // blue
  "#ea4335",   // red
  "#fbbc04",   // yellow
  "#34a853",   // green
  "#673ab7",   // purple
  "#ff7043",   // orange
  "#26a69a",   // teal
  "#5f6368",   // gray
]

const RANGE_RE = /^([^!]+)!([A-Z]+)(\d+):([A-Z]+)(\d+)$/

function colLetterToNum(s: string): number {
  let c = 0
  for (let i = 0; i < s.length; i++) c = c * 26 + (s.charCodeAt(i) - 64)
  return c
}

function colNumToLetter(n: number): string {
  let s = ""
  let c = n
  while (c > 0) {
    const r = (c - 1) % 26
    s = String.fromCharCode(65 + r) + s
    c = Math.floor((c - 1) / 26)
  }
  return s
}

/**
 * Expand "SheetName!A2:A6" → ["SheetName!A2", "SheetName!A3", ..., "SheetName!A6"]
 * Single-row ranges (A2:F2) and single-cell (A2:A2) supported.
 */
function expandRange(range: string): string[] {
  const m = range.match(RANGE_RE)
  if (!m) return []
  const [, sheet, c1, r1, c2, r2] = m
  const startCol = colLetterToNum(c1)
  const endCol = colLetterToNum(c2)
  const startRow = parseInt(r1, 10)
  const endRow = parseInt(r2, 10)
  const refs: string[] = []
  for (let r = startRow; r <= endRow; r++) {
    for (let c = startCol; c <= endCol; c++) {
      refs.push(`${sheet}!${colNumToLetter(c)}${r}`)
    }
  }
  return refs
}

export function resolveChartData(chart: ChartSpec, values: WorkbookValues): ResolvedChartData {
  const categoryRefs = expandRange(chart.categoryRange)
  const seriesRefs = chart.series.map((s) => expandRange(s.range))
  const rowCount = Math.min(categoryRefs.length, ...seriesRefs.map((r) => r.length))

  const rows: ResolvedChartData["rows"] = []
  for (let i = 0; i < rowCount; i++) {
    const catRef = categoryRefs[i]
    const cat = values.get(catRef)?.value
    if (cat === undefined || cat === null || cat === "") continue
    const row: Record<string, string | number> = { category: cat as string | number }
    for (let s = 0; s < chart.series.length; s++) {
      const ref = seriesRefs[s][i]
      const v = values.get(ref)?.value
      row[chart.series[s].name] = (typeof v === "number" || typeof v === "string" ? v : 0) as number | string
    }
    rows.push(row)
  }

  const series = chart.series.map((s, i) => ({
    name: s.name,
    color: s.color ?? PALETTE[i % PALETTE.length],
  }))

  return { rows, series }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bunx vitest run tests/unit/spreadsheet/chart-data.test.ts
```
Expected: PASS — 4/4.

- [ ] **Step 5: Commit**

```bash
git add src/lib/spreadsheet/chart-data.ts tests/unit/spreadsheet/chart-data.test.ts
git commit-sulthan -m "feat(spreadsheet): resolveChartData — range parsing + Recharts data shape"
```

---

## Task 9: SheetChartView component (Recharts)

**Files:**
- Create: `src/features/conversations/components/chat/artifacts/renderers/sheet-chart-view.tsx`

(Frontend component — visual smoke at end of plan.)

- [ ] **Step 1: Verify recharts is in deps**

```bash
grep -E '"recharts"' package.json
```
Expected: line showing recharts version. If missing, run `bun add recharts` and commit separately.

- [ ] **Step 2: Implement SheetChartView**

```tsx
// src/features/conversations/components/chat/artifacts/renderers/sheet-chart-view.tsx
"use client"

import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell,
} from "recharts"
import type { ChartSpec, WorkbookValues } from "@/lib/spreadsheet/types"
import { resolveChartData } from "@/lib/spreadsheet/chart-data"

interface Props {
  charts: ChartSpec[]
  values: WorkbookValues
}

export function SheetChartView({ charts, values }: Props) {
  if (charts.length === 0) {
    return (
      <div className="flex items-center justify-center h-full p-8 text-sm text-muted-foreground">
        No charts in this spec.
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-auto p-4 space-y-6">
      {charts.map((chart) => (
        <ChartBlock key={chart.id} chart={chart} values={values} />
      ))}
    </div>
  )
}

function ChartBlock({ chart, values }: { chart: ChartSpec; values: WorkbookValues }) {
  const { rows, series } = resolveChartData(chart, values)

  if (rows.length === 0) {
    return (
      <div className="border rounded-md p-4 text-sm text-muted-foreground">
        {chart.title ?? chart.id}: no data resolved.
      </div>
    )
  }

  return (
    <div className="border rounded-md p-4 bg-background">
      {chart.title && (
        <h3 className="text-base font-semibold text-center mb-3">{chart.title}</h3>
      )}
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          {renderChart(chart, rows, series)}
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function renderChart(
  chart: ChartSpec,
  rows: Array<Record<string, string | number>>,
  series: Array<{ name: string; color: string }>,
) {
  switch (chart.type) {
    case "bar":
      return (
        <BarChart data={rows}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="category" />
          <YAxis />
          <Tooltip />
          <Legend />
          {series.map((s) => (
            <Bar key={s.name} dataKey={s.name} fill={s.color} stackId={chart.stacked ? "stack" : undefined} />
          ))}
        </BarChart>
      )
    case "line":
      return (
        <LineChart data={rows}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="category" />
          <YAxis />
          <Tooltip />
          <Legend />
          {series.map((s) => (
            <Line key={s.name} type="monotone" dataKey={s.name} stroke={s.color} strokeWidth={2} />
          ))}
        </LineChart>
      )
    case "area":
      return (
        <AreaChart data={rows}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="category" />
          <YAxis />
          <Tooltip />
          <Legend />
          {series.map((s) => (
            <Area key={s.name} type="monotone" dataKey={s.name} fill={s.color} stroke={s.color} fillOpacity={0.4} stackId={chart.stacked ? "stack" : undefined} />
          ))}
        </AreaChart>
      )
    case "pie": {
      // Pie uses only the first series; each row is a slice
      const seriesName = series[0]?.name ?? "value"
      return (
        <PieChart>
          <Tooltip />
          <Legend />
          <Pie
            data={rows}
            dataKey={seriesName}
            nameKey="category"
            outerRadius={100}
            label
          >
            {rows.map((_row, i) => (
              <Cell key={i} fill={series[0]?.color ?? "#1a73e8"} fillOpacity={1 - i * 0.1} />
            ))}
          </Pie>
        </PieChart>
      )
    }
  }
}
```

- [ ] **Step 3: Typecheck**

```bash
bunx tsc --noEmit -p tsconfig.json 2>&1 | grep sheet-chart-view | head
```
Expected: empty.

- [ ] **Step 4: Commit**

```bash
git add src/features/conversations/components/chat/artifacts/renderers/sheet-chart-view.tsx
git commit-sulthan -m "feat(panel): SheetChartView — Recharts bar/line/pie/area for spec.charts"
```

---

## Task 10: Wire Data/Charts tab toggle into SpecWorkbookView

**Files:**
- Modify: `src/features/conversations/components/chat/artifacts/renderers/sheet-spec-view.tsx`

- [ ] **Step 1: Add tab state + Charts view branch**

In `SpecWorkbookView`, near the existing `useState` calls, add:

```ts
const [view, setView] = useState<"data" | "charts">("data")
```

Near the toolbar (after the formula bar, before the grid), insert a tab toggle that only renders when `spec.charts && spec.charts.length > 0`:

```tsx
{spec.charts && spec.charts.length > 0 && (
  <div className="flex items-center gap-1 px-2 py-1 border-b shrink-0 bg-muted/10 text-xs">
    <button
      type="button"
      onClick={() => setView("data")}
      className={
        "px-3 py-1 rounded-md transition-colors " +
        (view === "data" ? "bg-background border border-gray-300 font-medium" : "text-muted-foreground hover:bg-muted/60")
      }
    >
      Data
    </button>
    <button
      type="button"
      onClick={() => setView("charts")}
      className={
        "px-3 py-1 rounded-md transition-colors " +
        (view === "charts" ? "bg-background border border-gray-300 font-medium" : "text-muted-foreground hover:bg-muted/60")
      }
    >
      Charts
    </button>
  </div>
)}
```

Wrap the existing grid + sheet tabs block in `{view === "data" && (... existing JSX ...)}`. Add a `{view === "charts" && spec.charts && (...)}` block:

```tsx
{view === "charts" && spec.charts && (
  <SheetChartView
    charts={spec.charts}
    values={values ?? new Map()}
  />
)}
```

Remember to add `import { SheetChartView } from "./sheet-chart-view"` at the top.

- [ ] **Step 2: Typecheck**

```bash
bunx tsc --noEmit -p tsconfig.json 2>&1 | grep sheet-spec-view | head
```
Expected: empty.

- [ ] **Step 3: Commit**

```bash
git add src/features/conversations/components/chat/artifacts/renderers/sheet-spec-view.tsx
git commit-sulthan -m "feat(panel): Data/Charts tab toggle in SpecWorkbookView when spec.charts present"
```

---

## Task 11: Native xlsx chart export

**Files:**
- Modify: `src/lib/spreadsheet/generate-xlsx.ts`

- [ ] **Step 1: Read current generate-xlsx.ts**

```bash
cat src/lib/spreadsheet/generate-xlsx.ts
```

The file currently uses ExcelJS. Find where it iterates sheets and writes cells. After all sheets are populated, we need to add charts.

ExcelJS chart support is partial — it writes chart objects via `worksheet.addChart(...)` for some chart types. Verify the API in this version of ExcelJS:

```bash
node -e 'const E = require("exceljs"); const wb = new E.Workbook(); const ws = wb.addWorksheet("S"); console.log(typeof ws.addChart)'
```

If `function`, proceed. If `undefined`, ExcelJS in this repo doesn't support chart objects — fall back to graceful skip (write data tables only; downloaded xlsx will not have native charts but data is intact).

- [ ] **Step 2: Add chart emission**

If ExcelJS supports `addChart`, append after the cells/named-ranges block:

```ts
if (spec.charts && spec.charts.length > 0) {
  for (const chart of spec.charts) {
    // ExcelJS chart API uses range strings like "Data!A2:A6"
    // The first sheet is target by default; place near top-right of that sheet
    const targetSheet = workbook.getWorksheet(spec.sheets[0].name)
    if (!targetSheet) continue
    try {
      targetSheet.addChart({
        type: chart.type,
        title: chart.title,
        dataLabels: { showLegend: true },
        plotArea: {
          plotVisOnly: true,
          showLegend: true,
        },
        series: chart.series.map((s, i) => ({
          name: s.name,
          xAxis: chart.categoryRange,
          yAxis: s.range,
          color: s.color ?? PALETTE[i % PALETTE.length],
        })),
      } as never)
    } catch (err) {
      console.warn("[generate-xlsx] chart emission failed for", chart.id, err)
    }
  }
}

// Reuse the same palette as the renderer for consistency
const PALETTE = [
  "#1a73e8", "#ea4335", "#fbbc04", "#34a853",
  "#673ab7", "#ff7043", "#26a69a", "#5f6368",
]
```

If ExcelJS does NOT support `addChart` in this version, skip this entirely with an explanatory comment:

```ts
// NOTE: ExcelJS in this repo does not expose a stable chart API. Charts in
// the panel preview are rendered via Recharts client-side. The downloaded
// .xlsx contains the underlying data ranges but no native chart objects;
// users can right-click the data and Insert Chart in Excel directly.
```

- [ ] **Step 3: Typecheck**

```bash
bunx tsc --noEmit -p tsconfig.json 2>&1 | grep generate-xlsx | head
```
Expected: empty.

- [ ] **Step 4: Run any existing generate-xlsx tests**

```bash
bunx vitest run tests/unit/spreadsheet/ 2>&1 | tail -10
```
Expected: existing tests still pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/spreadsheet/generate-xlsx.ts
git commit-sulthan -m "feat(spreadsheet): emit native ExcelJS charts when spec.charts present (or graceful skip)"
```

---

## Task 12: LLM prompt — add charts subsection + worked example

**Files:**
- Modify: `src/lib/prompts/artifacts/sheet.ts`

- [ ] **Step 1: Locate Shape C section**

```bash
grep -n "Shape C\|## Shape C\|JSON spec" src/lib/prompts/artifacts/sheet.ts | head
```

- [ ] **Step 2: Add charts subsection**

Inside Shape C's rules (just before the "Anti-Patterns" or close-out section), append:

````markdown
## Charts (optional)

When the user benefits from a visual — trend over time, comparison across categories, distribution, or stacked composition — emit a `charts` array at the top level of the spec. The panel auto-adds a Data/Charts tab toggle when present.

```json
{
  "kind": "spreadsheet/v1",
  "sheets": [
    {
      "name": "Trajectory",
      "cells": [
        { "ref": "A1", "value": "Year",    "style": "header" },
        { "ref": "B1", "value": "Revenue", "style": "header" },
        { "ref": "C1", "value": "EBITDA",  "style": "header" },
        { "ref": "A2", "value": 2024 }, { "ref": "B2", "value": 100, "format": "$#,##0" }, { "ref": "C2", "value": 30, "format": "$#,##0" },
        { "ref": "A3", "value": 2025 }, { "ref": "B3", "value": 130, "format": "$#,##0" }, { "ref": "C3", "value": 40, "format": "$#,##0" },
        { "ref": "A4", "value": 2026 }, { "ref": "B4", "value": 170, "format": "$#,##0" }, { "ref": "C4", "value": 55, "format": "$#,##0" }
      ]
    }
  ],
  "charts": [
    {
      "id": "rev-trend",
      "title": "Financial Trajectory",
      "type": "bar",
      "categoryRange": "Trajectory!A2:A4",
      "series": [
        { "name": "Revenue", "range": "Trajectory!B2:B4", "color": "#1a73e8" },
        { "name": "EBITDA",  "range": "Trajectory!C2:C4", "color": "#34a853" }
      ]
    }
  ]
}
```

**Chart rules:**

- `type`: `"bar"` (compare categories), `"line"` (trend over time), `"area"` (cumulative trend), `"pie"` (composition; uses first series only — each row is a slice).
- `categoryRange`: x-axis labels. Always a single column or single row range like `Sheet1!A2:A6`.
- `series[].range`: y-values, same shape as `categoryRange` (parallel ranges).
- `series[].color` is optional; the panel cycles through a default palette if absent.
- `stacked: true` for bar/area to stack series on top of each other.
- Maximum 8 charts per workbook.

**When to emit a chart:**

- Financial models, projections, forecasts → bar or line of revenue/EBITDA over years
- Budget breakdowns → pie chart of spending categories
- Cumulative metrics → area chart with `stacked: true`
- Comparison across categories → bar chart

Skip charts for simple lookup tables, dictionaries, or one-off snapshots.
````

- [ ] **Step 3: Verify the prompt compiles (it's a TS string template)**

```bash
bunx tsc --noEmit -p tsconfig.json 2>&1 | grep "prompts/artifacts/sheet" | head
```
Expected: empty.

- [ ] **Step 4: Commit**

```bash
git add src/lib/prompts/artifacts/sheet.ts
git commit-sulthan -m "feat(prompt): instruct LLM to emit spec.charts when visual is warranted"
```

---

## Task 13: Render snapshot test for SpecWorkbookView

**Files:**
- Create: `tests/unit/renderers/sheet-spec-view-render.test.tsx`

- [ ] **Step 1: Check whether RTL (React Testing Library) is set up**

```bash
grep -E '"@testing-library/react"' package.json
```

If not present, install:
```bash
bun add -d @testing-library/react @testing-library/jest-dom jsdom
```

Verify `vitest.config.ts` (or `vite.config.ts`) sets `test.environment = "jsdom"` and includes a setup file that imports `@testing-library/jest-dom`. If not, add it. (Skip this task if the repo has a strong policy against RTL — fall back to a simpler smoke test.)

- [ ] **Step 2: Write the test**

```tsx
// tests/unit/renderers/sheet-spec-view-render.test.tsx
import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { SpecWorkbookView } from "@/features/conversations/components/chat/artifacts/renderers/sheet-spec-view"

const minimalSpec = JSON.stringify({
  kind: "spreadsheet/v1",
  sheets: [
    {
      name: "Sheet1",
      cells: [
        { ref: "A1", value: "Year",    style: "header" },
        { ref: "B1", value: "Revenue", style: "header" },
        { ref: "A2", value: 2025 },
        { ref: "B2", value: 100, format: "$#,##0" },
        { ref: "A3", value: 2026 },
        { ref: "B3", formula: "=B2*1.5", format: "$#,##0" },
      ],
    },
  ],
})

describe("SpecWorkbookView", () => {
  it("renders the formula bar at the top, sheet tabs at the bottom", async () => {
    render(<SpecWorkbookView content={minimalSpec} onDownloadXlsx={() => {}} />)
    // Sheet tab is visible (single sheet still renders)
    expect(screen.getByText("Sheet1")).toBeInTheDocument()
    // Column letter A is rendered
    expect(screen.getAllByText("A").length).toBeGreaterThan(0)
    // Header cell content rendered
    expect(screen.getByText("Year")).toBeInTheDocument()
    expect(screen.getByText("Revenue")).toBeInTheDocument()
  })

  it("formats currency values per cell.format", async () => {
    render(<SpecWorkbookView content={minimalSpec} onDownloadXlsx={() => {}} />)
    expect(await screen.findByText("$100")).toBeInTheDocument()
  })

  it("shows error banner when content is invalid JSON", async () => {
    render(<SpecWorkbookView content="{not valid" onDownloadXlsx={() => {}} />)
    expect(screen.getByText(/Invalid spreadsheet spec/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Run**

```bash
bunx vitest run tests/unit/renderers/sheet-spec-view-render.test.tsx
```
Expected: PASS — 3/3.

If RTL is unavailable in this repo (no jsdom config, no install), skip this task and rely on manual smoke (Step 4 of Task 14).

- [ ] **Step 4: Commit**

```bash
git add tests/unit/renderers/sheet-spec-view-render.test.tsx
git commit-sulthan -m "test(panel): SpecWorkbookView render — formula bar, tabs, format, error states"
```

---

## Task 14: Regression sweep + manual smoke + branch cleanup

**Files:** none (verification only)

- [ ] **Step 1: Full spreadsheet test suite**

```bash
bunx vitest run tests/unit/spreadsheet/ tests/unit/renderers/ 2>&1 | tail -10
```
Expected: ALL green. Existing spreadsheet tests + new format/cell-classify/chart-data/parse-charts/styles/render tests all pass.

- [ ] **Step 2: Wider regression sweep**

```bash
bunx vitest run tests/unit/document-ast/ tests/unit/document-script/ tests/unit/rendering/ tests/unit/api/ tests/unit/tools/ tests/unit/spreadsheet/ tests/unit/renderers/ 2>&1 | tail -10
```
Expected: ALL green (~600 tests).

- [ ] **Step 3: Typecheck on touched files**

```bash
bunx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "spreadsheet|sheet-spec-view|sheet-formula-bar|sheet-chart-view|prompts/artifacts/sheet" | head
```
Expected: empty.

- [ ] **Step 4: Manual smoke**

```bash
bun run dev
```

In the browser:
1. Open a chat
2. Ask: "Buatkan financial model 5 tahun dengan revenue, EBITDA, net income — pakai chart bar untuk visualisasi"
3. Verify panel shows JSON streaming (current behavior preserved)
4. After streaming completes:
   - Top formula bar visible (Name Box on left + ƒx + display on right)
   - Click any cell → formula bar populates
   - Numeric cells right-aligned, headers bold
   - Cells with plain values render in **blue text**
   - Cells with formulas render in **black text**
   - If formula references a different sheet, render in **green text**
   - Sheet tabs at the **bottom** with active tab styled
   - Column letters A B C... and row numbers 1 2 3... visible
   - Sticky left column on horizontal scroll
   - Frozen panes (if spec has any) show 2px gray border
   - Default font is Arial
5. Verify Charts tab:
   - Top of grid has Data | Charts toggle
   - Click Charts → bar chart renders via Recharts
6. Click "Download XLSX" → file downloads, opens correctly in LibreOffice/Excel

- [ ] **Step 5: Commit + push**

```bash
git push origin feat/spreadsheet-excel-feel-polish
```

- [ ] **Step 6: Open PR**

```bash
gh pr create --title "feat(spreadsheet): Excel-feel panel polish + Charts tab" --body "$(cat <<'EOF'
## Summary

Brings the `application/sheet` panel preview to ~95% visual parity with Claude.ai's xlsx artifact preview while keeping current architectural strengths (typed JSON spec, ExcelJS generation, streaming, manual edit, click-cell formula).

Implements `docs/superpowers/specs/2026-04-27-spreadsheet-excel-feel-polish-design.md`.

### Phase A — visual polish
- Color coding via `classifyCell` + `colorClassToClassName`: blue inputs, black formulas, green cross-sheet refs, red external refs (skill-mandated)
- Real Excel format string engine via `numfmt` library (`$#,##0;($#,##0);-` → `$1,234` / `($1,234)` / `-`)
- Top formula bar with Name Box + ƒx (replaces footer cell info)
- Bottom sheet tabs (moved from top, Excel-style rounded-top with active border)
- Sticky left-column row labels
- Auto-aligned numerics (right) / booleans (center) / text (left)
- Active row + column header highlighted on cell selection
- Frozen panes rendered as 2px gray border at row N / col M
- Yellow background for `style: "highlight"` cells
- Default font Arial via `theme.font`
- Tighter cell padding for Excel-like density

### Phase B — Charts tab
- Schema additively gains `charts?: ChartSpec[]` (max 8 per workbook)
- `resolveChartData` — range parser + Recharts data shape transformer
- `SheetChartView` — Recharts `BarChart` / `LineChart` / `PieChart` / `AreaChart` with stacking support
- Data/Charts tab toggle in panel when `spec.charts` present
- Native ExcelJS chart objects emitted in downloaded `.xlsx` (graceful skip if API unavailable)
- LLM prompt updated with charts subsection + worked example

## Test plan
- [x] format.test.ts — currency/percent/multiple formats incl. `$#,##0;($#,##0);-`
- [x] cell-classify.test.ts — input/formula/cross-sheet/external/header rules
- [x] styles.test.ts — colorClassToClassName mapping
- [x] parse.test.ts — ChartSpec validation + maxCharts cap
- [x] chart-data.test.ts — range expansion + Recharts shape + missing-row skip
- [x] sheet-spec-view-render.test.tsx — formula bar, tabs, format, error
- [x] Full regression sweep across spreadsheet + renderer suites
- [x] Manual smoke: 5-year financial model with chart end-to-end

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

(Strip the `🤖 Generated` line per repo policy if user wants a strictly clean PR body — but reusing the docx PR pattern is fine.)

---

## Self-Review

**Spec coverage check:**
- §2 architectural decisions → Tasks 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12 each implement a locked decision
- §3 visual polish targets (3.1–3.8) → Task 6 (rewrite) consolidates all of them
- §4 Charts tab (4.1–4.6) → Tasks 7 (schema), 8 (data resolver), 9 (render component), 10 (toggle wiring), 11 (native xlsx export), 12 (prompt)
- §5 file structure → mirrored in plan File Structure block
- §6 data flow → covered implicitly via component wiring in Tasks 6 + 10
- §7 testing strategy → Tasks 2, 3, 4, 7, 8, 13 add unit + render tests
- §8 out of scope → respected (no range select, no copy/paste, no fill handle, no conditional formatting, no pivot tables)

**Placeholder scan:** No "TBD"/"TODO"/"implement later". Task 11 has a fallback if ExcelJS doesn't expose `addChart` — that's a documented decision branch, not a placeholder. Task 13 has a "skip if RTL not set up" branch — also a decision branch with a clear fallback (manual smoke in Task 14).

**Type consistency:** `ColorClass`, `CellSpec`, `ChartSpec`, `ChartSeriesSpec`, `WorkbookValues`, `ResolvedChartData` are defined in earlier tasks and reused consistently in later tasks. Function names: `formatNumber`, `classifyCell`, `colorClassToClassName`, `resolveChartData` — all defined once and used identically.

No issues found.
