import type { ChartSpec, WorkbookValues } from "./types"

export interface ResolvedChartData {
  rows: Array<Record<string, string | number>>
  series: Array<{ name: string; color: string }>
}

const PALETTE = [
  "#1a73e8",   // blue
  "#ea4335",   // red
  "#fbbc04",   // yellow
  "#34a853",   // green
  "#673ab7",   // purple
  "#ff7043",   // orange
  "#26a69a",   // teal
  "#5f6368",   // gray
]

const RANGE_RE = /^([^!]+)!([A-Z]+)(\d+):([A-Z]+)(\d+)$/

function colLetterToNum(s: string): number {
  let c = 0
  for (let i = 0; i < s.length; i++) c = c * 26 + (s.charCodeAt(i) - 64)
  return c
}

function colNumToLetter(n: number): string {
  let s = ""
  let c = n
  while (c > 0) {
    const r = (c - 1) % 26
    s = String.fromCharCode(65 + r) + s
    c = Math.floor((c - 1) / 26)
  }
  return s
}

/**
 * Expand "SheetName!A2:A6" → ["SheetName!A2", "SheetName!A3", ..., "SheetName!A6"]
 * Single-row ranges (A2:F2) and single-cell (A2:A2) supported.
 */
function expandRange(range: string): string[] {
  // Strip Excel-style absolute-ref `$` markers ($A$1:$B$5) before pattern match —
  // the regex doesn't handle them but they're semantically equivalent here.
  const normalized = range.replace(/\$/g, "")
  const m = normalized.match(RANGE_RE)
  if (!m) return []
  const [, sheet, c1, r1, c2, r2] = m
  const startCol = colLetterToNum(c1)
  const endCol = colLetterToNum(c2)
  const startRow = parseInt(r1, 10)
  const endRow = parseInt(r2, 10)
  const refs: string[] = []
  for (let r = startRow; r <= endRow; r++) {
    for (let c = startCol; c <= endCol; c++) {
      refs.push(`${sheet}!${colNumToLetter(c)}${r}`)
    }
  }
  return refs
}

export function resolveChartData(chart: ChartSpec, values: WorkbookValues): ResolvedChartData {
  const categoryRefs = expandRange(chart.categoryRange)
  const seriesRefs = chart.series.map((s) => expandRange(s.range))
  const rowCount = Math.min(categoryRefs.length, ...seriesRefs.map((r) => r.length))

  const rows: ResolvedChartData["rows"] = []
  for (let i = 0; i < rowCount; i++) {
    const catRef = categoryRefs[i]
    const cat = values.get(catRef)?.value
    if (cat === undefined || cat === null || cat === "") continue
    const row: Record<string, string | number> = { category: cat as string | number }
    for (let s = 0; s < chart.series.length; s++) {
      const ref = seriesRefs[s][i]
      const v = values.get(ref)?.value
      row[chart.series[s].name] = (typeof v === "number" || typeof v === "string" ? v : 0) as number | string
    }
    rows.push(row)
  }

  const series = chart.series.map((s, i) => ({
    name: s.name,
    color: s.color ?? PALETTE[i % PALETTE.length],
  }))

  return { rows, series }
}
