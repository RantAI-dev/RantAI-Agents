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

  it("evaluates formulas in topological order using Kahn's algorithm", () => {
    // Long chain B1 ← C1 ← D1 ← E1 ← A1=1. Each cell depends on the
    // previous one; the evaluator must compute A1 first, then B1, ...,
    // E1. The earlier O(n²) naive scan handled this fine; this test
    // pins the behavior so the Kahn's-algorithm rewrite can't regress
    // the chain semantics silently.
    const v = evaluateWorkbook(
      spec([
        { ref: "E1", formula: "=D1+1" },
        { ref: "D1", formula: "=C1+1" },
        { ref: "C1", formula: "=B1+1" },
        { ref: "B1", formula: "=A1+1" },
        { ref: "A1", value: 10 },
      ])
    )
    expect(v.get("Sheet1!E1")?.value).toBe(14)
  })

  it("preserves dependency error types instead of collapsing every error to #REF!", () => {
    // A1 produces #DIV/0!; B1 depends on A1. The dependent should surface
    // the same #DIV/0! type, not a generic #REF!. Earlier code threw
    // FormulaError.REF unconditionally on any upstream error, which hid
    // the root cause from anyone debugging a chain.
    const v = evaluateWorkbook(
      spec([
        { ref: "A1", formula: "=1/0" },
        { ref: "B1", formula: "=A1+1" },
      ])
    )
    expect(v.get("Sheet1!A1")?.error).toMatch(/DIV/i)
    expect(v.get("Sheet1!B1")?.error).toMatch(/DIV/i)
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
