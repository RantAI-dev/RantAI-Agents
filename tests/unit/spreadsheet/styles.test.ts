import { describe, it, expect } from "vitest"
import { colorClassToClassName, formatCellValue } from "@/lib/spreadsheet/styles"

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
