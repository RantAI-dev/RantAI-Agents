import ExcelJS from "exceljs"
import { tokenizeCsv } from "./csv"
import { XLSX_MIME_TYPE } from "./types"

/**
 * CSV sheet artifact → .xlsx workbook.
 *
 * A comma-separated file is only split into columns by Excel when the OS list
 * separator is a comma. In Indonesian (and most European) locales it is a
 * semicolon, so the downloaded CSV opened with every row in column A and a
 * "possible data loss" warning (QA TC-811). An .xlsx carries its own cell
 * boundaries and opens the same everywhere.
 */
const PLAIN_NUMBER = /^-?(?:\d+|\d*\.\d+)$/

export function buildCsvWorkbook(csv: string, sheetName = "Sheet1"): ExcelJS.Workbook {
  const rows = tokenizeCsv(csv)
  const wb = new ExcelJS.Workbook()
  wb.creator = "RantAI"
  wb.created = new Date()
  // Excel caps sheet names at 31 chars and rejects []:*?/\
  const safeName = sheetName.replace(/[[\]:*?/\\]/g, " ").trim().slice(0, 31) || "Sheet1"
  const ws = wb.addWorksheet(safeName, { views: [{ state: "frozen", ySplit: 1 }] })

  rows.forEach((fields, r) => {
    const values = fields.map((raw) => {
      const v = raw.trim()
      // Header stays text; body cells that are plain numbers become numbers so
      // sums and sorting work. Leading-zero codes ("007") stay text.
      if (r > 0 && PLAIN_NUMBER.test(v) && !/^-?0\d/.test(v)) return Number(v)
      return v
    })
    const row = ws.addRow(values)
    if (r === 0) row.font = { bold: true }
  })

  const columnCount = Math.max(0, ...rows.map((r) => r.length))
  for (let c = 1; c <= columnCount; c++) {
    const longest = Math.max(
      8,
      ...rows.map((r) => (r[c - 1] ?? "").trim().length),
    )
    ws.getColumn(c).width = Math.min(60, longest + 2)
  }
  return wb
}

export async function csvToXlsxBlob(csv: string, sheetName?: string): Promise<Blob> {
  const buffer = await buildCsvWorkbook(csv, sheetName).xlsx.writeBuffer()
  return new Blob([buffer], { type: XLSX_MIME_TYPE })
}
