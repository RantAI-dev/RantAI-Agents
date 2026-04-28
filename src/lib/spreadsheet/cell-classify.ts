import type { CellSpec } from "./types"

export type ColorClass = "input" | "formula" | "cross-sheet" | "external" | "header" | "default"

const EXTERNAL_REF = /'\[[^\]]+\][^']+'!/   // matches '[file.xlsx]Sheet'!
const SHEET_REF = /\b[A-Za-z_][\w ]*!/      // matches Sheet1! (no quotes)

/**
 * Skill-mandated financial-model color rules:
 *  - blue (input):       plain value, no formula
 *  - black (formula):    formula in same sheet
 *  - green (cross-sheet): formula references another sheet within workbook
 *  - red (external):     formula references another workbook file
 *
 * `style: "header"` always wins (renders bold+larger).
 * `style: "highlight"` only adds yellow background — color class derives from
 * value/formula presence as if highlight wasn't set.
 */
export function classifyCell(cell: CellSpec): ColorClass {
  if (cell.style === "header") return "header"
  if (!cell.formula) {
    if (cell.value !== undefined && cell.value !== null && cell.value !== "") {
      return "input"
    }
    return "default"
  }
  if (EXTERNAL_REF.test(cell.formula)) return "external"
  if (SHEET_REF.test(cell.formula)) return "cross-sheet"
  return "formula"
}
