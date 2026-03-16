"use client"

import { useState } from "react"
import { Eye, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { Task } from "@/lib/digital-employee/task-types"

interface TaskReviewBarProps {
  task: Task
  onReview: (action: "approve" | "changes" | "reject", comment?: string) => Promise<void>
  isStale?: boolean
}

export function TaskReviewBar({ task, onReview, isStale }: TaskReviewBarProps) {
  const [isSubmitting, setIsSubmitting] = useState<string | null>(null)

  const isActive = task.status === "IN_REVIEW"

  async function handleReview(action: "approve" | "changes" | "reject") {
    if (isSubmitting || isStale) return
    setIsSubmitting(action)
    try {
      await onReview(action)
    } finally {
      setIsSubmitting(null)
    }
  }

  if (!isActive) {
    return (
      <div className="border border-dashed rounded-lg p-3 mx-5 mb-4 flex items-center gap-2.5 text-muted-foreground">
        <Eye className="w-4 h-4 flex-shrink-0 opacity-50" />
        <p className="text-xs">
          Task-level review will activate when all subtasks are done
        </p>
      </div>
    )
  }

  const assigneeLabel = task.assignee_id
    ? task.assignee_id
    : "The assignee"

  return (
    <div className="bg-violet-500/[0.04] border border-violet-500/15 rounded-lg p-3 mx-5 mb-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Eye className="w-4 h-4 text-violet-500 flex-shrink-0" />
          <p className="text-xs text-foreground leading-snug">
            <span className="font-medium">{assigneeLabel}</span> completed this task and is awaiting your review
          </p>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          <Button
            size="sm"
            variant="ghost"
            disabled={!!isSubmitting || isStale}
            onClick={() => handleReview("approve")}
            className={cn(
              "h-7 px-2.5 text-xs rounded transition-colors",
              "bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500 hover:text-white"
            )}
          >
            <Check className="w-3 h-3 mr-1" />
            Approve
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={!!isSubmitting || isStale}
            onClick={() => handleReview("changes")}
            className={cn(
              "h-7 px-2.5 text-xs rounded transition-colors",
              "bg-amber-500/10 text-amber-500 hover:bg-amber-500 hover:text-white"
            )}
          >
            Changes
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={!!isSubmitting || isStale}
            onClick={() => handleReview("reject")}
            className={cn(
              "h-7 px-2.5 text-xs rounded transition-colors",
              "bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white"
            )}
          >
            Reject
          </Button>
        </div>
      </div>

      {task.review_comment && (
        <p className="mt-2 text-xs text-muted-foreground pl-6 border-l border-violet-500/20 ml-1">
          {task.review_comment}
        </p>
      )}
    </div>
  )
}
