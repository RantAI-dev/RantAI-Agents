"use client"

import { Zap, Clock } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { formatDistanceToNow } from "date-fns"
import { RUN_STATUS_STYLES } from "@/lib/digital-employee/shared-constants"

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

interface TabRunsProps {
  runs: RunItem[]
  containerRunning: boolean
  employeeStatus: string
  onRunNow: () => void
}

export function TabRuns({ runs, containerRunning, employeeStatus, onRunNow }: TabRunsProps) {
  return (
    <div className="flex-1 overflow-auto p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">Jobs ({runs.length})</h2>
        {employeeStatus === "ACTIVE" && containerRunning && (
          <Button size="sm" onClick={onRunNow}>
            <Zap className="h-3.5 w-3.5 mr-1.5" />
            Run Now
          </Button>
        )}
      </div>
      {runs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Zap className="h-8 w-8 mb-3 opacity-30" />
          <p className="text-sm">No runs yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {runs.map((run) => {
            const runStatus = RUN_STATUS_STYLES[run.status] || RUN_STATUS_STYLES.COMPLETED
            const duration = run.executionTimeMs
              ? `${(run.executionTimeMs / 1000).toFixed(1)}s`
              : "-"
            const tokens = run.promptTokens + run.completionTokens

            return (
              <div
                key={run.id}
                className="rounded-lg border bg-card p-3 flex items-center gap-4 text-sm"
              >
                <Badge
                  variant="secondary"
                  className={cn("text-[10px] px-1.5 py-0.5 shrink-0", runStatus.className)}
                >
                  {runStatus.label}
                </Badge>
                <span className="text-muted-foreground">{run.trigger}</span>
                <span className="text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {duration}
                </span>
                <span className="text-muted-foreground">{tokens.toLocaleString()} tokens</span>
                <span className="text-muted-foreground ml-auto text-xs">
                  {formatDistanceToNow(new Date(run.startedAt), { addSuffix: true })}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
