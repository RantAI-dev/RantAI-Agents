"use client"

import { useState, useMemo } from "react"
import { Zap, Clock, Check, X, ChevronDown, Filter } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { format, isToday, isYesterday, formatDistanceToNow } from "date-fns"
import { RUN_STATUS_STYLES } from "@/lib/digital-employee/shared-constants"
import { estimateCostFromTokens, formatCost } from "@/lib/digital-employee/cost"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"

interface RunItem {
  id: string
  trigger: string
  workflowId: string | null
  status: string
  output: unknown
  error: string | null
  promptTokens: number
  completionTokens: number
  executionTimeMs: number | null
  startedAt: string
  completedAt: string | null
}

interface TabHistoryProps {
  runs: RunItem[]
  containerRunning: boolean
  employeeStatus: string
  model?: string
  onRunNow: () => void
}

type StatusFilter = "ALL" | "COMPLETED" | "FAILED" | "RUNNING"
type TriggerFilter = "ALL" | "schedule" | "manual" | "webhook"

export function TabHistory({ runs, containerRunning, employeeStatus, model, onRunNow }: TabHistoryProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL")
  const [triggerFilter, setTriggerFilter] = useState<TriggerFilter>("ALL")
  const [expandedRuns, setExpandedRuns] = useState<Set<string>>(new Set())

  const toggleRun = (runId: string) => {
    setExpandedRuns((prev) => {
      const next = new Set(prev)
      if (next.has(runId)) next.delete(runId)
      else next.add(runId)
      return next
    })
  }

  const filtered = useMemo(() => {
    let result = [...runs]
    if (statusFilter !== "ALL") {
      result = result.filter((r) => r.status === statusFilter)
    }
    if (triggerFilter !== "ALL") {
      result = result.filter((r) => r.trigger === triggerFilter)
    }
    return result
  }, [runs, statusFilter, triggerFilter])

  // Group by day
  const grouped = useMemo(() => {
    const groups: { label: string; runs: RunItem[] }[] = []
    let currentLabel = ""

    for (const run of filtered) {
      const date = new Date(run.startedAt)
      const label = isToday(date)
        ? "Today"
        : isYesterday(date)
          ? "Yesterday"
          : format(date, "MMMM d, yyyy")

      if (label !== currentLabel) {
        currentLabel = label
        groups.push({ label, runs: [] })
      }
      groups[groups.length - 1].runs.push(run)
    }

    return groups
  }, [filtered])

  return (
    <div className="flex-1 overflow-auto p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">History ({runs.length})</h2>
        {employeeStatus === "ACTIVE" && containerRunning && (
          <Button size="sm" onClick={onRunNow}>
            <Zap className="h-3.5 w-3.5 mr-1.5" />
            Run Now
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          {(["ALL", "COMPLETED", "FAILED", "RUNNING"] as StatusFilter[]).map((s) => (
            <Button
              key={s}
              variant={statusFilter === s ? "secondary" : "ghost"}
              size="sm"
              className="h-7 text-xs px-2"
              onClick={() => setStatusFilter(s)}
            >
              {s === "ALL" ? "All" : s.charAt(0) + s.slice(1).toLowerCase()}
            </Button>
          ))}
        </div>
        <div className="h-4 w-px bg-border" />
        <div className="flex items-center gap-1">
          {(["ALL", "schedule", "manual", "webhook"] as TriggerFilter[]).map((t) => (
            <Button
              key={t}
              variant={triggerFilter === t ? "secondary" : "ghost"}
              size="sm"
              className="h-7 text-xs px-2"
              onClick={() => setTriggerFilter(t)}
            >
              {t === "ALL" ? "All triggers" : t.charAt(0).toUpperCase() + t.slice(1)}
            </Button>
          ))}
        </div>
      </div>

      {/* Timeline */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Zap className="h-8 w-8 mb-3 opacity-30" />
          <p className="text-sm">
            {runs.length === 0 ? "No runs yet" : "No runs match your filters"}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map((group) => (
            <div key={group.label}>
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                {group.label}
              </h3>
              <div className="relative">
                {/* Vertical timeline line */}
                <div className="absolute left-[11px] top-2 bottom-2 w-px bg-border" />

                <div className="space-y-1">
                  {group.runs.map((run) => {
                    const runStatus = RUN_STATUS_STYLES[run.status] || RUN_STATUS_STYLES.COMPLETED
                    const duration = run.executionTimeMs
                      ? `${(run.executionTimeMs / 1000).toFixed(1)}s`
                      : null
                    const tokens = run.promptTokens + run.completionTokens
                    const cost = estimateCostFromTokens(tokens, model)
                    const isExpanded = expandedRuns.has(run.id)
                    const hasDetail = !!run.output || !!run.error

                    return (
                      <Collapsible
                        key={run.id}
                        open={isExpanded}
                        onOpenChange={() => hasDetail && toggleRun(run.id)}
                      >
                        <CollapsibleTrigger asChild>
                          <button
                            className={cn(
                              "w-full flex items-center gap-3 pl-2 pr-3 py-2 rounded-lg text-sm text-left transition-colors",
                              hasDetail && "hover:bg-muted/50 cursor-pointer",
                              !hasDetail && "cursor-default"
                            )}
                          >
                            {/* Status dot on timeline */}
                            <div
                              className={cn(
                                "w-[22px] h-[22px] rounded-full border-2 border-background flex items-center justify-center shrink-0 z-10",
                                run.status === "COMPLETED" && "bg-emerald-500",
                                run.status === "FAILED" && "bg-red-500",
                                run.status === "RUNNING" && "bg-blue-500",
                                run.status === "PAUSED" && "bg-amber-500"
                              )}
                            >
                              {run.status === "COMPLETED" && <Check className="h-3 w-3 text-white" />}
                              {run.status === "FAILED" && <X className="h-3 w-3 text-white" />}
                              {run.status === "RUNNING" && <Zap className="h-3 w-3 text-white" />}
                            </div>

                            <span className="text-xs text-muted-foreground shrink-0 w-12">
                              {format(new Date(run.startedAt), "HH:mm")}
                            </span>

                            <Badge
                              variant="secondary"
                              className={cn("text-[10px] px-1.5 py-0 shrink-0", runStatus.className)}
                            >
                              {runStatus.label}
                            </Badge>

                            <span className="text-xs text-muted-foreground shrink-0">{run.trigger}</span>

                            {duration && (
                              <span className="text-xs text-muted-foreground flex items-center gap-1 shrink-0">
                                <Clock className="h-3 w-3" />
                                {duration}
                              </span>
                            )}

                            {tokens > 0 && (
                              <span className="text-xs text-muted-foreground shrink-0">
                                {tokens.toLocaleString()} tok
                              </span>
                            )}

                            {cost > 0 && (
                              <span className="text-xs text-muted-foreground shrink-0">
                                {formatCost(cost)}
                              </span>
                            )}

                            {hasDetail && (
                              <ChevronDown
                                className={cn(
                                  "h-3.5 w-3.5 text-muted-foreground ml-auto transition-transform shrink-0",
                                  isExpanded && "rotate-180"
                                )}
                              />
                            )}
                          </button>
                        </CollapsibleTrigger>

                        {hasDetail && (
                          <CollapsibleContent>
                            <div className="ml-10 mr-3 mb-2 p-3 rounded-md bg-muted/30 text-xs">
                              {run.error && (
                                <div className="text-red-500 mb-2">
                                  <span className="font-medium">Error: </span>
                                  {run.error}
                                </div>
                              )}
                              {run.output != null && (
                                <pre className="text-muted-foreground whitespace-pre-wrap break-words max-h-48 overflow-auto">
                                  {typeof run.output === "string"
                                    ? run.output
                                    : JSON.stringify(run.output as object, null, 2)}
                                </pre>
                              )}
                            </div>
                          </CollapsibleContent>
                        )}
                      </Collapsible>
                    )
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
