"use client"

import { Copy, Check, RotateCcw } from "@/lib/icons"
import { cn } from "@/lib/utils"

interface LatexToolbarProps {
  activeTab: "preview" | "source"
  onTabChange: (tab: "preview" | "source") => void
  onCopy: () => void
  copied: boolean
  error?: string
  onRetry?: () => void
}

const TABS = [
  { value: "preview" as const, label: "Preview" },
  { value: "source" as const, label: "Source" },
]

export function LatexToolbar({
  activeTab,
  onTabChange,
  onCopy,
  copied,
  error,
  onRetry,
}: LatexToolbarProps) {
  return (
    <div className="flex items-center justify-between gap-2 px-4 py-2 border-b border-border bg-background">
      {/* Tab group — hand-rolled so fireEvent.click works in tests (Radix Tabs fires on mousedown). */}
      <div role="tablist" className="inline-flex h-9 items-center justify-center rounded-lg bg-muted p-[3px]">
        {TABS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={activeTab === value}
            data-state={activeTab === value ? "active" : "inactive"}
            onClick={() => onTabChange(value)}
            className={cn(
              "inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center rounded-md border border-transparent px-3 py-1 text-sm font-medium whitespace-nowrap transition-[color,box-shadow]",
              activeTab === value
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1.5">
        {error && onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 transition-colors"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Retry
          </button>
        )}
        <button
          type="button"
          onClick={onCopy}
          aria-label="Copy"
          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          Copy
        </button>
      </div>
    </div>
  )
}
