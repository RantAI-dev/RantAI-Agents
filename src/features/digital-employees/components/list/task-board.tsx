"use client"

import { useState } from "react"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import {
  EnrichedTask,
  TaskStatus,
  TASK_STATUS_CONFIG,
  TASK_STATUS_ORDER,
} from "@/lib/digital-employee/task-types"
import { TaskCard } from "@/features/digital-employees/components/list/task-card"

interface TaskBoardProps {
  tasks: EnrichedTask[]
  onSelectTask: (taskId: string) => void
  onCreateTask: (status: TaskStatus) => void
}

const BOARD_COLUMNS: TaskStatus[] = ["TODO", "IN_PROGRESS", "IN_REVIEW", "DONE"]

export function TaskBoard({ tasks, onSelectTask, onCreateTask }: TaskBoardProps) {
  const [showCancelled, setShowCancelled] = useState(false)

  // Only top-level tasks (no parent_task_id)
  const topLevelTasks = tasks.filter((t) => !t.parent_task_id)

  const columns: TaskStatus[] = showCancelled
    ? [...BOARD_COLUMNS, "CANCELLED"]
    : BOARD_COLUMNS

  function getColumnTasks(status: TaskStatus): EnrichedTask[] {
    return topLevelTasks.filter((t) => t.status === status)
  }

  const cancelledCount = topLevelTasks.filter((t) => t.status === "CANCELLED").length

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      {cancelledCount > 0 && (
        <div className="flex items-center justify-end">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-muted-foreground"
            onClick={() => setShowCancelled((v) => !v)}
          >
            {showCancelled ? "Hide" : "Show"} cancelled ({cancelledCount})
          </Button>
        </div>
      )}

      {/* Board grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        {columns.map((status) => {
          const config = TASK_STATUS_CONFIG[status]
          const columnTasks = getColumnTasks(status)
          const isCancelledCol = status === "CANCELLED"

          return (
            <div
              key={status}
              className={cn(
                "bg-card border rounded-lg flex flex-col min-h-[400px]",
                isCancelledCol && "opacity-70"
              )}
            >
              {/* Column header */}
              <div className="flex items-center justify-between p-3 border-b shrink-0">
                <div className="flex items-center gap-2">
                  <span
                    className={cn("h-2 w-2 rounded-full shrink-0", config.dotClass)}
                  />
                  <span className="text-sm font-medium">{config.label}</span>
                  <Badge
                    variant="secondary"
                    className="text-[10px] px-1.5 py-0 h-4 tabular-nums"
                  >
                    {columnTasks.length}
                  </Badge>
                </div>
                {!isCancelledCol && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 border border-dashed rounded text-muted-foreground hover:text-foreground hover:border-border"
                    onClick={() => onCreateTask(status)}
                    title={`Add task to ${config.label}`}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>

              {/* Column body */}
              <div className="flex-1 p-2 space-y-2 overflow-y-auto scrollbar-thin">
                {columnTasks.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full py-8 text-center">
                    <p className="text-xs text-muted-foreground/50">No tasks</p>
                  </div>
                ) : (
                  columnTasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      onClick={() => onSelectTask(task.id)}
                    />
                  ))
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default TaskBoard
