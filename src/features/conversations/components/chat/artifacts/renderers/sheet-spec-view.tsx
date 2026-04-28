"use client"

import { useState, useMemo, useEffect } from "react"
import { AlertTriangle, FunctionSquare } from "@/lib/icons"
import {
  type SpreadsheetSpec,
  type WorkbookValues,
  type CellStyleName,
  type CellValue,
} from "@/lib/spreadsheet/types"
import { parseSpec } from "@/lib/spreadsheet/parse"
import { resolveCellStyle, colorClassToClassName } from "@/lib/spreadsheet/styles"
import { classifyCell } from "@/lib/spreadsheet/cell-classify"
import { formatNumber } from "@/lib/spreadsheet/format"
import { SheetFormulaBar } from "./sheet-formula-bar"
import { SheetChartView } from "./sheet-chart-view"

interface SpecWorkbookViewProps {
  content: string
  title?: string
}

interface CellEntry {
  ref: string
  row: number
  col: number
  value?: CellValue
  formula?: string
  format?: string
  style?: CellStyleName
  note?: string
}

function refToRowCol(ref: string): { row: number; col: number } {
  const m = ref.replace(/\$/g, "").match(/^([A-Z]+)([0-9]+)$/)
  if (!m) return { row: 0, col: 0 }
  let col = 0
  for (let i = 0; i < m[1].length; i++) col = col * 26 + (m[1].charCodeAt(i) - 64)
  return { row: parseInt(m[2], 10), col }
}

function colToLetter(col: number): string {
  let s = ""
  let c = col
  while (c > 0) {
    const r = (c - 1) % 26
    s = String.fromCharCode(65 + r) + s
    c = Math.floor((c - 1) / 26)
  }
  return s
}

function cellAlignmentClass(value: unknown): string {
  if (typeof value === "number") return "text-right"
  if (typeof value === "boolean") return "text-center"
  return "text-left"
}

export function SpecWorkbookView({ content }: SpecWorkbookViewProps) {
  const [activeSheet, setActiveSheet] = useState(0)
  const [selectedRef, setSelectedRef] = useState<string | null>(null)
  const [values, setValues] = useState<WorkbookValues | null>(null)
  const [evalError, setEvalError] = useState<string | null>(null)
  const [view, setView] = useState<"data" | "charts">("data")

  // Reset selection / active-sheet when the underlying content changes.
  useEffect(() => {
    setActiveSheet(0)
    setSelectedRef(null)
    setView("data")
  }, [content])

  const parsed = useMemo(() => parseSpec(content), [content])
  const spec: SpreadsheetSpec | null = parsed.ok ? parsed.spec! : null

  useEffect(() => {
    if (!spec) return
    let cancelled = false
    ;(async () => {
      try {
        const { evaluateWorkbook } = await import("@/lib/spreadsheet/formulas")
        if (cancelled) return
        setValues(evaluateWorkbook(spec))
      } catch (err) {
        if (!cancelled) {
          setEvalError(err instanceof Error ? err.message : String(err))
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [spec])

  if (!spec) {
    return (
      <div className="p-4">
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2.5 text-amber-500">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span className="text-sm font-medium">Invalid spreadsheet spec</span>
          </div>
          <ul className="px-4 py-2 border-t border-amber-500/20 text-xs text-amber-500/80 list-disc list-inside">
            {parsed.errors.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        </div>
      </div>
    )
  }

  const sheet = spec.sheets[activeSheet]
  const cellsWithPos: CellEntry[] = sheet.cells.map((c) => ({
    ...c,
    ...refToRowCol(c.ref),
  }))
  const maxRow = cellsWithPos.reduce((acc, c) => Math.max(acc, c.row), 1)
  const maxCol = cellsWithPos.reduce((acc, c) => Math.max(acc, c.col), 1)
  const cellMap = new Map<string, CellEntry>()
  for (const c of cellsWithPos) {
    cellMap.set(c.ref.replace(/\$/g, ""), c)
  }

  const selectedCell = selectedRef ? cellMap.get(selectedRef) : null
  const formulaBarText: string | null = selectedCell
    ? selectedCell.formula
      ? selectedCell.formula
      : selectedCell.value !== undefined && selectedCell.value !== null
        ? String(selectedCell.value)
        : ""
    : null

  const fontFamily = spec.theme?.font ?? "Arial"
  const frozenRows = sheet.frozen?.rows ?? 0
  const frozenCols = sheet.frozen?.columns ?? 0
  const activeRow = selectedRef ? refToRowCol(selectedRef).row : null
  const activeCol = selectedRef ? refToRowCol(selectedRef).col : null

  return (
    <div className="flex flex-col h-full">
      {/* Top formula bar — Excel pattern */}
      <SheetFormulaBar selectedRef={selectedRef} formulaOrValue={formulaBarText} />

      {/* Data / Charts tab toggle — only when charts present */}
      {spec.charts && spec.charts.length > 0 && (
        <div className="flex items-center gap-1 px-2 py-1 border-b shrink-0 bg-muted/10 text-xs">
          <button
            type="button"
            onClick={() => setView("data")}
            className={
              "px-3 py-1 rounded-md transition-colors " +
              (view === "data" ? "bg-background border border-gray-300 font-medium" : "text-muted-foreground hover:bg-muted/60")
            }
          >
            Data
          </button>
          <button
            type="button"
            onClick={() => setView("charts")}
            className={
              "px-3 py-1 rounded-md transition-colors " +
              (view === "charts" ? "bg-background border border-gray-300 font-medium" : "text-muted-foreground hover:bg-muted/60")
            }
          >
            Charts
          </button>
        </div>
      )}

      {view === "data" && (
        <>
      {/* Toolbar (compact info) — XLSX download lives in the panel header,
          not duplicated here. */}
      <div className="flex items-center gap-2 px-4 py-1.5 border-b shrink-0 bg-muted/20 text-xs text-muted-foreground">
        <FunctionSquare className="h-3.5 w-3.5 opacity-60" />
        <span className="tabular-nums flex-1">
          {sheet.name} · {sheet.cells.length} cells
        </span>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-auto" style={{ fontFamily }}>
        <table className="text-sm border-collapse">
          <thead className="sticky top-0 z-10">
            <tr>
              <th className="sticky left-0 z-20 w-10 px-1 py-0.5 text-xs text-muted-foreground font-normal border-r-2 border-b-2 border-gray-300 bg-gradient-to-b from-gray-50 to-gray-100" />
              {Array.from({ length: maxCol }, (_, i) => (
                <th
                  key={i}
                  className={
                    "px-2 py-0.5 text-xs font-normal border-r border-b-2 border-gray-300 whitespace-nowrap bg-gradient-to-b from-gray-50 to-gray-100 text-center " +
                    (activeCol === i + 1 ? "bg-blue-100 text-blue-900 font-semibold" : "text-muted-foreground")
                  }
                  style={{
                    width: sheet.columns?.[i]?.width
                      ? sheet.columns[i].width! * 7 + 16
                      : undefined,
                  }}
                >
                  {colToLetter(i + 1)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: maxRow }, (_, r) => (
              <tr key={r}>
                <td
                  className={
                    "sticky left-0 z-10 w-10 px-1 py-0.5 text-xs text-muted-foreground text-right border-r-2 border-b border-gray-300 bg-gradient-to-b from-gray-50 to-gray-100 " +
                    (activeRow === r + 1 ? "!bg-blue-100 !text-blue-900 !font-semibold" : "")
                  }
                >
                  {r + 1}
                </td>
                {Array.from({ length: maxCol }, (_, c) => {
                  const ref = `${colToLetter(c + 1)}${r + 1}`
                  const cell = cellMap.get(ref)
                  const qualified = `${sheet.name}!${ref}`
                  const evaluated = values?.get(qualified)
                  const userStyle = resolveCellStyle(cell?.style, spec.theme)
                  const colorClass = cell ? classifyCell(cell) : "default"
                  const colorClassName = colorClassToClassName(colorClass)
                  const isSelected = selectedRef === ref
                  const isHighlight = cell?.style === "highlight"
                  const rawValue = cell?.formula ? evaluated?.value : cell?.value
                  const alignment = cellAlignmentClass(rawValue)

                  const displayText = (() => {
                    if (!cell) return ""
                    if (evaluated?.error) return `#${evaluated.error}!`
                    return formatNumber(
                      rawValue as number | string | boolean | null | undefined,
                      cell.format ?? sheet.columns?.[c]?.format,
                    )
                  })()

                  const frozenRowBorder =
                    frozenRows > 0 && r + 1 === frozenRows ? "border-b-2 border-b-gray-500" : ""
                  const frozenColBorder =
                    frozenCols > 0 && c + 1 === frozenCols ? "border-r-2 border-r-gray-500" : ""

                  return (
                    <td
                      key={c}
                      onClick={() => setSelectedRef(ref)}
                      className={
                        "px-2 py-0.5 text-sm border-r border-b border-gray-200 cursor-cell whitespace-nowrap " +
                        alignment + " " +
                        colorClassName + " " +
                        userStyle.classNames + " " +
                        (isHighlight ? "bg-yellow-200/80 " : "") +
                        (evaluated?.error ? "text-red-600 " : "") +
                        frozenRowBorder + " " +
                        frozenColBorder + " " +
                        (isSelected ? "outline outline-2 outline-blue-600 outline-offset-[-2px]" : "")
                      }
                      title={cell?.note}
                    >
                      {displayText}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Bottom sheet tabs — Excel pattern */}
      {spec.sheets.length > 0 && (
        <div className="flex items-center gap-0.5 px-2 py-1 border-t shrink-0 overflow-x-auto bg-muted/20">
          {spec.sheets.map((s, i) => (
            <button
              key={s.name}
              type="button"
              onClick={() => { setActiveSheet(i); setSelectedRef(null) }}
              className={
                "px-3 py-1 text-xs rounded-t-md whitespace-nowrap transition-colors " +
                (i === activeSheet
                  ? "bg-background border border-b-0 border-gray-300 font-medium text-foreground"
                  : "text-muted-foreground hover:bg-muted/60")
              }
            >
              {s.name}
            </button>
          ))}
        </div>
      )}
        </>
      )}

      {view === "charts" && spec.charts && (
        <SheetChartView charts={spec.charts} values={values ?? new Map()} />
      )}

      {evalError && (
        <div className="px-4 py-2 text-xs text-amber-500 border-t shrink-0">
          Formula eval failed: {evalError}
        </div>
      )}
    </div>
  )
}
