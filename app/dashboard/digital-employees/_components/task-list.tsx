"use client"

import { useState, useMemo } from "react"
import {
  ChevronDown,
  ChevronRight,
  Circle,
  CheckCircle2,
  Clock,
  MoreHorizontal,
  Plus,
  UserCircle,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  EnrichedTask,
  TaskStatus,
  TaskPriority,
  TASK_STATUS_CONFIG,
  TASK_STATUS_ORDER,
  TASK_PRIORITY_CONFIG,
} from "@/lib/digital-employee/task-types"

interface TaskListProps {
  tasks: EnrichedTask[]
  onSelectTask: (taskId: string) => void
  onCreateTask: (status?: TaskStatus) => void
  groupBy?: "status" | "team" | "assignee" | "priority"
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
      <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-muted text-muted-foreground shrink-0">
        <UserCircle className="h-4 w-4" />
      </span>
    )
  }
  const letter = name.charAt(0).toUpperCase()
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
        "inline-flex items-center justify-center h-5 w-5 rounded-full text-[10px] font-semibold relative shrink-0",
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

function StatusIcon({ status }: { status: TaskStatus }) {
  if (status === "DONE") {
    return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
  }
  if (status === "CANCELLED") {
    return <Circle className="h-3.5 w-3.5 text-destructive shrink-0" />
  }
  const cfg = TASK_STATUS_CONFIG[status]
  return <Circle className={cn("h-3.5 w-3.5 shrink-0", cfg.color)} />
}

const PRIORITY_BADGE_CLASS: Record<TaskPriority, string> = {
  HIGH: "bg-red-500/10 text-red-500",
  MEDIUM: "bg-amber-500/10 text-amber-500",
  LOW: "bg-blue-500/10 text-blue-500",
}

// ─── Group logic ───────────────────────────────────────────────────────────────

interface Group {
  key: string
  label: string
  dotClass?: string
  color?: string
  tasks: EnrichedTask[]
  status?: TaskStatus
}

function groupTasks(
  tasks: EnrichedTask[],
  groupBy: "status" | "team" | "assignee" | "priority",
  subtaskMap: Map<string, EnrichedTask[]>
): Group[] {
  // For list view, show top-level tasks only
  const topLevel = tasks.filter((t) => !t.parent_task_id)

  if (groupBy === "status") {
    return TASK_STATUS_ORDER.filter((s) => s !== "CANCELLED" || topLevel.some((t) => t.status === s))
      .map((status) => ({
        key: status,
        label: TASK_STATUS_CONFIG[status].label.toUpperCase(),
        dotClass: TASK_STATUS_CONFIG[status].dotClass,
        color: TASK_STATUS_CONFIG[status].color,
        status,
        tasks: topLevel.filter((t) => t.status === status),
      }))
      .filter((g) => g.tasks.length > 0)
  }

  if (groupBy === "team") {
    const teamMap = new Map<string, EnrichedTask[]>()
    for (const t of topLevel) {
      const key = t.group_name ?? "No Team"
      if (!teamMap.has(key)) teamMap.set(key, [])
      teamMap.get(key)!.push(t)
    }
    return Array.from(teamMap.entries()).map(([key, tasks]) => ({
      key,
      label: key.toUpperCase(),
      tasks,
    }))
  }

  if (groupBy === "assignee") {
    const assigneeMap = new Map<string, EnrichedTask[]>()
    for (const t of topLevel) {
      const key = t.assignee_name ?? "Unassigned"
      if (!assigneeMap.has(key)) assigneeMap.set(key, [])
      assigneeMap.get(key)!.push(t)
    }
    return Array.from(assigneeMap.entries()).map(([key, tasks]) => ({
      key,
      label: key.toUpperCase(),
      tasks,
    }))
  }

  if (groupBy === "priority") {
    const order: TaskPriority[] = ["HIGH", "MEDIUM", "LOW"]
    return order.map((p) => ({
      key: p,
      label: TASK_PRIORITY_CONFIG[p].label.toUpperCase(),
      tasks: topLevel.filter((t) => t.priority === p),
    })).filter((g) => g.tasks.length > 0)
  }

  return []
}

// ─── Main Component ────────────────────────────────────────────────────────────

export function TaskList({
  tasks,
  onSelectTask,
  onCreateTask,
  groupBy = "status",
}: TaskListProps) {
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set())
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())

  // Build a subtask map: parent_id → subtasks[]
  const subtaskMap = useMemo(() => {
    const map = new Map<string, EnrichedTask[]>()
    for (const t of tasks) {
      if (t.parent_task_id) {
        if (!map.has(t.parent_task_id)) map.set(t.parent_task_id, [])
        map.get(t.parent_task_id)!.push(t)
      }
    }
    return map
  }, [tasks])

  const groups = useMemo(
    () => groupTasks(tasks, groupBy, subtaskMap),
    [tasks, groupBy, subtaskMap]
  )

  function toggleTask(id: string) {
    setExpandedTasks((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleGroup(key: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <div className="border rounded-lg overflow-hidden bg-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/5">
            <th
              className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-3.5 py-2.5"
              style={{ width: "38%" }}
            >
              Name
            </th>
            <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-3.5 py-2.5">
              Assignee
            </th>
            <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-3.5 py-2.5">
              Team
            </th>
            <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-3.5 py-2.5">
              Due Date
            </th>
            <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-3.5 py-2.5">
              Priority
            </th>
            <th className="px-3.5 py-2.5" style={{ width: 28 }} />
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => {
            const isCollapsed = collapsedGroups.has(group.key)
            return (
              <>
                {/* Group header row */}
                <tr
                  key={`group-${group.key}`}
                  className="border-b bg-muted/5 cursor-pointer hover:bg-muted/10 transition-colors"
                  onClick={() => toggleGroup(group.key)}
                >
                  <td colSpan={6} className="px-3.5 py-2">
                    <div className="flex items-center gap-2">
                      {isCollapsed ? (
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      )}
                      {group.dotClass && (
                        <span className={cn("h-2 w-2 rounded-full shrink-0", group.dotClass)} />
                      )}
                      <span className="text-xs font-semibold text-muted-foreground">
                        {group.label}
                      </span>
                      <Badge
                        variant="secondary"
                        className="text-[10px] px-1.5 py-0 h-4 tabular-nums"
                      >
                        {group.tasks.length}
                      </Badge>
                    </div>
                  </td>
                </tr>

                {!isCollapsed && (
                  <>
                    {group.tasks.map((task) => {
                      const isDone = task.status === "DONE"
                      const subtasks = subtaskMap.get(task.id) ?? []
                      const hasSubtasks = subtasks.length > 0
                      const isExpanded = expandedTasks.has(task.id)
                      const overdue = isOverdue(task.due_date)

                      return (
                        <>
                          {/* Task row */}
                          <tr
                            key={`task-${task.id}`}
                            className={cn(
                              "border-b hover:bg-muted/5 cursor-pointer transition-colors",
                              isDone && "opacity-50"
                            )}
                            onClick={() => onSelectTask(task.id)}
                          >
                            {/* Name */}
                            <td className="px-3.5 py-2.5" style={{ width: "38%" }}>
                              <div className="flex items-center gap-1.5">
                                {/* Subtask toggle */}
                                {hasSubtasks ? (
                                  <button
                                    className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      toggleTask(task.id)
                                    }}
                                  >
                                    {isExpanded ? (
                                      <ChevronDown className="h-3.5 w-3.5" />
                                    ) : (
                                      <ChevronRight className="h-3.5 w-3.5" />
                                    )}
                                  </button>
                                ) : (
                                  <span className="w-3.5 shrink-0" />
                                )}

                                <StatusIcon status={task.status} />

                                <span
                                  className={cn(
                                    "text-sm truncate",
                                    isDone && "line-through text-muted-foreground"
                                  )}
                                >
                                  {task.title}
                                </span>

                                {/* Subtask count chip */}
                                {hasSubtasks && (
                                  <span className="shrink-0 text-[10px] text-muted-foreground bg-muted px-1.5 py-0 rounded-full">
                                    {task.subtask_done_count ?? 0}/{task.subtask_count}
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* Assignee */}
                            <td className="px-3.5 py-2.5">
                              <div className="flex items-center gap-1.5">
                                <AvatarCircle
                                  name={task.assignee_name}
                                  online={task.assignee_online}
                                />
                                <span className="text-xs text-muted-foreground truncate max-w-[100px]">
                                  {task.assignee_name ?? "—"}
                                </span>
                              </div>
                            </td>

                            {/* Team */}
                            <td className="px-3.5 py-2.5">
                              {task.group_name ? (
                                <Badge
                                  variant="secondary"
                                  className="text-[10px] px-1.5 py-0.5 bg-secondary text-secondary-foreground"
                                >
                                  {task.group_name}
                                </Badge>
                              ) : (
                                <span className="text-xs text-muted-foreground/50">—</span>
                              )}
                            </td>

                            {/* Due date */}
                            <td className="px-3.5 py-2.5">
                              {task.due_date ? (
                                <span
                                  className={cn(
                                    "flex items-center gap-1 text-xs",
                                    overdue ? "text-red-500" : "text-muted-foreground"
                                  )}
                                >
                                  <Clock className="h-3 w-3" />
                                  {formatDate(task.due_date)}
                                </span>
                              ) : (
                                <span className="text-xs text-muted-foreground/50">—</span>
                              )}
                            </td>

                            {/* Priority */}
                            <td className="px-3.5 py-2.5">
                              <Badge
                                variant="secondary"
                                className={cn(
                                  "text-[10px] px-1.5 py-0.5",
                                  PRIORITY_BADGE_CLASS[task.priority]
                                )}
                              >
                                {TASK_PRIORITY_CONFIG[task.priority].label}
                              </Badge>
                            </td>

                            {/* Menu */}
                            <td className="px-3.5 py-2.5" style={{ width: 28 }}>
                              <button
                                className="text-muted-foreground hover:text-foreground transition-colors"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </button>
                            </td>
                          </tr>

                          {/* Subtask rows (expanded) */}
                          {isExpanded &&
                            subtasks.map((sub) => {
                              const subDone = sub.status === "DONE"
                              const subOverdue = isOverdue(sub.due_date)
                              return (
                                <tr
                                  key={`sub-${sub.id}`}
                                  className={cn(
                                    "border-b hover:bg-muted/5 cursor-pointer transition-colors",
                                    subDone && "opacity-50"
                                  )}
                                  onClick={() => onSelectTask(sub.id)}
                                >
                                  {/* Name (indented) */}
                                  <td className="pl-9 pr-3.5 py-2" style={{ width: "38%" }}>
                                    <div className="flex items-center gap-1.5">
                                      <span className="w-3.5 shrink-0" />
                                      <StatusIcon status={sub.status} />
                                      <span
                                        className={cn(
                                          "text-xs truncate",
                                          subDone && "line-through text-muted-foreground"
                                        )}
                                      >
                                        {sub.title}
                                      </span>
                                    </div>
                                  </td>

                                  {/* Assignee */}
                                  <td className="px-3.5 py-2">
                                    <div className="flex items-center gap-1.5">
                                      <AvatarCircle
                                        name={sub.assignee_name}
                                        online={sub.assignee_online}
                                      />
                                      <span className="text-xs text-muted-foreground truncate max-w-[100px]">
                                        {sub.assignee_name ?? "—"}
                                      </span>
                                    </div>
                                  </td>

                                  {/* Team */}
                                  <td className="px-3.5 py-2">
                                    {sub.group_name ? (
                                      <Badge
                                        variant="secondary"
                                        className="text-[10px] px-1.5 py-0.5"
                                      >
                                        {sub.group_name}
                                      </Badge>
                                    ) : (
                                      <span className="text-xs text-muted-foreground/50">—</span>
                                    )}
                                  </td>

                                  {/* Due date */}
                                  <td className="px-3.5 py-2">
                                    {sub.due_date ? (
                                      <span
                                        className={cn(
                                          "flex items-center gap-1 text-xs",
                                          subOverdue ? "text-red-500" : "text-muted-foreground"
                                        )}
                                      >
                                        <Clock className="h-3 w-3" />
                                        {formatDate(sub.due_date)}
                                      </span>
                                    ) : (
                                      <span className="text-xs text-muted-foreground/50">—</span>
                                    )}
                                  </td>

                                  {/* Priority */}
                                  <td className="px-3.5 py-2">
                                    <Badge
                                      variant="secondary"
                                      className={cn(
                                        "text-[10px] px-1.5 py-0.5",
                                        PRIORITY_BADGE_CLASS[sub.priority]
                                      )}
                                    >
                                      {TASK_PRIORITY_CONFIG[sub.priority].label}
                                    </Badge>
                                  </td>

                                  {/* Menu */}
                                  <td className="px-3.5 py-2" style={{ width: 28 }}>
                                    <button
                                      className="text-muted-foreground hover:text-foreground transition-colors"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <MoreHorizontal className="h-4 w-4" />
                                    </button>
                                  </td>
                                </tr>
                              )
                            })}
                        </>
                      )
                    })}

                    {/* Add task row */}
                    <tr className="border-b">
                      <td colSpan={6} className="px-3.5 py-1.5">
                        <button
                          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                          onClick={() => onCreateTask(group.status as TaskStatus | undefined)}
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Add Task
                        </button>
                      </td>
                    </tr>
                  </>
                )}
              </>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default TaskList
