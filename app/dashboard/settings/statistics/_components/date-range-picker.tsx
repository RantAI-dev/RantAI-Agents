"use client"

import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Calendar } from "lucide-react"
import { useState } from "react"
import { cn } from "@/lib/utils"
import type { StatisticsFilters } from "@/hooks/use-statistics"

interface DateRangePickerProps {
  filters: StatisticsFilters
  onUpdate: (update: Partial<StatisticsFilters>) => void
}

const PRESETS = [
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
  { label: "This month", days: -1 },
] as const

function getPresetRange(preset: (typeof PRESETS)[number]) {
  const now = new Date()
  if (preset.days === -1) {
    const from = new Date(now.getFullYear(), now.getMonth(), 1)
    return {
      from: from.toISOString().split("T")[0],
      to: now.toISOString().split("T")[0],
    }
  }
  const from = new Date(now.getTime() - preset.days * 24 * 60 * 60 * 1000)
  return {
    from: from.toISOString().split("T")[0],
    to: now.toISOString().split("T")[0],
  }
}

function getActiveLabel(filters: StatisticsFilters): string {
  for (const preset of PRESETS) {
    const range = getPresetRange(preset)
    if (range.from === filters.from && range.to === filters.to) {
      return preset.label
    }
  }
  return `${filters.from} - ${filters.to}`
}

export function DateRangePicker({ filters, onUpdate }: DateRangePickerProps) {
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 font-mono text-xs">
          <Calendar className="h-4 w-4" />
          <span className="hidden sm:inline">{getActiveLabel(filters)}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2" align="end">
        <div className="space-y-0.5">
          {PRESETS.map((preset) => {
            const range = getPresetRange(preset)
            const isActive =
              range.from === filters.from && range.to === filters.to
            return (
              <Button
                key={preset.label}
                variant={isActive ? "secondary" : "ghost"}
                size="sm"
                className={cn(
                  "w-full justify-start font-mono text-xs",
                  isActive && "bg-primary/10 text-primary border border-primary/20"
                )}
                onClick={() => {
                  onUpdate(range)
                  setOpen(false)
                }}
              >
                {isActive && (
                  <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-primary inline-block" />
                )}
                {preset.label}
              </Button>
            )
          })}
        </div>
        <div className="border-t mt-2 pt-2 space-y-1">
          <p className="text-[11px] text-muted-foreground px-2 font-mono uppercase tracking-wider">Group by</p>
          <div className="flex gap-1">
            {(["day", "week", "month"] as const).map((g) => (
              <Button
                key={g}
                variant="ghost"
                size="sm"
                className={cn(
                  "flex-1 capitalize font-mono text-xs",
                  filters.groupBy === g && "bg-primary/10 text-primary border border-primary/20"
                )}
                onClick={() => onUpdate({ groupBy: g })}
              >
                {g}
              </Button>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
