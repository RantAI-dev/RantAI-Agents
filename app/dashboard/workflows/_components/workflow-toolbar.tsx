"use client"

import {
  Save,
  Play,
  Undo2,
  Redo2,
  Trash2,
  History,
  Loader2,
  Settings2,
  Copy,
  Check,
  Globe,
  Download,
  Upload,
  MessageSquare,
  LayoutGrid,
  Grid3x3,
  Rocket,
  Plus,
  X as XIcon,
} from "lucide-react"
import { useMemo, useState, useCallback, useRef, useEffect } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useWorkflowEditor } from "@/hooks/use-workflow-editor"

function ToolbarTooltip({ children, label, shortcut }: { children: React.ReactNode; label: string; shortcut?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs flex items-center gap-1.5">
        {label}
        {shortcut && <kbd className="px-1 py-0.5 rounded bg-muted text-[10px] font-mono border">{shortcut}</kbd>}
      </TooltipContent>
    </Tooltip>
  )
}

interface WorkflowToolbarProps {
  onSave: () => void
  onRun: () => void
  onDelete: () => void
  onImport?: (data: unknown) => void
  showChatTest?: boolean
  onToggleChatTest?: () => void
  onToggleStatus?: () => void
  onAutoLayout?: () => void
  showGrid?: boolean
  onToggleGrid?: () => void
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-muted text-muted-foreground",
  ACTIVE: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300",
  PAUSED: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
  ARCHIVED: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
}

const MODE_COLORS: Record<string, string> = {
  STANDARD: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
  CHATFLOW: "bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300",
}

export function WorkflowToolbar({ onSave, onRun, onDelete, onImport, onToggleStatus, showChatTest, onToggleChatTest, onAutoLayout, showGrid = true, onToggleGrid }: WorkflowToolbarProps) {
  const workflowName = useWorkflowEditor((s) => s.workflowName)
  const workflowStatus = useWorkflowEditor((s) => s.workflowStatus)
  const workflowMode = useWorkflowEditor((s) => s.workflowMode)
  const assistantId = useWorkflowEditor((s) => s.assistantId)
  const apiEnabled = useWorkflowEditor((s) => s.apiEnabled)
  const apiKey = useWorkflowEditor((s) => s.apiKey)
  const chatflowConfig = useWorkflowEditor((s) => s.chatflowConfig)
  const setWorkflowMeta = useWorkflowEditor((s) => s.setWorkflowMeta)
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

  const [copiedKey, setCopiedKey] = useState(false)
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([])
  const [newStarterPrompt, setNewStarterPrompt] = useState("")
  const importInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch("/api/assistants")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setAgents(data.map((a: { id: string; name: string }) => ({ id: a.id, name: a.name })))
      })
      .catch(() => {})
  }, [])

  const handleExport = useCallback(async () => {
    const wId = useWorkflowEditor.getState().workflowId
    if (!wId) return
    try {
      const res = await fetch(`/api/dashboard/workflows/${wId}/export`)
      if (!res.ok) throw new Error("Export failed")
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `${workflowName.replace(/[^a-zA-Z0-9-_]/g, "_")}_workflow.json`
      a.click()
      URL.revokeObjectURL(url)
      toast.success("Workflow exported")
    } catch {
      toast.error("Failed to export workflow")
    }
  }, [workflowName])

  const handleImportFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target?.result as string)
          onImport?.(data)
        } catch {
          toast.error("Invalid JSON file")
        }
      }
      reader.readAsText(file)
      // Reset so the same file can be re-imported
      e.target.value = ""
    },
    [onImport]
  )

  const copyApiKey = useCallback(() => {
    if (apiKey) {
      navigator.clipboard.writeText(apiKey)
      setCopiedKey(true)
      setTimeout(() => setCopiedKey(false), 2000)
    }
  }, [apiKey])

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
    <TooltipProvider delayDuration={300}>
    <div className="relative flex items-center gap-2 px-3 py-1.5 border-b bg-background shrink-0 min-h-10" role="toolbar" aria-label="Workflow toolbar">
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

      {onToggleStatus ? (
        <Button
          variant={workflowStatus === "ACTIVE" ? "default" : "outline"}
          size="sm"
          className={`h-6 text-[11px] gap-1 ${
            workflowStatus === "ACTIVE"
              ? "bg-emerald-600 hover:bg-emerald-700 text-white"
              : ""
          }`}
          onClick={onToggleStatus}
        >
          <Rocket className="h-3 w-3" />
          {workflowStatus === "ACTIVE" ? "Active" : "Deploy"}
        </Button>
      ) : (
        <Badge variant="secondary" className={STATUS_COLORS[workflowStatus] || ""}>
          {workflowStatus}
        </Badge>
      )}

      <Badge variant="secondary" className={MODE_COLORS[workflowMode] || ""}>
        {workflowMode === "CHATFLOW" ? "Chatflow" : "Standard"}
      </Badge>

      {apiEnabled && (
        <Badge variant="outline" className="text-[10px] gap-1">
          <Globe className="h-2.5 w-2.5" />
          API
        </Badge>
      )}

      {/* Step progress counter */}
      {executionProgress && (
        <span className="text-[10px] text-muted-foreground truncate max-w-[250px]">
          Step {executionProgress.completed}/{executionProgress.total}
          {executionProgress.runningLabel && ` — ${executionProgress.runningLabel}`}
        </span>
      )}

      <div className="flex-1" />

      {/* Settings popover */}
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            aria-label="Workflow Settings"
          >
            <Settings2 className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72" align="end">
          <div className="space-y-4">
            <div className="space-y-1">
              <h4 className="text-sm font-semibold">Workflow Mode</h4>
              <p className="text-[11px] text-muted-foreground">
                Chatflow mode handles chat messages via this workflow instead of direct LLM.
              </p>
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="mode-toggle" className="text-xs">
                Chatflow Mode
              </Label>
              <Switch
                id="mode-toggle"
                checked={workflowMode === "CHATFLOW"}
                onCheckedChange={(checked) =>
                  setWorkflowMeta({ mode: checked ? "CHATFLOW" : "STANDARD" })
                }
              />
            </div>

            {workflowMode === "CHATFLOW" && (
              <>
                <div className="border-t pt-3 space-y-1">
                  <h4 className="text-sm font-semibold">Linked Agent</h4>
                  <p className="text-[11px] text-muted-foreground">
                    Chat messages to this agent will be processed by this workflow.
                  </p>
                </div>

                <Select
                  value={assistantId || "none"}
                  onValueChange={(val) =>
                    setWorkflowMeta({ assistantId: val === "none" ? null : val })
                  }
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Select agent..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none" className="text-xs">No agent linked</SelectItem>
                    {agents.map((agent) => (
                      <SelectItem key={agent.id} value={agent.id} className="text-xs">
                        {agent.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <div className="border-t pt-3 space-y-1">
                  <h4 className="text-sm font-semibold">Welcome Message</h4>
                  <p className="text-[11px] text-muted-foreground">
                    Greeting shown when chat opens.
                  </p>
                </div>
                <Input
                  value={chatflowConfig.welcomeMessage || ""}
                  onChange={(e) =>
                    setWorkflowMeta({
                      chatflowConfig: { ...chatflowConfig, welcomeMessage: e.target.value || undefined },
                    })
                  }
                  placeholder="Hello! How can I help you?"
                  className="h-8 text-xs"
                />

                <div className="flex items-center justify-between">
                  <Label htmlFor="followups-toggle" className="text-xs">
                    Follow-up Prompts
                  </Label>
                  <Switch
                    id="followups-toggle"
                    checked={chatflowConfig.enableFollowUps || false}
                    onCheckedChange={(checked) =>
                      setWorkflowMeta({
                        chatflowConfig: { ...chatflowConfig, enableFollowUps: checked },
                      })
                    }
                  />
                </div>
                <p className="text-[10px] text-muted-foreground -mt-2">
                  LLM generates suggested follow-up questions after each response.
                </p>

                <div className="border-t pt-3 space-y-1">
                  <h4 className="text-sm font-semibold">Starter Prompts</h4>
                  <p className="text-[11px] text-muted-foreground">
                    Suggested questions shown at start.
                  </p>
                </div>
                <div className="space-y-1.5">
                  {(chatflowConfig.starterPrompts || []).map((prompt, i) => (
                    <div key={i} className="flex items-center gap-1">
                      <span className="flex-1 text-xs bg-muted px-2 py-1 rounded truncate">{prompt}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0"
                        onClick={() => {
                          const updated = [...(chatflowConfig.starterPrompts || [])]
                          updated.splice(i, 1)
                          setWorkflowMeta({
                            chatflowConfig: { ...chatflowConfig, starterPrompts: updated },
                          })
                        }}
                      >
                        <XIcon className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                  <div className="flex items-center gap-1">
                    <Input
                      value={newStarterPrompt}
                      onChange={(e) => setNewStarterPrompt(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && newStarterPrompt.trim()) {
                          e.preventDefault()
                          setWorkflowMeta({
                            chatflowConfig: {
                              ...chatflowConfig,
                              starterPrompts: [...(chatflowConfig.starterPrompts || []), newStarterPrompt.trim()],
                            },
                          })
                          setNewStarterPrompt("")
                        }
                      }}
                      placeholder="Add a prompt..."
                      className="h-7 text-xs flex-1"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0"
                      disabled={!newStarterPrompt.trim()}
                      onClick={() => {
                        if (newStarterPrompt.trim()) {
                          setWorkflowMeta({
                            chatflowConfig: {
                              ...chatflowConfig,
                              starterPrompts: [...(chatflowConfig.starterPrompts || []), newStarterPrompt.trim()],
                            },
                          })
                          setNewStarterPrompt("")
                        }
                      }}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </>
            )}

            <div className="border-t pt-3 space-y-1">
              <h4 className="text-sm font-semibold">Public API</h4>
              <p className="text-[11px] text-muted-foreground">
                Enable to expose this workflow as a REST API endpoint.
              </p>
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="api-toggle" className="text-xs">
                API Access
              </Label>
              <Switch
                id="api-toggle"
                checked={apiEnabled}
                onCheckedChange={(checked) =>
                  setWorkflowMeta({ apiEnabled: checked })
                }
              />
            </div>

            {apiEnabled && apiKey && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">API Key</Label>
                <div className="flex items-center gap-1">
                  <code className="flex-1 text-[10px] bg-muted px-2 py-1 rounded truncate font-mono">
                    {apiKey}
                  </code>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0"
                    onClick={copyApiKey}
                  >
                    {copiedKey ? (
                      <Check className="h-3 w-3 text-green-500" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  POST /api/workflows/{"{id}"}/run
                </p>
              </div>
            )}

            {apiEnabled && !apiKey && (
              <p className="text-[10px] text-amber-600 dark:text-amber-400">
                Save the workflow to generate an API key.
              </p>
            )}
          </div>
        </PopoverContent>
      </Popover>

      {/* Export / Import */}
      <ToolbarTooltip label="Export as JSON">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={handleExport}
          aria-label="Export Workflow"
        >
          <Download className="h-4 w-4" />
        </Button>
      </ToolbarTooltip>
      <ToolbarTooltip label="Import from JSON">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => importInputRef.current?.click()}
          aria-label="Import Workflow"
        >
          <Upload className="h-4 w-4" />
        </Button>
      </ToolbarTooltip>
      <input
        ref={importInputRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={handleImportFile}
      />

      {/* Auto-Layout */}
      {onAutoLayout && (
        <ToolbarTooltip label="Auto Layout">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onAutoLayout}
            aria-label="Auto Layout"
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
        </ToolbarTooltip>
      )}

      {/* Grid Toggle */}
      {onToggleGrid && (
        <ToolbarTooltip label={showGrid ? "Hide Grid" : "Show Grid"}>
          <Button
            variant={showGrid ? "secondary" : "ghost"}
            size="icon"
            className="h-7 w-7"
            onClick={onToggleGrid}
            aria-label={showGrid ? "Hide Grid" : "Show Grid"}
          >
            <Grid3x3 className="h-4 w-4" />
          </Button>
        </ToolbarTooltip>
      )}

      <div className="w-px h-5 bg-border mx-1" />

      {/* Undo / Redo */}
      <ToolbarTooltip label="Undo" shortcut="Ctrl+Z">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={undo}
          disabled={historyIndex <= 0}
          aria-label="Undo"
        >
          <Undo2 className="h-4 w-4" />
        </Button>
      </ToolbarTooltip>
      <ToolbarTooltip label="Redo" shortcut="Ctrl+Y">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={redo}
          disabled={historyIndex >= historyLength - 1}
          aria-label="Redo"
        >
          <Redo2 className="h-4 w-4" />
        </Button>
      </ToolbarTooltip>

      <div className="w-px h-5 bg-border mx-1" />

      {/* Test Chat (Chatflow only) */}
      {workflowMode === "CHATFLOW" && onToggleChatTest && (
        <ToolbarTooltip label="Test Chat">
          <Button
            variant={showChatTest ? "secondary" : "ghost"}
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={onToggleChatTest}
            aria-label="Test Chat"
          >
            <MessageSquare className="h-3.5 w-3.5" />
            Chat
          </Button>
        </ToolbarTooltip>
      )}

      {/* Run History */}
      <ToolbarTooltip label="Run History">
        <Button
          variant={showRunHistory ? "secondary" : "ghost"}
          size="icon"
          className="h-7 w-7"
          onClick={toggleRunHistory}
          aria-label="Run History"
        >
          <History className="h-4 w-4" />
        </Button>
      </ToolbarTooltip>

      {/* Run */}
      <ToolbarTooltip label="Run Workflow">
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={onRun}
          disabled={isRunning}
          aria-label="Run Workflow"
        >
          {isRunning ? (
            <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
          ) : (
            <Play className="h-3.5 w-3.5 mr-1" />
          )}
          {isRunning ? "Running..." : "Run"}
        </Button>
      </ToolbarTooltip>

      {/* Save */}
      <ToolbarTooltip label="Save" shortcut="Ctrl+S">
        <Button
          size="sm"
          className="h-7 text-xs"
          onClick={onSave}
          disabled={!isDirty || isSaving}
          aria-label="Save Workflow"
        >
          {isSaving ? (
            <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
          ) : (
            <Save className="h-3.5 w-3.5 mr-1" />
          )}
          {isSaving ? "Saving..." : "Save"}
        </Button>
      </ToolbarTooltip>

      {/* Delete */}
      <ToolbarTooltip label="Delete Workflow">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-destructive hover:text-destructive"
          onClick={onDelete}
          aria-label="Delete Workflow"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </ToolbarTooltip>
    </div>
    </TooltipProvider>
  )
}
