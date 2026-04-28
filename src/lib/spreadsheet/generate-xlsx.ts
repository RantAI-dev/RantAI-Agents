import ExcelJS from "exceljs"
import {
  DEFAULT_THEME,
  XLSX_MIME_TYPE,
  type CellStyleName,
  type SpreadsheetSpec,
  type SpreadsheetTheme,
  type WorkbookValues,
} from "./types"

/**
 * Build an xlsx Blob from a validated spec + its computed formula values.
 * Cached computed values are written alongside formulas so Excel opens the
 * file with numbers already visible, skipping the full-workbook recalc step.
 */
export async function generateXlsx(
  spec: SpreadsheetSpec,
  values: WorkbookValues
): Promise<Blob> {
  const theme: Required<SpreadsheetTheme> = { ...DEFAULT_THEME, ...(spec.theme ?? {}) }
  const wb = new ExcelJS.Workbook()
  wb.creator = "RantAI"
  wb.created = new Date()

  for (const sheet of spec.sheets) {
    const ws = wb.addWorksheet(sheet.name, {
      views: sheet.frozen
        ? [
            {
              state: "frozen",
              xSplit: sheet.frozen.columns ?? 0,
              ySplit: sheet.frozen.rows ?? 0,
            },
          ]
        : undefined,
    })

    if (sheet.columns) {
      ws.columns = sheet.columns.map((col) => ({
        width: col.width,
        style: col.format ? { numFmt: col.format } : undefined,
      }))
    }

    for (const cellSpec of sheet.cells) {
      const cell = ws.getCell(cellSpec.ref)
      if (cellSpec.formula !== undefined) {
        const cleanRef = cellSpec.ref.replace(/\$/g, "")
        const qualified = `${sheet.name}!${cleanRef}`
        const cachedValue = values.get(qualified)?.value ?? null
        cell.value = {
          formula: cellSpec.formula.startsWith("=")
            ? cellSpec.formula.slice(1)
            : cellSpec.formula,
          result: cachedValue as never,
        }
      } else if (cellSpec.value !== undefined) {
        cell.value = cellSpec.value as never
      }

      if (cellSpec.format) {
        cell.numFmt = cellSpec.format
      }

      applyStyle(cell, cellSpec.style, theme)

      if (cellSpec.note) {
        cell.note = cellSpec.note
      }
    }

    if (sheet.merges) {
      for (const range of sheet.merges) {
        ws.mergeCells(range)
      }
    }
  }

  if (spec.namedRanges) {
    for (const [name, ref] of Object.entries(spec.namedRanges)) {
      // ExcelJS definedNames.add(locStr, name) — location is first arg, name is second
      wb.definedNames.add(ref, name)
    }
  }

  // NOTE: ExcelJS in this repo does not expose a stable chart API
  // (worksheet.addChart is undefined; index.d.ts has no addChart symbol).
  // Charts in the panel preview are rendered via Recharts client-side. The
  // downloaded .xlsx contains the underlying data ranges but no native chart
  // objects; users can right-click the data and Insert Chart in Excel directly.

  const buffer = await wb.xlsx.writeBuffer()
  return new Blob([buffer], { type: XLSX_MIME_TYPE })
}

function applyStyle(
  cell: ExcelJS.Cell,
  style: CellStyleName | undefined,
  theme: Required<SpreadsheetTheme>
): void {
  if (!style) return
  switch (style) {
    case "header":
      cell.font = { ...(cell.font ?? {}), bold: true, name: theme.font }
      break
    case "input":
      cell.font = {
        ...(cell.font ?? {}),
        color: { argb: hexToArgb(theme.inputColor) },
        name: theme.font,
      }
      break
    case "formula":
      cell.font = {
        ...(cell.font ?? {}),
        color: { argb: hexToArgb(theme.formulaColor) },
        name: theme.font,
      }
      break
    case "cross-sheet":
      cell.font = {
        ...(cell.font ?? {}),
        color: { argb: hexToArgb(theme.crossSheetColor) },
        name: theme.font,
      }
      break
    case "highlight":
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: hexToArgb(theme.highlightFill) },
      }
      break
    case "note":
      cell.font = {
        ...(cell.font ?? {}),
        italic: true,
        color: { argb: hexToArgb("#666666") },
        name: theme.font,
      }
      break
  }
}

function hexToArgb(hex: string): string {
  const clean = hex.replace(/^#/, "").toUpperCase()
  if (clean.length === 6) return `FF${clean}`
  if (clean.length === 8) return clean
  return "FF000000"
}
