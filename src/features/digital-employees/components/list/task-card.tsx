"use client"

import { Eye, Clock, UserCircle, CloudOff, CheckCircle2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import {
  EnrichedTask,
  TASK_STATUS_CONFIG,
  TASK_PRIORITY_CONFIG,
} from "@/lib/digital-employee/task-types"

interface TaskCardProps {
  task: EnrichedTask
  onClick?: () => void
}

function isOverdue(dateStr: string | null | undefined): boolean {
  if (!dateStr) return false
  return new Date(dateStr) < new Date()
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

function AvatarCircle({ name, online }: { name?: string; online?: boolean }) {
  if (!name) {
    return (
      <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-muted text-muted-foreground">
        <UserCircle className="h-4 w-4" />
      </span>
    )
  }
  const letter = name.charAt(0).toUpperCase()
  // Pick a deterministic color from the name
  const colors = [
    "bg-blue-500/20 text-blue-600",
    "bg-violet-500/20 text-violet-600",
    "bg-emerald-500/20 text-emerald-600",
    "bg-amber-500/20 text-amber-600",
    "bg-rose-500/20 text-rose-600",
    "bg-cyan-500/20 text-cyan-600",
  ]
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  const color = colors[Math.abs(hash) % colors.length]

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center h-5 w-5 rounded-full text-[10px] font-semibold relative",
        color
      )}
    >
      {letter}
      {online && (
        <span className="absolute -bottom-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-emerald-500 border border-background" />
      )}
    </span>
  )
}

export function TaskCard({ task, onClick }: TaskCardProps) {
  const isDone = task.status === "DONE"
  const statusCfg = TASK_STATUS_CONFIG[task.status]
  const priorityCfg = TASK_PRIORITY_CONFIG[task.priority]

  // Priority badge colors
  const priorityBadgeClass =
    task.priority === "HIGH"
      ? "bg-red-500/10 text-red-500"
      : task.priority === "MEDIUM"
        ? "bg-amber-500/10 text-amber-500"
        : "bg-blue-500/10 text-blue-500"

  // Left border accent
  const leftBorderClass =
    task.status === "IN_PROGRESS"
      ? "border-l-2 border-l-blue-500"
      : task.status === "IN_REVIEW"
        ? "border-l-2 border-l-violet-500"
        : ""

  // Creator label
  let creatorLabel: string | null = null
  if (task.created_by_user_id) {
    creatorLabel = "assigned by human"
  } else if (task.created_by_employee_id) {
    // We don't have the name here; just use a generic label
    creatorLabel = "created by agent"
  }

  const hasSubtasks = (task.subtask_count ?? 0) > 0
  const subtaskDone = task.subtask_done_count ?? 0
  const subtaskTotal = task.subtask_count ?? 0
  const subtaskPct = subtaskTotal > 0 ? (subtaskDone / subtaskTotal) * 100 : 0

  const overdue = isOverdue(task.due_date)

  return (
    <div
      className={cn(
        "bg-background border rounded-lg p-3 cursor-pointer hover:border-border/80 transition-all hover:-translate-y-0.5",
        leftBorderClass,
        isDone && "opacity-70"
      )}
      onClick={onClick}
    >
      {/* Priority badge + stale indicator */}
      <div className="flex items-center gap-1.5 mb-1.5">
        <Badge
          variant="secondary"
          className={cn("text-[10px] px-1.5 py-0 font-medium", priorityBadgeClass)}
        >
          {priorityCfg.label}
        </Badge>
        {task.is_stale && (
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground ml-auto">
            <CloudOff className="h-3 w-3" />
            Offline
          </span>
        )}
      </div>

      {/* Title */}
      <p
        className={cn(
          "text-sm font-medium text-foreground leading-snug mb-1.5",
          isDone && "line-through text-muted-foreground"
        )}
      >
        {task.title}
      </p>

      {/* Creator tag */}
      {creatorLabel && (
        <p className="text-[10px] text-muted-foreground/60 mb-1.5">{creatorLabel}</p>
      )}

      {/* Subtask progress */}
      {hasSubtasks && (
        <div className="mb-2 space-y-1">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" />
              {subtaskDone}/{subtaskTotal} done
            </span>
          </div>
          <div className="bg-border h-0.5 rounded-full overflow-hidden">
            <div
              className="bg-emerald-500 h-full rounded-full transition-all"
              style={{ width: `${subtaskPct}%` }}
            />
          </div>
        </div>
      )}

      {/* Review indicator */}
      {task.human_review && (
        <div className="mb-2">
          <Badge
            variant="secondary"
            className="bg-violet-500/10 text-violet-500 text-[10px] px-1.5 py-0.5 flex items-center gap-1 w-fit"
          >
            <Eye className="h-3 w-3" />
            {task.review_status === "PENDING" && task.reviewer_id
              ? `Reviewing: ${task.reviewer_id.slice(0, 8)}`
              : "Needs human review"}
          </Badge>
        </div>
      )}

      {/* Footer */}
      <div className="border-t pt-2 mt-2 flex items-center justify-between gap-2">
        {/* Assignee */}
        <div className="flex items-center gap-1.5 min-w-0">
          <AvatarCircle name={task.assignee_name} online={task.assignee_online} />
          <span className="text-[10px] text-muted-foreground truncate">
            {task.assignee_name ?? "Unassigned"}
          </span>
        </div>

        {/* Due date */}
        {task.due_date && (
          <span
            className={cn(
              "flex items-center gap-1 text-[10px] shrink-0",
              overdue ? "text-red-500" : "text-muted-foreground"
            )}
          >
            <Clock className="h-3 w-3" />
            {formatDate(task.due_date)}
          </span>
        )}
      </div>
    </div>
  )
}

export default TaskCard
