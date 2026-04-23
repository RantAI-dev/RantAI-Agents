import { DEFAULT_THEME, type CellStyleName, type SpreadsheetTheme } from "./types"

export interface ResolvedCellStyle {
  fontColor?: string
  fontBold?: boolean
  fontItalic?: boolean
  fillColor?: string
  /** Tailwind utility classes matching the above, for the HTML preview. */
  classNames: string
}

export function resolveCellStyle(
  style: CellStyleName | undefined,
  theme?: SpreadsheetTheme
): ResolvedCellStyle {
  const t = { ...DEFAULT_THEME, ...(theme ?? {}) }
  switch (style) {
    case "header":
      return {
        fontBold: true,
        classNames: "font-semibold text-foreground",
      }
    case "input":
      return {
        fontColor: t.inputColor,
        classNames: "text-blue-600 dark:text-blue-400",
      }
    case "formula":
      return {
        fontColor: t.formulaColor,
        classNames: "text-foreground",
      }
    case "cross-sheet":
      return {
        fontColor: t.crossSheetColor,
        classNames: "text-emerald-600 dark:text-emerald-400",
      }
    case "highlight":
      return {
        fillColor: t.highlightFill,
        classNames: "bg-yellow-200/60 dark:bg-yellow-900/40",
      }
    case "note":
      return {
        fontItalic: true,
        fontColor: "#666666",
        classNames: "italic text-muted-foreground",
      }
    default:
      return { classNames: "" }
  }
}

import type { CellValue } from "./types"

/**
 * Renders a cell value for the HTML preview using a minimal subset of
 * Excel-style number formats. The exported xlsx carries the raw format string,
 * so Excel will render it identically or better.
 */
export function formatCellValue(value: CellValue, format?: string): string {
  if (value === null || value === undefined) return ""
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE"
  if (!format) return typeof value === "number" ? String(value) : String(value)

  if (typeof value !== "number") {
    if (/^d|^m|^y/i.test(format) && typeof value === "string") {
      const d = new Date(value)
      if (!isNaN(d.getTime())) return renderDate(d, format)
    }
    return String(value)
  }

  const segments = format.split(";")
  const hasNumberPattern = segments.some((s) => /[0#,.]/.test(s))
  if (!hasNumberPattern) return String(value)

  let segment: string
  if (value > 0) segment = segments[0]
  else if (value < 0) segment = segments[1] ?? segments[0]
  else segment = segments[2] ?? segments[0]

  return applyNumberFormat(value, segment)
}

function applyNumberFormat(value: number, segment: string): string {
  const hasNumberPattern = /[0#,.]/.test(segment)
  if (!hasNumberPattern) return segment

  const isPercent = /%/.test(segment)
  const working = isPercent ? value * 100 : value
  const abs = Math.abs(working)

  const decMatch = segment.match(/\.([0#]+)/)
  const decimals = decMatch ? decMatch[1].length : 0

  const hasThousands = /#,##0|,0/.test(segment)

  let numStr = abs.toFixed(decimals)
  if (hasThousands) {
    const [intPart, decPart] = numStr.split(".")
    const withSep = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
    numStr = decPart !== undefined ? `${withSep}.${decPart}` : withSep
  }

  const mask = segment.match(/[#0,.]+/)?.[0] ?? ""
  const beforeMask = segment.slice(0, segment.indexOf(mask))
  const afterMask = segment.slice(segment.indexOf(mask) + mask.length)
  const prefix = beforeMask.replace(/\\(.)/g, "$1")
  const suffix = afterMask.replace(/\\(.)/g, "$1")

  const sign = working < 0 && !/^\(/.test(segment) ? "-" : ""
  return `${sign}${prefix}${numStr}${suffix}`
}

function renderDate(d: Date, format: string): string {
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
  const y = d.getUTCFullYear()
  const mo = d.getUTCMonth()
  const day = d.getUTCDate()
  if (/mmm d, yyyy/i.test(format)) return `${months[mo]} ${day}, ${y}`
  if (/yyyy-mm-dd/i.test(format)) {
    const m2 = String(mo + 1).padStart(2, "0")
    const d2 = String(day).padStart(2, "0")
    return `${y}-${m2}-${d2}`
  }
  return d.toISOString().slice(0, 10)
}
