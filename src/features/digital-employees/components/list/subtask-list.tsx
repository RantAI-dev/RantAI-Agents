"use client"

import { useState } from "react"
import {
  Check,
  Eye,
  Plus,
  CheckCircle2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import type { Task } from "@/lib/digital-employee/task-types"

interface SubtaskListProps {
  subtasks: Task[]
  onAddSubtask: (input: { title: string; assignee_id?: string }) => Promise<void>
  onReviewSubtask: (subtaskId: string, action: "approve" | "changes" | "reject") => Promise<void>
  isStale?: boolean
}

function SubtaskCheckbox({ status }: { status: Task["status"] }) {
  const base =
    "flex-shrink-0 flex items-center justify-center rounded-md border transition-colors"
  const size = "w-[18px] h-[18px]"

  if (status === "DONE") {
    return (
      <div className={cn(base, size, "bg-emerald-500 border-emerald-500 text-white")}>
        <Check className="w-3 h-3" strokeWidth={3} />
      </div>
    )
  }
  if (status === "IN_REVIEW") {
    return (
      <div className={cn(base, size, "bg-violet-500 border-violet-500 text-white")}>
        <Eye className="w-3 h-3" strokeWidth={2.5} />
      </div>
    )
  }
  if (status === "IN_PROGRESS") {
    return <div className={cn(base, size, "border-blue-500")} />
  }
  return <div className={cn(base, size, "border-border")} />
}

function ReviewTag({ task }: { task: Task }) {
  if (!task.human_review) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded bg-muted/10 text-muted-foreground italic">
        No review
      </span>
    )
  }

  if (task.status === "DONE" && task.review_status === "APPROVED") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-500">
        <Check className="w-2.5 h-2.5" strokeWidth={2.5} />
        Approved
      </span>
    )
  }

  if (task.status === "IN_REVIEW") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-500">
        <Eye className="w-2.5 h-2.5" strokeWidth={2.5} />
        Awaiting review
      </span>
    )
  }

  // human_review true but not yet in review state
  return (
    <span className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-500 opacity-50">
      <Eye className="w-2.5 h-2.5" strokeWidth={2.5} />
      Review required
    </span>
  )
}

export function SubtaskList({
  subtasks,
  onAddSubtask,
  onReviewSubtask,
  isStale,
}: SubtaskListProps) {
  const [addingSubtask, setAddingSubtask] = useState(false)
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [reviewingId, setReviewingId] = useState<string | null>(null)

  const doneCount = subtasks.filter((s) => s.status === "DONE").length
  const totalCount = subtasks.length
  const progress = totalCount > 0 ? (doneCount / totalCount) * 100 : 0

  async function handleAddSubtask() {
    const title = newSubtaskTitle.trim()
    if (!title || isSubmitting) return
    setIsSubmitting(true)
    try {
      await onAddSubtask({ title })
      setNewSubtaskTitle("")
      setAddingSubtask(false)
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleReview(
    subtaskId: string,
    action: "approve" | "changes" | "reject"
  ) {
    if (reviewingId) return
    setReviewingId(subtaskId)
    try {
      await onReviewSubtask(subtaskId, action)
    } finally {
      setReviewingId(null)
    }
  }

  return (
    <div className="px-5 pb-2">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-foreground">
          Subtasks
        </span>
        {totalCount > 0 && (
          <span className="text-xs text-muted-foreground">
            {doneCount} of {totalCount} done
          </span>
        )}
      </div>

      {/* Progress bar */}
      {totalCount > 0 && (
        <div className="h-1 bg-border rounded-full mb-3 overflow-hidden">
          <div
            className="h-full bg-emerald-500 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {/* Subtask rows */}
      <div className="space-y-0.5">
        {subtasks.map((subtask) => {
          const needsReview =
            subtask.status === "IN_REVIEW" && subtask.human_review
          const isReviewing = reviewingId === subtask.id

          return (
            <div
              key={subtask.id}
              className={cn(
                "flex items-start gap-2.5 p-2.5 rounded-lg hover:bg-muted/5 cursor-pointer border transition-colors",
                needsReview
                  ? "border-violet-500/15 bg-violet-500/[0.02]"
                  : "border-transparent"
              )}
            >
              <div className="pt-0.5">
                <SubtaskCheckbox status={subtask.status} />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={cn(
                      "text-sm leading-snug",
                      subtask.status === "DONE"
                        ? "line-through text-muted-foreground"
                        : "text-foreground"
                    )}
                  >
                    {subtask.title}
                  </span>
                  <ReviewTag task={subtask} />
                </div>

                {subtask.assignee_id && (
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Assigned to {subtask.assignee_id}
                  </p>
                )}

                {/* Inline review buttons */}
                {needsReview && !isStale && (
                  <div className="flex items-center gap-1.5 mt-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={!!isReviewing}
                      onClick={(e) => {
                        e.stopPropagation()
                        handleReview(subtask.id, "approve")
                      }}
                      className="h-6 px-2 text-[11px] rounded bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500 hover:text-white transition-colors"
                    >
                      <Check className="w-3 h-3 mr-1" />
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={!!isReviewing}
                      onClick={(e) => {
                        e.stopPropagation()
                        handleReview(subtask.id, "changes")
                      }}
                      className="h-6 px-2 text-[11px] rounded bg-amber-500/10 text-amber-500 hover:bg-amber-500 hover:text-white transition-colors"
                    >
                      Changes
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={!!isReviewing}
                      onClick={(e) => {
                        e.stopPropagation()
                        handleReview(subtask.id, "reject")
                      }}
                      className="h-6 px-2 text-[11px] rounded bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition-colors"
                    >
                      Reject
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Add subtask row / inline input */}
      {addingSubtask ? (
        <div className="flex items-center gap-2 mt-1 px-2.5">
          <div className="w-[18px] flex-shrink-0" />
          <Input
            autoFocus
            placeholder="Subtask title…"
            value={newSubtaskTitle}
            onChange={(e) => setNewSubtaskTitle(e.target.value)}
            disabled={isSubmitting || isStale}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAddSubtask()
              if (e.key === "Escape") {
                setAddingSubtask(false)
                setNewSubtaskTitle("")
              }
            }}
            className="h-7 text-sm"
          />
          <Button
            size="sm"
            disabled={!newSubtaskTitle.trim() || isSubmitting || isStale}
            onClick={handleAddSubtask}
            className="h-7 px-2"
          >
            Add
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setAddingSubtask(false)
              setNewSubtaskTitle("")
            }}
            className="h-7 px-2"
          >
            Cancel
          </Button>
        </div>
      ) : (
        <button
          disabled={isStale}
          onClick={() => !isStale && setAddingSubtask(true)}
          className={cn(
            "flex items-center gap-2 w-full px-2.5 py-2 rounded-lg text-sm text-muted-foreground transition-colors mt-0.5",
            isStale
              ? "opacity-50 cursor-not-allowed"
              : "hover:text-primary hover:bg-muted/5 cursor-pointer"
          )}
        >
          <Plus className="w-3.5 h-3.5" />
          Add subtask
        </button>
      )}
    </div>
  )
}
