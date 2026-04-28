import { z } from "zod"
import {
  SPREADSHEET_SPEC_VERSION,
  SPREADSHEET_CAPS,
  type SpreadsheetSpec,
  type ContentShape,
  type ParseResult,
  type SheetSpec,
  type CellSpec,
} from "./types"

const ChartAxisZ = z.object({
  title: z.string().optional(),
  format: z.string().optional(),
})

const ChartSeriesZ = z.object({
  name: z.string(),
  range: z.string(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
})

const ChartSpecZ = z.object({
  id: z.string().min(1),
  title: z.string().optional(),
  type: z.enum(["bar", "line", "pie", "area"]),
  categoryRange: z.string().min(1),
  series: z.array(ChartSeriesZ).min(1),
  xAxis: ChartAxisZ.optional(),
  yAxis: ChartAxisZ.optional(),
  stacked: z.boolean().optional(),
})

const ChartsArrayZ = z
  .array(ChartSpecZ)
  .max(SPREADSHEET_CAPS.maxCharts, `Too many charts (max ${SPREADSHEET_CAPS.maxCharts})`)

export function detectShape(content: string): ContentShape {
  const trimmed = content.trimStart()
  if (trimmed.startsWith("[")) return "array"
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed)
      if (
        parsed &&
        typeof parsed === "object" &&
        !Array.isArray(parsed) &&
        parsed.kind === SPREADSHEET_SPEC_VERSION
      ) {
        return "spec"
      }
    } catch {
      // fall through
    }
  }
  return "csv"
}

const A1_REF = /^\$?[A-Z]+\$?[1-9][0-9]*$/
const SHEET_NAME_OK = /^[A-Za-z0-9 _]+$/
const VALID_STYLES = new Set([
  "header",
  "input",
  "formula",
  "cross-sheet",
  "highlight",
  "note",
])

export function parseSpec(content: string): ParseResult {
  const errors: string[] = []
  const warnings: string[] = []

  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch (err) {
    errors.push(
      `Invalid JSON: ${err instanceof Error ? err.message : String(err)}`
    )
    return { ok: false, errors, warnings }
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    errors.push("Top level must be a JSON object.")
    return { ok: false, errors, warnings }
  }

  const obj = parsed as Record<string, unknown>

  if (obj.kind !== SPREADSHEET_SPEC_VERSION) {
    errors.push(
      `Expected kind "${SPREADSHEET_SPEC_VERSION}" but got ${JSON.stringify(
        obj.kind
      )}.`
    )
    return { ok: false, errors, warnings }
  }

  if (!Array.isArray(obj.sheets) || obj.sheets.length === 0) {
    errors.push("sheets must be a non-empty array.")
    return { ok: false, errors, warnings }
  }

  if (obj.sheets.length > SPREADSHEET_CAPS.maxSheets) {
    errors.push(
      `Workbook has ${obj.sheets.length} sheets but the max is ${SPREADSHEET_CAPS.maxSheets} sheets.`
    )
    return { ok: false, errors, warnings }
  }

  const seenNames = new Set<string>()
  let totalFormulas = 0

  for (let i = 0; i < obj.sheets.length; i++) {
    const sheet = obj.sheets[i] as Record<string, unknown>
    const sheetLabel = `sheets[${i}]`

    if (typeof sheet.name !== "string" || sheet.name.length === 0) {
      errors.push(`Sheet name must be a non-empty string.`)
      continue
    }
    if (sheet.name.length > SPREADSHEET_CAPS.maxSheetNameLength) {
      errors.push(
        `Sheet name "${sheet.name}" exceeds ${SPREADSHEET_CAPS.maxSheetNameLength} characters.`
      )
    }
    if (!SHEET_NAME_OK.test(sheet.name)) {
      errors.push(
        `Sheet name "${sheet.name}" contains invalid characters. Use letters, numbers, spaces, and underscores only.`
      )
    }
    if (seenNames.has(sheet.name)) {
      errors.push(`Duplicate sheet name: "${sheet.name}".`)
    }
    seenNames.add(sheet.name)

    if (!Array.isArray(sheet.cells)) {
      errors.push(`${sheetLabel}.cells must be an array.`)
      continue
    }

    if (sheet.cells.length > SPREADSHEET_CAPS.maxCellsPerSheet) {
      errors.push(
        `Sheet "${sheet.name}" has ${sheet.cells.length} cells but the max is ${SPREADSHEET_CAPS.maxCellsPerSheet} cells per sheet.`
      )
    }

    const refsInSheet = new Set<string>()
    for (let c = 0; c < sheet.cells.length; c++) {
      const cell = sheet.cells[c] as Record<string, unknown>
      const cellLabel = `${sheet.name}.cells[${c}]`

      if (typeof cell.ref !== "string" || !A1_REF.test(cell.ref)) {
        errors.push(
          `${cellLabel}.ref must be an A1 reference like "A1" or "$B$12". Got: ${JSON.stringify(cell.ref)}.`
        )
        continue
      }
      const canonicalRef = cell.ref.replace(/\$/g, "")
      if (refsInSheet.has(canonicalRef)) {
        errors.push(`${cellLabel}.ref "${cell.ref}" is duplicated in sheet "${sheet.name}".`)
      }
      refsInSheet.add(canonicalRef)

      const hasValue = cell.value !== undefined
      const hasFormula = cell.formula !== undefined
      if (hasValue && hasFormula) {
        errors.push(
          `${cellLabel} has both value and formula. Provide one.`
        )
      }
      if (!hasValue && !hasFormula) {
        errors.push(
          `${cellLabel} has neither value nor formula. Provide one.`
        )
      }
      if (hasFormula) {
        if (typeof cell.formula !== "string" || !cell.formula.startsWith("=")) {
          errors.push(
            `${cellLabel}.formula must be a string starting with "=". Got: ${JSON.stringify(cell.formula)}.`
          )
        } else {
          totalFormulas++
        }
      }
      if (
        cell.style !== undefined &&
        (typeof cell.style !== "string" || !VALID_STYLES.has(cell.style))
      ) {
        errors.push(
          `${cellLabel}.style "${cell.style}" is not one of: ${Array.from(VALID_STYLES).join(", ")}.`
        )
      }
    }
  }

  if (totalFormulas > SPREADSHEET_CAPS.maxFormulasPerWorkbook) {
    errors.push(
      `Workbook has ${totalFormulas} formulas but the max is ${SPREADSHEET_CAPS.maxFormulasPerWorkbook}.`
    )
  }

  if (obj.namedRanges !== undefined) {
    if (
      typeof obj.namedRanges !== "object" ||
      obj.namedRanges === null ||
      Array.isArray(obj.namedRanges)
    ) {
      errors.push("namedRanges must be an object.")
    } else {
      const keys = Object.keys(obj.namedRanges)
      if (keys.length > SPREADSHEET_CAPS.maxNamedRanges) {
        errors.push(
          `Workbook has ${keys.length} named ranges but the max is ${SPREADSHEET_CAPS.maxNamedRanges}.`
        )
      }
    }
  }

  if (obj.charts !== undefined) {
    const result = ChartsArrayZ.safeParse(obj.charts)
    if (!result.success) {
      for (const issue of result.error.issues) {
        const path = issue.path.length > 0 ? `charts[${issue.path.join(".")}]` : "charts"
        errors.push(`${path}: ${issue.message}`)
      }
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors, warnings }
  }

  return {
    ok: true,
    spec: obj as unknown as SpreadsheetSpec,
    errors,
    warnings,
  }
}
