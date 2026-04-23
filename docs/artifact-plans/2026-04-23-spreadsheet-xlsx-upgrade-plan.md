# Spreadsheet XLSX Upgrade — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evolve `application/sheet` in place so it accepts a `spreadsheet/v1` JSON spec (alongside existing CSV / JSON-array shapes), renders a workbook preview with computed formula values, and exports a real `.xlsx` via ExcelJS. Zero regression on existing CSV artifacts. Zero new runtime dependencies.

**Architecture:** A single type with shape dispatch. A new `src/lib/spreadsheet/` module holds: types, a parser that detects the shape + validates the spec, a formula evaluator (AST via `fast-formula-parser`, math via `@formulajs/formulajs`, dep graph in-house), and an ExcelJS-based xlsx generator. The renderer splits into three sub-views: `CsvTableView` (extracted from today), `ArrayTableView` (extracted), `SpecWorkbookView` (new). The download handler peeks at shape to pick `.xlsx` vs `.csv`. Everything new is lazy-loaded — zero bundle cost at idle.

**Tech Stack:** Next.js 15, React 18, TypeScript, TanStack Table (`@tanstack/react-table` already in deps), Vitest, Tailwind. New deps: `exceljs` (MIT, ~900 KB ungz), `@formulajs/formulajs` (MIT, ~120 KB), `fast-formula-parser` (MIT, ~40 KB). Retains `xlsx@0.18.5` (SheetJS) for the RAG parsers and for test round-trips.

**Design doc:** [`docs/artifact-plans/2026-04-23-spreadsheet-xlsx-upgrade-design.md`](./2026-04-23-spreadsheet-xlsx-upgrade-design.md) — read first.

**Package manager:** bun. All install / test commands use `bun`, never `npm`.

---

## File Structure

### New files

- `src/lib/spreadsheet/types.ts` — spec types, version tag, style names, MIME constant
- `src/lib/spreadsheet/parse.ts` — `detectShape`, `parseSpec`, structural checks, caps
- `src/lib/spreadsheet/formulas.ts` — formula AST parsing, ref extraction, dep graph, evaluator (wraps Formula.js)
- `src/lib/spreadsheet/styles.ts` — style-name → ExcelJS style object mapping (shared by renderer + exporter)
- `src/lib/spreadsheet/generate-xlsx.ts` — `generateXlsx(spec, computedValues) → Promise<Blob>`
- `src/features/conversations/components/chat/artifacts/renderers/sheet-spec-view.tsx` — the new `SpecWorkbookView` sub-renderer
- `tests/unit/spreadsheet/parse.test.ts`
- `tests/unit/spreadsheet/formulas.test.ts`
- `tests/unit/spreadsheet/generate-xlsx.test.ts`

### Modified files

- `src/features/conversations/components/chat/artifacts/renderers/sheet-renderer.tsx` — shape-dispatch on top, existing body becomes `CsvTableView` + `ArrayTableView`
- `src/lib/tools/builtin/_validate-artifact.ts` — `validateSheet` gains a spec branch
- `src/features/conversations/components/chat/artifacts/artifact-panel.tsx` — `getExtension` shape-aware, `handleDownload` spec branch, dual-button toolbar
- `src/lib/prompts/artifacts/sheet.ts` — Shape C section, decision table, example
- `src/lib/prompts/artifacts/context.ts` — one-liner update
- `tests/unit/validate-artifact.test.ts` — new cases for spec shape
- `package.json` / `bun.lock` — three new deps

### Responsibility boundaries

- **`types.ts`** owns the public shape. Everything else imports from here. No logic.
- **`parse.ts`** owns shape detection and schema validation. Returns either a parsed spec or a list of issues. Does not touch Formula.js (imports `formulas.ts` only for ref-extraction at validate-time).
- **`formulas.ts`** owns formula evaluation. Pure functions: spec in, `Map<ref, {value, error?}>` out. Does not touch the DOM, ExcelJS, or React.
- **`styles.ts`** owns the six named styles. Shared source of truth so the renderer's preview matches the exported xlsx byte-for-byte.
- **`generate-xlsx.ts`** owns the ExcelJS Workbook build. Pure function: spec + values in, Blob out. No DOM.
- **`sheet-spec-view.tsx`** owns the rich preview. Orchestrates `parseSpec` → `evaluateWorkbook` → TanStack. Lazy-loads Formula.js on mount.
- **`sheet-renderer.tsx`** becomes a 40-line dispatcher that picks which sub-view to render.

---

## Phasing (four independently mergeable slices)

- **Phase 1 (Tasks 1–6):** types, shape detection, spec parser, formula evaluator, validator branch, minimal renderer guard so spec content doesn't hit the CSV parse-error UI. No user-visible rich preview, no xlsx export yet.
- **Phase 2 (Tasks 7–10):** `SpecWorkbookView` renderer — sheet tabs, A/B/C column letters, ƒx toggle, computed values, type-aware sort. Download still flattens active sheet to CSV.
- **Phase 3 (Tasks 11–13):** `generate-xlsx.ts` + panel download branch + dual-button toolbar. Spec content downloads as `.xlsx`.
- **Phase 4 (Task 14):** update the sheet prompt to teach the LLM when and how to emit a JSON spec.

Each phase ends with a commit and leaves `main` in a shippable state.

---

## Phase 1 — Spec, Validator, Formula Evaluator

### Task 1: Install dependencies and scaffold the module

**Files:**
- Modify: `package.json` (add three deps)
- Create: `src/lib/spreadsheet/` (empty directory)
- Create: `tests/unit/spreadsheet/` (empty directory)

- [ ] **Step 1: Install dependencies with bun**

Run:
```bash
cd /home/shiro/rantai/RantAI-Agents
bun add exceljs @formulajs/formulajs fast-formula-parser
```

Expected: `package.json` gains three entries under `"dependencies"`. `bun.lock` updates. No errors.

- [ ] **Step 2: Verify versions in package.json**

Run: `grep -E 'exceljs|formulajs|fast-formula-parser' package.json`

Expected output (versions may differ slightly, this is fine):
```
"@formulajs/formulajs": "^4.x.x",
"exceljs": "^4.x.x",
"fast-formula-parser": "^1.x.x",
```

- [ ] **Step 3: Create module directory**

Run: `mkdir -p src/lib/spreadsheet tests/unit/spreadsheet`

- [ ] **Step 4: Commit**

```bash
git add package.json bun.lock
git commit -m "chore(deps): add exceljs, formulajs, fast-formula-parser for sheet xlsx upgrade"
```

---

### Task 2: Write `types.ts`

**Files:**
- Create: `src/lib/spreadsheet/types.ts`

- [ ] **Step 1: Write the full types file**

Create `src/lib/spreadsheet/types.ts`:

```typescript
export const SPREADSHEET_SPEC_VERSION = "spreadsheet/v1" as const

export const XLSX_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

export const SPREADSHEET_CAPS = {
  maxSheets: 8,
  maxCellsPerSheet: 500,
  maxFormulasPerWorkbook: 200,
  maxNamedRanges: 64,
  maxSheetNameLength: 31,
} as const

export type CellStyleName =
  | "header"
  | "input"
  | "formula"
  | "cross-sheet"
  | "highlight"
  | "note"

export type CellValue = string | number | boolean | null

export interface CellSpec {
  ref: string
  value?: CellValue
  formula?: string
  format?: string
  style?: CellStyleName
  note?: string
}

export interface ColumnSpec {
  width?: number
  format?: string
}

export interface FrozenSpec {
  rows?: number
  columns?: number
}

export interface SheetSpec {
  name: string
  columns?: ColumnSpec[]
  frozen?: FrozenSpec
  cells: CellSpec[]
  merges?: string[]
}

export interface SpreadsheetTheme {
  font?: "Arial" | "Calibri" | "Times New Roman"
  inputColor?: string
  formulaColor?: string
  crossSheetColor?: string
  highlightFill?: string
}

export const DEFAULT_THEME: Required<SpreadsheetTheme> = {
  font: "Arial",
  inputColor: "#0000FF",
  formulaColor: "#000000",
  crossSheetColor: "#008000",
  highlightFill: "#FFFF00",
}

export interface SpreadsheetSpec {
  kind: typeof SPREADSHEET_SPEC_VERSION
  theme?: SpreadsheetTheme
  namedRanges?: Record<string, string>
  sheets: SheetSpec[]
}

export type ContentShape = "csv" | "array" | "spec"

export interface EvaluatedCell {
  value: CellValue
  error?: string
}

export type WorkbookValues = Map<string, EvaluatedCell>

export interface ParseResult {
  ok: boolean
  spec?: SpreadsheetSpec
  errors: string[]
  warnings: string[]
}
```

- [ ] **Step 2: Verify TypeScript accepts the file**

Run: `bunx tsc --noEmit -p .`

Expected: no errors. If pre-existing errors appear in other files, verify none reference `src/lib/spreadsheet/types.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/spreadsheet/types.ts
git commit -m "feat(spreadsheet): add types and caps for spreadsheet/v1 spec"
```

---

### Task 3: Write `parse.ts` — shape detection

**Files:**
- Create: `src/lib/spreadsheet/parse.ts`
- Test: `tests/unit/spreadsheet/parse.test.ts`

- [ ] **Step 1: Write the failing tests for `detectShape`**

Create `tests/unit/spreadsheet/parse.test.ts`:

```typescript
import { describe, it, expect } from "vitest"
import { detectShape } from "@/lib/spreadsheet/parse"

describe("detectShape", () => {
  it("detects CSV when content starts with non-{, non-[ character", () => {
    expect(detectShape("a,b,c\n1,2,3")).toBe("csv")
  })

  it("detects CSV when content is empty string", () => {
    expect(detectShape("")).toBe("csv")
  })

  it("detects array when content starts with [", () => {
    expect(detectShape('[{"a":1}]')).toBe("array")
  })

  it("detects array with leading whitespace", () => {
    expect(detectShape('   \n  [{"a":1}]')).toBe("array")
  })

  it("detects spec when content is a JSON object with kind=spreadsheet/v1", () => {
    expect(detectShape('{"kind":"spreadsheet/v1","sheets":[]}')).toBe("spec")
  })

  it("falls back to csv when content starts with { but is not a spec", () => {
    expect(detectShape('{"foo":1}')).toBe("csv")
  })

  it("falls back to csv when JSON is malformed", () => {
    expect(detectShape('{"kind":"spreadsheet/v1"')).toBe("csv")
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/unit/spreadsheet/parse.test.ts`
Expected: FAIL — `Cannot find module "@/lib/spreadsheet/parse"`.

- [ ] **Step 3: Write `detectShape`**

Create `src/lib/spreadsheet/parse.ts`:

```typescript
import {
  SPREADSHEET_SPEC_VERSION,
  SPREADSHEET_CAPS,
  type SpreadsheetSpec,
  type ContentShape,
  type ParseResult,
  type SheetSpec,
  type CellSpec,
} from "./types"

export function detectShape(content: string): ContentShape {
  const trimmed = content.trimStart()
  if (trimmed.startsWith("[")) return "array"
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed)
      if (
        parsed &&
        typeof parsed === "object" &&
        !Array.isArray(parsed) &&
        parsed.kind === SPREADSHEET_SPEC_VERSION
      ) {
        return "spec"
      }
    } catch {
      // fall through
    }
  }
  return "csv"
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test tests/unit/spreadsheet/parse.test.ts`
Expected: PASS — 7 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/spreadsheet/parse.ts tests/unit/spreadsheet/parse.test.ts
git commit -m "feat(spreadsheet): add content shape detection for sheet artifact"
```

---

### Task 4: Extend `parse.ts` — `parseSpec` with schema + caps validation

**Files:**
- Modify: `src/lib/spreadsheet/parse.ts`
- Test: `tests/unit/spreadsheet/parse.test.ts`

- [ ] **Step 1: Write the failing tests for `parseSpec`**

Append to `tests/unit/spreadsheet/parse.test.ts`:

```typescript
import { parseSpec } from "@/lib/spreadsheet/parse"

const VALID_SPEC = {
  kind: "spreadsheet/v1",
  sheets: [
    {
      name: "Sheet1",
      cells: [
        { ref: "A1", value: "Header" },
        { ref: "B1", value: 42, format: "#,##0" },
      ],
    },
  ],
}

describe("parseSpec — happy path", () => {
  it("accepts a minimal valid spec", () => {
    const r = parseSpec(JSON.stringify(VALID_SPEC))
    expect(r.ok).toBe(true)
    expect(r.spec?.sheets).toHaveLength(1)
    expect(r.errors).toEqual([])
  })

  it("accepts a spec with named ranges, merges, frozen panes, and theme", () => {
    const spec = {
      kind: "spreadsheet/v1",
      theme: { inputColor: "#0000FF" },
      namedRanges: { Rate: "Sheet1!B2" },
      sheets: [
        {
          name: "Sheet1",
          columns: [{ width: 20 }, { width: 10, format: "0.0%" }],
          frozen: { rows: 1 },
          cells: [
            { ref: "A1", value: "Rate" },
            { ref: "B1", value: 0.15, style: "input" },
            { ref: "B2", formula: "=B1*2", style: "formula" },
          ],
          merges: ["A1:B1"],
        },
      ],
    }
    const r = parseSpec(JSON.stringify(spec))
    expect(r.ok).toBe(true)
  })
})

describe("parseSpec — errors", () => {
  it("rejects malformed JSON", () => {
    const r = parseSpec('{"kind":"spreadsheet/v1"')
    expect(r.ok).toBe(false)
    expect(r.errors[0]).toMatch(/JSON/i)
  })

  it("rejects wrong kind", () => {
    const r = parseSpec('{"kind":"spreadsheet/v2","sheets":[]}')
    expect(r.ok).toBe(false)
    expect(r.errors.join(" ")).toMatch(/kind/i)
  })

  it("rejects empty sheets array", () => {
    const r = parseSpec('{"kind":"spreadsheet/v1","sheets":[]}')
    expect(r.ok).toBe(false)
    expect(r.errors.join(" ")).toMatch(/sheet/i)
  })

  it("rejects over-cap sheet count", () => {
    const sheets = Array.from({ length: 9 }, (_, i) => ({
      name: `S${i}`,
      cells: [{ ref: "A1", value: 1 }],
    }))
    const r = parseSpec(JSON.stringify({ kind: "spreadsheet/v1", sheets }))
    expect(r.ok).toBe(false)
    expect(r.errors.join(" ")).toMatch(/8 sheets/)
  })

  it("rejects over-cap cells per sheet", () => {
    const cells = Array.from({ length: 501 }, (_, i) => ({
      ref: `A${i + 1}`,
      value: i,
    }))
    const r = parseSpec(
      JSON.stringify({
        kind: "spreadsheet/v1",
        sheets: [{ name: "S", cells }],
      })
    )
    expect(r.ok).toBe(false)
    expect(r.errors.join(" ")).toMatch(/500 cells/)
  })

  it("rejects duplicate sheet names", () => {
    const r = parseSpec(
      JSON.stringify({
        kind: "spreadsheet/v1",
        sheets: [
          { name: "Dup", cells: [{ ref: "A1", value: 1 }] },
          { name: "Dup", cells: [{ ref: "A1", value: 2 }] },
        ],
      })
    )
    expect(r.ok).toBe(false)
    expect(r.errors.join(" ")).toMatch(/duplicate/i)
  })

  it("rejects bad sheet name characters", () => {
    const r = parseSpec(
      JSON.stringify({
        kind: "spreadsheet/v1",
        sheets: [{ name: "Has!Bang", cells: [{ ref: "A1", value: 1 }] }],
      })
    )
    expect(r.ok).toBe(false)
    expect(r.errors.join(" ")).toMatch(/sheet name/i)
  })

  it("rejects malformed A1 ref", () => {
    const r = parseSpec(
      JSON.stringify({
        kind: "spreadsheet/v1",
        sheets: [{ name: "S", cells: [{ ref: "1A", value: 1 }] }],
      })
    )
    expect(r.ok).toBe(false)
    expect(r.errors.join(" ")).toMatch(/ref/i)
  })

  it("rejects cell with both value and formula", () => {
    const r = parseSpec(
      JSON.stringify({
        kind: "spreadsheet/v1",
        sheets: [
          {
            name: "S",
            cells: [{ ref: "A1", value: 1, formula: "=1+1" }],
          },
        ],
      })
    )
    expect(r.ok).toBe(false)
    expect(r.errors.join(" ")).toMatch(/both value and formula/i)
  })

  it("rejects unknown style name", () => {
    const r = parseSpec(
      JSON.stringify({
        kind: "spreadsheet/v1",
        sheets: [
          { name: "S", cells: [{ ref: "A1", value: 1, style: "bogus" }] },
        ],
      })
    )
    expect(r.ok).toBe(false)
    expect(r.errors.join(" ")).toMatch(/style/i)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/unit/spreadsheet/parse.test.ts`
Expected: 12 tests FAIL (`parseSpec is not a function`).

- [ ] **Step 3: Implement `parseSpec`**

Append to `src/lib/spreadsheet/parse.ts`:

```typescript
const A1_REF = /^\$?[A-Z]+\$?[1-9][0-9]*$/
const SHEET_NAME_OK = /^[A-Za-z0-9 _]+$/
const VALID_STYLES = new Set([
  "header",
  "input",
  "formula",
  "cross-sheet",
  "highlight",
  "note",
])

export function parseSpec(content: string): ParseResult {
  const errors: string[] = []
  const warnings: string[] = []

  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch (err) {
    errors.push(
      `Invalid JSON: ${err instanceof Error ? err.message : String(err)}`
    )
    return { ok: false, errors, warnings }
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    errors.push("Top level must be a JSON object.")
    return { ok: false, errors, warnings }
  }

  const obj = parsed as Record<string, unknown>

  if (obj.kind !== SPREADSHEET_SPEC_VERSION) {
    errors.push(
      `Expected kind "${SPREADSHEET_SPEC_VERSION}" but got ${JSON.stringify(
        obj.kind
      )}.`
    )
    return { ok: false, errors, warnings }
  }

  if (!Array.isArray(obj.sheets) || obj.sheets.length === 0) {
    errors.push("sheets must be a non-empty array.")
    return { ok: false, errors, warnings }
  }

  if (obj.sheets.length > SPREADSHEET_CAPS.maxSheets) {
    errors.push(
      `Workbook has ${obj.sheets.length} sheets but the max is ${SPREADSHEET_CAPS.maxSheets} sheets.`
    )
    return { ok: false, errors, warnings }
  }

  const seenNames = new Set<string>()
  let totalFormulas = 0

  for (let i = 0; i < obj.sheets.length; i++) {
    const sheet = obj.sheets[i] as Record<string, unknown>
    const sheetLabel = `sheets[${i}]`

    if (typeof sheet.name !== "string" || sheet.name.length === 0) {
      errors.push(`${sheetLabel}.name must be a non-empty string.`)
      continue
    }
    if (sheet.name.length > SPREADSHEET_CAPS.maxSheetNameLength) {
      errors.push(
        `${sheetLabel}.name "${sheet.name}" exceeds ${SPREADSHEET_CAPS.maxSheetNameLength} characters.`
      )
    }
    if (!SHEET_NAME_OK.test(sheet.name)) {
      errors.push(
        `${sheetLabel}.name "${sheet.name}" contains invalid characters. Use letters, numbers, spaces, and underscores only.`
      )
    }
    if (seenNames.has(sheet.name)) {
      errors.push(`Duplicate sheet name: "${sheet.name}".`)
    }
    seenNames.add(sheet.name)

    if (!Array.isArray(sheet.cells)) {
      errors.push(`${sheetLabel}.cells must be an array.`)
      continue
    }

    if (sheet.cells.length > SPREADSHEET_CAPS.maxCellsPerSheet) {
      errors.push(
        `Sheet "${sheet.name}" has ${sheet.cells.length} cells but the max is ${SPREADSHEET_CAPS.maxCellsPerSheet} cells per sheet.`
      )
    }

    const refsInSheet = new Set<string>()
    for (let c = 0; c < sheet.cells.length; c++) {
      const cell = sheet.cells[c] as Record<string, unknown>
      const cellLabel = `${sheet.name}.cells[${c}]`

      if (typeof cell.ref !== "string" || !A1_REF.test(cell.ref)) {
        errors.push(
          `${cellLabel}.ref must be an A1 reference like "A1" or "$B$12". Got: ${JSON.stringify(cell.ref)}.`
        )
        continue
      }
      const canonicalRef = cell.ref.replace(/\$/g, "")
      if (refsInSheet.has(canonicalRef)) {
        errors.push(`${cellLabel}.ref "${cell.ref}" is duplicated in sheet "${sheet.name}".`)
      }
      refsInSheet.add(canonicalRef)

      const hasValue = cell.value !== undefined
      const hasFormula = cell.formula !== undefined
      if (hasValue && hasFormula) {
        errors.push(
          `${cellLabel} has both value and formula. Provide one.`
        )
      }
      if (!hasValue && !hasFormula) {
        errors.push(
          `${cellLabel} has neither value nor formula. Provide one.`
        )
      }
      if (hasFormula) {
        if (typeof cell.formula !== "string" || !cell.formula.startsWith("=")) {
          errors.push(
            `${cellLabel}.formula must be a string starting with "=". Got: ${JSON.stringify(cell.formula)}.`
          )
        } else {
          totalFormulas++
        }
      }
      if (
        cell.style !== undefined &&
        (typeof cell.style !== "string" || !VALID_STYLES.has(cell.style))
      ) {
        errors.push(
          `${cellLabel}.style "${cell.style}" is not one of: ${Array.from(VALID_STYLES).join(", ")}.`
        )
      }
    }
  }

  if (totalFormulas > SPREADSHEET_CAPS.maxFormulasPerWorkbook) {
    errors.push(
      `Workbook has ${totalFormulas} formulas but the max is ${SPREADSHEET_CAPS.maxFormulasPerWorkbook}.`
    )
  }

  if (obj.namedRanges !== undefined) {
    if (
      typeof obj.namedRanges !== "object" ||
      obj.namedRanges === null ||
      Array.isArray(obj.namedRanges)
    ) {
      errors.push("namedRanges must be an object.")
    } else {
      const keys = Object.keys(obj.namedRanges)
      if (keys.length > SPREADSHEET_CAPS.maxNamedRanges) {
        errors.push(
          `Workbook has ${keys.length} named ranges but the max is ${SPREADSHEET_CAPS.maxNamedRanges}.`
        )
      }
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors, warnings }
  }

  return {
    ok: true,
    spec: obj as unknown as SpreadsheetSpec,
    errors,
    warnings,
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test tests/unit/spreadsheet/parse.test.ts`
Expected: PASS — all 19 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/spreadsheet/parse.ts tests/unit/spreadsheet/parse.test.ts
git commit -m "feat(spreadsheet): add parseSpec schema + caps validation"
```

---

### Task 5: Formula evaluator

**Files:**
- Create: `src/lib/spreadsheet/formulas.ts`
- Test: `tests/unit/spreadsheet/formulas.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/spreadsheet/formulas.test.ts`:

```typescript
import { describe, it, expect } from "vitest"
import { evaluateWorkbook } from "@/lib/spreadsheet/formulas"
import type { SpreadsheetSpec } from "@/lib/spreadsheet/types"

function spec(cells: Array<{ ref: string; value?: unknown; formula?: string }>): SpreadsheetSpec {
  return {
    kind: "spreadsheet/v1",
    sheets: [{ name: "Sheet1", cells: cells as never }],
  }
}

describe("evaluateWorkbook — values pass through", () => {
  it("returns plain values unchanged", () => {
    const v = evaluateWorkbook(spec([{ ref: "A1", value: 42 }]))
    expect(v.get("Sheet1!A1")?.value).toBe(42)
    expect(v.get("Sheet1!A1")?.error).toBeUndefined()
  })

  it("returns strings and booleans unchanged", () => {
    const v = evaluateWorkbook(
      spec([
        { ref: "A1", value: "hello" },
        { ref: "A2", value: true },
      ])
    )
    expect(v.get("Sheet1!A1")?.value).toBe("hello")
    expect(v.get("Sheet1!A2")?.value).toBe(true)
  })
})

describe("evaluateWorkbook — formulas", () => {
  it("evaluates SUM over a range", () => {
    const v = evaluateWorkbook(
      spec([
        { ref: "A1", value: 1 },
        { ref: "A2", value: 2 },
        { ref: "A3", value: 3 },
        { ref: "B1", formula: "=SUM(A1:A3)" },
      ])
    )
    expect(v.get("Sheet1!B1")?.value).toBe(6)
  })

  it("evaluates nested arithmetic with refs", () => {
    const v = evaluateWorkbook(
      spec([
        { ref: "A1", value: 100 },
        { ref: "A2", value: 0.15 },
        { ref: "A3", formula: "=A1*(1+A2)" },
      ])
    )
    expect(v.get("Sheet1!A3")?.value).toBeCloseTo(115, 5)
  })

  it("evaluates IF correctly", () => {
    const v = evaluateWorkbook(
      spec([
        { ref: "A1", value: 10 },
        { ref: "A2", formula: "=IF(A1>5,\"high\",\"low\")" },
      ])
    )
    expect(v.get("Sheet1!A2")?.value).toBe("high")
  })

  it("resolves dependencies across cells (topo order)", () => {
    // B1 depends on A1; A1 defined later in the cells array
    const v = evaluateWorkbook(
      spec([
        { ref: "B1", formula: "=A1*2" },
        { ref: "A1", value: 21 },
      ])
    )
    expect(v.get("Sheet1!B1")?.value).toBe(42)
  })

  it("returns #REF! when formula references an undefined cell", () => {
    const v = evaluateWorkbook(spec([{ ref: "A1", formula: "=Z99*2" }]))
    expect(v.get("Sheet1!A1")?.error).toMatch(/REF|NAME/)
  })

  it("detects circular references", () => {
    const v = evaluateWorkbook(
      spec([
        { ref: "A1", formula: "=B1+1" },
        { ref: "B1", formula: "=A1+1" },
      ])
    )
    expect(v.get("Sheet1!A1")?.error).toMatch(/circular|cycle/i)
    expect(v.get("Sheet1!B1")?.error).toMatch(/circular|cycle/i)
  })
})

describe("evaluateWorkbook — named ranges", () => {
  it("resolves named ranges to their cell value", () => {
    const sp: SpreadsheetSpec = {
      kind: "spreadsheet/v1",
      namedRanges: { GrowthRate: "Sheet1!B1" },
      sheets: [
        {
          name: "Sheet1",
          cells: [
            { ref: "A1", value: 1000 },
            { ref: "B1", value: 0.1 },
            { ref: "C1", formula: "=A1*(1+GrowthRate)" },
          ],
        },
      ],
    }
    const v = evaluateWorkbook(sp)
    expect(v.get("Sheet1!C1")?.value).toBeCloseTo(1100, 5)
  })
})

describe("evaluateWorkbook — cross-sheet refs", () => {
  it("resolves Sheet2!A1 from Sheet1 formula", () => {
    const sp: SpreadsheetSpec = {
      kind: "spreadsheet/v1",
      sheets: [
        {
          name: "Sheet1",
          cells: [{ ref: "A1", formula: "=Sheet2!A1*2" }],
        },
        {
          name: "Sheet2",
          cells: [{ ref: "A1", value: 7 }],
        },
      ],
    }
    const v = evaluateWorkbook(sp)
    expect(v.get("Sheet1!A1")?.value).toBe(14)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/unit/spreadsheet/formulas.test.ts`
Expected: FAIL — `Cannot find module "@/lib/spreadsheet/formulas"`.

- [ ] **Step 3: Write the evaluator**

Create `src/lib/spreadsheet/formulas.ts`:

```typescript
import * as formulajs from "@formulajs/formulajs"
import FormulaParserLib from "fast-formula-parser"
import type {
  SpreadsheetSpec,
  WorkbookValues,
  CellValue,
} from "./types"

// fast-formula-parser ships as both CJS and ESM. Resolve the default export
// defensively so either shape works.
const FormulaParser =
  (FormulaParserLib as unknown as { default?: typeof FormulaParserLib }).default ??
  FormulaParserLib

type ParserInstance = {
  parse: (formula: string, position: { sheet: string; row: number; col: number }) => unknown
}

interface CellLocation {
  sheet: string
  ref: string
  row: number
  col: number
}

/** "A1" → { row: 1, col: 1 }. Strips $ anchors. */
function refToRowCol(ref: string): { row: number; col: number } {
  const clean = ref.replace(/\$/g, "")
  const match = clean.match(/^([A-Z]+)([0-9]+)$/)
  if (!match) throw new Error(`Malformed ref: ${ref}`)
  const letters = match[1]
  const row = parseInt(match[2], 10)
  let col = 0
  for (let i = 0; i < letters.length; i++) {
    col = col * 26 + (letters.charCodeAt(i) - 64)
  }
  return { row, col }
}

function rowColToRef(row: number, col: number): string {
  let letters = ""
  let c = col
  while (c > 0) {
    const rem = (c - 1) % 26
    letters = String.fromCharCode(65 + rem) + letters
    c = Math.floor((c - 1) / 26)
  }
  return `${letters}${row}`
}

function qualify(sheet: string, ref: string): string {
  return `${sheet}!${ref.replace(/\$/g, "")}`
}

export function evaluateWorkbook(spec: SpreadsheetSpec): WorkbookValues {
  const values: WorkbookValues = new Map()
  // Map<qualifiedRef, {sheet, ref, formula?, value?}>
  type Cell = {
    sheet: string
    ref: string
    row: number
    col: number
    formula?: string
    value?: CellValue
  }
  const cellIndex = new Map<string, Cell>()

  for (const sheet of spec.sheets) {
    for (const cell of sheet.cells) {
      const { row, col } = refToRowCol(cell.ref)
      cellIndex.set(qualify(sheet.name, cell.ref), {
        sheet: sheet.name,
        ref: cell.ref.replace(/\$/g, ""),
        row,
        col,
        formula: cell.formula,
        value: cell.value ?? null,
      })
    }
  }

  // Build an evaluator that pulls current cell values from `values` map.
  // fast-formula-parser calls onCell(sheet, row, col) and onRange(sheet, rowFrom, colFrom, rowTo, colTo).
  const parser = new (FormulaParser as unknown as new (opts: unknown) => ParserInstance)({
    onCell: ({ sheet, row, col }: { sheet: string; row: number; col: number }) => {
      const sheetName = sheet || spec.sheets[0].name
      const ref = rowColToRef(row, col)
      const key = `${sheetName}!${ref}`
      const entry = values.get(key)
      if (entry?.error) return `#${entry.error}#` // propagate as stringy error token; Formula.js will fold to NaN
      return entry?.value ?? null
    },
    onRange: ({
      sheet,
      from,
      to,
    }: {
      sheet: string
      from: { row: number; col: number }
      to: { row: number; col: number }
    }) => {
      const sheetName = sheet || spec.sheets[0].name
      const out: CellValue[][] = []
      for (let r = from.row; r <= to.row; r++) {
        const rowVals: CellValue[] = []
        for (let c = from.col; c <= to.col; c++) {
          const ref = rowColToRef(r, c)
          const key = `${sheetName}!${ref}`
          rowVals.push(values.get(key)?.value ?? null)
        }
        out.push(rowVals)
      }
      return out
    },
    functions: formulajs as unknown as Record<string, (...args: unknown[]) => unknown>,
  })

  // Extract refs from a formula for dep-graph construction.
  // We use a simple regex rather than the parser's AST traversal to keep this self-contained.
  function extractRefs(
    formula: string,
    currentSheet: string,
    namedRanges: Record<string, string>
  ): string[] {
    const refs: string[] = []
    // Named ranges first — resolve to their qualified ref.
    for (const [name, target] of Object.entries(namedRanges)) {
      const re = new RegExp(`\\b${name}\\b`, "g")
      if (re.test(formula)) {
        // Target is typically "Sheet!A1"; normalize to qualified form.
        const qualified = target.includes("!")
          ? target.replace(/\$/g, "")
          : qualify(currentSheet, target)
        refs.push(qualified)
      }
    }
    // Sheet!A1 or Sheet!A1:B2
    const sheetRefRe = /([A-Za-z0-9_ ]+)!\$?([A-Z]+)\$?([0-9]+)(?::\$?([A-Z]+)\$?([0-9]+))?/g
    let m: RegExpExecArray | null
    while ((m = sheetRefRe.exec(formula)) !== null) {
      const s = m[1].trim()
      if (m[4] && m[5]) {
        const fromRC = refToRowCol(`${m[2]}${m[3]}`)
        const toRC = refToRowCol(`${m[4]}${m[5]}`)
        for (let r = fromRC.row; r <= toRC.row; r++) {
          for (let c = fromRC.col; c <= toRC.col; c++) {
            refs.push(`${s}!${rowColToRef(r, c)}`)
          }
        }
      } else {
        refs.push(`${s}!${m[2]}${m[3]}`)
      }
    }
    // Same-sheet refs: A1 or A1:B2 (avoid double-matching sheet-qualified refs)
    const stripped = formula.replace(sheetRefRe, "")
    const plainRefRe = /\$?([A-Z]+)\$?([0-9]+)(?::\$?([A-Z]+)\$?([0-9]+))?/g
    while ((m = plainRefRe.exec(stripped)) !== null) {
      if (m[3] && m[4]) {
        const fromRC = refToRowCol(`${m[1]}${m[2]}`)
        const toRC = refToRowCol(`${m[3]}${m[4]}`)
        for (let r = fromRC.row; r <= toRC.row; r++) {
          for (let c = fromRC.col; c <= toRC.col; c++) {
            refs.push(qualify(currentSheet, rowColToRef(r, c)))
          }
        }
      } else {
        refs.push(qualify(currentSheet, `${m[1]}${m[2]}`))
      }
    }
    return refs
  }

  // Seed the values map with raw values first.
  for (const [key, cell] of cellIndex) {
    if (cell.formula === undefined) {
      values.set(key, { value: cell.value ?? null })
    }
  }

  // Build dep graph for formula cells and topologically sort.
  const namedRanges = spec.namedRanges ?? {}
  const deps = new Map<string, string[]>()
  for (const [key, cell] of cellIndex) {
    if (cell.formula !== undefined) {
      deps.set(key, extractRefs(cell.formula, cell.sheet, namedRanges))
    }
  }

  // Kahn's algorithm on the subgraph of formula cells.
  const order: string[] = []
  const incoming = new Map<string, number>()
  for (const key of deps.keys()) {
    incoming.set(key, 0)
  }
  for (const [_key, refs] of deps) {
    for (const ref of refs) {
      if (incoming.has(ref)) {
        incoming.set(ref, (incoming.get(ref) ?? 0) + 1)
      }
    }
  }
  // Reversed: Kahn picks nodes with 0 outgoing-to-unprocessed. Simpler:
  // iterate until fixed point, processing formulas whose deps are all resolved.
  const remaining = new Set(deps.keys())
  while (remaining.size > 0) {
    let progress = false
    for (const key of [...remaining]) {
      const myDeps = deps.get(key) ?? []
      const unresolved = myDeps.filter(
        (d) => remaining.has(d) // still unresolved formula dep
      )
      if (unresolved.length === 0) {
        order.push(key)
        remaining.delete(key)
        progress = true
      }
    }
    if (!progress) {
      // Cycle — mark all remaining as circular
      for (const key of remaining) {
        values.set(key, { value: null, error: "CIRCULAR" })
      }
      break
    }
  }

  // Evaluate in topological order.
  for (const key of order) {
    const cell = cellIndex.get(key)!
    try {
      const { row, col } = cell
      const result = parser.parse(cell.formula!.slice(1), {
        sheet: cell.sheet,
        row,
        col,
      })
      if (
        typeof result === "object" &&
        result !== null &&
        "result" in (result as Record<string, unknown>)
      ) {
        const r = (result as { result: unknown; error?: string })
        if (r.error) {
          values.set(key, { value: null, error: r.error.replace(/^#|!$/g, "") })
        } else {
          values.set(key, { value: r.result as CellValue })
        }
      } else {
        values.set(key, { value: result as CellValue })
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      const code = /#?(REF|NAME|VALUE|DIV\/0|NUM|N\/A)!?/.exec(msg)?.[1] ?? "ERROR"
      values.set(key, { value: null, error: code })
    }
  }

  return values
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test tests/unit/spreadsheet/formulas.test.ts`
Expected: PASS — all 10 tests green.

If the parser's callback signature differs from what's above (fast-formula-parser has had several API revisions), adjust `onCell` / `onRange` to match the installed version's shape. Check with: `cat node_modules/fast-formula-parser/README.md | head -200`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/spreadsheet/formulas.ts tests/unit/spreadsheet/formulas.test.ts
git commit -m "feat(spreadsheet): add formula evaluator with dep graph and cycle detection"
```

---

### Task 6: Wire the spec branch into `validateSheet`

**Files:**
- Modify: `src/lib/tools/builtin/_validate-artifact.ts`
- Modify: `tests/unit/validate-artifact.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/validate-artifact.test.ts`:

```typescript
describe("validateArtifactContent — application/sheet (JSON spec)", () => {
  const VALID_SPEC = JSON.stringify({
    kind: "spreadsheet/v1",
    sheets: [
      {
        name: "Sheet1",
        cells: [
          { ref: "A1", value: "Header" },
          { ref: "B1", value: 42 },
          { ref: "B2", formula: "=B1*2" },
        ],
      },
    ],
  })

  it("accepts a valid spec", () => {
    const r = validateArtifactContent("application/sheet", VALID_SPEC)
    expect(r.ok).toBe(true)
  })

  it("rejects a spec with an undefined cell reference", () => {
    const bad = JSON.stringify({
      kind: "spreadsheet/v1",
      sheets: [
        {
          name: "Sheet1",
          cells: [{ ref: "A1", formula: "=Z99*2" }],
        },
      ],
    })
    const r = validateArtifactContent("application/sheet", bad)
    expect(r.ok).toBe(false)
    expect(r.errors.join(" ")).toMatch(/Z99|undefined|REF/i)
  })

  it("rejects a spec with a circular reference", () => {
    const bad = JSON.stringify({
      kind: "spreadsheet/v1",
      sheets: [
        {
          name: "Sheet1",
          cells: [
            { ref: "A1", formula: "=B1+1" },
            { ref: "B1", formula: "=A1+1" },
          ],
        },
      ],
    })
    const r = validateArtifactContent("application/sheet", bad)
    expect(r.ok).toBe(false)
    expect(r.errors.join(" ")).toMatch(/circular|cycle/i)
  })

  it("still accepts legacy CSV content unchanged", () => {
    const csv = "A,B\n1,2\n3,4"
    const r = validateArtifactContent("application/sheet", csv)
    expect(r.ok).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/unit/validate-artifact.test.ts -t "JSON spec"`
Expected: FAIL — validator still runs the CSV branch on JSON content and rejects it.

- [ ] **Step 3: Wire the spec branch into `validateSheet`**

Open `src/lib/tools/builtin/_validate-artifact.ts`. Find the `function validateSheet(content: string)` function (around line 790). Add this BEFORE the CSV branch (before `// ----- CSV branch -----`):

```typescript
  // ----- Shape dispatch -----
  const { detectShape, parseSpec } = await (async () => {
    // Static imports: rewritten below. Left as comment to describe intent.
    return {
      detectShape: (await import("@/lib/spreadsheet/parse")).detectShape,
      parseSpec: (await import("@/lib/spreadsheet/parse")).parseSpec,
    }
  })()
```

Actually — `validateSheet` is a **synchronous** function, so dynamic imports won't work cleanly here. Use static imports at the top of `_validate-artifact.ts` instead.

Add to the top of `_validate-artifact.ts` (alongside the other imports):

```typescript
import { detectShape, parseSpec } from "@/lib/spreadsheet/parse"
import { evaluateWorkbook } from "@/lib/spreadsheet/formulas"
```

Then replace the top of `validateSheet` (right after the `const warnings: string[] = []` declaration and before the existing JSON/CSV branching) with:

```typescript
  const shape = detectShape(content)

  // ----- JSON spec branch -----
  if (shape === "spec") {
    const parsed = parseSpec(content)
    if (!parsed.ok || !parsed.spec) {
      return { ok: false, errors: parsed.errors, warnings: parsed.warnings }
    }

    // Semantic check: evaluate the workbook and surface #REF! / circular errors
    const values = evaluateWorkbook(parsed.spec)
    const cellErrors: string[] = []
    for (const [key, v] of values) {
      if (v.error === "CIRCULAR") {
        cellErrors.push(`Cell ${key} is part of a circular reference.`)
      } else if (v.error === "REF" || v.error === "NAME") {
        cellErrors.push(
          `Cell ${key} references an undefined cell or name (#${v.error}!).`
        )
      }
    }
    if (cellErrors.length > 0) {
      // Dedupe circular messages (each cell in a cycle reports it)
      const deduped = Array.from(new Set(cellErrors))
      return { ok: false, errors: deduped, warnings: parsed.warnings }
    }

    return {
      ok: true,
      errors: [],
      warnings: parsed.warnings,
    }
  }
```

Keep the existing JSON-array and CSV branches below exactly as they are. The existing `if (content.trimStart().startsWith("["))` check still handles the array shape.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test tests/unit/validate-artifact.test.ts`
Expected: PASS — all new spec tests green, every pre-existing CSV and array test still green.

Also run the whole unit suite as a regression guard:

Run: `bun test tests/unit`
Expected: no new failures compared to `main`.

- [ ] **Step 5: Add a minimal renderer guard so spec content doesn't hit parseError UI**

Open `src/features/conversations/components/chat/artifacts/renderers/sheet-renderer.tsx`. In the `useMemo` block at the top of `SheetRenderer`, add a spec-shape short circuit AS THE FIRST branch (before the `if (content.trimStart().startsWith("["))` array check):

```typescript
    try {
      const trimmed = content.trimStart()
      // Temporary Phase 1 guard: JSON spec renders as pretty-printed JSON
      // until Phase 2 ships SpecWorkbookView. Prevents the CSV parser from
      // choking on "{...}" content.
      if (trimmed.startsWith("{")) {
        try {
          const maybeSpec = JSON.parse(trimmed)
          if (maybeSpec?.kind === "spreadsheet/v1") {
            return {
              headers: ["JSON Spec (Phase 1 placeholder)"],
              rows: [{ "JSON Spec (Phase 1 placeholder)": JSON.stringify(maybeSpec, null, 2) }],
              parseError: null,
            }
          }
        } catch {
          // fall through to existing behavior
        }
      }
      // ... existing code continues
```

- [ ] **Step 6: Commit Phase 1**

```bash
git add src/lib/tools/builtin/_validate-artifact.ts tests/unit/validate-artifact.test.ts src/features/conversations/components/chat/artifacts/renderers/sheet-renderer.tsx
git commit -m "feat(sheet): validate spreadsheet/v1 JSON spec; Phase 1 renderer guard"
```

Phase 1 ships.

---

## Phase 2 — Rich Preview (`SpecWorkbookView`)

### Task 7: Style mapping module

**Files:**
- Create: `src/lib/spreadsheet/styles.ts`

- [ ] **Step 1: Write the file**

Create `src/lib/spreadsheet/styles.ts`:

```typescript
import { DEFAULT_THEME, type CellStyleName, type SpreadsheetTheme } from "./types"

export interface ResolvedCellStyle {
  fontColor?: string
  fontBold?: boolean
  fontItalic?: boolean
  fillColor?: string
  /** Tailwind utility classes matching the above, for the HTML preview. */
  classNames: string
}

export function resolveCellStyle(
  style: CellStyleName | undefined,
  theme?: SpreadsheetTheme
): ResolvedCellStyle {
  const t = { ...DEFAULT_THEME, ...(theme ?? {}) }
  switch (style) {
    case "header":
      return {
        fontBold: true,
        classNames: "font-semibold text-foreground",
      }
    case "input":
      return {
        fontColor: t.inputColor,
        classNames: "text-blue-600 dark:text-blue-400",
      }
    case "formula":
      return {
        fontColor: t.formulaColor,
        classNames: "text-foreground",
      }
    case "cross-sheet":
      return {
        fontColor: t.crossSheetColor,
        classNames: "text-emerald-600 dark:text-emerald-400",
      }
    case "highlight":
      return {
        fillColor: t.highlightFill,
        classNames: "bg-yellow-200/60 dark:bg-yellow-900/40",
      }
    case "note":
      return {
        fontItalic: true,
        fontColor: "#666666",
        classNames: "italic text-muted-foreground",
      }
    default:
      return { classNames: "" }
  }
}
```

- [ ] **Step 2: Verify TypeScript**

Run: `bunx tsc --noEmit -p .`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/spreadsheet/styles.ts
git commit -m "feat(spreadsheet): add cell style resolver shared by renderer and exporter"
```

---

### Task 8: Number format renderer

**Files:**
- Modify: `src/lib/spreadsheet/styles.ts` (add `formatCellValue`)
- Test: append to `tests/unit/spreadsheet/parse.test.ts` (new `describe`)

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/spreadsheet/parse.test.ts`:

```typescript
import { formatCellValue } from "@/lib/spreadsheet/styles"

describe("formatCellValue", () => {
  it("formats currency with thousands", () => {
    expect(formatCellValue(1234.5, "$#,##0")).toBe("$1,235")
  })
  it("formats currency with parenthesized negatives", () => {
    expect(formatCellValue(-1234.5, "$#,##0;($#,##0);-")).toBe("($1,235)")
  })
  it("formats zero as dash when the format supplies a zero segment", () => {
    expect(formatCellValue(0, "$#,##0;($#,##0);-")).toBe("-")
  })
  it("formats percentage", () => {
    expect(formatCellValue(0.1234, "0.0%")).toBe("12.3%")
    expect(formatCellValue(0.1234, "0.00%")).toBe("12.34%")
  })
  it("formats plain thousands", () => {
    expect(formatCellValue(1234567, "#,##0")).toBe("1,234,567")
  })
  it("returns raw string for non-numeric input regardless of format", () => {
    expect(formatCellValue("hello", "$#,##0")).toBe("hello")
  })
  it("returns empty string for null", () => {
    expect(formatCellValue(null, "$#,##0")).toBe("")
  })
  it("passes through unknown format as General", () => {
    expect(formatCellValue(42.5, "banana")).toBe("42.5")
  })
  it("formats ISO dates as mmm d, yyyy when requested", () => {
    expect(formatCellValue("2026-04-23", "mmm d, yyyy")).toBe("Apr 23, 2026")
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/unit/spreadsheet/parse.test.ts -t "formatCellValue"`
Expected: FAIL — `formatCellValue is not exported`.

- [ ] **Step 3: Add `formatCellValue` to `styles.ts`**

Append to `src/lib/spreadsheet/styles.ts`:

```typescript
import type { CellValue } from "./types"

/**
 * Renders a cell value for the HTML preview using a minimal subset of
 * Excel-style number formats. The exported xlsx carries the raw format string,
 * so Excel will render it identically or better.
 */
export function formatCellValue(value: CellValue, format?: string): string {
  if (value === null || value === undefined) return ""
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE"
  if (!format) return typeof value === "number" ? String(value) : String(value)

  if (typeof value !== "number") {
    // Date format on a string that looks like ISO?
    if (/^d|^m|^y/i.test(format) && typeof value === "string") {
      const d = new Date(value)
      if (!isNaN(d.getTime())) return renderDate(d, format)
    }
    return String(value)
  }

  // Positive; Negative; Zero segments
  const segments = format.split(";")
  let segment: string
  if (value > 0) segment = segments[0]
  else if (value < 0) segment = segments[1] ?? segments[0]
  else segment = segments[2] ?? segments[0]

  return applyNumberFormat(value, segment)
}

function applyNumberFormat(value: number, segment: string): string {
  // Literal zero segment like "-" → pass through
  if (/^[^0#]*$/.test(segment)) return segment

  const isPercent = /%/.test(segment)
  const working = isPercent ? value * 100 : value
  const abs = Math.abs(working)

  // Decimal precision
  const decMatch = segment.match(/\.([0#]+)/)
  const decimals = decMatch ? decMatch[1].length : 0

  // Thousands separator?
  const hasThousands = /#,##0|,0/.test(segment)

  let numStr = abs.toFixed(decimals)
  if (hasThousands) {
    const [intPart, decPart] = numStr.split(".")
    const withSep = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
    numStr = decPart !== undefined ? `${withSep}.${decPart}` : withSep
  }

  // Prefix / suffix: everything outside the digit mask
  const mask = segment.match(/[#0,.]+/)?.[0] ?? ""
  const beforeMask = segment.slice(0, segment.indexOf(mask))
  const afterMask = segment.slice(segment.indexOf(mask) + mask.length)
  const prefix = beforeMask.replace(/\\(.)/g, "$1")
  const suffix = afterMask.replace(/\\(.)/g, "$1")

  const sign = working < 0 && !/^\(/.test(segment) ? "-" : ""
  return `${sign}${prefix}${numStr}${suffix}`
}

function renderDate(d: Date, format: string): string {
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
  const y = d.getUTCFullYear()
  const mo = d.getUTCMonth()
  const day = d.getUTCDate()
  if (/mmm d, yyyy/i.test(format)) return `${months[mo]} ${day}, ${y}`
  if (/yyyy-mm-dd/i.test(format)) {
    const m2 = String(mo + 1).padStart(2, "0")
    const d2 = String(day).padStart(2, "0")
    return `${y}-${m2}-${d2}`
  }
  return d.toISOString().slice(0, 10)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test tests/unit/spreadsheet/parse.test.ts -t "formatCellValue"`
Expected: PASS — all 9 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/spreadsheet/styles.ts tests/unit/spreadsheet/parse.test.ts
git commit -m "feat(spreadsheet): add number/date format renderer for HTML preview"
```

---

### Task 9: Build `SpecWorkbookView`

**Files:**
- Create: `src/features/conversations/components/chat/artifacts/renderers/sheet-spec-view.tsx`

- [ ] **Step 1: Write the component**

Create `src/features/conversations/components/chat/artifacts/renderers/sheet-spec-view.tsx`:

```typescript
"use client"

import { useState, useMemo, useEffect, useCallback } from "react"
import { AlertTriangle, Download, FunctionSquare, Search } from "@/lib/icons"
import {
  SPREADSHEET_SPEC_VERSION,
  type SpreadsheetSpec,
  type WorkbookValues,
} from "@/lib/spreadsheet/types"
import { parseSpec } from "@/lib/spreadsheet/parse"
import { resolveCellStyle, formatCellValue } from "@/lib/spreadsheet/styles"

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
  style?: string
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

export function SpecWorkbookView({
  content,
  onDownloadXlsx,
}: SpecWorkbookViewProps) {
  const [activeSheet, setActiveSheet] = useState(0)
  const [showFormulas, setShowFormulas] = useState(false)
  const [selectedRef, setSelectedRef] = useState<string | null>(null)
  const [values, setValues] = useState<WorkbookValues | null>(null)
  const [evalError, setEvalError] = useState<string | null>(null)

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
        setEvalError(err instanceof Error ? err.message : String(err))
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
  const sheetValues = values

  // Derive grid dimensions from cells (max row + col)
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

  return (
    <div className="flex flex-col h-full">
      {/* Sheet tabs */}
      {spec.sheets.length > 1 && (
        <div className="flex items-center gap-0.5 px-2 py-1.5 border-b shrink-0 overflow-x-auto">
          {spec.sheets.map((s, i) => (
            <button
              key={s.name}
              type="button"
              onClick={() => { setActiveSheet(i); setSelectedRef(null) }}
              className={
                "px-3 py-1 text-xs rounded-md whitespace-nowrap transition-colors " +
                (i === activeSheet
                  ? "bg-muted font-medium text-foreground"
                  : "text-muted-foreground hover:bg-muted/60")
              }
            >
              {s.name}
            </button>
          ))}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b shrink-0">
        <Search className="h-4 w-4 text-muted-foreground shrink-0 opacity-50" />
        <div className="flex-1 text-xs text-muted-foreground tabular-nums">
          {sheet.name} · {sheet.cells.length} cells
        </div>
        <button
          type="button"
          onClick={() => setShowFormulas((s) => !s)}
          title="Toggle raw formulas"
          className={
            "inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md transition-colors " +
            (showFormulas
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-muted")
          }
        >
          <FunctionSquare className="h-3.5 w-3.5" />
          ƒx
        </button>
        <button
          type="button"
          onClick={onDownloadXlsx}
          className="inline-flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:text-foreground rounded-md hover:bg-muted transition-colors"
        >
          <Download className="h-3.5 w-3.5" />
          XLSX
        </button>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-auto">
        <table className="text-sm border-collapse">
          <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm z-10">
            <tr>
              <th className="w-10 px-1 py-1 text-xs text-muted-foreground font-normal border-r border-b" />
              {Array.from({ length: maxCol }, (_, i) => (
                <th
                  key={i}
                  className="px-3 py-1 text-xs text-muted-foreground font-normal border-r border-b whitespace-nowrap"
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
                <td className="w-10 px-1 py-1 text-xs text-muted-foreground text-center border-r border-b bg-muted/40">
                  {r + 1}
                </td>
                {Array.from({ length: maxCol }, (_, c) => {
                  const ref = `${colToLetter(c + 1)}${r + 1}`
                  const cell = cellMap.get(ref)
                  const qualified = `${sheet.name}!${ref}`
                  const evaluated = sheetValues?.get(qualified)
                  const style = resolveCellStyle(
                    cell?.style as never,
                    spec.theme
                  )
                  const isSelected = selectedRef === ref
                  const displayText = (() => {
                    if (!cell) return ""
                    if (evaluated?.error) return `#${evaluated.error}!`
                    if (showFormulas && cell.formula) return cell.formula
                    const v = cell.formula ? evaluated?.value : cell.value
                    return formatCellValue(
                      v as never,
                      cell.format ?? sheet.columns?.[c]?.format
                    )
                  })()
                  return (
                    <td
                      key={c}
                      onClick={() => setSelectedRef(ref)}
                      className={
                        "px-3 py-1 text-sm border-r border-b cursor-cell whitespace-nowrap " +
                        (evaluated?.error ? "text-red-600 " : "") +
                        style.classNames +
                        (isSelected ? " outline outline-2 outline-primary" : "")
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

      {/* Cell footer */}
      {selectedCell && (
        <div className="px-4 py-2 border-t shrink-0 text-xs text-muted-foreground font-mono tabular-nums">
          <span className="text-foreground font-semibold">{selectedCell.ref}</span>
          {selectedCell.formula && <span> · {selectedCell.formula}</span>}
          {selectedCell.format && <span> · fmt: {selectedCell.format}</span>}
          {selectedCell.note && <span className="italic"> · {selectedCell.note}</span>}
        </div>
      )}

      {evalError && (
        <div className="px-4 py-2 text-xs text-amber-500 border-t">
          Formula eval failed: {evalError}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Add missing icon** (FunctionSquare)

Check whether `FunctionSquare` is already exported from `src/lib/icons.tsx`:

Run: `grep -n "FunctionSquare" src/lib/icons.tsx`

If absent, add it — find the icon export block and add a line:

Open `src/lib/icons.tsx`, find the export list, add:
```typescript
export { FunctionSquare } from "lucide-react"
```

(If the file uses a different pattern like a single re-export block, follow that file's convention.)

- [ ] **Step 3: Verify TypeScript**

Run: `bunx tsc --noEmit -p .`
Expected: no new errors in `sheet-spec-view.tsx`.

- [ ] **Step 4: Commit**

```bash
git add src/features/conversations/components/chat/artifacts/renderers/sheet-spec-view.tsx src/lib/icons.tsx
git commit -m "feat(sheet): add SpecWorkbookView with sheet tabs, formula toggle, cell grid"
```

---

### Task 10: Wire `SpecWorkbookView` into the main renderer

**Files:**
- Modify: `src/features/conversations/components/chat/artifacts/renderers/sheet-renderer.tsx`

- [ ] **Step 1: Refactor `SheetRenderer` to dispatch on shape**

Open `src/features/conversations/components/chat/artifacts/renderers/sheet-renderer.tsx`. Replace the entire file with:

```typescript
"use client"

import { useState, useMemo, useCallback, lazy, Suspense } from "react"
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type SortingState,
  type ColumnDef,
} from "@tanstack/react-table"
import { ArrowUpDown, Download, Search, AlertTriangle } from "@/lib/icons"
import { detectShape } from "@/lib/spreadsheet/parse"

const SpecWorkbookView = lazy(() =>
  import("./sheet-spec-view").then((m) => ({ default: m.SpecWorkbookView }))
)

interface SheetRendererProps {
  content: string
  title?: string
  onDownloadXlsx?: () => void
}

type RowData = Record<string, string>

export function SheetRenderer({
  content,
  title,
  onDownloadXlsx,
}: SheetRendererProps) {
  const shape = useMemo(() => detectShape(content), [content])

  if (shape === "spec") {
    return (
      <Suspense fallback={<SheetLoading />}>
        <SpecWorkbookView
          content={content}
          title={title}
          onDownloadXlsx={onDownloadXlsx ?? (() => {})}
        />
      </Suspense>
    )
  }

  return <CsvOrArrayView content={content} title={title} />
}

function SheetLoading() {
  return (
    <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
      Loading workbook…
    </div>
  )
}

/**
 * Legacy renderer for CSV and JSON-array content. Behavior preserved verbatim
 * from the pre-upgrade implementation.
 */
function CsvOrArrayView({
  content,
  title,
}: {
  content: string
  title?: string
}) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [globalFilter, setGlobalFilter] = useState("")

  const { headers, rows, parseError } = useMemo(() => {
    try {
      if (content.trimStart().startsWith("[")) {
        const data = JSON.parse(content)
        if (Array.isArray(data) && data.length > 0) {
          const headers = Object.keys(data[0])
          const rows: RowData[] = data.map((item: Record<string, unknown>) => {
            const row: RowData = {}
            headers.forEach((h) => {
              row[h] = String(item[h] ?? "")
            })
            return row
          })
          return { headers, rows, parseError: null }
        }
      }
      const lines = parseCSV(content)
      if (lines.length < 2)
        return { headers: [], rows: [], parseError: "No data rows found" }
      const headers = lines[0]
      const rows: RowData[] = lines.slice(1).map((row) => {
        const obj: RowData = {}
        headers.forEach((h, i) => {
          obj[h] = row[i] || ""
        })
        return obj
      })
      return { headers, rows, parseError: null }
    } catch (err) {
      return {
        headers: [] as string[],
        rows: [] as RowData[],
        parseError:
          err instanceof Error ? err.message : "Failed to parse data",
      }
    }
  }, [content])

  const columns = useMemo<ColumnDef<RowData>[]>(
    () =>
      headers.map((h) => ({
        accessorKey: h,
        header: h,
      })),
    [headers]
  )

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  })

  const isFiltered = table.getRowModel().rows.length !== rows.length

  const handleExportCSV = useCallback(() => {
    const escape = (v: string) =>
      v.includes(",") || v.includes('"') || v.includes("\n")
        ? `"${v.replace(/"/g, '""')}"`
        : v
    const csvRows = [headers.map(escape).join(",")]
    table.getRowModel().rows.forEach((row) => {
      csvRows.push(
        headers.map((h) => escape(row.original[h] || "")).join(",")
      )
    })
    const slug =
      (title ?? "sheet")
        .replace(/[^a-z0-9]+/gi, "-")
        .replace(/^-+|-+$/g, "")
        .toLowerCase() || "sheet"
    const filename = isFiltered ? `${slug}-filtered.csv` : `${slug}.csv`
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }, [headers, table, title, isFiltered])

  if (parseError) {
    return (
      <div className="p-4">
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2.5 text-amber-500">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span className="text-sm font-medium">Could not parse table data</span>
          </div>
          <div className="px-3 py-2 border-t border-amber-500/20 text-xs text-amber-500/80">
            {parseError}
          </div>
          <pre className="px-3 py-3 border-t border-amber-500/20 text-xs text-muted-foreground overflow-auto max-h-64 whitespace-pre-wrap font-mono bg-muted/30">
            {content}
          </pre>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-2 border-b shrink-0">
        <Search className="h-4 w-4 text-muted-foreground shrink-0" />
        <input
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          placeholder="Filter..."
          className="flex-1 text-sm bg-transparent outline-none placeholder:text-muted-foreground"
        />
        <button
          type="button"
          onClick={handleExportCSV}
          title={isFiltered ? "Download only matching rows" : "Download all rows as CSV"}
          className="inline-flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:text-foreground rounded-md hover:bg-muted transition-colors"
        >
          <Download className="h-3.5 w-3.5" />
          {isFiltered ? "CSV (filtered)" : "CSV"}
        </button>
        <span className="text-xs text-muted-foreground tabular-nums">
          {table.getRowModel().rows.length} rows
        </span>
      </div>
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm z-10">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((header) => (
                  <th
                    key={header.id}
                    onClick={header.column.getToggleSortingHandler()}
                    className="px-3 py-2 text-left text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none border-b whitespace-nowrap"
                  >
                    <div className="flex items-center gap-1">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      <ArrowUpDown className="h-3 w-3 opacity-50" />
                    </div>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="border-b border-border/50 hover:bg-muted/30">
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-3 py-1.5 text-sm whitespace-nowrap">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  let current: string[] = []
  let field = ""
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"'
        i++
      } else if (ch === '"') {
        inQuotes = false
      } else {
        field += ch
      }
    } else {
      if (ch === '"') {
        inQuotes = true
      } else if (ch === ",") {
        current.push(field)
        field = ""
      } else if (ch === "\n" || (ch === "\r" && text[i + 1] === "\n")) {
        current.push(field)
        field = ""
        if (current.some((c) => c.trim().length > 0)) rows.push(current)
        current = []
        if (ch === "\r") i++
      } else {
        field += ch
      }
    }
  }
  if (field || current.length) {
    current.push(field)
    if (current.some((c) => c.trim().length > 0)) rows.push(current)
  }
  return rows
}
```

- [ ] **Step 2: Update artifact-renderer.tsx to thread the optional prop**

Find the sheet-renderer call site in `src/features/conversations/components/chat/artifacts/artifact-renderer.tsx` (look around line 38 and line 104):

Run: `grep -n "SheetRenderer\|sheet-renderer" src/features/conversations/components/chat/artifacts/artifact-renderer.tsx`

If the call passes `{ content, title }` props only, leave it alone for now — the `onDownloadXlsx` prop is optional and the fallback in `SpecWorkbookView` is a no-op button. Task 12 will thread it through.

- [ ] **Step 3: Run tests and visually verify**

Run: `bun test tests/unit`
Expected: existing CSV renderer tests (if any) still pass; no new failures.

Run: `bun dev` (or whatever the project uses — check `package.json` scripts). Open an existing CSV sheet artifact in the UI. Verify: looks identical to before the change. Open a spec artifact (seed one manually via the DB or a prompt). Verify: sheet tabs, column letters, computed values, ƒx toggle all work.

The Phase 1 placeholder guard from Task 6 Step 5 is removed automatically because this task replaces the whole `sheet-renderer.tsx` file. Verify by:

Run: `grep -n "Phase 1 placeholder" src/features/conversations/components/chat/artifacts/renderers/sheet-renderer.tsx`
Expected: no match.

- [ ] **Step 4: Commit Phase 2**

```bash
git add src/features/conversations/components/chat/artifacts/renderers/sheet-renderer.tsx
git commit -m "feat(sheet): dispatch to SpecWorkbookView for JSON spec content"
```

Phase 2 ships. Users see the rich preview; download still routes through the CSV path.

---

## Phase 3 — XLSX Export

### Task 11: `generate-xlsx.ts` — workbook builder

**Files:**
- Create: `src/lib/spreadsheet/generate-xlsx.ts`
- Test: `tests/unit/spreadsheet/generate-xlsx.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/spreadsheet/generate-xlsx.test.ts`:

```typescript
import { describe, it, expect } from "vitest"
import * as XLSX from "xlsx"
import { generateXlsx } from "@/lib/spreadsheet/generate-xlsx"
import { evaluateWorkbook } from "@/lib/spreadsheet/formulas"
import type { SpreadsheetSpec } from "@/lib/spreadsheet/types"

async function blobToBuffer(blob: Blob): Promise<Buffer> {
  const arrayBuffer = await blob.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

describe("generateXlsx", () => {
  it("produces a valid xlsx buffer with one sheet and simple values", async () => {
    const spec: SpreadsheetSpec = {
      kind: "spreadsheet/v1",
      sheets: [
        {
          name: "Sheet1",
          cells: [
            { ref: "A1", value: "Hello" },
            { ref: "B1", value: 42 },
          ],
        },
      ],
    }
    const blob = await generateXlsx(spec, evaluateWorkbook(spec))
    const buf = await blobToBuffer(blob)
    const wb = XLSX.read(buf, { type: "buffer" })
    expect(wb.SheetNames).toEqual(["Sheet1"])
    const sh = wb.Sheets["Sheet1"]
    expect(sh.A1.v).toBe("Hello")
    expect(sh.B1.v).toBe(42)
  })

  it("writes formulas with cached computed values so Excel opens ready", async () => {
    const spec: SpreadsheetSpec = {
      kind: "spreadsheet/v1",
      sheets: [
        {
          name: "Sheet1",
          cells: [
            { ref: "A1", value: 100 },
            { ref: "A2", value: 0.15 },
            { ref: "A3", formula: "=A1*(1+A2)" },
          ],
        },
      ],
    }
    const blob = await generateXlsx(spec, evaluateWorkbook(spec))
    const buf = await blobToBuffer(blob)
    const wb = XLSX.read(buf, { type: "buffer" })
    const sh = wb.Sheets["Sheet1"]
    expect(sh.A3.f).toBe("A1*(1+A2)") // SheetJS strips the leading =
    expect(sh.A3.v).toBeCloseTo(115, 5)
  })

  it("applies number format strings", async () => {
    const spec: SpreadsheetSpec = {
      kind: "spreadsheet/v1",
      sheets: [
        {
          name: "Sheet1",
          cells: [{ ref: "A1", value: 1234.5, format: "$#,##0" }],
        },
      ],
    }
    const blob = await generateXlsx(spec, evaluateWorkbook(spec))
    const buf = await blobToBuffer(blob)
    const wb = XLSX.read(buf, { type: "buffer", cellStyles: true })
    const sh = wb.Sheets["Sheet1"]
    expect(sh.A1.z).toBe("$#,##0")
  })

  it("creates multiple sheets and preserves order", async () => {
    const spec: SpreadsheetSpec = {
      kind: "spreadsheet/v1",
      sheets: [
        { name: "Assumptions", cells: [{ ref: "A1", value: 1 }] },
        { name: "Projections", cells: [{ ref: "A1", value: 2 }] },
      ],
    }
    const blob = await generateXlsx(spec, evaluateWorkbook(spec))
    const buf = await blobToBuffer(blob)
    const wb = XLSX.read(buf, { type: "buffer" })
    expect(wb.SheetNames).toEqual(["Assumptions", "Projections"])
  })

  it("applies merges", async () => {
    const spec: SpreadsheetSpec = {
      kind: "spreadsheet/v1",
      sheets: [
        {
          name: "Sheet1",
          cells: [
            { ref: "A1", value: "Merged" },
            { ref: "B1", value: "" },
            { ref: "C1", value: "" },
          ],
          merges: ["A1:C1"],
        },
      ],
    }
    const blob = await generateXlsx(spec, evaluateWorkbook(spec))
    const buf = await blobToBuffer(blob)
    const wb = XLSX.read(buf, { type: "buffer" })
    const sh = wb.Sheets["Sheet1"]
    expect(sh["!merges"]).toBeDefined()
    expect(sh["!merges"]).toHaveLength(1)
  })

  it("defines named ranges at the workbook level", async () => {
    const spec: SpreadsheetSpec = {
      kind: "spreadsheet/v1",
      namedRanges: { Rate: "Sheet1!B1" },
      sheets: [
        {
          name: "Sheet1",
          cells: [{ ref: "B1", value: 0.1 }],
        },
      ],
    }
    const blob = await generateXlsx(spec, evaluateWorkbook(spec))
    const buf = await blobToBuffer(blob)
    const wb = XLSX.read(buf, { type: "buffer", bookVBA: false })
    expect(wb.Workbook?.Names?.some((n) => n.Name === "Rate")).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/unit/spreadsheet/generate-xlsx.test.ts`
Expected: FAIL — `Cannot find module "@/lib/spreadsheet/generate-xlsx"`.

- [ ] **Step 3: Implement `generateXlsx`**

Create `src/lib/spreadsheet/generate-xlsx.ts`:

```typescript
import ExcelJS from "exceljs"
import {
  DEFAULT_THEME,
  XLSX_MIME_TYPE,
  type CellStyleName,
  type SpreadsheetSpec,
  type SpreadsheetTheme,
  type WorkbookValues,
} from "./types"

/**
 * Build an xlsx Blob from a validated spec + its computed formula values.
 * Cached computed values are written alongside formulas so Excel opens the
 * file with numbers already visible, skipping the full-workbook recalc step.
 */
export async function generateXlsx(
  spec: SpreadsheetSpec,
  values: WorkbookValues
): Promise<Blob> {
  const theme: Required<SpreadsheetTheme> = { ...DEFAULT_THEME, ...(spec.theme ?? {}) }
  const wb = new ExcelJS.Workbook()
  wb.creator = "RantAI"
  wb.created = new Date()

  for (const sheet of spec.sheets) {
    const ws = wb.addWorksheet(sheet.name, {
      views: sheet.frozen
        ? [
            {
              state: "frozen",
              xSplit: sheet.frozen.columns ?? 0,
              ySplit: sheet.frozen.rows ?? 0,
            },
          ]
        : undefined,
    })

    if (sheet.columns) {
      ws.columns = sheet.columns.map((col) => ({
        width: col.width,
        style: col.format ? { numFmt: col.format } : undefined,
      }))
    }

    for (const cellSpec of sheet.cells) {
      const cell = ws.getCell(cellSpec.ref)
      if (cellSpec.formula !== undefined) {
        const qualified = `${sheet.name}!${cellSpec.ref.replace(/\$/g, "")}`
        const cachedValue = values.get(qualified)?.value ?? null
        cell.value = {
          formula: cellSpec.formula.startsWith("=")
            ? cellSpec.formula.slice(1)
            : cellSpec.formula,
          result: cachedValue as never,
        }
      } else if (cellSpec.value !== undefined) {
        cell.value = cellSpec.value as never
      }

      if (cellSpec.format) {
        cell.numFmt = cellSpec.format
      }

      applyStyle(cell, cellSpec.style, theme)

      if (cellSpec.note) {
        cell.note = cellSpec.note
      }
    }

    if (sheet.merges) {
      for (const range of sheet.merges) {
        ws.mergeCells(range)
      }
    }
  }

  if (spec.namedRanges) {
    for (const [name, ref] of Object.entries(spec.namedRanges)) {
      wb.definedNames.add(ref, name)
    }
  }

  const buffer = await wb.xlsx.writeBuffer()
  return new Blob([buffer], { type: XLSX_MIME_TYPE })
}

function applyStyle(
  cell: ExcelJS.Cell,
  style: CellStyleName | undefined,
  theme: Required<SpreadsheetTheme>
): void {
  if (!style) return
  switch (style) {
    case "header":
      cell.font = { ...(cell.font ?? {}), bold: true, name: theme.font }
      break
    case "input":
      cell.font = {
        ...(cell.font ?? {}),
        color: { argb: hexToArgb(theme.inputColor) },
        name: theme.font,
      }
      break
    case "formula":
      cell.font = {
        ...(cell.font ?? {}),
        color: { argb: hexToArgb(theme.formulaColor) },
        name: theme.font,
      }
      break
    case "cross-sheet":
      cell.font = {
        ...(cell.font ?? {}),
        color: { argb: hexToArgb(theme.crossSheetColor) },
        name: theme.font,
      }
      break
    case "highlight":
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: hexToArgb(theme.highlightFill) },
      }
      break
    case "note":
      cell.font = {
        ...(cell.font ?? {}),
        italic: true,
        color: { argb: hexToArgb("#666666") },
        name: theme.font,
      }
      break
  }
}

function hexToArgb(hex: string): string {
  const clean = hex.replace(/^#/, "").toUpperCase()
  if (clean.length === 6) return `FF${clean}`
  if (clean.length === 8) return clean
  return "FF000000"
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test tests/unit/spreadsheet/generate-xlsx.test.ts`
Expected: PASS — all 6 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/spreadsheet/generate-xlsx.ts tests/unit/spreadsheet/generate-xlsx.test.ts
git commit -m "feat(spreadsheet): add ExcelJS-based xlsx generator with cached formula values"
```

---

### Task 12: Download handler + dual-button toolbar

**Files:**
- Modify: `src/features/conversations/components/chat/artifacts/artifact-panel.tsx`
- Modify: `src/features/conversations/components/chat/artifacts/artifact-renderer.tsx`

- [ ] **Step 1: Update `getExtension` in artifact-panel.tsx**

Open `src/features/conversations/components/chat/artifacts/artifact-panel.tsx`. Find `function getExtension` (around line 741).

Replace the `application/sheet` case:
```typescript
    case "application/sheet":
      return ".csv"
```
with:
```typescript
    case "application/sheet": {
      // Dynamic shape peek — JSON spec downloads as .xlsx, everything else as .csv
      try {
        const trimmed = artifact.content.trimStart()
        if (trimmed.startsWith("{")) {
          const parsed = JSON.parse(trimmed)
          if (parsed?.kind === "spreadsheet/v1") return ".xlsx"
        }
      } catch {
        // fall through
      }
      return ".csv"
    }
```

- [ ] **Step 2: Add the spec download branch to `handleDownload`**

Still in `artifact-panel.tsx`. Find `handleDownload` (around line 149). Right AFTER the slides branch (the `if (displayArtifact.type === "application/slides")` block that ends with `return`), and BEFORE the line that declares `const downloadContent = displayArtifact.type === "text/latex" ? wrapLatexForDownload(...) : ...`, add:

```typescript
    // Spreadsheet JSON spec → real .xlsx via ExcelJS
    if (displayArtifact.type === "application/sheet") {
      const trimmed = displayArtifact.content.trimStart()
      if (trimmed.startsWith("{")) {
        try {
          const parsed = JSON.parse(trimmed)
          if (parsed?.kind === "spreadsheet/v1") {
            const { parseSpec } = await import("@/lib/spreadsheet/parse")
            const { evaluateWorkbook } = await import("@/lib/spreadsheet/formulas")
            const { generateXlsx } = await import("@/lib/spreadsheet/generate-xlsx")
            const result = parseSpec(displayArtifact.content)
            if (!result.ok || !result.spec) {
              console.error("[ArtifactPanel] Spreadsheet spec invalid:", result.errors)
              return
            }
            const values = evaluateWorkbook(result.spec)
            const blob = await generateXlsx(result.spec, values)
            const url = URL.createObjectURL(blob)
            const a = document.createElement("a")
            a.href = url
            a.download = filename // already ends with .xlsx because of getExtension
            a.click()
            URL.revokeObjectURL(url)
            return
          }
        } catch (err) {
          console.error("[ArtifactPanel] Spreadsheet download failed:", err)
          // fall through to CSV path
        }
      }
    }
```

- [ ] **Step 3: Thread `onDownloadXlsx` into the renderer call site**

Open `src/features/conversations/components/chat/artifacts/artifact-renderer.tsx`. Find the SheetRenderer render site (around line 104):

```typescript
    case "application/sheet":
      return <SheetRenderer content={content} title={artifact.title} />
```

Change to:
```typescript
    case "application/sheet":
      return (
        <SheetRenderer
          content={content}
          title={artifact.title}
          onDownloadXlsx={onDownloadXlsx}
        />
      )
```

Then make sure `onDownloadXlsx` is threaded as a prop through `ArtifactRenderer`. Search for the component's prop type:

Run: `grep -n "interface.*RendererProps\|type.*RendererProps\|function ArtifactRenderer" src/features/conversations/components/chat/artifacts/artifact-renderer.tsx`

Add an optional `onDownloadXlsx?: () => void` to the props interface. If the artifact-renderer is invoked from artifact-panel.tsx, pass a closure from there that calls `handleDownload` (the same one). If the ArtifactRenderer is invoked from places that don't have download context, leave the prop undefined — the button in `SpecWorkbookView` falls back to a no-op.

- [ ] **Step 4: Verify end-to-end**

Start the dev server:
```bash
bun dev
```

Then in the UI:
1. Create a spec artifact via a chat prompt ("Build me a 2-sheet budget with an Assumptions tab and a Projections tab with formulas").
2. Wait for validation + render.
3. Verify: sheet tabs, computed values, ƒx toggle, XLSX download button all work.
4. Click XLSX download. Verify: file downloads with `.xlsx` extension. Open in Excel / LibreOffice / Google Sheets. Verify: formulas present, values visible, formats correct.

- [ ] **Step 5: Regression check on legacy CSV artifact**

In the UI, open an existing CSV sheet artifact. Verify: looks identical to before (no sheet tabs, no column letters, no ƒx button, Download says "CSV"). No console errors.

- [ ] **Step 6: Commit Phase 3**

```bash
git add src/features/conversations/components/chat/artifacts/artifact-panel.tsx src/features/conversations/components/chat/artifacts/artifact-renderer.tsx
git commit -m "feat(sheet): wire xlsx download for spreadsheet/v1 spec content"
```

Phase 3 ships. End-to-end xlsx generation works.

---

### Task 13: Context prompt one-liner

**Files:**
- Modify: `src/lib/prompts/artifacts/context.ts`

- [ ] **Step 1: Peek at the current one-liner**

Run: `grep -n "application/sheet" src/lib/prompts/artifacts/context.ts`

- [ ] **Step 2: Update the summary**

Find the sheet entry and update the summary to mention the new capability. Example — the exact current text may differ; match the existing file's style:

Before (whatever is there today):
```typescript
{ type: "application/sheet", summary: "CSV or JSON array — sortable, filterable table" }
```

After:
```typescript
{ type: "application/sheet", summary: "CSV / JSON array for flat tables; JSON spec (spreadsheet/v1) for workbooks with formulas, number formats, and multi-sheet layouts" }
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/prompts/artifacts/context.ts
git commit -m "docs(prompts): mention JSON spec shape in sheet context summary"
```

---

## Phase 4 — Prompt Rules

### Task 14: Teach the LLM to author specs

**Files:**
- Modify: `src/lib/prompts/artifacts/sheet.ts`

- [ ] **Step 1: Update summary line**

Open `src/lib/prompts/artifacts/sheet.ts`. Update the top-level `summary` field:

```typescript
  summary:
    "Tabular data for interactive preview and Excel download. Accepts CSV or a JSON array for flat tables; accepts a JSON spec (kind: \"spreadsheet/v1\") for workbooks with formulas, number formats, merged cells, named ranges, and multi-sheet layouts.",
```

- [ ] **Step 2: Replace the `rules` body**

Replace the entire `rules` string in `sheet.ts` with:

```typescript
  rules: `**application/sheet — Tabular Data and Workbooks**

You are generating content for an interactive spreadsheet artifact. Three content shapes are supported — **pick the simplest one that fits the task**.

## Shape Decision Table

| User's intent | Shape to emit | Download |
|---|---|---|
| A simple list / directory / static dataset | **CSV** (Shape A) | .csv |
| Same thing, but commas in values make CSV quoting annoying | **JSON array** (Shape B) | .csv |
| A financial model, budget, cap table, scenario compare, or anything with **formulas**, **number formatting** (\`$1,234.50\`, \`15.0%\`), **multi-sheet** structure, **merged cells**, or **cell notes** | **JSON spec** (Shape C) | .xlsx |

If any formula, percentage format, currency format, date format, multi-sheet layout, merged header, named range, or cell comment is called for, use Shape C. CSV and JSON-array shapes CANNOT express these.

---

## Shape A — CSV

First row is the header. Comma delimiter only. Quote any field containing a comma, quote, or newline with double-quotes. Escape internal quotes by doubling them. Every row must have the same column count. No trailing comma. UTF-8. Line endings \`\\n\` or \`\\r\\n\`.

## Shape B — JSON array of objects

Top level is a non-empty array. Every object has the same keys in the same order. First object's keys become the column headers, in order. Do NOT nest objects or arrays inside values.

## Shape C — JSON spec (kind: "spreadsheet/v1")

A full workbook specification. The renderer evaluates formulas live and exports a real .xlsx file.

### Schema (all fields not marked "optional" are required)

\`\`\`json
{
  "kind": "spreadsheet/v1",
  "theme": {
    "font": "Arial",
    "inputColor": "#0000FF",
    "formulaColor": "#000000",
    "crossSheetColor": "#008000",
    "highlightFill": "#FFFF00"
  },
  "namedRanges": {
    "GrowthRate": "Assumptions!B3"
  },
  "sheets": [
    {
      "name": "Assumptions",
      "columns": [
        { "width": 24 },
        { "width": 14, "format": "$#,##0" }
      ],
      "frozen": { "rows": 1, "columns": 0 },
      "cells": [
        { "ref": "A1", "value": "Starting Revenue", "style": "header" },
        { "ref": "B1", "value": 1200000, "format": "$#,##0", "style": "input", "note": "Source: Q4 2025 actuals" },
        { "ref": "B3", "formula": "=B1*(1+GrowthRate)", "format": "$#,##0", "style": "formula" }
      ],
      "merges": ["A1:C1"]
    }
  ]
}
\`\`\`

### Hard caps (validator rejects otherwise)
- Max **8 sheets** per workbook
- Max **500 cells** per sheet (roughly 50 rows × 10 cols; pick what fits, don't fill the cap)
- Max **200 formulas** per workbook
- Max **64 named ranges**
- Sheet names: letters, numbers, spaces, underscores only; ≤ 31 characters

### Cell rules
- \`ref\` is A1 notation (\`"A1"\`, \`"$B$12"\`). Required.
- Provide **either** \`value\` **or** \`formula\`, never both.
- \`formula\` must start with \`=\`. Use A1 refs and named ranges freely. Functions supported: SUM, AVERAGE, MIN, MAX, IF, IFERROR, VLOOKUP, INDEX, MATCH, SUMIF, SUMIFS, AVERAGEIFS, COUNTIFS, NPV, IRR, XIRR, PMT, RATE, DATE, EOMONTH, NETWORKDAYS, TEXT, LEFT, RIGHT, MID, LEN, CONCATENATE, ROUND, ABS, and most common Excel functions.
- Cross-sheet refs: \`Sheet2!A1\`. Same-sheet refs: \`A1\`.
- \`format\` is an Excel number format string. Common presets:
  - Currency: \`"$#,##0"\`, \`"$#,##0.00"\`, \`"$#,##0;($#,##0);-"\` (dash for zero)
  - Percentage: \`"0.0%"\`, \`"0.00%"\`
  - Multiples (P/E, EV/EBITDA): \`"0.0x"\`
  - Plain thousands: \`"#,##0"\`
  - Dates: \`"yyyy-mm-dd"\`, \`"mmm d, yyyy"\`
- \`style\` is one of: \`"header"\`, \`"input"\`, \`"formula"\`, \`"cross-sheet"\`, \`"highlight"\`, \`"note"\`.
  - Use \`"input"\` for hardcoded numbers the user is expected to change (assumptions, drivers).
  - Use \`"formula"\` for calculated cells.
  - Use \`"cross-sheet"\` for formulas pulling from another sheet.
  - Use \`"highlight"\` for cells needing user attention.
- \`note\` is a cell comment. Use it to cite sources for hardcoded numbers: \`"Source: Company 10-K, FY2024, Page 45"\`.

### Financial model conventions (apply when the user asks for a model)
- Put **all assumptions** (growth rates, margins, multiples, tax rates) in a dedicated \`Assumptions\` sheet. Cells use \`style: "input"\`.
- Reference assumptions from other sheets via **named ranges** or cross-sheet refs (never hardcode the same number twice).
- **Never mix number and letter dates in a column.** Pick ISO (\`"2026-04-23"\`) and stay.
- Years as text: \`"2026"\` value with format \`"0"\` (so Excel doesn't add thousand-separator).
- Use negative-in-parens format for currency: \`"$#,##0;($#,##0);-"\`.
- Round where precision adds noise: \`=ROUND(B2, 0)\` rather than ten decimal places.

## Anti-patterns (validator rejects)

- ❌ \`"kind": "spreadsheet/v2"\` or any value other than \`"spreadsheet/v1"\`
- ❌ Cell with both \`value\` and \`formula\`
- ❌ Cell with neither \`value\` nor \`formula\`
- ❌ Formula referencing an undefined cell (\`=Z99*2\` when Z99 is not in \`cells\`)
- ❌ Circular reference (\`A1: =B1+1\`, \`B1: =A1+1\`)
- ❌ Duplicate \`ref\` inside one sheet
- ❌ Duplicate sheet names
- ❌ Sheet name with \`!\`, \`:\`, \`*\`, \`?\`, \`/\`, \`\\\`, \`[\`, \`]\`
- ❌ Unknown \`style\` name (typos)
- ❌ More than 8 sheets / 500 cells per sheet / 200 formulas / 64 named ranges
- ❌ Using Shape A or B when the user's intent requires Shape C (formulas, formatting, multi-sheet)
- ❌ Markdown fences wrapping the JSON (\`\`\`json … \`\`\`) — emit raw JSON only
- ❌ Placeholder data (\`"John Doe"\`, \`"Company A"\`, \`foo\`, \`bar\`) — use realistic names, companies, amounts`,
  examples: [
    // KEEP the two existing examples here (employee CSV and monthly sales JSON array)
    // — they cover Shape A and Shape B.
    // Then ADD the Shape C example below.
    {
      label: "JSON spec — 3-year revenue projection with Assumptions and Projections sheets",
      code: JSON.stringify(
        {
          kind: "spreadsheet/v1",
          theme: { font: "Arial", inputColor: "#0000FF", formulaColor: "#000000" },
          namedRanges: {
            StartingRevenue: "Assumptions!B2",
            GrowthRate: "Assumptions!B3",
            EbitdaMargin: "Assumptions!B4",
          },
          sheets: [
            {
              name: "Assumptions",
              columns: [{ width: 28 }, { width: 16, format: "$#,##0" }],
              frozen: { rows: 1 },
              cells: [
                { ref: "A1", value: "Driver", style: "header" },
                { ref: "B1", value: "Value", style: "header" },
                { ref: "A2", value: "Starting Revenue (FY25)" },
                { ref: "B2", value: 4200000, format: "$#,##0", style: "input", note: "Source: FY25 actuals" },
                { ref: "A3", value: "Annual Growth Rate" },
                { ref: "B3", value: 0.18, format: "0.0%", style: "input" },
                { ref: "A4", value: "EBITDA Margin" },
                { ref: "B4", value: 0.28, format: "0.0%", style: "input" },
              ],
            },
            {
              name: "Projections",
              columns: [
                { width: 18 },
                { width: 16, format: "$#,##0" },
                { width: 16, format: "$#,##0" },
                { width: 16, format: "$#,##0" },
              ],
              frozen: { rows: 1 },
              cells: [
                { ref: "A1", value: "Metric", style: "header" },
                { ref: "B1", value: "FY26", style: "header" },
                { ref: "C1", value: "FY27", style: "header" },
                { ref: "D1", value: "FY28", style: "header" },
                { ref: "A2", value: "Revenue" },
                { ref: "B2", formula: "=StartingRevenue*(1+GrowthRate)", style: "cross-sheet", format: "$#,##0" },
                { ref: "C2", formula: "=B2*(1+GrowthRate)", style: "formula", format: "$#,##0" },
                { ref: "D2", formula: "=C2*(1+GrowthRate)", style: "formula", format: "$#,##0" },
                { ref: "A3", value: "EBITDA" },
                { ref: "B3", formula: "=B2*EbitdaMargin", style: "cross-sheet", format: "$#,##0" },
                { ref: "C3", formula: "=C2*EbitdaMargin", style: "cross-sheet", format: "$#,##0" },
                { ref: "D3", formula: "=D2*EbitdaMargin", style: "cross-sheet", format: "$#,##0" },
              ],
            },
          ],
        },
        null,
        2
      ),
    },
  ],
}
```

Note: the existing file already has `examples` with the CSV and JSON-array cases. Preserve those two and append the JSON-spec example. Do NOT delete the legacy examples — they're still instructive for Shape A and B.

- [ ] **Step 3: Verify the change compiles**

Run: `bunx tsc --noEmit -p .`
Expected: no errors in `sheet.ts`.

- [ ] **Step 4: Smoke test with a real prompt**

Start the dev server:
```bash
bun dev
```

Send the chat prompt: *"Build me a 3-year revenue projection. Starting revenue is $4.2M, growth 18% annually, EBITDA margin 28%. I want to be able to tweak the assumptions and see the numbers update."*

Expected:
1. LLM emits a Shape-C JSON spec (not CSV, not JSON array).
2. Validator accepts it.
3. Preview shows Assumptions and Projections sheet tabs, formatted currency and percentages, computed values.
4. Download button says XLSX. Click it; open the resulting file. Edit `B3` in Assumptions. Verify projection numbers recalc.

If the LLM emits CSV instead: something in the prompt isn't steering hard enough. Inspect the raw output, refine the Shape Decision Table and/or move the "use Shape C if any formula / format / multi-sheet" guidance closer to the top of `rules`.

- [ ] **Step 5: Commit Phase 4**

```bash
git add src/lib/prompts/artifacts/sheet.ts
git commit -m "feat(prompts): teach sheet artifact to author spreadsheet/v1 specs"
```

Phase 4 ships. Feature is user-visible end-to-end.

---

## Final Regression Pass

### Task 15: Full regression

- [ ] **Step 1: Run the full unit suite**

Run: `bun test tests/unit`
Expected: all tests pass. No pre-existing green test becomes red.

- [ ] **Step 2: Sample of existing CSV artifacts**

In dev, open 5 existing CSV or JSON-array sheet artifacts (prod data copied locally, or seed data). Verify each renders identically to `main`:
- Filter, sort, CSV download all work
- No new UI elements appear (no sheet tabs, no column letters, no ƒx button)
- No console errors

- [ ] **Step 3: Bundle impact check**

Run: `bun run build` (or whatever the project uses).

Verify in the build output that `exceljs`, `@formulajs/formulajs`, and `fast-formula-parser` appear only in async chunks — not in the main bundle. If any shows up in the top-level bundle, the lazy-import wiring is broken; revisit Tasks 9 and 12.

- [ ] **Step 4: Smoke test new capability with 5 prompts**

Use the dev chat and send these prompts:
1. "Build me a 3-year revenue projection with 18% growth and 28% EBITDA margin."
2. "Create a cap table for a company with 2 founders at 45% each and an option pool of 10%."
3. "Make me a loan amortization schedule: $500K principal, 7% APR, 30-year term."
4. "Build a cohort retention grid for the last 6 months with sample data."
5. "Show me a simple P&L for Q1 with revenue, COGS, gross margin, opex, EBITDA."

Each should produce a Shape-C spec, render the rich preview with computed values, and download to a working .xlsx.

- [ ] **Step 5: Commit the regression notes (optional)**

If you captured any learnings during the smoke test — specific prompts that chose the wrong shape, specific functions Formula.js handled unexpectedly — append them to the design doc under §13 Open Questions. Otherwise skip.

---

## Rollback

If the feature needs to be disabled post-merge, the safest revert is to restore the sheet renderer + validator to pre-Task 6 behavior. Everything else is additive:

- `src/lib/spreadsheet/` — leave in place (unused)
- Revert in `_validate-artifact.ts`: remove the `if (shape === "spec")` block from `validateSheet`; leave imports
- Revert in `sheet-renderer.tsx`: remove the shape-dispatch, let `CsvOrArrayView` handle everything (spec content will hit the amber parse-error UI, which is acceptable as a disabled state)
- Revert in `artifact-panel.tsx`: remove the spec download branch and the `.xlsx` extension peek
- Revert in `sheet.ts`: restore the pre-Phase-4 rules body

No database migration, no schema change — the `Artifact.content` field tolerates any of the three shapes as text.
