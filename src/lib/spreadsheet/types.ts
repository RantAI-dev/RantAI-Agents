export const SPREADSHEET_SPEC_VERSION = "spreadsheet/v1" as const

export const XLSX_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

export const SPREADSHEET_CAPS = {
  maxSheets: 8,
  maxCellsPerSheet: 500,
  maxFormulasPerWorkbook: 200,
  maxNamedRanges: 64,
  maxSheetNameLength: 31,
  maxCharts: 8,
} as const

export type CellStyleName =
  | "header"
  | "input"
  | "formula"
  | "cross-sheet"
  | "highlight"
  | "note"

export type CellValue = string | number | boolean | null

export interface CellSpec {
  ref: string
  value?: CellValue
  formula?: string
  format?: string
  style?: CellStyleName
  note?: string
}

export interface ColumnSpec {
  width?: number
  format?: string
}

export interface FrozenSpec {
  rows?: number
  columns?: number
}

export interface SheetSpec {
  name: string
  columns?: ColumnSpec[]
  frozen?: FrozenSpec
  cells: CellSpec[]
  merges?: string[]
}

export interface SpreadsheetTheme {
  font?: "Arial" | "Calibri" | "Times New Roman"
  inputColor?: string
  formulaColor?: string
  crossSheetColor?: string
  highlightFill?: string
}

export const DEFAULT_THEME: Required<SpreadsheetTheme> = {
  font: "Arial",
  inputColor: "#0000FF",
  formulaColor: "#000000",
  crossSheetColor: "#008000",
  highlightFill: "#FFFF00",
}

export interface ChartAxis {
  title?: string
  format?: string
}

export interface ChartSeriesSpec {
  name: string
  range: string
  color?: string
}

export type ChartType = "bar" | "line" | "pie" | "area"

export interface ChartSpec {
  id: string
  title?: string
  type: ChartType
  categoryRange: string
  series: ChartSeriesSpec[]
  xAxis?: ChartAxis
  yAxis?: ChartAxis
  stacked?: boolean
}

export interface SpreadsheetSpec {
  kind: typeof SPREADSHEET_SPEC_VERSION
  theme?: SpreadsheetTheme
  namedRanges?: Record<string, string>
  sheets: SheetSpec[]
  charts?: ChartSpec[]
}

export type ContentShape = "csv" | "array" | "spec"

export interface EvaluatedCell {
  value: CellValue
  error?: string
}

export type WorkbookValues = Map<string, EvaluatedCell>

export interface ParseResult {
  ok: boolean
  spec?: SpreadsheetSpec
  errors: string[]
  warnings: string[]
}
