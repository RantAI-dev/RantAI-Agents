"use client"

import { formatDistanceToNow } from "date-fns"
import {
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  Pause,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { WorkflowRunItem } from "@/hooks/use-workflow-runs"

const STATUS_CONFIG: Record<
  string,
  { icon: typeof CheckCircle2; color: string; label: string }
> = {
  COMPLETED: { icon: CheckCircle2, color: "text-emerald-500", label: "Completed" },
  FAILED: { icon: XCircle, color: "text-destructive", label: "Failed" },
  RUNNING: { icon: Loader2, color: "text-blue-500", label: "Running" },
  PENDING: { icon: Clock, color: "text-muted-foreground", label: "Pending" },
  PAUSED: { icon: Pause, color: "text-amber-500", label: "Paused" },
}

interface RunHistoryProps {
  runs: WorkflowRunItem[]
  activeRunId: string | null
  onSelectRun: (run: WorkflowRunItem) => void
  isLoading: boolean
}

export function RunHistory({
  runs,
  activeRunId,
  onSelectRun,
  isLoading,
}: RunHistoryProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (runs.length === 0) {
    return (
      <div className="text-center py-6">
        <p className="text-xs text-muted-foreground">No runs yet. Click Run to execute the workflow.</p>
      </div>
    )
  }

  return (
    <div className="divide-y">
      {runs.map((run) => {
        const config = STATUS_CONFIG[run.status] || STATUS_CONFIG.PENDING
        const Icon = config.icon
        const isActive = run.id === activeRunId

        return (
          <button
            key={run.id}
            onClick={() => onSelectRun(run)}
            className={cn(
              "flex items-center gap-2.5 w-full px-3 py-2 text-left hover:bg-muted/50 transition-colors",
              isActive && "bg-muted"
            )}
          >
            <Icon
              className={cn(
                "h-4 w-4 shrink-0",
                config.color,
                run.status === "RUNNING" && "animate-spin"
              )}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium truncate">
                  {run.id.slice(0, 8)}
                </span>
                <Badge variant="secondary" className="text-[10px] h-4 px-1">
                  {config.label}
                </Badge>
              </div>
              <p className="text-[10px] text-muted-foreground">
                {formatDistanceToNow(new Date(run.startedAt), { addSuffix: true })}
                {run.completedAt &&
                  ` (${Math.round(
                    (new Date(run.completedAt).getTime() -
                      new Date(run.startedAt).getTime()) /
                      1000
                  )}s)`}
              </p>
            </div>
          </button>
        )
      })}
    </div>
  )
}
