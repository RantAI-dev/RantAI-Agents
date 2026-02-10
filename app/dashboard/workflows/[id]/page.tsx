"use client"

import { useState, useCallback, useEffect, useRef, use } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { ArrowLeft, Loader2, GitBranch } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useWorkflows } from "@/hooks/use-workflows"
import { useWorkflowRuns } from "@/hooks/use-workflow-runs"
import { useWorkflowEditor } from "@/hooks/use-workflow-editor"
import { WorkflowCanvas } from "@/app/dashboard/agent-builder/_components/workflow/workflow-canvas"
import { WorkflowToolbar } from "@/app/dashboard/agent-builder/_components/workflow/workflow-toolbar"
import { NodePalette } from "@/app/dashboard/agent-builder/_components/workflow/node-palette"
import { PropertiesPanel } from "@/app/dashboard/agent-builder/_components/workflow/properties-panel"
import { VariablesPanel } from "@/app/dashboard/agent-builder/_components/workflow/variables-panel"
import { RunHistory } from "@/app/dashboard/agent-builder/_components/workflow/run-history"
import { RunDetail } from "@/app/dashboard/agent-builder/_components/workflow/run-detail"
import { Input } from "@/components/ui/input"
import type { WorkflowNodeData, StepLogEntry } from "@/lib/workflow/types"
import type { Node, Edge } from "@xyflow/react"

export default function WorkflowEditorPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()

  const {
    workflows,
    isLoading: workflowsLoading,
    updateWorkflow,
    deleteWorkflow,
  } = useWorkflows()

  const workflow = workflows.find((w) => w.id === id)

  const {
    runs,
    activeRun,
    setActiveRun,
    isLoading: runsLoading,
    fetchRuns,
    executeWorkflow,
    resumeRun,
  } = useWorkflowRuns(id)

  const editor = useWorkflowEditor()
  const [runDialogOpen, setRunDialogOpen] = useState(false)
  const [runInputJson, setRunInputJson] = useState("{}")
  const prevRunStatusRef = useRef<string | null>(null)

  // Sync node execution status from activeRun steps
  useEffect(() => {
    if (!activeRun?.steps) {
      editor.clearNodeExecutionStatus()
      return
    }
    const steps = activeRun.steps as StepLogEntry[]
    const statusMap: Record<string, "pending" | "running" | "success" | "failed" | "suspended"> = {}
    for (const step of steps) {
      statusMap[step.nodeId] = step.status
    }
    editor.setNodeExecutionStatus(statusMap)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRun?.steps])

  // Toast on run status transitions
  useEffect(() => {
    const currentStatus = activeRun?.status ?? null
    const prevStatus = prevRunStatusRef.current
    prevRunStatusRef.current = currentStatus

    if (!prevStatus || !currentStatus || prevStatus === currentStatus) return

    if (currentStatus === "COMPLETED") {
      toast.success("Workflow completed successfully")
      editor.setRunning(false)
    } else if (currentStatus === "FAILED") {
      toast.error("Workflow execution failed")
      editor.setRunning(false)
    } else if (currentStatus === "PAUSED") {
      toast.info("Workflow paused — waiting for human input")
      editor.setRunning(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRun?.status])

  // Load workflow into editor
  useEffect(() => {
    if (workflow) {
      editor.loadWorkflow({
        id: workflow.id,
        name: workflow.name,
        description: workflow.description,
        nodes: (workflow.nodes || []) as Node<WorkflowNodeData>[],
        edges: (workflow.edges || []) as Edge[],
        trigger: (workflow.trigger as { type: "manual" | "webhook" | "schedule" | "event" }) || {
          type: "manual",
        },
        variables: (workflow.variables as { inputs: []; outputs: [] }) || {
          inputs: [],
          outputs: [],
        },
        status: workflow.status,
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, workflowsLoading])

  const handleSave = useCallback(async () => {
    editor.setSaving(true)
    try {
      await updateWorkflow(id, {
        name: editor.workflowName,
        description: editor.workflowDescription || null,
        nodes: editor.nodes as unknown as unknown[],
        edges: editor.edges as unknown as unknown[],
        trigger: editor.trigger as unknown as { type: string },
        variables: editor.variables as unknown as {
          inputs: unknown[]
          outputs: unknown[]
        },
      })
      editor.setDirty(false)
    } finally {
      editor.setSaving(false)
    }
  }, [id, editor, updateWorkflow])

  const handleRunClick = useCallback(() => {
    const inputs = editor.variables?.inputs || []
    if (inputs.length > 0) {
      // Build a template from defined input variables
      const template: Record<string, unknown> = {}
      for (const v of inputs) {
        if (v.defaultValue !== undefined) {
          template[v.name] = v.defaultValue
        } else if (v.type === "string") {
          template[v.name] = ""
        } else if (v.type === "number") {
          template[v.name] = 0
        } else if (v.type === "boolean") {
          template[v.name] = false
        } else if (v.type === "object") {
          template[v.name] = {}
        } else if (v.type === "array") {
          template[v.name] = []
        } else {
          template[v.name] = null
        }
      }
      setRunInputJson(JSON.stringify(template, null, 2))
    } else {
      setRunInputJson("{}")
    }
    setRunDialogOpen(true)
  }, [editor.variables])

  const handleRunExecute = useCallback(async () => {
    let input: unknown = {}
    try {
      input = JSON.parse(runInputJson)
    } catch {
      return // invalid JSON, don't execute
    }
    setRunDialogOpen(false)
    editor.setRunning(true)
    editor.setShowRunHistory(true)
    try {
      await executeWorkflow(input)
      fetchRuns()
    } catch {
      editor.setRunning(false)
    }
  }, [runInputJson, executeWorkflow, fetchRuns, editor])

  const handleDelete = useCallback(async () => {
    await deleteWorkflow(id)
    router.push("/dashboard/workflows")
  }, [id, deleteWorkflow, router])

  const handleResume = useCallback(
    async (stepId: string, data: unknown) => {
      if (!activeRun) return
      await resumeRun(activeRun.id, stepId, data)
    },
    [activeRun, resumeRun]
  )

  // Loading
  if (workflowsLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // Not found
  if (!workflow) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <GitBranch className="h-10 w-10 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">Workflow not found</p>
        <Button variant="outline" onClick={() => router.push("/dashboard/workflows")}>
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          Back to Workflows
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex items-center gap-3 min-h-14 border-b bg-background pl-12 pr-3 py-2 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={() => router.push("/dashboard/workflows")}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>

        <GitBranch className="h-4 w-4 text-muted-foreground shrink-0" />

        <Input
          value={editor.workflowName}
          onChange={(e) => editor.setWorkflowMeta({ name: e.target.value })}
          className="h-7 text-sm font-medium border-none shadow-none focus-visible:ring-0 max-w-[300px] px-1"
          placeholder="Workflow name"
        />

        <div className="flex-1" />

        {/* Toolbar actions inline */}
        <WorkflowToolbar
          onSave={handleSave}
          onRun={handleRunClick}
          onDelete={handleDelete}
        />
      </div>

      {/* Main canvas area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Node Palette */}
        <NodePalette />

        {/* Canvas + bottom panels */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 relative">
            <WorkflowCanvas />
          </div>

          {/* Variables Panel */}
          <VariablesPanel />

          {/* Run History (collapsible) */}
          {editor.showRunHistory && (
            <div className="border-t max-h-[250px] overflow-y-auto">
              <div className="px-3 py-1.5 border-b bg-muted/30">
                <span className="text-xs font-semibold">Run History</span>
              </div>
              {activeRun ? (
                <RunDetail run={activeRun} onResume={handleResume} />
              ) : (
                <RunHistory
                  runs={runs}
                  activeRunId={null}
                  onSelectRun={(run) => setActiveRun(run)}
                  isLoading={runsLoading}
                />
              )}
              {activeRun && (
                <div className="px-3 py-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[10px]"
                    onClick={() => setActiveRun(null)}
                  >
                    Back to list
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Properties Panel */}
        <PropertiesPanel />
      </div>

      {/* Run Input Dialog */}
      <Dialog open={runDialogOpen} onOpenChange={setRunDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Run Workflow</DialogTitle>
            <DialogDescription>
              {(editor.variables?.inputs?.length ?? 0) > 0
                ? `Provide input for: ${editor.variables.inputs.map((v) => v.name).join(", ")}`
                : "Provide JSON input for this workflow execution."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="run-input">Input JSON</Label>
            <Textarea
              id="run-input"
              value={runInputJson}
              onChange={(e) => setRunInputJson(e.target.value)}
              className="font-mono text-xs min-h-[200px]"
              placeholder='{ "key": "value" }'
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  handleRunExecute()
                }
              }}
            />
            {(() => {
              try {
                JSON.parse(runInputJson)
                return null
              } catch {
                return (
                  <p className="text-xs text-destructive">Invalid JSON</p>
                )
              }
            })()}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRunDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleRunExecute}
              disabled={(() => {
                try {
                  JSON.parse(runInputJson)
                  return false
                } catch {
                  return true
                }
              })()}
            >
              Run
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
