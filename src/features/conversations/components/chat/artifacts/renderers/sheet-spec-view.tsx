"use client"

import { useState, useMemo, useEffect } from "react"
import { AlertTriangle, Download, FunctionSquare, Search } from "@/lib/icons"
import {
  type SpreadsheetSpec,
  type WorkbookValues,
  type CellStyleName,
} from "@/lib/spreadsheet/types"
import { parseSpec } from "@/lib/spreadsheet/parse"
import { resolveCellStyle, formatCellValue } from "@/lib/spreadsheet/styles"

interface SpecWorkbookViewProps {
  content: string
  title?: string
  onDownloadXlsx: () => void
}

interface CellEntry {
  ref: string
  row: number
  col: number
  value?: unknown
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

export function SpecWorkbookView({
  content,
  onDownloadXlsx,
}: SpecWorkbookViewProps) {
  const [activeSheet, setActiveSheet] = useState(0)
  const [showFormulas, setShowFormulas] = useState(false)
  const [selectedRef, setSelectedRef] = useState<string | null>(null)
  const [values, setValues] = useState<WorkbookValues | null>(null)
  const [evalError, setEvalError] = useState<string | null>(null)

  // Reset selection / active-sheet when the underlying content changes.
  // An LLM update that drops sheets (e.g. 3 → 1) used to leave activeSheet
  // pointing at an undefined index, and a stale selectedRef stayed
  // highlighted on a cell that had been replaced.
  useEffect(() => {
    setActiveSheet(0)
    setSelectedRef(null)
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

  return (
    <div className="flex flex-col h-full">
      {/* Sheet tabs */}
      {spec.sheets.length > 1 && (
        <div className="flex items-center gap-0.5 px-2 py-1.5 border-b shrink-0 overflow-x-auto">
          {spec.sheets.map((s, i) => (
            <button
              key={s.name}
              type="button"
              onClick={() => { setActiveSheet(i); setSelectedRef(null) }}
              className={
                "px-3 py-1 text-xs rounded-md whitespace-nowrap transition-colors " +
                (i === activeSheet
                  ? "bg-muted font-medium text-foreground"
                  : "text-muted-foreground hover:bg-muted/60")
              }
            >
              {s.name}
            </button>
          ))}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b shrink-0">
        <Search className="h-4 w-4 text-muted-foreground shrink-0 opacity-50" />
        <div className="flex-1 text-xs text-muted-foreground tabular-nums">
          {sheet.name} · {sheet.cells.length} cells
        </div>
        <button
          type="button"
          onClick={() => setShowFormulas((s) => !s)}
          title="Toggle raw formulas"
          className={
            "inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md transition-colors " +
            (showFormulas
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-muted")
          }
        >
          <FunctionSquare className="h-3.5 w-3.5" />
          ƒx
        </button>
        <button
          type="button"
          onClick={onDownloadXlsx}
          className="inline-flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:text-foreground rounded-md hover:bg-muted transition-colors"
        >
          <Download className="h-3.5 w-3.5" />
          XLSX
        </button>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-auto">
        <table className="text-sm border-collapse">
          <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm z-10">
            <tr>
              <th className="w-10 px-1 py-1 text-xs text-muted-foreground font-normal border-r border-b" />
              {Array.from({ length: maxCol }, (_, i) => (
                <th
                  key={i}
                  className="px-3 py-1 text-xs text-muted-foreground font-normal border-r border-b whitespace-nowrap"
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
                <td className="w-10 px-1 py-1 text-xs text-muted-foreground text-center border-r border-b bg-muted/40">
                  {r + 1}
                </td>
                {Array.from({ length: maxCol }, (_, c) => {
                  const ref = `${colToLetter(c + 1)}${r + 1}`
                  const cell = cellMap.get(ref)
                  const qualified = `${sheet.name}!${ref}`
                  const evaluated = values?.get(qualified)
                  const style = resolveCellStyle(cell?.style, spec.theme)
                  const isSelected = selectedRef === ref
                  const displayText = (() => {
                    if (!cell) return ""
                    if (evaluated?.error) return `#${evaluated.error}!`
                    if (showFormulas && cell.formula) return cell.formula
                    const v = cell.formula ? evaluated?.value : cell.value
                    return formatCellValue(
                      v as never,
                      cell.format ?? sheet.columns?.[c]?.format
                    )
                  })()
                  return (
                    <td
                      key={c}
                      onClick={() => setSelectedRef(ref)}
                      className={
                        "px-3 py-1 text-sm border-r border-b cursor-cell whitespace-nowrap " +
                        (evaluated?.error ? "text-red-600 " : "") +
                        style.classNames +
                        (isSelected ? " outline outline-2 outline-primary" : "")
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

      {/* Cell footer */}
      {selectedCell && (
        <div className="px-4 py-2 border-t shrink-0 text-xs text-muted-foreground font-mono tabular-nums">
          <span className="text-foreground font-semibold">{selectedCell.ref}</span>
          {selectedCell.formula && <span> · {selectedCell.formula}</span>}
          {selectedCell.format && <span> · fmt: {selectedCell.format}</span>}
          {selectedCell.note && <span className="italic"> · {selectedCell.note}</span>}
        </div>
      )}

      {evalError && (
        <div className="px-4 py-2 text-xs text-amber-500 border-t">
          Formula eval failed: {evalError}
        </div>
      )}
    </div>
  )
}
