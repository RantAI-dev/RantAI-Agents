"use client"

import { useRef } from "react"
import { cn } from "@/lib/utils"

interface LatexToolbarProps {
  activeTab: "preview" | "source"
  onTabChange: (tab: "preview" | "source") => void
}

const TABS = [
  { value: "preview" as const, label: "Preview" },
  { value: "source" as const, label: "Source" },
]

export function LatexToolbar({ activeTab, onTabChange }: LatexToolbarProps) {
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
    <div className="flex items-center gap-2 px-4 py-2 border-b bg-muted/30 shrink-0">
      {/* Tab group is hand-rolled (instead of shadcn Tabs / Radix) so fireEvent.click
          works in jsdom tests; Radix Tabs fires on mousedown. ArrowLeft/Right keyboard
          navigation is implemented manually below to keep parity with the Radix a11y
          contract. Copy + Retry chrome lives on the panel header (artifact-panel.tsx)
          and on the error-state amber callout respectively, matching the convention
          set by every other renderer in this directory. */}
      <div role="tablist" className="inline-flex h-8 items-center justify-center rounded-md bg-muted p-[3px]">
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
              "inline-flex h-full items-center justify-center rounded-sm px-3 text-xs font-medium whitespace-nowrap transition-[color,box-shadow]",
              activeTab === value
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}
