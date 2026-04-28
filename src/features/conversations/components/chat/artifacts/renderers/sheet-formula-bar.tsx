"use client"

import { ChevronDown, FunctionSquare } from "@/lib/icons"

interface Props {
  /** the active cell ref, e.g. "B5", or null when nothing selected */
  selectedRef: string | null
  /** the active cell's formula (with leading `=`) or its raw display value */
  formulaOrValue: string | null
}

/**
 * Excel-style top formula bar.
 *
 * Layout:
 *   ┌──────────────┬──────────────────────────────────┐
 *   │  [B5]   ▼   │  ƒx  =SUM(B2:B4)                │
 *   └──────────────┴──────────────────────────────────┘
 *
 * Name Box on the left (96px) shows the active cell ref. The dropdown chevron
 * is purely visual — there is no actual jump-to-name list (Claude.ai also
 * shows it as decorative). On the right, a ƒx icon then a monospace display
 * of the active formula (italicised) or value (plain). Empty when no cell
 * is selected.
 */
export function SheetFormulaBar({ selectedRef, formulaOrValue }: Props) {
  const isFormula =
    typeof formulaOrValue === "string" && formulaOrValue.startsWith("=")
  return (
    <div className="flex items-stretch h-9 border-b shrink-0 text-xs">
      <div className="flex items-center gap-1 px-2 min-w-[96px] border-r bg-muted/40">
        <span className="font-mono text-foreground">
          {selectedRef ?? ""}
        </span>
        <ChevronDown className="h-3 w-3 text-muted-foreground/60 ml-auto" />
      </div>
      <div className="flex items-center gap-2 px-2 flex-1 bg-background">
        <FunctionSquare className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
        <span
          className={
            "font-mono text-foreground truncate " +
            (isFormula ? "italic" : "")
          }
        >
          {formulaOrValue ?? ""}
        </span>
      </div>
    </div>
  )
}
