import type { ColorClass } from "./cell-classify"
import { DEFAULT_THEME, type CellStyleName, type SpreadsheetTheme } from "./types"

export interface ResolvedCellStyle {
  fontColor?: string
  fontBold?: boolean
  fontItalic?: boolean
  fillColor?: string
  /**
   * Tailwind utility classes for the HTML preview. **These intentionally
   * do not exactly match `fontColor` / `fillColor`** — the hex values
   * carry into the XLSX export verbatim (and Excel users expect those
   * exact ANSI-style colors), while the preview substitutes the closest
   * Tailwind semantic so it adapts to dark mode automatically. Use
   * `fontColor` / `fillColor` when exporting; use `classNames` when
   * rendering inline HTML.
   */
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
        fontColor: t.noteColor,
        classNames: "italic text-muted-foreground",
      }
    default:
      return { classNames: "" }
  }
}

/**
 * Map a ColorClass to Tailwind utility classes for cell text styling.
 * Background-color (highlight yellow) is applied separately by caller.
 */
export function colorClassToClassName(c: ColorClass): string {
  switch (c) {
    case "input":
      return "text-blue-700"          // ~#0000FF, but Tailwind picks the closest semantic
    case "cross-sheet":
      return "text-green-700"         // ~#008000
    case "external":
      return "text-red-600"           // ~#FF0000
    case "header":
      return "font-bold text-base"    // bold + slightly larger than default text-sm
    case "formula":
    case "default":
      return ""
  }
}
