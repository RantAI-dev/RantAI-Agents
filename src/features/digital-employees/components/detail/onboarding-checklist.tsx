"use client"

import { useState, useEffect, useCallback } from "react"
import { Check, X, Loader2, Rocket } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

interface OnboardingStep {
  status: string
  details: string | null
  updatedAt: string
}

export interface OnboardingStatusData {
  steps: Record<string, OnboardingStep>
  completedCount: number
  totalSteps: number
  startedAt: string
}

interface OnboardingChecklistProps {
  employeeId: string
  onGoLive?: () => void
  initialStatus?: OnboardingStatusData | null
}

const DEFAULT_STEPS = [
  { key: "read_soul", label: "Read behavioral guidelines (SOUL.md)" },
  { key: "read_tools", label: "Review available tools (TOOLS.md)" },
  { key: "test_tool", label: "Test a platform tool" },
  { key: "read_memory", label: "Check long-term memory" },
  { key: "write_memory", label: "Write first memory entry" },
  { key: "complete_task", label: "Complete a sample task" },
]

export function OnboardingChecklist({ employeeId, onGoLive, initialStatus }: OnboardingChecklistProps) {
  const [status, setStatus] = useState<OnboardingStatusData | null>(initialStatus ?? null)

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/dashboard/digital-employees/${employeeId}/files?filename=ONBOARDING_STATUS.json`)
      if (res.ok) {
        const data = await res.json()
        if (data.content) {
          setStatus(JSON.parse(data.content))
        }
      }
    } catch {
      // ignore
    }
  }, [employeeId])

  // Poll for updates every 10s during onboarding
  useEffect(() => {
    const interval = setInterval(fetchStatus, 10000)
    return () => clearInterval(interval)
  }, [fetchStatus])

  const completedCount = status?.completedCount || 0
  const totalSteps = DEFAULT_STEPS.length
  const progress = totalSteps > 0 ? Math.round((completedCount / totalSteps) * 100) : 0
  const allComplete = completedCount >= totalSteps

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium">Onboarding Progress</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {completedCount}/{totalSteps} steps completed ({progress}%)
          </p>
        </div>
        {allComplete && onGoLive && (
          <Button size="sm" onClick={onGoLive}>
            <Rocket className="h-3.5 w-3.5 mr-1.5" />
            Go Live
          </Button>
        )}
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500",
            allComplete ? "bg-emerald-500" : "bg-blue-500"
          )}
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Steps */}
      <div className="space-y-1">
        {DEFAULT_STEPS.map((step) => {
          const stepStatus = status?.steps[step.key]
          const isCompleted = stepStatus?.status === "completed"
          const isFailed = stepStatus?.status === "failed"
          const isInProgress = stepStatus?.status === "in_progress"

          return (
            <div key={step.key} className="flex items-center gap-2 text-sm py-1">
              {isCompleted ? (
                <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
              ) : isFailed ? (
                <X className="h-3.5 w-3.5 text-red-500 shrink-0" />
              ) : isInProgress ? (
                <Loader2 className="h-3.5 w-3.5 text-blue-500 animate-spin shrink-0" />
              ) : (
                <div className="h-3.5 w-3.5 rounded-full border border-muted-foreground/30 shrink-0" />
              )}
              <span className={cn(
                "text-xs",
                isCompleted ? "text-muted-foreground line-through" : "text-foreground"
              )}>
                {step.label}
              </span>
              {stepStatus?.details && (
                <span className="text-[10px] text-muted-foreground ml-auto truncate max-w-[150px]">
                  {stepStatus.details}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
