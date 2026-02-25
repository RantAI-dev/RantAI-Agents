"use client"

import { useState, useCallback, useEffect, useRef, use } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { toast } from "sonner"
import { ArrowLeft, Loader2, GitBranch, Monitor, Copy, Check, Code2, FormInput, Clock, CheckCircle2, XCircle, PauseCircle } from "lucide-react"
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
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useWorkflows } from "@/hooks/use-workflows"
import { useWorkflowRuns } from "@/hooks/use-workflow-runs"
import { useWorkflowEditor } from "@/hooks/use-workflow-editor"
import { WorkflowCanvas } from "../_components/workflow-canvas"
import { WorkflowToolbar } from "../_components/workflow-toolbar"
import { NodePalette } from "../_components/node-palette"
import { PropertiesPanel } from "../_components/properties-panel"
import { RunHistoryDialog } from "../_components/run-history-dialog"
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
  const searchParams = useSearchParams()

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
  const [runFormValues, setRunFormValues] = useState<Record<string, unknown>>({})
  const [jsonMode, setJsonMode] = useState(false)
  const [resultDialogOpen, setResultDialogOpen] = useState(false)
  const [runHistoryOpen, setRunHistoryOpen] = useState(false)
  const [resultCopied, setResultCopied] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const [chatTestOpen, setChatTestOpen] = useState(false)
  const [showGrid, setShowGrid] = useState(true)
  const [showMinimap, setShowMinimap] = useState(true)
  const [showPalette, setShowPalette] = useState(true)
  const [isMobile, setIsMobile] = useState(false)
  const [showTutorial, setShowTutorial] = useState(false)
  const prevRunStatusRef = useRef<string | null>(null)

  // Auto-show tutorial when created from "New Workflow" or template (?tour=true)
  useEffect(() => {
    if (searchParams.get("tour") === "true") {
      setShowTutorial(true)
      // Clean the URL without triggering navigation
      router.replace(`/dashboard/workflows/${id}`, { scroll: false })
    }
  }, [searchParams, id, router])

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

  // Sync node execution status from activeRun steps (shows success/failed icons on nodes)
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
      setResultDialogOpen(true)
    } else if (currentStatus === "FAILED") {
      toast.error("Workflow execution failed")
      editor.setRunning(false)
      setResultDialogOpen(true)
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
        tags: (workflow as unknown as { tags?: string[] }).tags || [],
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
        tags: editor.tags,
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
          tags: updated.tags,
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
      const firstNodeErr = validation.errors.find((e) => e.nodeId)
      if (firstNodeErr?.nodeId) {
        editor.selectNode(firstNodeErr.nodeId)
      }
      return
    }

    const inputs = editor.variables?.inputs || []
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

    setRunFormValues(template)
    setRunInputJson(JSON.stringify(template, null, 2))
    // Use form mode when input variables are defined, JSON mode otherwise
    setJsonMode(inputs.length === 0)
    setRunDialogOpen(true)
  }, [editor.variables])

  const handleRunExecute = useCallback(async () => {
    let input: unknown = {}
    if (jsonMode) {
      try {
        input = JSON.parse(runInputJson)
      } catch {
        return
      }
    } else {
      input = { ...runFormValues }
    }
    setRunDialogOpen(false)
    editor.setRunning(true)
    try {
      await executeWorkflow(input)
      fetchRuns()
    } catch {
      editor.setRunning(false)
    }
  }, [jsonMode, runInputJson, runFormValues, executeWorkflow, fetchRuns, editor])

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
          <div className="w-[240px] border-r bg-background shrink-0 p-2 space-y-3">
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
          <div className="w-[320px] border-l bg-background shrink-0 p-3 space-y-3">
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
      <OnboardingOverlay
        forceShow={showTutorial}
        onComplete={() => setShowTutorial(false)}
      />

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
          showMinimap={showMinimap}
          onToggleMinimap={() => setShowMinimap((v) => !v)}
          onShowTutorial={() => setShowTutorial(true)}
          onOpenRunHistory={() => setRunHistoryOpen(true)}
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

        {/* Canvas */}
        <div className="flex-1 relative overflow-hidden">
          <WorkflowCanvas showGrid={showGrid} showMinimap={showMinimap} />
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
            <div className="flex items-center justify-between pr-6">
              <div>
                <DialogTitle>Run Workflow</DialogTitle>
                <DialogDescription>
                  {(editor.variables?.inputs?.length ?? 0) > 0
                    ? `Provide input for: ${editor.variables.inputs.map((v) => v.name).join(", ")}`
                    : "Provide JSON input for this workflow execution."}
                </DialogDescription>
              </div>
              {(editor.variables?.inputs?.length ?? 0) > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1.5 shrink-0"
                  onClick={() => {
                    if (!jsonMode) {
                      // Sync form values to JSON before switching
                      setRunInputJson(JSON.stringify(runFormValues, null, 2))
                    } else {
                      // Sync JSON to form values before switching
                      try {
                        setRunFormValues(JSON.parse(runInputJson))
                      } catch { /* keep current form values */ }
                    }
                    setJsonMode((v) => !v)
                  }}
                >
                  {jsonMode ? <FormInput className="h-3.5 w-3.5" /> : <Code2 className="h-3.5 w-3.5" />}
                  {jsonMode ? "Form" : "JSON"}
                </Button>
              )}
            </div>
          </DialogHeader>

          <div className="space-y-3 py-2">
            {jsonMode ? (
              /* ── JSON Mode ── */
              <div className="space-y-2">
                <Label htmlFor="run-input">Input JSON</Label>
                <Textarea
                  id="run-input"
                  value={runInputJson}
                  onChange={(e) => setRunInputJson(e.target.value)}
                  className="font-mono text-xs min-h-[200px]"
                  placeholder='{ "key": "value" }'
                />
                {(() => {
                  try {
                    JSON.parse(runInputJson)
                    return null
                  } catch {
                    return <p className="text-xs text-destructive">Invalid JSON</p>
                  }
                })()}
              </div>
            ) : (
              /* ── Form Mode ── */
              <div className="space-y-4">
                {(editor.variables?.inputs || []).map((variable) => (
                  <div key={variable.name} className="space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <Label htmlFor={`input-${variable.name}`} className="text-xs font-medium">
                        {variable.name}
                      </Label>
                      {variable.required && (
                        <span className="text-destructive text-[10px]">*</span>
                      )}
                      <span className="text-[10px] text-muted-foreground ml-auto">
                        {variable.type}
                      </span>
                    </div>

                    {variable.description && (
                      <p className="text-[10px] text-muted-foreground">{variable.description}</p>
                    )}

                    {variable.type === "string" && (
                      <Input
                        id={`input-${variable.name}`}
                        value={String(runFormValues[variable.name] ?? "")}
                        onChange={(e) =>
                          setRunFormValues((prev) => ({ ...prev, [variable.name]: e.target.value }))
                        }
                        className="text-xs"
                        placeholder={`Enter ${variable.name}...`}
                      />
                    )}

                    {variable.type === "number" && (
                      <Input
                        id={`input-${variable.name}`}
                        type="number"
                        value={String(runFormValues[variable.name] ?? 0)}
                        onChange={(e) =>
                          setRunFormValues((prev) => ({
                            ...prev,
                            [variable.name]: e.target.value === "" ? 0 : Number(e.target.value),
                          }))
                        }
                        className="text-xs"
                      />
                    )}

                    {variable.type === "boolean" && (
                      <div className="flex items-center gap-2">
                        <Switch
                          id={`input-${variable.name}`}
                          checked={Boolean(runFormValues[variable.name])}
                          onCheckedChange={(checked) =>
                            setRunFormValues((prev) => ({ ...prev, [variable.name]: checked }))
                          }
                        />
                        <Label htmlFor={`input-${variable.name}`} className="text-xs text-muted-foreground">
                          {runFormValues[variable.name] ? "true" : "false"}
                        </Label>
                      </div>
                    )}

                    {(variable.type === "object" || variable.type === "array") && (
                      <Textarea
                        id={`input-${variable.name}`}
                        value={
                          typeof runFormValues[variable.name] === "string"
                            ? String(runFormValues[variable.name])
                            : JSON.stringify(runFormValues[variable.name] ?? (variable.type === "array" ? [] : {}), null, 2)
                        }
                        onChange={(e) => {
                          try {
                            setRunFormValues((prev) => ({ ...prev, [variable.name]: JSON.parse(e.target.value) }))
                          } catch {
                            // Keep raw string while user is editing
                            setRunFormValues((prev) => ({ ...prev, [variable.name]: e.target.value }))
                          }
                        }}
                        className="font-mono text-xs min-h-[80px]"
                        placeholder={variable.type === "array" ? "[]" : "{}"}
                      />
                    )}
                  </div>
                ))}
                {(editor.variables?.inputs?.length ?? 0) === 0 && (
                  <p className="text-xs text-muted-foreground italic py-4 text-center">
                    No input variables defined. Use the Variables Panel to add inputs.
                  </p>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setRunDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleRunExecute}
              disabled={jsonMode && (() => {
                try { JSON.parse(runInputJson); return false } catch { return true }
              })()}
            >
              Run
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Run Result Dialog */}
      <Dialog open={resultDialogOpen} onOpenChange={setResultDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {activeRun?.status === "COMPLETED" ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              ) : activeRun?.status === "FAILED" ? (
                <XCircle className="h-5 w-5 text-destructive" />
              ) : activeRun?.status === "PAUSED" ? (
                <PauseCircle className="h-5 w-5 text-amber-500" />
              ) : null}
              Workflow Result
            </DialogTitle>
          </DialogHeader>

          {(() => {
            // Extract clean final output from the last executed node
            const cleanOutput = (() => {
              if (!activeRun?.output || typeof activeRun.output !== "object") return activeRun?.output ?? null
              const steps = (activeRun.steps ?? []) as StepLogEntry[]
              const successSteps = steps.filter((s) => s.status === "success")
              if (successSteps.length === 0) return null

              // Get the last successful step's output
              const lastStep = successSteps[successSteps.length - 1]
              const lastOutput = lastStep.output as Record<string, unknown> | null

              if (!lastOutput || typeof lastOutput !== "object") return lastOutput

              // If it's an LLM-style output (has text + usage/finishReason), extract just the meaningful fields
              if ("text" in lastOutput && ("usage" in lastOutput || "finishReason" in lastOutput)) {
                return lastOutput.text
              }

              // For other outputs, strip internal metadata keys
              const metaKeys = new Set(["usage", "finishReason", "raw", "cost", "is_byok", "cost_details", "inputTokens", "outputTokens", "totalTokens", "reasoningTokens", "cachedInputTokens", "inputTokenDetails", "completionTokenDetails", "noCacheReadTokens", "cacheReadTokens"])
              const cleaned: Record<string, unknown> = {}
              let hasCleanedKeys = false
              for (const [key, value] of Object.entries(lastOutput)) {
                if (!metaKeys.has(key)) {
                  cleaned[key] = value
                  hasCleanedKeys = true
                }
              }
              return hasCleanedKeys ? cleaned : lastOutput
            })()

            const outputText = cleanOutput == null ? null
              : typeof cleanOutput === "string" ? cleanOutput
              : JSON.stringify(cleanOutput, null, 2)

            return (
              <div className="space-y-4 py-2">
                {/* Status + Duration */}
                <div className="flex items-center gap-3">
                  <Badge
                    variant="secondary"
                    className={
                      activeRun?.status === "COMPLETED"
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300"
                        : activeRun?.status === "FAILED"
                          ? "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300"
                          : "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300"
                    }
                  >
                    {activeRun?.status}
                  </Badge>
                  {activeRun?.startedAt && activeRun?.completedAt && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {(() => {
                        const ms = new Date(activeRun.completedAt).getTime() - new Date(activeRun.startedAt).getTime()
                        return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`
                      })()}
                    </span>
                  )}
                  {activeRun?.error && (
                    <span className="text-xs text-destructive truncate flex-1">{activeRun.error}</span>
                  )}
                </div>

                {/* Output */}
                {outputText != null && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-semibold">Output</Label>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => {
                          navigator.clipboard.writeText(outputText)
                          setResultCopied(true)
                          setTimeout(() => setResultCopied(false), 2000)
                        }}
                      >
                        {resultCopied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                      </Button>
                    </div>
                    <ScrollArea className="max-h-[300px]">
                      <pre className="bg-muted/50 rounded-md p-3 text-xs font-mono whitespace-pre-wrap break-words">
                        {outputText}
                      </pre>
                    </ScrollArea>
                  </div>
                )}

                {outputText == null && activeRun?.status === "COMPLETED" && (
                  <p className="text-xs text-muted-foreground italic text-center py-4">
                    Workflow completed with no output.
                  </p>
                )}
              </div>
            )
          })()}

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setResultDialogOpen(false)
                setRunHistoryOpen(true)
              }}
            >
              View Run Details
            </Button>
            <Button size="sm" onClick={() => setResultDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Run History Dialog */}
      <RunHistoryDialog
        open={runHistoryOpen}
        onOpenChange={setRunHistoryOpen}
        runs={runs}
        runsLoading={runsLoading}
        activeRun={activeRun}
        onSelectRun={setActiveRun}
        onClearRun={() => setActiveRun(null)}
        onResume={handleResume}
      />

      {/* Keyboard Shortcuts Dialog */}
      <KeyboardShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />

      {/* Quick Add Node Dialog (Ctrl+K) */}
      <QuickAddDialog open={quickAddOpen} onOpenChange={setQuickAddOpen} />
    </div>
  )
}
