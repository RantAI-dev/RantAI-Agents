"use client"

import { Search, WrapText } from "@/lib/icons"

interface CodeStatusBarProps {
  lineCount: number
  wrap: boolean
  onWrapToggle: () => void
  onSearchOpen: () => void
}

export function CodeStatusBar({
  lineCount,
  wrap,
  onWrapToggle,
  onSearchOpen,
}: CodeStatusBarProps) {
  return (
    <div className="flex items-center justify-between border-t border-border/50 bg-muted/30 px-3 py-1 text-[11px] text-muted-foreground font-mono shrink-0">
      <span className="tabular-nums">
        {lineCount} {lineCount === 1 ? "line" : "lines"} · UTF-8 · LF
      </span>
      <span className="flex items-center gap-3">
        <button
          type="button"
          onClick={onSearchOpen}
          aria-label="Open search (Ctrl+F)"
          className="inline-flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer"
        >
          <Search className="h-3 w-3" />
          Ctrl+F
        </button>
        <button
          type="button"
          onClick={onWrapToggle}
          aria-label={wrap ? "Disable line wrap" : "Enable line wrap"}
          aria-pressed={wrap}
          className="inline-flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer"
        >
          <WrapText className="h-3 w-3" />
          wrap: {wrap ? "on" : "off"}
        </button>
      </span>
    </div>
  )
}
