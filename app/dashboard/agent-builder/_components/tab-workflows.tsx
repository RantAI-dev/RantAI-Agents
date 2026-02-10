"use client"

import { useState, useCallback, useEffect } from "react"
import { Plus, Loader2, GitBranch } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useWorkflows, type WorkflowItem } from "@/hooks/use-workflows"
import { useWorkflowRuns } from "@/hooks/use-workflow-runs"
import { useWorkflowEditor } from "@/hooks/use-workflow-editor"
import { WorkflowCanvas } from "./workflow/workflow-canvas"
import { WorkflowToolbar } from "./workflow/workflow-toolbar"
import { NodePalette } from "./workflow/node-palette"
import { PropertiesPanel } from "./workflow/properties-panel"
import { VariablesPanel } from "./workflow/variables-panel"
import { RunHistory } from "./workflow/run-history"
import { RunDetail } from "./workflow/run-detail"
import type { WorkflowNodeData } from "@/lib/workflow/types"
import type { Node, Edge } from "@xyflow/react"

interface TabWorkflowsProps {
  agentId: string | null
  agentName: string
  isNew: boolean
}

export function TabWorkflows({ agentId, agentName, isNew }: TabWorkflowsProps) {
  const {
    workflows,
    isLoading: workflowsLoading,
    createWorkflow,
    updateWorkflow,
    deleteWorkflow,
  } = useWorkflows(agentId)

  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null)

  const selectedWorkflow = workflows.find((w) => w.id === selectedWorkflowId)

  const {
    runs,
    activeRun,
    setActiveRun,
    isLoading: runsLoading,
    fetchRuns,
    executeWorkflow,
    resumeRun,
  } = useWorkflowRuns(selectedWorkflowId)

  const editor = useWorkflowEditor()

  // Load workflow into editor when selected
  useEffect(() => {
    if (selectedWorkflow) {
      editor.loadWorkflow({
        id: selectedWorkflow.id,
        name: selectedWorkflow.name,
        description: selectedWorkflow.description,
        nodes: (selectedWorkflow.nodes || []) as Node<WorkflowNodeData>[],
        edges: (selectedWorkflow.edges || []) as Edge[],
        trigger: (selectedWorkflow.trigger as { type: "manual" | "webhook" | "schedule" | "event" }) || {
          type: "manual",
        },
        variables: (selectedWorkflow.variables as { inputs: []; outputs: [] }) || {
          inputs: [],
          outputs: [],
        },
        status: selectedWorkflow.status,
      })
    } else {
      editor.resetEditor()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWorkflowId])

  // Auto-select first workflow
  useEffect(() => {
    if (!selectedWorkflowId && workflows.length > 0) {
      setSelectedWorkflowId(workflows[0].id)
    }
  }, [workflows, selectedWorkflowId])

  const handleCreate = useCallback(async () => {
    if (!agentId) return
    const workflow = await createWorkflow({
      name: `${agentName} Workflow`,
      assistantId: agentId,
    })
    if (workflow) {
      setSelectedWorkflowId(workflow.id)
    }
  }, [agentId, agentName, createWorkflow])

  const handleSave = useCallback(async () => {
    if (!selectedWorkflowId) return
    editor.setSaving(true)
    try {
      await updateWorkflow(selectedWorkflowId, {
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
  }, [selectedWorkflowId, editor, updateWorkflow])

  const handleRun = useCallback(async () => {
    if (!selectedWorkflowId) return
    editor.setRunning(true)
    try {
      await executeWorkflow({})
      fetchRuns()
    } finally {
      editor.setRunning(false)
    }
  }, [selectedWorkflowId, executeWorkflow, fetchRuns, editor])

  const handleDelete = useCallback(async () => {
    if (!selectedWorkflowId) return
    await deleteWorkflow(selectedWorkflowId)
    setSelectedWorkflowId(null)
  }, [selectedWorkflowId, deleteWorkflow])

  const handleResume = useCallback(
    async (stepId: string, data: unknown) => {
      if (!activeRun) return
      await resumeRun(activeRun.id, stepId, data)
    },
    [activeRun, resumeRun]
  )

  // New agent — can't create workflows yet
  if (isNew) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 p-8">
        <GitBranch className="h-10 w-10 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground text-center">
          Save your agent first to create workflows.
        </p>
      </div>
    )
  }

  // Loading
  if (workflowsLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // No workflow selected — show list / create
  if (!selectedWorkflowId) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
        <GitBranch className="h-10 w-10 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">
          No workflows yet for this agent.
        </p>
        <Button size="sm" onClick={handleCreate}>
          <Plus className="h-4 w-4 mr-1.5" />
          Create Workflow
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Workflow selector bar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b bg-muted/30 shrink-0">
        <Select
          value={selectedWorkflowId}
          onValueChange={setSelectedWorkflowId}
        >
          <SelectTrigger className="h-7 text-xs w-[200px]">
            <SelectValue placeholder="Select workflow" />
          </SelectTrigger>
          <SelectContent>
            {workflows.map((w) => (
              <SelectItem key={w.id} value={w.id} className="text-xs">
                {w.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          value={editor.workflowName}
          onChange={(e) => editor.setWorkflowMeta({ name: e.target.value })}
          className="h-7 text-xs flex-1 max-w-[200px]"
          placeholder="Workflow name"
        />

        <div className="flex-1" />

        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={handleCreate}
        >
          <Plus className="h-3.5 w-3.5 mr-1" />
          New
        </Button>
      </div>

      {/* Toolbar */}
      <WorkflowToolbar
        onSave={handleSave}
        onRun={handleRun}
        onDelete={handleDelete}
      />

      {/* Main canvas area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Node Palette */}
        <NodePalette />

        {/* Canvas */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 relative">
            <WorkflowCanvas />
          </div>

          {/* Variables Panel (always visible, compact) */}
          <VariablesPanel />

          {/* Run History (collapsible) */}
          {editor.showRunHistory && (
            <div className="border-t max-h-[200px] overflow-y-auto">
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
    </div>
  )
}
