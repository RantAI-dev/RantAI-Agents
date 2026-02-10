"use client"

import {
  Save,
  Play,
  Undo2,
  Redo2,
  Trash2,
  History,
  Loader2,
} from "lucide-react"
import { useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useWorkflowEditor } from "@/hooks/use-workflow-editor"

interface WorkflowToolbarProps {
  onSave: () => void
  onRun: () => void
  onDelete: () => void
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-muted text-muted-foreground",
  ACTIVE: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  PAUSED: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  ARCHIVED: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
}

export function WorkflowToolbar({ onSave, onRun, onDelete }: WorkflowToolbarProps) {
  const workflowName = useWorkflowEditor((s) => s.workflowName)
  const workflowStatus = useWorkflowEditor((s) => s.workflowStatus)
  const isDirty = useWorkflowEditor((s) => s.isDirty)
  const isSaving = useWorkflowEditor((s) => s.isSaving)
  const isRunning = useWorkflowEditor((s) => s.isRunning)
  const undo = useWorkflowEditor((s) => s.undo)
  const redo = useWorkflowEditor((s) => s.redo)
  const historyIndex = useWorkflowEditor((s) => s.historyIndex)
  const historyLength = useWorkflowEditor((s) => s.history.length)
  const toggleRunHistory = useWorkflowEditor((s) => s.toggleRunHistory)
  const showRunHistory = useWorkflowEditor((s) => s.showRunHistory)
  const nodeExecutionStatus = useWorkflowEditor((s) => s.nodeExecutionStatus)
  const nodes = useWorkflowEditor((s) => s.nodes)

  const executionProgress = useMemo(() => {
    const entries = Object.entries(nodeExecutionStatus)
    if (entries.length === 0) return null
    const completed = entries.filter(([, s]) => s === "success" || s === "failed").length
    const total = entries.length
    const runningEntry = entries.find(([, s]) => s === "running")
    const runningLabel = runningEntry
      ? nodes.find((n) => n.id === runningEntry[0])?.data?.label || "Processing"
      : null
    return { completed, total, runningLabel, percent: Math.round((completed / total) * 100) }
  }, [nodeExecutionStatus, nodes])

  return (
    <div className="relative flex items-center gap-2 px-3 py-1.5 border-b bg-background shrink-0 min-h-10">
      {/* Execution progress bar */}
      {executionProgress && (
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-muted">
          <div
            className="h-full bg-blue-500 transition-all duration-500 ease-out"
            style={{ width: `${executionProgress.percent}%` }}
          />
        </div>
      )}
      {/* Workflow name */}
      <span className="text-sm font-medium truncate max-w-[200px]">
        {workflowName || "Untitled Workflow"}
      </span>

      <Badge variant="secondary" className={STATUS_COLORS[workflowStatus] || ""}>
        {workflowStatus}
      </Badge>

      {/* Step progress counter */}
      {executionProgress && (
        <span className="text-[10px] text-muted-foreground truncate max-w-[250px]">
          Step {executionProgress.completed}/{executionProgress.total}
          {executionProgress.runningLabel && ` — ${executionProgress.runningLabel}`}
        </span>
      )}

      <div className="flex-1" />

      {/* Undo / Redo */}
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={undo}
        disabled={historyIndex <= 0}
        title="Undo"
      >
        <Undo2 className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={redo}
        disabled={historyIndex >= historyLength - 1}
        title="Redo"
      >
        <Redo2 className="h-4 w-4" />
      </Button>

      <div className="w-px h-5 bg-border mx-1" />

      {/* Run History */}
      <Button
        variant={showRunHistory ? "secondary" : "ghost"}
        size="icon"
        className="h-7 w-7"
        onClick={toggleRunHistory}
        title="Run History"
      >
        <History className="h-4 w-4" />
      </Button>

      {/* Run */}
      <Button
        variant="outline"
        size="sm"
        className="h-7 text-xs"
        onClick={onRun}
        disabled={isRunning}
      >
        {isRunning ? (
          <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
        ) : (
          <Play className="h-3.5 w-3.5 mr-1" />
        )}
        Run
      </Button>

      {/* Save */}
      <Button
        size="sm"
        className="h-7 text-xs"
        onClick={onSave}
        disabled={!isDirty || isSaving}
      >
        {isSaving ? (
          <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
        ) : (
          <Save className="h-3.5 w-3.5 mr-1" />
        )}
        Save
      </Button>

      {/* Delete */}
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 text-destructive hover:text-destructive"
        onClick={onDelete}
        title="Delete Workflow"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}
