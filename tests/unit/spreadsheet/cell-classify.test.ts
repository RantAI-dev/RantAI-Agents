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
