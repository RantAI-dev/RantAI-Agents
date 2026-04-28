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
