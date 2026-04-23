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
    expect(sh.A3.f).toBe("A1*(1+A2)")
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
