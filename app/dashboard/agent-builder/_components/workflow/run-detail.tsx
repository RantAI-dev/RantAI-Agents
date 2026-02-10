"use client"

import { useState } from "react"
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

  const toggleStep = (stepId: string) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev)
      if (next.has(stepId)) next.delete(stepId)
      else next.add(stepId)
      return next
    })
  }

  const steps = (run.steps || []) as StepLogEntry[]

  return (
    <div className="space-y-1 p-2">
      {/* Run header */}
      <div className="flex items-center gap-2 mb-2">
        <Badge variant="secondary" className="text-[10px]">
          {run.status}
        </Badge>
        {run.error && (
          <span className="text-[10px] text-destructive truncate">
            {run.error}
          </span>
        )}
      </div>

      {/* Steps */}
      {steps.map((step) => {
        const Icon = STEP_STATUS_ICON[step.status] || Clock
        const color = STEP_STATUS_COLOR[step.status] || "text-muted-foreground"
        const expanded = expandedSteps.has(step.stepId)

        return (
          <div
            key={step.stepId}
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
              {step.durationMs > 0 && (
                <span className="text-[10px] text-muted-foreground">
                  {step.durationMs}ms
                </span>
              )}
            </button>

            {expanded && (
              <div className="px-2 pb-2 space-y-1 border-t">
                {step.input !== undefined && (
                  <div>
                    <span className="text-[10px] font-semibold text-muted-foreground">
                      Input:
                    </span>
                    <pre className="text-[10px] bg-background rounded p-1 overflow-auto max-h-24">
                      {JSON.stringify(step.input, null, 2)}
                    </pre>
                  </div>
                )}
                {step.output !== undefined && (
                  <div>
                    <span className="text-[10px] font-semibold text-muted-foreground">
                      Output:
                    </span>
                    <pre className="text-[10px] bg-background rounded p-1 overflow-auto max-h-24">
                      {JSON.stringify(step.output, null, 2)}
                    </pre>
                  </div>
                )}
                {step.error && (
                  <div>
                    <span className="text-[10px] font-semibold text-destructive">
                      Error:
                    </span>
                    <pre className="text-[10px] text-destructive bg-destructive/5 rounded p-1">
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
        <div className="mt-3 p-2 border rounded bg-amber-50 dark:bg-amber-900/10 space-y-2">
          <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
            Workflow is waiting for human input
          </p>
          <Textarea
            value={resumeInput}
            onChange={(e) => setResumeInput(e.target.value)}
            className="text-xs min-h-[60px]"
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
