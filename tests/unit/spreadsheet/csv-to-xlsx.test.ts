// @vitest-environment node
import ExcelJS from "exceljs"
import { describe, expect, it } from "vitest"
import { buildCsvWorkbook } from "@/lib/spreadsheet/csv-to-xlsx"

// QA TC-811: the CSV download opened in Indonesian-locale Excel with every row
// in column A. The download is now an .xlsx with real cell boundaries.
describe("buildCsvWorkbook", () => {
  const csv = 'Nama,Kota,Jumlah,Kode\nAndi,Depok,12,007\n"Budi, S.T.",Bandung,3.5,120\n'

  it("splits every field into its own cell, surviving a write/read round trip", async () => {
    const buffer = await buildCsvWorkbook(csv, "Penjualan").xlsx.writeBuffer()
    const read = new ExcelJS.Workbook()
    await read.xlsx.load(buffer as ArrayBuffer)
    const ws = read.getWorksheet("Penjualan")!

    expect(ws.getRow(1).values).toEqual([undefined, "Nama", "Kota", "Jumlah", "Kode"])
    expect(ws.getCell("A3").value).toBe("Budi, S.T.") // quoted comma stays in one cell
    expect(ws.getCell("B3").value).toBe("Bandung")
  })

  it("stores plain numbers as numbers but keeps leading-zero codes as text", () => {
    const ws = buildCsvWorkbook(csv).getWorksheet("Sheet1")!
    expect(ws.getCell("C2").value).toBe(12)
    expect(ws.getCell("C3").value).toBe(3.5)
    expect(ws.getCell("D2").value).toBe("007")
    expect(ws.getCell("D3").value).toBe(120)
  })

  it("sanitises sheet names Excel would reject", () => {
    const wb = buildCsvWorkbook(csv, "Q1/Q2: [draft] report with a very long name")
    expect(wb.worksheets[0].name).not.toMatch(/[[\]:*?/\\]/)
    expect(wb.worksheets[0].name.length).toBeLessThanOrEqual(31)
  })
})
