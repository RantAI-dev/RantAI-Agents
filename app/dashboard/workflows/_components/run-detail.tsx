"use client"

import { useState, useEffect, useRef } from "react"
import {
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  Pause,
  ChevronDown,
  ChevronRight,
  Send,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { WorkflowRunItem } from "@/hooks/use-workflow-runs"
import type { StepLogEntry } from "@/lib/workflow/types"

const STEP_STATUS_ICON: Record<string, typeof CheckCircle2> = {
  success: CheckCircle2,
  failed: XCircle,
  running: Loader2,
  pending: Clock,
  suspended: Pause,
}

const STEP_STATUS_COLOR: Record<string, string> = {
  success: "text-emerald-500",
  failed: "text-destructive",
  running: "text-blue-500",
  pending: "text-muted-foreground",
  suspended: "text-amber-500",
}

interface RunDetailProps {
  run: WorkflowRunItem
  onResume?: (stepId: string, data: unknown) => void
}

export function RunDetail({ run, onResume }: RunDetailProps) {
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set())
  const [resumeInput, setResumeInput] = useState("")
  const activeStepRef = useRef<HTMLDivElement>(null)

  const toggleStep = (stepId: string) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev)
      if (next.has(stepId)) next.delete(stepId)
      else next.add(stepId)
      return next
    })
  }

  const steps = (run.steps || []) as StepLogEntry[]

  // Auto-expand running step or last completed step
  useEffect(() => {
    if (steps.length === 0) return
    const runningStep = steps.find((s) => s.status === "running")
    const targetStep = runningStep || steps[steps.length - 1]
    if (targetStep) {
      setExpandedSteps((prev) => {
        const next = new Set(prev)
        next.add(targetStep.stepId)
        return next
      })
    }
  }, [steps.length, steps.map((s) => `${s.stepId}:${s.status}`).join(",")])

  // Auto-scroll to running step
  useEffect(() => {
    if (activeStepRef.current) {
      activeStepRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" })
    }
  }, [steps.find((s) => s.status === "running")?.stepId])

  return (
    <div className="space-y-1.5 p-3">
      {/* Run header */}
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <Badge variant="secondary" className="text-[10px] py-0.5">
          {run.status}
        </Badge>
        {(() => {
          const totalDuration = steps.reduce((sum, s) => sum + (s.durationMs || 0), 0)
          const totalTokens = steps.reduce((sum, s) => sum + (s.tokenUsage?.totalTokens || 0), 0)
          return (
            <>
              {totalDuration > 0 && (
                <span className="text-[10px] text-muted-foreground">
                  {totalDuration >= 1000 ? `${(totalDuration / 1000).toFixed(1)}s` : `${totalDuration}ms`}
                </span>
              )}
              {totalTokens > 0 && (
                <span className="text-[10px] text-muted-foreground">
                  {totalTokens.toLocaleString()} tokens
                </span>
              )}
            </>
          )
        })()}
        {run.error && (
          <span className="text-[10px] text-destructive truncate" title={run.error}>
            {run.error}
          </span>
        )}
      </div>

      {/* Steps */}
      {steps.map((step) => {
        const Icon = STEP_STATUS_ICON[step.status] || Clock
        const color = STEP_STATUS_COLOR[step.status] || "text-muted-foreground"
        const expanded = expandedSteps.has(step.stepId)

        const isRunningStep = step.status === "running"

        return (
          <div
            key={step.stepId}
            ref={isRunningStep ? activeStepRef : undefined}
            className="border rounded bg-muted/30"
          >
            <button
              onClick={() => toggleStep(step.stepId)}
              className="flex items-center gap-2 w-full px-2 py-1.5 text-left"
            >
              {expanded ? (
                <ChevronDown className="h-3 w-3 shrink-0" />
              ) : (
                <ChevronRight className="h-3 w-3 shrink-0" />
              )}
              <Icon
                className={cn(
                  "h-3.5 w-3.5 shrink-0",
                  color,
                  step.status === "running" && "animate-spin"
                )}
              />
              <span className="text-xs font-medium flex-1 truncate">
                {step.label}
              </span>
              {step.tokenUsage && (
                <span className="text-[10px] text-muted-foreground/70" title={`${step.tokenUsage.promptTokens} prompt + ${step.tokenUsage.completionTokens} completion`}>
                  {step.tokenUsage.totalTokens}tok
                </span>
              )}
              {step.durationMs > 0 && (
                <span className="text-[10px] text-muted-foreground">
                  {step.durationMs >= 1000 ? `${(step.durationMs / 1000).toFixed(1)}s` : `${step.durationMs}ms`}
                </span>
              )}
            </button>

            {expanded && (
              <div className="px-2.5 pb-2.5 pt-1.5 space-y-1.5 border-t">
                {step.input !== undefined && (
                  <div>
                    <span className="text-xs font-semibold text-muted-foreground">
                      Input
                    </span>
                    <pre className="text-[10px] font-mono bg-background rounded p-2 overflow-auto max-h-28 mt-0.5">
                      {JSON.stringify(step.input, null, 2)}
                    </pre>
                  </div>
                )}
                {step.tokenUsage && (
                  <div className="flex gap-3 text-[10px]">
                    <span className="text-muted-foreground">
                      Prompt: <span className="font-medium text-foreground">{step.tokenUsage.promptTokens.toLocaleString()}</span>
                    </span>
                    <span className="text-muted-foreground">
                      Completion: <span className="font-medium text-foreground">{step.tokenUsage.completionTokens.toLocaleString()}</span>
                    </span>
                    <span className="text-muted-foreground">
                      Total: <span className="font-medium text-foreground">{step.tokenUsage.totalTokens.toLocaleString()}</span>
                    </span>
                  </div>
                )}
                {step.output !== undefined && (
                  <div>
                    <span className="text-xs font-semibold text-muted-foreground">
                      Output
                    </span>
                    <pre className="text-[10px] font-mono bg-background rounded p-2 overflow-auto max-h-28 mt-0.5">
                      {JSON.stringify(step.output, null, 2)}
                    </pre>
                  </div>
                )}
                {step.error && (
                  <div>
                    <span className="text-xs font-semibold text-destructive">
                      Error
                    </span>
                    <pre className="text-[10px] font-mono text-destructive bg-destructive/5 rounded p-2 mt-0.5">
                      {step.error}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}

      {/* Resume form for PAUSED runs */}
      {run.status === "PAUSED" && onResume && (
        <div className="mt-3 p-3 border rounded bg-amber-50 dark:bg-amber-900/20 space-y-2">
          <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
            Workflow is waiting for human input
          </p>
          <Textarea
            value={resumeInput}
            onChange={(e) => setResumeInput(e.target.value)}
            className="text-xs min-h-[80px]"
            placeholder="Enter your response..."
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                const suspendedStep = steps.find(
                  (s) => s.status === "suspended"
                )
                if (suspendedStep) {
                  onResume(suspendedStep.stepId, { response: resumeInput })
                  setResumeInput("")
                }
              }}
            >
              <Send className="h-3 w-3 mr-1" />
              Submit
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                const suspendedStep = steps.find(
                  (s) => s.status === "suspended"
                )
                if (suspendedStep) {
                  onResume(suspendedStep.stepId, { approved: true })
                }
              }}
            >
              Approve
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs text-destructive"
              onClick={() => {
                const suspendedStep = steps.find(
                  (s) => s.status === "suspended"
                )
                if (suspendedStep) {
                  onResume(suspendedStep.stepId, { approved: false })
                }
              }}
            >
              Reject
            </Button>
          </div>
        </div>
      )}

      {/* Output for completed runs */}
      {run.status === "COMPLETED" && run.output != null && (
        <div className="mt-2">
          <span className="text-[10px] font-semibold text-muted-foreground">
            Final Output:
          </span>
          <pre className="text-[10px] bg-muted/50 rounded p-2 overflow-auto max-h-32">
            {JSON.stringify(run.output, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}
