"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import {
  X,
  Link2,
  MoreHorizontal,
  FileText,
  ArrowRight,
  UserPlus,
  Eye,
  MessageSquare,
  CheckCircle2,
  Send,
  Loader2,
  AlertCircle,
  ChevronDown,
  Calendar,
  User,
  Users,
  Flag,
} from "lucide-react"
import { formatDistanceToNow, isPast, parseISO } from "date-fns"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { useTaskDetail } from "@/hooks/use-task-detail"
import { SubtaskList } from "./subtask-list"
import { TaskReviewBar } from "./task-review-bar"
import type {
  Task,
  TaskComment,
  TaskEvent,
  TaskStatus,
  TaskPriority,
} from "@/lib/digital-employee/task-types"
import {
  TASK_STATUS_CONFIG,
  TASK_STATUS_ORDER,
  TASK_PRIORITY_CONFIG,
} from "@/lib/digital-employee/task-types"

// ─── Types ────────────────────────────────────────────────────────────────────

interface TaskDetailPanelProps {
  taskId: string | null
  open: boolean
  onClose: () => void
  onTaskUpdated?: () => void
}

// ─── Activity Timeline ────────────────────────────────────────────────────────

type TimelineItem =
  | { kind: "event"; item: TaskEvent }
  | { kind: "comment"; item: TaskComment }

function getEventIcon(eventType: string) {
  switch (eventType) {
    case "CREATED":
      return FileText
    case "STATUS_CHANGED":
      return ArrowRight
    case "ASSIGNED":
      return UserPlus
    case "REVIEW_SUBMITTED":
    case "REVIEW_RESPONDED":
      return Eye
    case "COMMENT":
      return MessageSquare
    case "SUBTASK_COMPLETED":
      return CheckCircle2
    default:
      return FileText
  }
}

function getEventDotClass(eventType: string): string {
  switch (eventType) {
    case "CREATED":
      return "bg-muted-foreground/40 text-muted-foreground"
    case "STATUS_CHANGED":
      return "bg-blue-500/20 text-blue-500"
    case "REVIEW_SUBMITTED":
    case "REVIEW_RESPONDED":
      return "bg-violet-500/20 text-violet-500"
    case "COMMENT":
      return "bg-primary/20 text-primary"
    case "SUBTASK_COMPLETED":
      return "bg-emerald-500/20 text-emerald-500"
    default:
      return "bg-muted-foreground/20 text-muted-foreground"
  }
}

function describeEvent(event: TaskEvent): string {
  const data = event.data as Record<string, unknown>
  switch (event.event_type) {
    case "CREATED":
      return "Task created"
    case "STATUS_CHANGED": {
      const from = data.from as string | undefined
      const to = data.to as string | undefined
      if (from && to) {
        const fromLabel = TASK_STATUS_CONFIG[from as TaskStatus]?.label ?? from
        const toLabel = TASK_STATUS_CONFIG[to as TaskStatus]?.label ?? to
        return `Status changed from ${fromLabel} to ${toLabel}`
      }
      return "Status changed"
    }
    case "ASSIGNED":
      return `Assigned to ${(data.assignee_id as string | undefined) ?? "someone"}`
    case "REVIEW_SUBMITTED":
      return "Review requested"
    case "REVIEW_RESPONDED": {
      const action = data.action as string | undefined
      if (action === "approve") return "Review approved"
      if (action === "changes") return "Changes requested"
      if (action === "reject") return "Rejected"
      return "Review responded"
    }
    case "SUBTASK_COMPLETED":
      return `Subtask completed: ${(data.subtask_title as string | undefined) ?? ""}`
    default:
      return event.event_type
  }
}

function ActivityTimeline({
  events,
  comments,
}: {
  events: TaskEvent[]
  comments: TaskComment[]
}) {
  const items: TimelineItem[] = [
    ...events.map((e) => ({ kind: "event" as const, item: e })),
    ...comments.map((c) => ({ kind: "comment" as const, item: c })),
  ].sort(
    (a, b) =>
      new Date(a.item.created_at).getTime() -
      new Date(b.item.created_at).getTime()
  )

  if (items.length === 0) {
    return (
      <p className="text-xs text-muted-foreground px-5 py-3">
        No activity yet.
      </p>
    )
  }

  return (
    <div className="px-5 pb-4">
      {items.map((entry, idx) => {
        const isLast = idx === items.length - 1

        if (entry.kind === "comment") {
          const comment = entry.item
          return (
            <div key={comment.id} className="relative flex gap-3">
              {/* Line connector */}
              {!isLast && (
                <div className="absolute left-[11px] top-8 bottom-0 w-px bg-border" />
              )}
              {/* Dot */}
              <div
                className={cn(
                  "w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center mt-1 z-10",
                  "bg-primary/20 text-primary"
                )}
              >
                <MessageSquare className="w-3 h-3" />
              </div>
              {/* Content */}
              <div className="flex-1 pb-4">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-medium text-foreground">
                    {comment.author_type === "HUMAN"
                      ? comment.author_user_id ?? "User"
                      : comment.author_employee_id ?? "Employee"}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {formatDistanceToNow(new Date(comment.created_at), {
                      addSuffix: true,
                    })}
                  </span>
                </div>
                <div className="text-sm text-foreground bg-muted/10 border rounded-md px-3 py-2">
                  {comment.content}
                </div>
              </div>
            </div>
          )
        }

        const event = entry.item
        const Icon = getEventIcon(event.event_type)
        const dotClass = getEventDotClass(event.event_type)

        return (
          <div key={event.id} className="relative flex gap-3">
            {!isLast && (
              <div className="absolute left-[11px] top-8 bottom-0 w-px bg-border" />
            )}
            <div
              className={cn(
                "w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center mt-1 z-10",
                dotClass
              )}
            >
              <Icon className="w-3 h-3" />
            </div>
            <div className="flex-1 pb-4 flex items-center gap-2">
              <p className="text-xs text-foreground">{describeEvent(event)}</p>
              <span className="text-[11px] text-muted-foreground ml-auto flex-shrink-0">
                {formatDistanceToNow(new Date(event.created_at), {
                  addSuffix: true,
                })}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Properties Grid ──────────────────────────────────────────────────────────

function PropertyRow({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="grid grid-cols-[110px_1fr] items-center py-2 border-b border-border/50 last:border-b-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="text-sm">{children}</div>
    </div>
  )
}

function PropertiesGrid({ task }: { task: Task }) {
  const priorityCfg = TASK_PRIORITY_CONFIG[task.priority]

  const isOverdue =
    task.due_date && !["DONE", "CANCELLED"].includes(task.status)
      ? isPast(parseISO(task.due_date))
      : false

  return (
    <div className="px-5 py-4">
      <PropertyRow label="Assignee">
        {task.assignee_id ? (
          <div className="flex items-center gap-2">
            <div className="relative">
              <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[10px] font-medium">
                {task.assignee_id.slice(0, 2).toUpperCase()}
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 border border-background" />
            </div>
            <span className="text-sm text-foreground truncate">
              {task.assignee_id}
            </span>
          </div>
        ) : (
          <span className="text-muted-foreground text-sm">Unassigned</span>
        )}
      </PropertyRow>

      <PropertyRow label="Team">
        {task.group_id ? (
          <Badge
            variant="outline"
            className="text-xs bg-blue-500/10 text-blue-500 border-blue-500/20"
          >
            {task.group_id}
          </Badge>
        ) : (
          <span className="text-muted-foreground text-sm">None</span>
        )}
      </PropertyRow>

      <PropertyRow label="Priority">
        <span className={cn("text-sm font-medium", priorityCfg.color)}>
          {priorityCfg.label}
        </span>
      </PropertyRow>

      <PropertyRow label="Due date">
        {task.due_date ? (
          <span
            className={cn(
              "text-sm",
              isOverdue ? "text-red-500 font-medium" : "text-foreground"
            )}
          >
            {new Date(task.due_date).toLocaleDateString()}
            {isOverdue && (
              <span className="ml-1 text-xs">(overdue)</span>
            )}
          </span>
        ) : (
          <span className="text-muted-foreground text-sm">None</span>
        )}
      </PropertyRow>

      <PropertyRow label="Reviewer">
        {task.human_review ? (
          <span className="text-sm text-violet-500 font-medium">
            Human review required
          </span>
        ) : task.reviewer_id ? (
          <span className="text-sm text-foreground">{task.reviewer_id}</span>
        ) : (
          <span className="text-muted-foreground text-sm">None</span>
        )}
      </PropertyRow>

      <PropertyRow label="Created by">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-[9px] font-medium flex-shrink-0">
            {(task.created_by_user_id ?? task.created_by_employee_id ?? "?")
              .slice(0, 2)
              .toUpperCase()}
          </div>
          <span className="text-sm text-foreground truncate">
            {task.created_by_user_id ?? task.created_by_employee_id ?? "Unknown"}
          </span>
          <span className="text-[11px] text-muted-foreground flex-shrink-0">
            {formatDistanceToNow(new Date(task.created_at), {
              addSuffix: true,
            })}
          </span>
        </div>
      </PropertyRow>
    </div>
  )
}

// ─── Loading Skeleton ─────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b bg-card flex items-center gap-3">
        <div className="w-7 h-7 rounded-md bg-muted animate-pulse" />
        <div className="h-4 w-24 rounded bg-muted animate-pulse" />
      </div>
      <div className="flex-1 p-5 space-y-4">
        <div className="h-5 w-20 rounded bg-muted animate-pulse" />
        <div className="h-7 w-3/4 rounded bg-muted animate-pulse" />
        <div className="space-y-2 mt-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-4 rounded bg-muted/60 animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Main Panel ───────────────────────────────────────────────────────────────

export function TaskDetailPanel({
  taskId,
  open,
  onClose,
  onTaskUpdated,
}: TaskDetailPanelProps) {
  const {
    task,
    subtasks,
    comments,
    events,
    isLoading,
    error,
    updateTask,
    submitReview,
    addComment,
    addSubtask,
    submitSubtaskReview,
  } = useTaskDetail(taskId)

  // Editable title
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState("")
  const titleRef = useRef<HTMLInputElement>(null)

  // Editable description
  const [editingDesc, setEditingDesc] = useState(false)
  const [descDraft, setDescDraft] = useState("")

  // Comment
  const [commentText, setCommentText] = useState("")
  const [isSendingComment, setIsSendingComment] = useState(false)

  // Reset drafts when task changes
  useEffect(() => {
    if (task) {
      setTitleDraft(task.title)
      setDescDraft(task.description ?? "")
    }
  }, [task?.id])

  const isStale = !task || isLoading

  const handleTitleBlur = useCallback(async () => {
    setEditingTitle(false)
    if (!task || titleDraft.trim() === task.title || !titleDraft.trim()) return
    try {
      await updateTask({ title: titleDraft.trim() })
      onTaskUpdated?.()
    } catch {
      setTitleDraft(task.title)
    }
  }, [task, titleDraft, updateTask, onTaskUpdated])

  const handleDescBlur = useCallback(async () => {
    setEditingDesc(false)
    if (!task || descDraft === (task.description ?? "")) return
    try {
      await updateTask({ description: descDraft })
      onTaskUpdated?.()
    } catch {
      setDescDraft(task.description ?? "")
    }
  }, [task, descDraft, updateTask, onTaskUpdated])

  const handleStatusChange = useCallback(
    async (status: TaskStatus) => {
      if (!task) return
      try {
        await updateTask({ status })
        onTaskUpdated?.()
      } catch {}
    },
    [task, updateTask, onTaskUpdated]
  )

  const handleReview = useCallback(
    async (action: "approve" | "changes" | "reject", comment?: string) => {
      try {
        await submitReview({ action, comment })
        onTaskUpdated?.()
      } catch {}
    },
    [submitReview, onTaskUpdated]
  )

  const handleSubtaskReview = useCallback(
    async (subtaskId: string, action: "approve" | "changes" | "reject") => {
      try {
        await submitSubtaskReview(subtaskId, { action })
        onTaskUpdated?.()
      } catch {}
    },
    [submitSubtaskReview, onTaskUpdated]
  )

  const handleAddSubtask = useCallback(
    async (input: { title: string; assignee_id?: string }) => {
      await addSubtask(input)
      onTaskUpdated?.()
    },
    [addSubtask, onTaskUpdated]
  )

  const handleSendComment = useCallback(async () => {
    const text = commentText.trim()
    if (!text || isSendingComment) return
    setIsSendingComment(true)
    try {
      await addComment({ content: text, author_type: "HUMAN" })
      setCommentText("")
    } finally {
      setIsSendingComment(false)
    }
  }, [commentText, isSendingComment, addComment])

  const handleCopyLink = useCallback(() => {
    if (taskId) {
      const url = `${window.location.origin}/dashboard/digital-employees?task=${taskId}`
      navigator.clipboard.writeText(url).catch(() => {})
    }
  }, [taskId])

  const statusCfg = task ? TASK_STATUS_CONFIG[task.status] : null

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        className={cn(
          "max-w-[640px] w-full p-0 flex flex-col gap-0 overflow-hidden",
          // Override default close button — we render our own
          "[&>button:last-child]:hidden"
        )}
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-card flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <Button
              variant="ghost"
              size="icon"
              className="w-7 h-7"
              onClick={onClose}
            >
              <X className="w-4 h-4" />
            </Button>
            {task && (
              <span className="font-mono text-xs text-muted-foreground">
                TASK-{task.id.slice(0, 8).toUpperCase()}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="w-7 h-7"
              onClick={handleCopyLink}
              title="Copy link"
            >
              <Link2 className="w-3.5 h-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="w-7 h-7">
              <MoreHorizontal className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* ── Body ── */}
        {!taskId || (isLoading && !task) ? (
          <LoadingSkeleton />
        ) : error ? (
          <div className="flex flex-col items-center justify-center flex-1 gap-3 p-8 text-center">
            <AlertCircle className="w-8 h-8 text-destructive/60" />
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button variant="outline" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
        ) : task ? (
          <div className="flex flex-col flex-1 overflow-hidden">
            <div className="flex-1 overflow-y-auto scrollbar-thin">
              {/* Status + Title */}
              <div className="p-5 pb-0">
                <div className="mb-3">
                  <Select
                    value={task.status}
                    onValueChange={(v) => handleStatusChange(v as TaskStatus)}
                    disabled={isStale}
                  >
                    <SelectTrigger
                      size="sm"
                      className={cn(
                        "w-fit h-7 text-xs border-transparent bg-transparent hover:bg-muted/30 px-2 gap-1.5",
                        statusCfg?.color
                      )}
                    >
                      <span
                        className={cn(
                          "w-2 h-2 rounded-full flex-shrink-0",
                          statusCfg?.dotClass
                        )}
                      />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TASK_STATUS_ORDER.map((s) => {
                        const cfg = TASK_STATUS_CONFIG[s]
                        return (
                          <SelectItem key={s} value={s} className="text-sm">
                            <span className="flex items-center gap-2">
                              <span
                                className={cn(
                                  "w-2 h-2 rounded-full",
                                  cfg.dotClass
                                )}
                              />
                              {cfg.label}
                            </span>
                          </SelectItem>
                        )
                      })}
                    </SelectContent>
                  </Select>
                </div>

                {editingTitle ? (
                  <Input
                    ref={titleRef}
                    value={titleDraft}
                    onChange={(e) => setTitleDraft(e.target.value)}
                    onBlur={handleTitleBlur}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") titleRef.current?.blur()
                      if (e.key === "Escape") {
                        setTitleDraft(task.title)
                        setEditingTitle(false)
                      }
                    }}
                    className="text-xl font-bold border-0 border-b rounded-none shadow-none px-0 focus-visible:ring-0 focus-visible:border-primary"
                    autoFocus
                  />
                ) : (
                  <h2
                    className="text-xl font-bold text-foreground cursor-text hover:bg-muted/10 rounded px-1 -mx-1 py-0.5 transition-colors"
                    onClick={() => {
                      setEditingTitle(true)
                      setTitleDraft(task.title)
                    }}
                  >
                    {task.title}
                  </h2>
                )}
              </div>

              {/* Properties */}
              <PropertiesGrid task={task} />

              {/* Divider */}
              <div className="h-px bg-border mx-5" />

              {/* Description */}
              <div className="px-5 py-4">
                <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
                  Description
                </p>
                {editingDesc ? (
                  <Textarea
                    value={descDraft}
                    onChange={(e) => setDescDraft(e.target.value)}
                    onBlur={handleDescBlur}
                    placeholder="Add a description…"
                    className="text-sm min-h-[80px] resize-none"
                    autoFocus
                  />
                ) : (
                  <div
                    className={cn(
                      "text-sm rounded px-2 py-1.5 -mx-2 cursor-text hover:bg-muted/10 transition-colors min-h-[40px]",
                      task.description
                        ? "text-foreground"
                        : "text-muted-foreground italic"
                    )}
                    onClick={() => {
                      setEditingDesc(true)
                      setDescDraft(task.description ?? "")
                    }}
                  >
                    {task.description || "Add a description…"}
                  </div>
                )}
              </div>

              {/* Divider */}
              <div className="h-px bg-border mx-5" />

              {/* Subtasks */}
              <div className="py-4">
                <SubtaskList
                  subtasks={subtasks}
                  onAddSubtask={handleAddSubtask}
                  onReviewSubtask={handleSubtaskReview}
                  isStale={isStale}
                />
              </div>

              {/* Review bar */}
              <TaskReviewBar
                task={task}
                onReview={handleReview}
                isStale={isStale}
              />

              {/* Activity */}
              <div className="px-5 pt-2 pb-1">
                <p className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wide">
                  Activity
                </p>
              </div>
              <ActivityTimeline events={events} comments={comments} />
            </div>

            {/* ── Comment Box (sticky bottom) ── */}
            <div className="flex-shrink-0 border-t bg-card px-4 py-3 flex items-end gap-2.5">
              <div className="flex-1">
                <Input
                  placeholder="Add a comment…"
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  disabled={isSendingComment || isStale}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault()
                      handleSendComment()
                    }
                  }}
                  className="text-sm"
                />
              </div>
              <Button
                size="icon"
                disabled={!commentText.trim() || isSendingComment || isStale}
                onClick={handleSendComment}
                className="w-9 h-9 flex-shrink-0"
              >
                {isSendingComment ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </Button>
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
