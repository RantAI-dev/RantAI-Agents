"use client"

import { useState } from "react"
import { Zap, Plus, Loader2, Trash2 } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { useEmployeeGoals } from "@/hooks/use-employee-goals"
import { GoalEditorDialog } from "./goal-editor-dialog"
import { toast } from "sonner"

interface GoalTrackerProps {
  employeeId: string
}

const STATUS_COLORS: Record<string, string> = {
  on_track: "bg-emerald-500",
  completed: "bg-emerald-500",
  exceeded: "bg-blue-500",
  behind: "bg-amber-500",
}

const PERIOD_LABELS: Record<string, string> = {
  daily: "Today",
  weekly: "This week",
  monthly: "This month",
  total: "All time",
}

export function GoalTracker({ employeeId }: GoalTrackerProps) {
  const { goals, isLoading, createGoal, deleteGoal } = useEmployeeGoals(employeeId)
  const [createOpen, setCreateOpen] = useState(false)

  if (isLoading) {
    return (
      <div className="rounded-lg border bg-card p-4 flex items-center justify-center">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (goals.length === 0) return null

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Zap className="h-4 w-4" />
          Goals
        </div>
        <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setCreateOpen(true)}>
          <Plus className="h-3 w-3 mr-1" />
          Add
        </Button>
      </div>

      <div className="space-y-2">
        {goals.map((goal) => {
          const barColor = STATUS_COLORS[goal.status as string] || "bg-muted"
          const progressPct = Math.min(goal.progress, 100)

          return (
            <div key={goal.id} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium truncate">{goal.name}</span>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    {PERIOD_LABELS[goal.period] || goal.period}
                  </Badge>
                  <span className="text-muted-foreground">
                    {goal.currentValue}/{goal.target} {goal.unit}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className={cn("h-full rounded-full transition-all", barColor)}
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                <span className={cn("text-[10px] font-medium w-8 text-right",
                  goal.progress >= 100 ? "text-emerald-500" : goal.progress >= 60 ? "text-foreground" : "text-amber-500"
                )}>
                  {Math.round(goal.progress)}%
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-5 w-5 p-0 text-muted-foreground hover:text-red-500"
                  onClick={async () => {
                    try { await deleteGoal(goal.id); toast.success("Goal removed") } catch { toast.error("Failed") }
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          )
        })}
      </div>

      <GoalEditorDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreate={async (input) => {
          try {
            await createGoal(input)
            toast.success("Goal created")
            setCreateOpen(false)
          } catch {
            toast.error("Failed to create goal")
          }
        }}
      />
    </div>
  )
}
