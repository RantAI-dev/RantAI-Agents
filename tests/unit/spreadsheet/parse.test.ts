import { describe, it, expect } from "vitest"
import { detectShape } from "@/lib/spreadsheet/parse"

import { parseSpec } from "@/lib/spreadsheet/parse"

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

