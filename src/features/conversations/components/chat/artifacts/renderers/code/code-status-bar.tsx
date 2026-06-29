"use client"

import { WrapText } from "@/lib/icons"
import { cn } from "@/lib/utils"

interface CodeStatusBarProps {
  lineCount: number
  wrap: boolean
  onWrapToggle: () => void
}

export function CodeStatusBar({
  lineCount,
  wrap,
  onWrapToggle,
}: CodeStatusBarProps) {
  return (
    <div className="flex items-center justify-between bg-[var(--artifact-surface)] shadow-[inset_0_1px_0_var(--artifact-border)] px-3 py-1 text-[11px] text-[var(--artifact-muted)] font-mono shrink-0">
      <span className="tabular-nums">
        {lineCount} {lineCount === 1 ? "line" : "lines"} · UTF-8 · LF
      </span>
      <button
        type="button"
        onClick={onWrapToggle}
        aria-label={wrap ? "Disable line wrap" : "Enable line wrap"}
        aria-pressed={wrap}
        className={cn(
          "inline-flex items-center gap-1 rounded-sm transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--artifact-accent)]",
          wrap
            ? "text-[var(--artifact-accent)]"
            : "hover:text-[var(--artifact-ink)]"
        )}
      >
        <WrapText className="h-3 w-3" />
        wrap: {wrap ? "on" : "off"}
      </button>
    </div>
  )
}
