"use client"

import { useRef } from "react"
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
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])

  const onTabKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, idx: number) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return
    e.preventDefault()
    const dir = e.key === "ArrowRight" ? 1 : -1
    const next = (idx + dir + TABS.length) % TABS.length
    tabRefs.current[next]?.focus()
    onTabChange(TABS[next].value)
  }

  return (
    <div className="flex items-center justify-between gap-2 px-4 py-2 border-b border-border bg-background">
      {/* Tab group is hand-rolled (instead of shadcn Tabs / Radix) so fireEvent.click
          works in jsdom tests; Radix Tabs fires on mousedown. ArrowLeft/Right keyboard
          navigation is implemented manually below to keep parity with the Radix a11y
          contract. */}
      <div role="tablist" className="inline-flex h-9 items-center justify-center rounded-lg bg-muted p-[3px]">
        {TABS.map(({ value, label }, idx) => (
          <button
            key={value}
            ref={(el) => {
              tabRefs.current[idx] = el
            }}
            type="button"
            role="tab"
            aria-selected={activeTab === value}
            data-state={activeTab === value ? "active" : "inactive"}
            onClick={() => onTabChange(value)}
            onKeyDown={(e) => onTabKeyDown(e, idx)}
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
