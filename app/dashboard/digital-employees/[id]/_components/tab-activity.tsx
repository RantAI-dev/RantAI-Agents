"use client"

import { useState } from "react"
import {
  Zap, Check, X, Shield, Play, Rocket, Square, Loader2, ChevronDown,
} from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { formatDistanceToNow } from "date-fns"
import { toast } from "sonner"
import { useEmployeeActivity } from "@/hooks/use-employee-activity"
import { estimateCostFromTokens, formatCost } from "@/lib/digital-employee/cost"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { OnboardingChecklist } from "./onboarding-checklist"
import { SandboxBanner } from "./sandbox-banner"

interface TabActivityProps {
  employee: {
    id: string
    name: string
    avatar: string | null
    status: string
    lastActiveAt: string | null
    assistant: { model: string }
    deploymentConfig: Record<string, unknown> | null
    sandboxMode?: boolean
  }
  containerRunning: boolean
  pendingApprovals: Array<{
    id: string
    requestType: string
    title: string
    description: string | null
    createdAt: string
  }>
  respondToApproval: (
    approvalId: string,
    response: { status: string }
  ) => Promise<void>
  runs: Array<{
    id: string; status: string; error: string | null; startedAt: string
  }>
  onRunNow: () => void
  onDeploy: () => void
  onActivate: () => void
  onDeactivate: () => void
  containerLoading?: boolean
  onRefresh?: () => void
}

export function TabActivity({
  employee,
  containerRunning,
  pendingApprovals,
  respondToApproval,
  runs,
  onRunNow,
  onDeploy,
  onActivate,
  onDeactivate,
  containerLoading,
  onRefresh,
}: TabActivityProps) {
  const { events, dailySummary, isLoading } = useEmployeeActivity(employee.id)
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set())

  const toggleEvent = (eventId: string) => {
    setExpandedEvents((prev) => {
      const next = new Set(prev)
      if (next.has(eventId)) next.delete(eventId)
      else next.add(eventId)
      return next
    })
  }

  // Derive current status text
  const statusText = (() => {
    if (employee.status === "DRAFT") return "Not deployed"
    if (employee.status === "PAUSED") return "Deactivated"
    if (employee.status === "ARCHIVED") return "Archived"
    if (!containerRunning) return "Offline"
    if (pendingApprovals.length > 0) return "Waiting for approval"
    if (employee.lastActiveAt) {
      const diff = Date.now() - new Date(employee.lastActiveAt).getTime()
      if (diff < 60_000) return "Running task..."
      return `Idle since ${formatDistanceToNow(new Date(employee.lastActiveAt))} ago`
    }
    return "Idle"
  })()

  const isRunning = containerRunning && employee.lastActiveAt &&
    (Date.now() - new Date(employee.lastActiveAt).getTime()) < 60_000

  return (
    <div className="flex-1 overflow-auto p-5 space-y-4">
      {/* ─── Live Status Banner ─── */}
      <div className="rounded-lg border bg-card p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <span className="text-2xl">{employee.avatar || "🤖"}</span>
              <span
                className={cn(
                  "absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-card",
                  isRunning
                    ? "bg-emerald-500 animate-pulse"
                    : containerRunning
                      ? "bg-emerald-500"
                      : employee.status === "PAUSED"
                        ? "bg-amber-500"
                        : "bg-muted-foreground/40"
                )}
              />
            </div>
            <div>
              <p className="text-sm font-medium">{statusText}</p>
              {employee.lastActiveAt && containerRunning && (
                <p className="text-xs text-muted-foreground">
                  Last active {formatDistanceToNow(new Date(employee.lastActiveAt), { addSuffix: true })}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {employee.status === "DRAFT" && (
              <Button size="sm" onClick={onDeploy}>
                <Rocket className="h-3.5 w-3.5 mr-1.5" />
                Deploy
              </Button>
            )}
            {employee.status === "ACTIVE" && (
              <>
                {containerRunning && (
                  <Button size="sm" onClick={onRunNow}>
                    <Zap className="h-3.5 w-3.5 mr-1.5" />
                    Run Now
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={onDeactivate} disabled={containerLoading}>
                  {containerLoading ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <Square className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  Deactivate
                </Button>
              </>
            )}
            {(employee.status === "PAUSED" || employee.status === "SUSPENDED") && (
              <Button size="sm" onClick={onActivate} disabled={containerLoading}>
                {containerLoading ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Play className="h-3.5 w-3.5 mr-1.5" />
                )}
                Activate
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* ─── Sandbox Banner ─── */}
      {employee.sandboxMode && (
        <SandboxBanner employeeId={employee.id} onGoLive={onRefresh} />
      )}

      {/* ─── Onboarding Checklist ─── */}
      {employee.status === "ONBOARDING" && (
        <OnboardingChecklist employeeId={employee.id} />
      )}

      {/* ─── Pending Approvals ─── */}
      {pendingApprovals.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium flex items-center gap-2">
            <Shield className="h-4 w-4 text-amber-500" />
            Pending Approvals ({pendingApprovals.length})
          </h3>
          {pendingApprovals.map((approval) => (
            <div
              key={approval.id}
              className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h4 className="text-sm font-medium">
                    {approval.requestType === "message_send"
                      ? `\u{1F4E8} ${approval.title}`
                      : approval.title}
                  </h4>
                  {approval.description && (
                    <p className="text-xs text-muted-foreground mt-0.5">{approval.description}</p>
                  )}
                  <Badge variant="outline" className="text-[10px] mt-1">{approval.requestType}</Badge>
                </div>
                <span className="text-xs text-muted-foreground shrink-0">
                  {formatDistanceToNow(new Date(approval.createdAt), { addSuffix: true })}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={() =>
                    respondToApproval(approval.id, { status: "APPROVED" })
                      .then(() => toast.success("Approved"))
                      .catch(() => toast.error("Failed"))
                  }
                >
                  <Check className="h-3.5 w-3.5 mr-1" />
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() =>
                    respondToApproval(approval.id, { status: "REJECTED" })
                      .then(() => toast.success("Rejected"))
                      .catch(() => toast.error("Failed"))
                  }
                >
                  <X className="h-3.5 w-3.5 mr-1" />
                  Reject
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ─── Daily Summary ─── */}
      {dailySummary.totalRuns > 0 && (
        <div className="rounded-lg border bg-card p-3">
          <div className="flex items-center gap-4 text-sm">
            <span className="font-medium">Today</span>
            <span className="text-muted-foreground">
              {dailySummary.totalRuns} run{dailySummary.totalRuns !== 1 ? "s" : ""}
            </span>
            <span className="text-emerald-500">{dailySummary.completed} completed</span>
            {dailySummary.failed > 0 && (
              <span className="text-red-500">{dailySummary.failed} failed</span>
            )}
            <span className="text-muted-foreground">
              {dailySummary.totalTokens.toLocaleString()} tokens
            </span>
            <span className="text-muted-foreground ml-auto">
              {formatCost(estimateCostFromTokens(dailySummary.totalTokens, employee.assistant.model))}
            </span>
          </div>
        </div>
      )}

      {/* ─── Recent Outputs ─── */}
      {(() => {
        const completedWithOutput = events
          .filter((e) => e.type === "run_completed" && e.data.output != null)
          .slice(0, 5)
        if (completedWithOutput.length === 0) return null
        return (
          <div>
            <h3 className="text-sm font-medium mb-2">Recent Outputs</h3>
            <div className="space-y-2">
              {completedWithOutput.map((event) => {
                const output = event.data.output
                const text = typeof output === "string" ? output : JSON.stringify(output as object, null, 2)
                const truncated = text.length > 300 ? text.slice(0, 300) + "..." : text
                return (
                  <div key={event.id} className="rounded-lg border bg-card p-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(event.timestamp), { addSuffix: true })}
                      </span>
                      <Badge variant="outline" className="text-[10px]">
                        {event.data.trigger as string}
                      </Badge>
                    </div>
                    <pre className="text-xs text-muted-foreground whitespace-pre-wrap break-words font-mono bg-muted/50 rounded p-2 max-h-32 overflow-auto">
                      {truncated}
                    </pre>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}

      {/* ─── Activity Feed ─── */}
      <div>
        <h3 className="text-sm font-medium mb-2">Activity</h3>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Zap className="h-8 w-8 mb-3 opacity-30" />
            <p className="text-sm">No activity yet</p>
          </div>
        ) : (
          <div className="space-y-1">
            {events.map((event) => {
              const isExpanded = expandedEvents.has(event.id)
              const icon = getEventIcon(event.type)
              const description = getEventDescription(event)
              const detail = getEventDetail(event)

              return (
                <Collapsible
                  key={event.id}
                  open={isExpanded}
                  onOpenChange={() => toggleEvent(event.id)}
                >
                  <CollapsibleTrigger asChild>
                    <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm hover:bg-muted/50 transition-colors text-left">
                      <span className="shrink-0">{icon}</span>
                      <span className="text-xs text-muted-foreground shrink-0 w-16">
                        {formatDistanceToNow(new Date(event.timestamp), { addSuffix: true })}
                      </span>
                      <span className="flex-1 truncate">{description}</span>
                      {detail && (
                        <ChevronDown
                          className={cn(
                            "h-3.5 w-3.5 text-muted-foreground transition-transform shrink-0",
                            isExpanded && "rotate-180"
                          )}
                        />
                      )}
                    </button>
                  </CollapsibleTrigger>
                  {detail && (
                    <CollapsibleContent>
                      <div className="ml-[3.25rem] px-3 pb-2 text-xs text-muted-foreground">
                        {detail}
                      </div>
                    </CollapsibleContent>
                  )}
                </Collapsible>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function getEventIcon(type: string): React.ReactNode {
  switch (type) {
    case "run_started":
      return <Play className="h-3.5 w-3.5 text-blue-500" />
    case "run_completed":
      return <Check className="h-3.5 w-3.5 text-emerald-500" />
    case "run_failed":
      return <X className="h-3.5 w-3.5 text-red-500" />
    case "approval_requested":
      return <Shield className="h-3.5 w-3.5 text-amber-500" />
    case "approval_responded":
      return <Check className="h-3.5 w-3.5 text-blue-500" />
    default:
      return <Zap className="h-3.5 w-3.5 text-muted-foreground" />
  }
}

function getEventDescription(event: { type: string; data: Record<string, unknown> }): string {
  const d = event.data
  switch (event.type) {
    case "run_started":
      return `Run started (${d.trigger})`
    case "run_completed": {
      const ms = d.executionTimeMs as number | null
      const tokens = ((d.promptTokens as number) || 0) + ((d.completionTokens as number) || 0)
      const parts = [`Run completed`]
      if (ms) parts.push(`${(ms / 1000).toFixed(1)}s`)
      if (tokens) parts.push(`${tokens.toLocaleString()} tokens`)
      return parts.join(" · ")
    }
    case "run_failed":
      return `Run failed${d.error ? `: ${d.error}` : ""}`
    case "approval_requested":
      if (d.requestType === "message_send") {
        return `Send ${(d as Record<string, unknown>).type || "message"} to employee: ${d.title}`
      }
      return `Approval requested: ${d.title}`
    case "approval_responded":
      return `Approval ${(d.status as string).toLowerCase()}: ${d.title}`
    default:
      return event.type
  }
}

function getEventDetail(event: { type: string; data: Record<string, unknown> }): string | null {
  const d = event.data
  if (event.type === "run_failed" && d.error) {
    return d.error as string
  }
  if ((event.type === "run_completed" || event.type === "run_failed") && d.output) {
    const output = typeof d.output === "string" ? d.output : JSON.stringify(d.output, null, 2)
    return output.length > 500 ? output.slice(0, 500) + "..." : output
  }
  if (event.type === "approval_requested" && d.description) {
    return d.description as string
  }
  return null
}
