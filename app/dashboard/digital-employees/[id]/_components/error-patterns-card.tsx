"use client"

import { useState, useEffect } from "react"
import { AlertTriangle } from "@/lib/icons"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { formatDistanceToNow } from "date-fns"

interface ErrorPattern {
  pattern: string
  count: number
  classification: string
  suggestedFix: string | null
  lastOccurrence: string
}

interface ErrorPatternsCardProps {
  employeeId: string
  runs: Array<{
    id: string
    status: string
    error: string | null
    startedAt: string
  }>
}

export function ErrorPatternsCard({ employeeId, runs }: ErrorPatternsCardProps) {
  const [patterns, setPatterns] = useState<ErrorPattern[]>([])

  useEffect(() => {
    const failedRuns = runs
      .filter((r) => r.status === "FAILED" && r.error)
      .map((r) => ({ error: r.error!, runId: r.id, createdAt: new Date(r.startedAt) }))

    if (failedRuns.length < 2) {
      setPatterns([])
      return
    }

    // Simple client-side pattern detection
    import("@/lib/digital-employee/error-recovery").then(({ detectErrorPatterns }) => {
      const detected = detectErrorPatterns(failedRuns)
      setPatterns(detected.map((p) => ({
        ...p,
        lastOccurrence: p.lastOccurrence.toISOString(),
      })))
    })
  }, [runs])

  if (patterns.length === 0) return null

  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium">
        <AlertTriangle className="h-4 w-4 text-amber-500" />
        Error Patterns Detected
      </div>
      <div className="space-y-2">
        {patterns.map((p, i) => (
          <div key={i} className="text-xs space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="font-medium truncate">{p.pattern}</span>
              <Badge
                variant="secondary"
                className={cn(
                  "text-[10px] px-1.5 py-0 shrink-0",
                  p.classification === "transient" ? "bg-amber-500/10 text-amber-500" :
                  p.classification === "permanent" ? "bg-red-500/10 text-red-500" :
                  "bg-muted text-muted-foreground"
                )}
              >
                {p.classification}
              </Badge>
              <span className="text-muted-foreground shrink-0">{p.count}x</span>
            </div>
            {p.suggestedFix && (
              <p className="text-muted-foreground ml-0.5">Fix: {p.suggestedFix}</p>
            )}
            <p className="text-muted-foreground ml-0.5">
              Last: {formatDistanceToNow(new Date(p.lastOccurrence), { addSuffix: true })}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
