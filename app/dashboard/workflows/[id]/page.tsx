"use client"

import { useState, useCallback, useEffect, useRef, use } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { ArrowLeft, Loader2, GitBranch, Monitor } from "lucide-react"
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
import { useWorkflowExecution } from "@/hooks/use-workflow-execution"
import { WorkflowCanvas } from "../_components/workflow-canvas"
import { WorkflowToolbar } from "../_components/workflow-toolbar"
import { NodePalette } from "../_components/node-palette"
import { PropertiesPanel } from "../_components/properties-panel"
import { VariablesPanel } from "../_components/variables-panel"
import { RunHistory } from "../_components/run-history"
import { RunDetail } from "../_components/run-detail"
import { KeyboardShortcutsDialog } from "../_components/keyboard-shortcuts-dialog"
import { QuickAddDialog } from "../_components/quick-add-dialog"
import { ChatTestPanel } from "../_components/chat-test-panel"
import { OnboardingOverlay } from "../_components/onboarding-overlay"
import { Input } from "@/components/ui/input"
import type { WorkflowNodeData, StepLogEntry } from "@/lib/workflow/types"
import type { Node, Edge } from "@xyflow/react"
import { importWorkflow } from "@/lib/workflow/import-export"
import { autoLayout } from "@/lib/workflow/auto-layout"
import { validateWorkflow } from "@/lib/workflow/validate"

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

  // Real-time execution visualization via Socket.io
  const activeRunId = activeRun?.status === "RUNNING" || activeRun?.status === "PENDING"
    ? activeRun.id
    : null
  useWorkflowExecution(activeRunId)

  const [runDialogOpen, setRunDialogOpen] = useState(false)
  const [runInputJson, setRunInputJson] = useState("{}")
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const [chatTestOpen, setChatTestOpen] = useState(false)
  const [showGrid, setShowGrid] = useState(true)
  const [showPalette, setShowPalette] = useState(true)
  const [isMobile, setIsMobile] = useState(false)
  const prevRunStatusRef = useRef<string | null>(null)

  // Responsive: hide palette on smaller screens, show mobile warning
  useEffect(() => {
    const checkSize = () => {
      setIsMobile(window.innerWidth < 768)
      if (window.innerWidth < 1200) {
        setShowPalette(false)
      } else {
        setShowPalette(true)
      }
    }
    checkSize()
    window.addEventListener("resize", checkSize)
    return () => window.removeEventListener("resize", checkSize)
  }, [])

  // Sync node execution status and step outputs from activeRun steps
  useEffect(() => {
    if (!activeRun?.steps) {
      editor.clearNodeExecutionStatus()
      return
    }
    const steps = activeRun.steps as StepLogEntry[]
    const statusMap: Record<string, "pending" | "running" | "success" | "failed" | "suspended"> = {}
    const outputMap: Record<string, unknown> = {}
    for (const step of steps) {
      statusMap[step.nodeId] = step.status
      if (step.output !== null && step.output !== undefined) {
        outputMap[step.nodeId] = step.output
      }
    }
    editor.setNodeExecutionStatus(statusMap)
    editor.setNodeOutputs(outputMap)
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
        mode: (workflow as unknown as { mode?: "STANDARD" | "CHATFLOW" }).mode || "STANDARD",
        chatflowConfig: (workflow as unknown as { chatflowConfig?: { welcomeMessage?: string; starterPrompts?: string[] } }).chatflowConfig || {},
        assistantId: (workflow as unknown as { assistantId?: string | null }).assistantId || null,
        apiEnabled: (workflow as unknown as { apiEnabled?: boolean }).apiEnabled || false,
        apiKey: (workflow as unknown as { apiKey?: string | null }).apiKey || null,
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, workflowsLoading])

  const handleToggleStatus = useCallback(async () => {
    const newStatus = editor.workflowStatus === "ACTIVE" ? "DRAFT" : "ACTIVE"
    try {
      await updateWorkflow(id, { status: newStatus } as Partial<import("@/hooks/use-workflows").WorkflowItem>)
      editor.setWorkflowMeta({ status: newStatus })
      editor.setDirty(false)
      toast.success(newStatus === "ACTIVE" ? "Workflow deployed" : "Workflow deactivated")
    } catch {
      toast.error("Failed to update status")
    }
  }, [id, editor, updateWorkflow])

  const handleSave = useCallback(async () => {
    editor.setSaving(true)
    try {
      const updated = await updateWorkflow(id, {
        name: editor.workflowName,
        description: editor.workflowDescription || null,
        nodes: editor.nodes as unknown as unknown[],
        edges: editor.edges as unknown as unknown[],
        trigger: editor.trigger as unknown as { type: string },
        variables: editor.variables as unknown as {
          inputs: unknown[]
          outputs: unknown[]
        },
        status: editor.workflowStatus,
        mode: editor.workflowMode as unknown as string,
        chatflowConfig: editor.chatflowConfig as unknown as { welcomeMessage?: string; starterPrompts?: string[] },
        apiEnabled: editor.apiEnabled as unknown as boolean,
        assistantId: editor.assistantId,
      } as Partial<import("@/hooks/use-workflows").WorkflowItem>)
      editor.setDirty(false)
      // Sync API key from server (auto-generated on first apiEnabled save)
      if (updated?.apiKey !== undefined) {
        editor.loadWorkflow({
          id: updated.id,
          name: updated.name,
          description: updated.description,
          nodes: (updated.nodes || []) as Node<WorkflowNodeData>[],
          edges: (updated.edges || []) as Edge[],
          trigger: (updated.trigger as { type: "manual" | "webhook" | "schedule" | "event" }) || { type: "manual" },
          variables: (updated.variables as { inputs: []; outputs: [] }) || { inputs: [], outputs: [] },
          status: updated.status,
          mode: updated.mode as "STANDARD" | "CHATFLOW" | undefined,
          chatflowConfig: updated.chatflowConfig as { welcomeMessage?: string; starterPrompts?: string[] } | undefined,
          assistantId: updated.assistantId,
          apiEnabled: updated.apiEnabled,
          apiKey: updated.apiKey,
        })
      }
    } finally {
      editor.setSaving(false)
    }
  }, [id, editor, updateWorkflow])

  const handleRunClick = useCallback(() => {
    // Validate workflow before run
    const validation = validateWorkflow(
      editor.nodes,
      editor.edges,
      editor.workflowMode
    )
    if (!validation.valid) {
      for (const err of validation.errors) {
        toast.error(err.message)
      }
      // Highlight first errored node
      const firstNodeErr = validation.errors.find((e) => e.nodeId)
      if (firstNodeErr?.nodeId) {
        editor.selectNode(firstNodeErr.nodeId)
      }
      return
    }

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

  const handleImport = useCallback(
    (data: unknown) => {
      try {
        const imported = importWorkflow(data)
        editor.pushHistory()
        // Replace canvas nodes and edges with imported data
        editor.loadWorkflow({
          id,
          name: imported.name,
          description: imported.description,
          nodes: imported.nodes,
          edges: imported.edges,
          trigger: imported.trigger as { type: "manual" | "webhook" | "schedule" | "event" },
          variables: imported.variables as { inputs: []; outputs: [] },
          status: editor.workflowStatus,
          mode: imported.mode,
        })
        editor.setDirty(true)
        toast.success(`Imported "${imported.name}" — save to persist`)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to import workflow")
      }
    },
    [id, editor]
  )

  const handleAutoLayout = useCallback(
    () => {
      const currentNodes = editor.nodes
      const currentEdges = editor.edges
      if (currentNodes.length === 0) {
        toast.info("No nodes to layout")
        return
      }
      editor.pushHistory()
      const laid = autoLayout(currentNodes, currentEdges, "TB")
      editor.setNodes(laid)
      toast.success("Layout applied (Top → Bottom)")
    },
    [editor]
  )

  // Unsaved changes warning
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (editor.isDirty) {
        e.preventDefault()
        e.returnValue = ""
      }
    }
    window.addEventListener("beforeunload", handler)
    return () => window.removeEventListener("beforeunload", handler)
  }, [editor.isDirty])

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      const target = e.target as HTMLElement
      const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable

      // Ctrl+S — Save (always, even in inputs)
      if (mod && e.key === "s") {
        e.preventDefault()
        handleSave()
        return
      }

      // Skip other shortcuts when typing in inputs
      if (isInput) return

      // Ctrl+Z — Undo
      if (mod && e.key === "z" && !e.shiftKey) {
        e.preventDefault()
        editor.undo()
        return
      }

      // Ctrl+Y or Ctrl+Shift+Z — Redo
      if ((mod && e.key === "y") || (mod && e.key === "z" && e.shiftKey)) {
        e.preventDefault()
        editor.redo()
        return
      }

      // Ctrl+D — Duplicate
      if (mod && e.key === "d") {
        e.preventDefault()
        editor.duplicateSelectedNodes()
        return
      }

      // Ctrl+C — Copy
      if (mod && e.key === "c") {
        e.preventDefault()
        editor.copySelectedNodes()
        return
      }

      // Ctrl+V — Paste
      if (mod && e.key === "v") {
        e.preventDefault()
        editor.pasteNodes()
        return
      }

      // Ctrl+K — Quick add node
      if (mod && e.key === "k") {
        e.preventDefault()
        setQuickAddOpen(true)
        return
      }

      // Delete / Backspace — Delete selected
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault()
        editor.deleteSelectedNodes()
        return
      }

      // Escape — Deselect
      if (e.key === "Escape") {
        editor.selectNode(null)
        return
      }

      // ? — Show shortcuts help
      if (e.key === "?" || (mod && e.key === "/")) {
        e.preventDefault()
        setShortcutsOpen(true)
        return
      }
    }

    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handleSave])

  // Loading skeleton
  if (workflowsLoading) {
    return (
      <div className="flex flex-col h-full animate-pulse">
        {/* Skeleton toolbar */}
        <div className="flex items-center gap-3 min-h-14 border-b bg-background pl-12 pr-3 py-2 shrink-0">
          <div className="h-8 w-8 rounded bg-muted" />
          <div className="h-4 w-4 rounded bg-muted" />
          <div className="h-5 w-40 rounded bg-muted" />
          <div className="flex-1" />
          <div className="flex gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-7 w-7 rounded bg-muted" />
            ))}
            <div className="h-7 w-16 rounded bg-muted" />
            <div className="h-7 w-16 rounded bg-muted" />
          </div>
        </div>
        {/* Skeleton body */}
        <div className="flex flex-1 overflow-hidden">
          {/* Skeleton palette */}
          <div className="w-[220px] border-r bg-background shrink-0 p-2 space-y-3">
            <div className="h-7 rounded bg-muted" />
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="space-y-1.5">
                <div className="h-4 w-24 rounded bg-muted" />
                <div className="h-8 w-full rounded bg-muted" />
                <div className="h-8 w-full rounded bg-muted" />
              </div>
            ))}
          </div>
          {/* Skeleton canvas */}
          <div className="flex-1 bg-muted/20 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
          {/* Skeleton properties */}
          <div className="w-[280px] border-l bg-background shrink-0 p-3 space-y-3">
            <div className="h-5 w-28 rounded bg-muted" />
            <div className="h-4 w-full rounded bg-muted" />
            <div className="h-20 w-full rounded bg-muted" />
          </div>
        </div>
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

  // Mobile warning
  if (isMobile) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-6 text-center">
        <Monitor className="h-10 w-10 text-muted-foreground/40" />
        <h2 className="text-sm font-medium">Desktop Recommended</h2>
        <p className="text-xs text-muted-foreground max-w-[280px]">
          The workflow editor works best on screens wider than 768px. Please use a desktop or tablet device.
        </p>
        <Button variant="outline" onClick={() => router.push("/dashboard/workflows")}>
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          Back to Workflows
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Onboarding overlay for first-time users */}
      <OnboardingOverlay />

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
          onImport={handleImport}
          onToggleStatus={handleToggleStatus}
          showChatTest={chatTestOpen}
          onToggleChatTest={() => setChatTestOpen((v) => !v)}
          onAutoLayout={handleAutoLayout}
          showGrid={showGrid}
          onToggleGrid={() => setShowGrid((v) => !v)}
        />
      </div>

      {/* Main canvas area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Node Palette (responsive: hidden < 1200px) */}
        {showPalette ? (
          <NodePalette />
        ) : (
          <div className="shrink-0 border-r">
            <Button
              variant="ghost"
              size="sm"
              className="h-full w-8 rounded-none text-muted-foreground hover:text-foreground"
              onClick={() => setShowPalette(true)}
              aria-label="Show Node Palette"
            >
              <span className="[writing-mode:vertical-lr] text-[10px] rotate-180">Nodes</span>
            </Button>
          </div>
        )}

        {/* Canvas + bottom panels */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 relative">
            <WorkflowCanvas showGrid={showGrid} />
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

        {/* Chat Test Panel (Chatflow mode) */}
        {chatTestOpen && editor.workflowMode === "CHATFLOW" && (
          <ChatTestPanel
            workflowId={id}
            onClose={() => setChatTestOpen(false)}
            onExecuteComplete={fetchRuns}
          />
        )}
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

      {/* Keyboard Shortcuts Dialog */}
      <KeyboardShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />

      {/* Quick Add Node Dialog (Ctrl+K) */}
      <QuickAddDialog open={quickAddOpen} onOpenChange={setQuickAddOpen} />
    </div>
  )
}
