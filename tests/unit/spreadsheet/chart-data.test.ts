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
