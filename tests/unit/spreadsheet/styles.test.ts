import { describe, it, expect } from "vitest"
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
