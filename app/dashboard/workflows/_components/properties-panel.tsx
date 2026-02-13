"use client"

import { useMemo, useState, useEffect, useCallback } from "react"
import { X, ChevronDown, ChevronRight, Copy, Check, AlertCircle, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { ExpressionEditor } from "./expression-editor"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { useWorkflowEditor } from "@/hooks/use-workflow-editor"
import {
  NodeType,
  getNodeCategory,
  NODE_CATEGORIES,
  type WorkflowNodeData,
  type AgentNodeData,
  type LlmNodeData,
  type ToolNodeData,
  type CodeNodeData,
  type HttpNodeData,
  type ConditionNodeData,
  type LoopNodeData,
  type HumanInputNodeData,
  type TransformNodeData,
  type FilterNodeData,
  type AggregateNodeData,
  type OutputParserNodeData,
  type RagSearchNodeData,
  type TriggerNodeData,
  type MergeNodeData,
  type StreamOutputNodeData,
  type SwitchNodeData,
  type StorageNodeData,
  type DatabaseNodeData,
  type ErrorHandlerNodeData,
  type SubWorkflowNodeData,
} from "@/lib/workflow/types"
import { AVAILABLE_MODELS } from "@/lib/models"
import { cn } from "@/lib/utils"

// ─── Validation Helpers ───────────────────────────────────────────────────────

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return (
    <div className="flex items-center gap-1 mt-0.5">
      <AlertCircle className="h-3 w-3 text-destructive shrink-0" />
      <span className="text-[10px] text-destructive">{message}</span>
    </div>
  )
}

function useValidation(data: WorkflowNodeData) {
  return useMemo(() => {
    const errors: Record<string, string> = {}

    if (!data.label?.trim()) {
      errors.label = "Label is required"
    }

    switch (data.nodeType) {
      case NodeType.AGENT: {
        const ad = data as AgentNodeData
        if (!ad.assistantId) errors.assistantId = "Select an assistant"
        break
      }
      case NodeType.LLM: {
        const ld = data as LlmNodeData
        if (!ld.model) errors.model = "Select a model"
        break
      }
      case NodeType.HTTP: {
        const hd = data as HttpNodeData
        if (!hd.url?.trim()) errors.url = "URL is required"
        else if (!/^https?:\/\/|^\{\{/.test(hd.url.trim())) errors.url = "Must start with http:// or https://"
        break
      }
      case NodeType.TRIGGER_SCHEDULE: {
        const td = data as TriggerNodeData
        if (!td.config?.schedule?.trim()) errors.schedule = "Cron expression is required"
        break
      }
      case NodeType.STREAM_OUTPUT: {
        const sd = data as StreamOutputNodeData
        if (!sd.model) errors.model = "Select a model"
        break
      }
    }

    return errors
  }, [data])
}

// ─── Collapsible Section ──────────────────────────────────────────────────────

function Section({
  title,
  defaultOpen = true,
  children,
}: {
  title: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center gap-1.5 w-full py-3 text-[11px] font-bold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors">
        {open ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
        {title}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="space-y-3 pb-2">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  )
}

// ─── Selectors ────────────────────────────────────────────────────────────────

function ModelSelector({
  value,
  onChange,
  error,
}: {
  value: string
  onChange: (id: string) => void
  error?: string
}) {
  const grouped = useMemo(() => {
    const map = new Map<string, typeof AVAILABLE_MODELS>()
    for (const m of AVAILABLE_MODELS) {
      const list = map.get(m.provider) || []
      list.push(m)
      map.set(m.provider, list)
    }
    return map
  }, [])

  return (
    <div className="space-y-1">
      <Label className="text-xs">Model</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className={cn("h-7 text-xs", error && "border-destructive")}>
          <SelectValue placeholder="Select model" />
        </SelectTrigger>
        <SelectContent>
          {[...grouped.entries()].map(([provider, models]) => (
            <div key={provider}>
              <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                {provider}
              </div>
              {models.map((m) => (
                <SelectItem key={m.id} value={m.id} className="text-xs">
                  <span>{m.name}</span>
                  {m.pricing.input === 0 && (
                    <span className="ml-1 text-[10px] text-emerald-600">free</span>
                  )}
                </SelectItem>
              ))}
            </div>
          ))}
        </SelectContent>
      </Select>
      <FieldError message={error} />
    </div>
  )
}

interface AssistantOption {
  id: string
  name: string
  emoji: string
}

function AssistantSelector({
  value,
  onChange,
  error,
}: {
  value: string
  onChange: (id: string) => void
  error?: string
}) {
  const [assistants, setAssistants] = useState<AssistantOption[]>([])

  useEffect(() => {
    fetch("/api/assistants")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setAssistants(
            data.map((a: { id: string; name: string; emoji?: string }) => ({
              id: a.id,
              name: a.name,
              emoji: a.emoji || "🤖",
            }))
          )
        }
      })
      .catch(() => {})
  }, [])

  return (
    <div className="space-y-1">
      <Label className="text-xs">Assistant</Label>
      <Select value={value || "__none__"} onValueChange={(v) => onChange(v === "__none__" ? "" : v)}>
        <SelectTrigger className={cn("h-7 text-xs", error && "border-destructive")}>
          <SelectValue placeholder="Select assistant" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__" className="text-xs">
            Select assistant...
          </SelectItem>
          {assistants.map((a) => (
            <SelectItem key={a.id} value={a.id} className="text-xs">
              {a.emoji} {a.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FieldError message={error} />
    </div>
  )
}

interface CredentialOption {
  id: string
  name: string
  type: string
}

function CredentialSelector({
  value,
  onChange,
}: {
  value?: string
  onChange: (id: string | undefined) => void
}) {
  const [credentials, setCredentials] = useState<CredentialOption[]>([])

  useEffect(() => {
    fetch("/api/dashboard/credentials")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setCredentials(data)
      })
      .catch(() => {})
  }, [])

  return (
    <div className="space-y-1">
      <Label className="text-xs">Credential</Label>
      <Select
        value={value || "__none__"}
        onValueChange={(v) => onChange(v === "__none__" ? undefined : v)}
      >
        <SelectTrigger className="h-7 text-xs">
          <SelectValue placeholder="None" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__" className="text-xs">
            None
          </SelectItem>
          {credentials.map((c) => (
            <SelectItem key={c.id} value={c.id} className="text-xs">
              {c.name} ({c.type})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

// ─── Workflow Selector ────────────────────────────────────────────────────────

function WorkflowSelector({
  value,
  onChange,
  error,
}: {
  value: string
  onChange: (id: string, name: string) => void
  error?: string
}) {
  const [workflows, setWorkflows] = useState<{ id: string; name: string; status: string }[]>([])

  useEffect(() => {
    fetch("/api/dashboard/workflows")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setWorkflows(
            data.map((w: { id: string; name: string; status: string }) => ({
              id: w.id,
              name: w.name,
              status: w.status,
            }))
          )
        }
      })
      .catch(() => {})
  }, [])

  return (
    <div className="space-y-1">
      <Select
        value={value || "__none__"}
        onValueChange={(v) => {
          if (v === "__none__") {
            onChange("", "")
          } else {
            const wf = workflows.find((w) => w.id === v)
            onChange(v, wf?.name || "")
          }
        }}
      >
        <SelectTrigger className={cn("h-7 text-xs", error && "border-destructive")}>
          <SelectValue placeholder="Select workflow" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__" className="text-xs">
            Select workflow...
          </SelectItem>
          {workflows.map((w) => (
            <SelectItem key={w.id} value={w.id} className="text-xs">
              {w.name} ({w.status.toLowerCase()})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FieldError message={error} />
    </div>
  )
}

// ─── Tool Selector ────────────────────────────────────────────────────────────

interface ToolOption {
  id: string
  name: string
  displayName: string
  description: string
  category: string
  isBuiltIn: boolean
}

function ToolSelector({
  value,
  onChange,
  isMcp,
}: {
  value: string
  onChange: (id: string, name: string) => void
  isMcp?: boolean
}) {
  const [tools, setTools] = useState<ToolOption[]>([])

  useEffect(() => {
    fetch("/api/dashboard/tools")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setTools(
            data
              .filter((t: ToolOption) =>
                isMcp ? !t.isBuiltIn : true
              )
              .map((t: ToolOption) => ({
                id: t.id,
                name: t.name,
                displayName: t.displayName || t.name,
                description: t.description || "",
                category: t.category || "custom",
                isBuiltIn: t.isBuiltIn,
              }))
          )
        }
      })
      .catch(() => {})
  }, [isMcp])

  const grouped = useMemo(() => {
    const map = new Map<string, ToolOption[]>()
    for (const t of tools) {
      const cat = t.isBuiltIn ? "builtin" : t.category || "custom"
      const list = map.get(cat) || []
      list.push(t)
      map.set(cat, list)
    }
    return map
  }, [tools])

  return (
    <div className="space-y-1">
      <Label className="text-xs">Tool</Label>
      <Select
        value={value || "__none__"}
        onValueChange={(v) => {
          if (v === "__none__") {
            onChange("", "")
          } else {
            const tool = tools.find((t) => t.id === v)
            onChange(v, tool?.name || "")
          }
        }}
      >
        <SelectTrigger className="h-7 text-xs">
          <SelectValue placeholder="Select tool..." />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__" className="text-xs">
            Select tool...
          </SelectItem>
          {[...grouped.entries()].map(([cat, catTools]) => (
            <div key={cat}>
              <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                {cat}
              </div>
              {catTools.map((t) => (
                <SelectItem key={t.id} value={t.id} className="text-xs">
                  <div className="flex flex-col">
                    <span>{t.displayName}</span>
                    {t.description && (
                      <span className="text-[10px] text-muted-foreground truncate max-w-[180px]">
                        {t.description}
                      </span>
                    )}
                  </div>
                </SelectItem>
              ))}
            </div>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

// ─── Knowledge Base Group Selector ────────────────────────────────────────────

interface KBGroupOption {
  id: string
  name: string
  documentCount: number
}

function KnowledgeBaseGroupSelector({
  value,
  onChange,
}: {
  value: string[]
  onChange: (ids: string[]) => void
}) {
  const [groups, setGroups] = useState<KBGroupOption[]>([])

  useEffect(() => {
    fetch("/api/dashboard/knowledge/groups")
      .then((r) => r.json())
      .then((data) => {
        const arr = data?.groups || data
        if (Array.isArray(arr)) {
          setGroups(
            arr.map((g: KBGroupOption) => ({
              id: g.id,
              name: g.name,
              documentCount: g.documentCount || 0,
            }))
          )
        }
      })
      .catch(() => {})
  }, [])

  const toggleGroup = (id: string) => {
    if (value.includes(id)) {
      onChange(value.filter((v) => v !== id))
    } else {
      onChange([...value, id])
    }
  }

  return (
    <div className="space-y-1">
      <Label className="text-xs">Knowledge Base Groups</Label>
      {groups.length === 0 ? (
        <p className="text-[10px] text-muted-foreground italic">No groups available</p>
      ) : (
        <div className="flex flex-col gap-1 max-h-[120px] overflow-y-auto">
          {groups.map((g) => (
            <label
              key={g.id}
              className={cn(
                "flex items-center gap-2 px-2 py-1 rounded cursor-pointer text-xs hover:bg-muted/50 transition-colors",
                value.includes(g.id) && "bg-muted"
              )}
            >
              <input
                type="checkbox"
                checked={value.includes(g.id)}
                onChange={() => toggleGroup(g.id)}
                className="h-3 w-3 rounded border-border"
              />
              <span className="flex-1 truncate">{g.name}</span>
              <span className="text-[10px] text-muted-foreground">{g.documentCount} docs</span>
            </label>
          ))}
        </div>
      )}
      {value.length === 0 && groups.length > 0 && (
        <p className="text-[10px] text-muted-foreground">All groups will be searched</p>
      )}
    </div>
  )
}

// ─── JSON Viewer ──────────────────────────────────────────────────────────────

function JsonValue({ value, depth = 0 }: { value: unknown; depth?: number }) {
  const [expanded, setExpanded] = useState(depth < 2)

  if (value === null) return <span className="text-orange-500">null</span>
  if (value === undefined) return <span className="text-muted-foreground">undefined</span>
  if (typeof value === "boolean")
    return <span className="text-violet-600 dark:text-violet-400">{String(value)}</span>
  if (typeof value === "number")
    return <span className="text-blue-600 dark:text-blue-400">{value}</span>
  if (typeof value === "string") {
    const display = value.length > 100 ? value.slice(0, 100) + "…" : value
    return <span className="text-emerald-700 dark:text-emerald-400">&quot;{display}&quot;</span>
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-muted-foreground">[]</span>
    return (
      <span>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-muted-foreground hover:text-foreground"
        >
          {expanded ? "▼" : "▶"} [{value.length}]
        </button>
        {expanded && (
          <div className="ml-3 border-l border-border/50 pl-2">
            {value.map((item, i) => (
              <div key={i} className="leading-relaxed">
                <span className="text-muted-foreground/60">{i}: </span>
                <JsonValue value={item} depth={depth + 1} />
              </div>
            ))}
          </div>
        )}
      </span>
    )
  }

  if (typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>)
    if (keys.length === 0) return <span className="text-muted-foreground">{"{}"}</span>
    return (
      <span>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-muted-foreground hover:text-foreground"
        >
          {expanded ? "▼" : "▶"} {"{"}
          {keys.length}
          {"}"}
        </button>
        {expanded && (
          <div className="ml-3 border-l border-border/50 pl-2">
            {keys.map((key) => (
              <div key={key} className="leading-relaxed">
                <span className="text-sky-700 dark:text-sky-400">{key}</span>
                <span className="text-muted-foreground">: </span>
                <JsonValue
                  value={(value as Record<string, unknown>)[key]}
                  depth={depth + 1}
                />
              </div>
            ))}
          </div>
        )}
      </span>
    )
  }

  return <span>{String(value)}</span>
}

// ─── Node Output Preview ──────────────────────────────────────────────────────

function NodeOutputPreview({ nodeId }: { nodeId: string }) {
  const executionStatus = useWorkflowEditor((s) => s.nodeExecutionStatus[nodeId])
  const [copied, setCopied] = useState(false)
  const [output, setOutput] = useState<unknown>(null)

  const hasOutput = executionStatus === "success" || executionStatus === "failed"

  useEffect(() => {
    if (!hasOutput) {
      setOutput(null)
      return
    }
    const stepOutputs = (globalThis as unknown as { __workflowStepOutputs?: Record<string, unknown> }).__workflowStepOutputs
    if (stepOutputs && stepOutputs[nodeId] !== undefined) {
      setOutput(stepOutputs[nodeId])
    }
  }, [nodeId, hasOutput, executionStatus])

  const handleCopy = useCallback(() => {
    try {
      const text = typeof output === "string" ? output : JSON.stringify(output, null, 2)
      navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* ignore */ }
  }, [output])

  if (!executionStatus) return null

  const statusLabel = {
    pending: "Pending",
    running: "Running...",
    success: "Completed",
    failed: "Failed",
    suspended: "Suspended",
  }[executionStatus]

  const statusColor = {
    pending: "text-muted-foreground",
    running: "text-blue-500",
    success: "text-emerald-600",
    failed: "text-destructive",
    suspended: "text-amber-500",
  }[executionStatus]

  return (
    <Section title="Output" defaultOpen={false}>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className={`text-[10px] ${statusColor}`}>
            {statusLabel}
          </span>
          {output !== null && (
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5"
              onClick={handleCopy}
            >
              {copied ? (
                <Check className="h-3 w-3 text-green-500" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
            </Button>
          )}
        </div>

        {output !== null && (
          <div className="bg-muted/50 rounded p-2 overflow-auto max-h-[200px] text-[10px] font-mono">
            <JsonValue value={output} />
          </div>
        )}

        {output === null && hasOutput && (
          <p className="text-[10px] text-muted-foreground italic">
            Output not available in this view
          </p>
        )}

        {executionStatus === "running" && (
          <div className="flex items-center gap-1.5">
            <div className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
            <p className="text-[10px] text-muted-foreground">Executing...</p>
          </div>
        )}
      </div>
    </Section>
  )
}

// ─── Main Properties Panel ────────────────────────────────────────────────────

export function PropertiesPanel() {
  const selectedNodeId = useWorkflowEditor((s) => s.selectedNodeId)
  const nodes = useWorkflowEditor((s) => s.nodes)
  const updateNodeData = useWorkflowEditor((s) => s.updateNodeData)
  const selectNode = useWorkflowEditor((s) => s.selectNode)

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedNodeId),
    [nodes, selectedNodeId]
  )

  if (!selectedNode || !selectedNodeId) {
    return (
      <div className="w-[280px] shrink-0 border-l bg-background flex items-center justify-center p-4">
        <p className="text-xs text-muted-foreground text-center">
          Select a node to edit its properties
        </p>
      </div>
    )
  }

  const data = selectedNode.data as WorkflowNodeData
  const category = getNodeCategory(data.nodeType)
  const categoryMeta = NODE_CATEGORIES[category]

  const update = (partial: Partial<WorkflowNodeData>) => {
    updateNodeData(selectedNodeId, partial)
  }

  return (
    <div className="w-[280px] shrink-0 border-l bg-background flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b">
        <span
          className="w-2.5 h-2.5 rounded-full shrink-0"
          style={{ backgroundColor: categoryMeta.headerColor }}
        />
        <span className="text-xs font-semibold flex-1 truncate">{data.label}</span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => selectNode(null)}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Form */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        <BasicFields data={data} update={update} />
        <NodeSpecificFields data={data} update={update} />
        <NodeOutputPreview nodeId={selectedNodeId} />
      </div>
    </div>
  )
}

// ─── Basic Fields (Label + Description) ───────────────────────────────────────

function BasicFields({
  data,
  update,
}: {
  data: WorkflowNodeData
  update: (partial: Partial<WorkflowNodeData>) => void
}) {
  const errors = useValidation(data)

  return (
    <Section title="Basic" defaultOpen={true}>
      <div className="space-y-1">
        <Label className="text-xs">Label</Label>
        <Input
          value={data.label}
          onChange={(e) => update({ label: e.target.value })}
          className={cn("h-7 text-xs", errors.label && "border-destructive")}
        />
        <FieldError message={errors.label} />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Description</Label>
        <Input
          value={data.description || ""}
          onChange={(e) => update({ description: e.target.value })}
          className="h-7 text-xs"
          placeholder="Optional description"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Notes</Label>
        <Textarea
          value={data.notes || ""}
          onChange={(e) => update({ notes: e.target.value })}
          className="text-xs min-h-[48px] resize-y"
          placeholder="Internal notes or comments"
          rows={2}
        />
      </div>
    </Section>
  )
}

// ─── Node Specific Fields ─────────────────────────────────────────────────────

function NodeSpecificFields({
  data,
  update,
}: {
  data: WorkflowNodeData
  update: (partial: Partial<WorkflowNodeData>) => void
}) {
  const errors = useValidation(data)

  switch (data.nodeType) {
    case NodeType.TRIGGER_MANUAL:
    case NodeType.TRIGGER_WEBHOOK:
    case NodeType.TRIGGER_SCHEDULE:
    case NodeType.TRIGGER_EVENT: {
      const td = data as TriggerNodeData
      return (
        <Section title="Configuration">
          {td.nodeType === NodeType.TRIGGER_SCHEDULE && (
            <div className="space-y-1">
              <Label className="text-xs">Cron Schedule</Label>
              <Input
                value={td.config?.schedule || ""}
                onChange={(e) =>
                  update({ config: { ...td.config, schedule: e.target.value } } as Partial<TriggerNodeData>)
                }
                className={cn("h-7 text-xs", errors.schedule && "border-destructive")}
                placeholder="0 * * * *"
              />
              <FieldError message={errors.schedule} />
            </div>
          )}
          {td.nodeType === NodeType.TRIGGER_WEBHOOK && (
            <>
              <div className="space-y-1">
                <Label className="text-xs">Webhook Path</Label>
                <Input
                  value={td.config?.webhookPath || ""}
                  onChange={(e) =>
                    update({ config: { ...td.config, webhookPath: e.target.value } } as Partial<TriggerNodeData>)
                  }
                  className="h-7 text-xs"
                  placeholder="e.g. my-workflow"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Webhook Secret</Label>
                <Input
                  value={td.config?.webhookSecret || ""}
                  onChange={(e) =>
                    update({ config: { ...td.config, webhookSecret: e.target.value } } as Partial<TriggerNodeData>)
                  }
                  className="h-7 text-xs font-mono"
                  placeholder="Optional HMAC-SHA256 secret"
                  type="password"
                />
                <p className="text-[10px] text-muted-foreground">
                  If set, requests must include x-webhook-signature header.
                </p>
              </div>
            </>
          )}
          {td.nodeType === NodeType.TRIGGER_EVENT && (
            <div className="space-y-1">
              <Label className="text-xs">Event Name</Label>
              <Input
                value={td.config?.eventName || ""}
                onChange={(e) =>
                  update({ config: { ...td.config, eventName: e.target.value } } as Partial<TriggerNodeData>)
                }
                className="h-7 text-xs"
                placeholder="user.created"
              />
            </div>
          )}
          {td.nodeType === NodeType.TRIGGER_MANUAL && (
            <p className="text-[10px] text-muted-foreground italic">
              Triggered manually via the Run button or API.
            </p>
          )}
        </Section>
      )
    }

    case NodeType.AGENT: {
      const ad = data as AgentNodeData
      return (
        <>
          <Section title="Configuration">
            <AssistantSelector
              value={ad.assistantId}
              onChange={(id) => update({ assistantId: id } as Partial<AgentNodeData>)}
              error={errors.assistantId}
            />
            <div className="space-y-1">
              <Label className="text-xs">Prompt Template</Label>
              <ExpressionEditor
                value={ad.promptTemplate || ""}
                onChange={(v) =>
                  update({ promptTemplate: v } as Partial<AgentNodeData>)
                }
                className="min-h-[60px]"
                placeholder="Optional override prompt"
              />
            </div>
          </Section>
          <Section title="Advanced" defaultOpen={false}>
            <div className="space-y-1">
              <Label className="text-xs">Max Steps</Label>
              <Input
                type="number"
                value={ad.maxSteps || 5}
                onChange={(e) =>
                  update({ maxSteps: parseInt(e.target.value) || 5 } as Partial<AgentNodeData>)
                }
                className="h-7 text-xs"
                min={1}
                max={20}
              />
            </div>
          </Section>
        </>
      )
    }

    case NodeType.LLM: {
      const ld = data as LlmNodeData
      return (
        <>
          <Section title="Configuration">
            <ModelSelector
              value={ld.model}
              onChange={(v) => update({ model: v } as Partial<LlmNodeData>)}
              error={errors.model}
            />
            <div className="space-y-1">
              <Label className="text-xs">System Prompt</Label>
              <ExpressionEditor
                value={ld.systemPrompt || ""}
                onChange={(v) =>
                  update({ systemPrompt: v } as Partial<LlmNodeData>)
                }
                className="min-h-[80px]"
                placeholder="You are a helpful assistant..."
              />
            </div>
          </Section>
          <Section title="Advanced" defaultOpen={false}>
            <div className="space-y-1">
              <Label className="text-xs">
                Temperature: {ld.temperature?.toFixed(1) ?? "0.7"}
              </Label>
              <Slider
                value={[ld.temperature ?? 0.7]}
                min={0}
                max={2}
                step={0.1}
                onValueChange={([v]) =>
                  update({ temperature: v } as Partial<LlmNodeData>)
                }
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Max Tokens</Label>
              <Input
                type="number"
                value={ld.maxTokens || ""}
                onChange={(e) =>
                  update({
                    maxTokens: e.target.value ? parseInt(e.target.value) : undefined,
                  } as Partial<LlmNodeData>)
                }
                className="h-7 text-xs"
                placeholder="Auto"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Top P</Label>
              <Input
                type="number"
                min={0}
                max={1}
                step={0.1}
                value={ld.topP ?? ""}
                onChange={(e) =>
                  update({
                    topP: e.target.value ? parseFloat(e.target.value) : undefined,
                  } as Partial<LlmNodeData>)
                }
                className="h-7 text-xs"
                placeholder="Default: 1.0"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Frequency Penalty</Label>
              <Input
                type="number"
                min={-2}
                max={2}
                step={0.1}
                value={ld.frequencyPenalty ?? ""}
                onChange={(e) =>
                  update({
                    frequencyPenalty: e.target.value ? parseFloat(e.target.value) : undefined,
                  } as Partial<LlmNodeData>)
                }
                className="h-7 text-xs"
                placeholder="0.0"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Presence Penalty</Label>
              <Input
                type="number"
                min={-2}
                max={2}
                step={0.1}
                value={ld.presencePenalty ?? ""}
                onChange={(e) =>
                  update({
                    presencePenalty: e.target.value ? parseFloat(e.target.value) : undefined,
                  } as Partial<LlmNodeData>)
                }
                className="h-7 text-xs"
                placeholder="0.0"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Stop Sequences</Label>
              <Input
                value={ld.stopSequences?.join(", ") || ""}
                onChange={(e) =>
                  update({
                    stopSequences: e.target.value
                      ? e.target.value.split(",").map((s) => s.trim()).filter(Boolean)
                      : undefined,
                  } as Partial<LlmNodeData>)
                }
                className="h-7 text-xs"
                placeholder="Comma-separated, e.g. END, STOP"
              />
            </div>
          </Section>
        </>
      )
    }

    case NodeType.TOOL:
    case NodeType.MCP_TOOL: {
      const td = data as ToolNodeData
      const mappingEntries = Object.entries(td.inputMapping || {})
      return (
        <>
          <Section title="Configuration">
            <ToolSelector
              value={td.toolId}
              onChange={(id, name) =>
                update({ toolId: id, toolName: name } as Partial<ToolNodeData>)
              }
              isMcp={td.nodeType === NodeType.MCP_TOOL}
            />
            <CredentialSelector
              value={td.credentialId}
              onChange={(id) =>
                update({ credentialId: id } as Partial<ToolNodeData>)
              }
            />
          </Section>
          <Section title="Input Mapping" defaultOpen={mappingEntries.length > 0}>
            <p className="text-[10px] text-muted-foreground mb-2">
              Map tool parameters to values or expressions.
            </p>
            <div className="space-y-1.5">
              {mappingEntries.map(([key, value], i) => (
                <div key={i} className="flex gap-1 items-start">
                  <Input
                    value={key}
                    onChange={(e) => {
                      const entries = Object.entries(td.inputMapping || {})
                      const newMapping: Record<string, string> = {}
                      entries.forEach(([k, v], j) => {
                        newMapping[j === i ? e.target.value : k] = v
                      })
                      update({ inputMapping: newMapping } as Partial<ToolNodeData>)
                    }}
                    className="h-7 text-xs font-mono w-[80px] shrink-0"
                    placeholder="param"
                  />
                  <ExpressionEditor
                    value={value}
                    onChange={(v) => {
                      const newMapping = { ...td.inputMapping, [key]: v }
                      update({ inputMapping: newMapping } as Partial<ToolNodeData>)
                    }}
                    className="min-h-[28px] flex-1"
                    mono
                    rows={1}
                    placeholder="{{ input.field }}"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => {
                      const newMapping = { ...td.inputMapping }
                      delete newMapping[key]
                      update({ inputMapping: newMapping } as Partial<ToolNodeData>)
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                className="w-full h-7 text-xs"
                onClick={() => {
                  const newMapping = { ...td.inputMapping, "": "" }
                  update({ inputMapping: newMapping } as Partial<ToolNodeData>)
                }}
              >
                <Plus className="h-3 w-3 mr-1" />
                Add Parameter
              </Button>
            </div>
          </Section>
        </>
      )
    }

    case NodeType.CODE: {
      const cd = data as CodeNodeData
      return (
        <Section title="Configuration">
          <div className="space-y-1">
            <Label className="text-xs">Code (JavaScript)</Label>
            <ExpressionEditor
              value={cd.code}
              onChange={(v) => update({ code: v } as Partial<CodeNodeData>)}
              className="min-h-[120px]"
              mono
              placeholder={"// input is available\nreturn { data: input };"}
            />
          </div>
        </Section>
      )
    }

    case NodeType.HTTP: {
      const hd = data as HttpNodeData
      return (
        <>
          <Section title="Configuration">
            <div className="space-y-1">
              <Label className="text-xs">Method</Label>
              <Select
                value={hd.method}
                onValueChange={(v) =>
                  update({ method: v } as Partial<HttpNodeData>)
                }
              >
                <SelectTrigger className="h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["GET", "POST", "PUT", "DELETE", "PATCH"].map((m) => (
                    <SelectItem key={m} value={m} className="text-xs">
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">URL</Label>
              <ExpressionEditor
                value={hd.url}
                onChange={(v) => update({ url: v } as Partial<HttpNodeData>)}
                className={cn("min-h-[36px]", errors.url && "border-destructive")}
                rows={1}
                placeholder="https://api.example.com/..."
              />
              <FieldError message={errors.url} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Body</Label>
              <ExpressionEditor
                value={hd.body || ""}
                onChange={(v) => update({ body: v } as Partial<HttpNodeData>)}
                className="min-h-[60px]"
                mono
                placeholder="{}"
              />
            </div>
          </Section>
          <Section title="Advanced" defaultOpen={false}>
            <CredentialSelector
              value={hd.credentialId}
              onChange={(id) =>
                update({ credentialId: id } as Partial<HttpNodeData>)
              }
            />
            <div className="space-y-1">
              <Label className="text-xs">Timeout</Label>
              <Input
                type="number"
                min={1000}
                max={300000}
                value={hd.timeout ?? 30000}
                onChange={(e) =>
                  update({
                    timeout: parseInt(e.target.value) || 30000,
                  } as Partial<HttpNodeData>)
                }
                className="h-7 text-xs"
                placeholder="Default: 30000"
              />
              <p className="text-[10px] text-muted-foreground">
                Request timeout in milliseconds.
              </p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Max Retries</Label>
              <Input
                type="number"
                min={0}
                max={5}
                value={hd.maxRetries ?? 0}
                onChange={(e) =>
                  update({
                    maxRetries: parseInt(e.target.value) || 0,
                  } as Partial<HttpNodeData>)
                }
                className="h-7 text-xs"
                placeholder="Default: 0"
              />
              <p className="text-[10px] text-muted-foreground">
                Retries with exponential backoff on failure.
              </p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Response Type</Label>
              <Select
                value={hd.responseType || "auto"}
                onValueChange={(v) =>
                  update({ responseType: v as "json" | "text" | "blob" } as Partial<HttpNodeData>)
                }
              >
                <SelectTrigger className="h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto" className="text-xs">Auto-detect</SelectItem>
                  <SelectItem value="json" className="text-xs">JSON</SelectItem>
                  <SelectItem value="text" className="text-xs">Text</SelectItem>
                  <SelectItem value="blob" className="text-xs">Blob (binary)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </Section>
        </>
      )
    }

    case NodeType.CONDITION: {
      const cd = data as ConditionNodeData
      return (
        <Section title="Configuration">
          <div className="space-y-2">
            <Label className="text-xs">Branches</Label>
            {cd.conditions.map((c, i) => (
              <div key={c.id} className="space-y-1 p-2 bg-muted/50 rounded">
                <Input
                  value={c.label}
                  onChange={(e) => {
                    const newConditions = [...cd.conditions]
                    newConditions[i] = { ...c, label: e.target.value }
                    update({ conditions: newConditions } as Partial<ConditionNodeData>)
                  }}
                  className="h-7 text-xs"
                  placeholder="e.g. If Premium, Else"
                />
                <ExpressionEditor
                  value={c.expression}
                  onChange={(v) => {
                    const newConditions = [...cd.conditions]
                    newConditions[i] = { ...c, expression: v }
                    update({ conditions: newConditions } as Partial<ConditionNodeData>)
                  }}
                  className="min-h-[36px]"
                  mono
                  rows={1}
                  placeholder="e.g. input.score > 80"
                />
              </div>
            ))}
          </div>
        </Section>
      )
    }

    case NodeType.SWITCH: {
      const sd = data as SwitchNodeData
      return (
        <>
          <Section title="Configuration">
            <div className="space-y-1">
              <Label className="text-xs">Switch Expression</Label>
              <ExpressionEditor
                value={sd.switchOn}
                onChange={(v) =>
                  update({ switchOn: v } as Partial<SwitchNodeData>)
                }
                className="min-h-[36px]"
                mono
                rows={1}
                placeholder="e.g., {{ input.category }}"
              />
              <p className="text-[10px] text-muted-foreground">
                Value to match against each case below.
              </p>
            </div>
            <div className="space-y-2 mt-2">
              <Label className="text-xs">Cases</Label>
              {sd.cases.map((c, i) => (
                <div key={c.id} className="space-y-1 p-2 bg-muted/50 rounded relative">
                  <div className="flex gap-1.5">
                    <Input
                      value={c.label}
                      onChange={(e) => {
                        const newCases = [...sd.cases]
                        newCases[i] = { ...c, label: e.target.value }
                        update({ cases: newCases } as Partial<SwitchNodeData>)
                      }}
                      className="h-7 text-xs flex-1"
                      placeholder="e.g. Premium"
                    />
                    {sd.cases.length > 1 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() => {
                          const newCases = sd.cases.filter((_, j) => j !== i)
                          update({ cases: newCases } as Partial<SwitchNodeData>)
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                  <Input
                    value={c.value}
                    onChange={(e) => {
                      const newCases = [...sd.cases]
                      newCases[i] = { ...c, value: e.target.value }
                      update({ cases: newCases } as Partial<SwitchNodeData>)
                    }}
                    className="h-7 text-xs font-mono"
                    placeholder="e.g. premium, active"
                  />
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                className="w-full h-7 text-xs"
                onClick={() => {
                  const newId = `case${sd.cases.length + 1}`
                  const newCases = [...sd.cases, { id: newId, value: "", label: `Case ${sd.cases.length + 1}` }]
                  update({ cases: newCases } as Partial<SwitchNodeData>)
                }}
              >
                <Plus className="h-3 w-3 mr-1" />
                Add Case
              </Button>
            </div>
          </Section>
          <Section title="Default Case" defaultOpen={false}>
            <p className="text-[10px] text-muted-foreground">
              When no case matches, the flow routes to the &quot;default&quot; output handle.
            </p>
          </Section>
        </>
      )
    }

    case NodeType.LOOP: {
      const ld = data as LoopNodeData
      return (
        <>
          <Section title="Configuration">
            <div className="space-y-1">
              <Label className="text-xs">Loop Type</Label>
              <Select
                value={ld.loopType}
                onValueChange={(v) =>
                  update({ loopType: v } as Partial<LoopNodeData>)
                }
              >
                <SelectTrigger className="h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="foreach" className="text-xs">For Each</SelectItem>
                  <SelectItem value="dowhile" className="text-xs">Do While</SelectItem>
                  <SelectItem value="dountil" className="text-xs">Do Until</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {ld.loopType === "foreach" && (
              <div className="space-y-1">
                <Label className="text-xs">Items Path</Label>
                <Input
                  value={ld.itemsPath || ""}
                  onChange={(e) =>
                    update({ itemsPath: e.target.value } as Partial<LoopNodeData>)
                  }
                  className="h-7 text-xs font-mono"
                  placeholder="e.g., documents, data.items"
                />
                <p className="text-[10px] text-muted-foreground">
                  Optional. Path to extract array from input object.
                </p>
              </div>
            )}
            {ld.loopType !== "foreach" && (
              <div className="space-y-1">
                <Label className="text-xs">Condition</Label>
                <ExpressionEditor
                  value={ld.condition || ""}
                  onChange={(v) =>
                    update({ condition: v } as Partial<LoopNodeData>)
                  }
                  className="min-h-[36px]"
                  mono
                  rows={1}
                  placeholder="e.g. $index < 10"
                />
              </div>
            )}
          </Section>
          <Section title="Advanced" defaultOpen={false}>
            <div className="space-y-1">
              <Label className="text-xs">Max Iterations</Label>
              <Input
                type="number"
                value={ld.maxIterations ?? 100}
                onChange={(e) =>
                  update({ maxIterations: parseInt(e.target.value) || 100 } as Partial<LoopNodeData>)
                }
                className="h-7 text-xs"
                min={1}
                max={10000}
                placeholder="100"
              />
              <p className="text-[10px] text-muted-foreground">
                Safety limit to prevent infinite loops.
              </p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Concurrency</Label>
              <Input
                type="number"
                value={ld.concurrency || 1}
                onChange={(e) =>
                  update({ concurrency: parseInt(e.target.value) || 1 } as Partial<LoopNodeData>)
                }
                className="h-7 text-xs"
                min={1}
                max={20}
                placeholder="Default: 1"
              />
              <p className="text-[10px] text-muted-foreground">
                Items processed in parallel per batch. 1 = sequential.
              </p>
            </div>
          </Section>
        </>
      )
    }

    case NodeType.MERGE: {
      const md = data as MergeNodeData
      return (
        <Section title="Configuration">
          <div className="space-y-1">
            <Label className="text-xs">Merge Strategy</Label>
            <Select
              value={md.mergeStrategy}
              onValueChange={(v) =>
                update({ mergeStrategy: v } as Partial<MergeNodeData>)
              }
            >
              <SelectTrigger className="h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">Wait for All</SelectItem>
                <SelectItem value="any" className="text-xs">Wait for Any</SelectItem>
                <SelectItem value="first" className="text-xs">First Completed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </Section>
      )
    }

    case NodeType.HUMAN_INPUT:
    case NodeType.APPROVAL:
    case NodeType.HANDOFF: {
      const hd = data as HumanInputNodeData
      return (
        <>
          <Section title="Configuration">
            <div className="space-y-1">
              <Label className="text-xs">Prompt</Label>
              <ExpressionEditor
                value={hd.prompt}
                onChange={(v) =>
                  update({ prompt: v } as Partial<HumanInputNodeData>)
                }
                className="min-h-[60px]"
                placeholder="What should the human do?"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Assign To</Label>
              <Input
                value={hd.assignTo || ""}
                onChange={(e) =>
                  update({ assignTo: e.target.value } as Partial<HumanInputNodeData>)
                }
                className="h-7 text-xs"
                placeholder="user@example.com"
              />
            </div>
          </Section>
          <Section title="Advanced" defaultOpen={false}>
            <div className="space-y-1">
              <Label className="text-xs">Timeout</Label>
              <Input
                type="number"
                value={hd.timeout || ""}
                onChange={(e) =>
                  update({
                    timeout: e.target.value ? parseInt(e.target.value) : undefined,
                  } as Partial<HumanInputNodeData>)
                }
                className="h-7 text-xs"
                placeholder="No timeout"
              />
              <p className="text-[10px] text-muted-foreground">
                Wait time in seconds before auto-resolving.
              </p>
            </div>
          </Section>
        </>
      )
    }

    case NodeType.TRANSFORM: {
      const td = data as TransformNodeData
      return (
        <Section title="Configuration">
          <div className="space-y-1">
            <Label className="text-xs">Expression</Label>
            <ExpressionEditor
              value={td.expression}
              onChange={(v) =>
                update({ expression: v } as Partial<TransformNodeData>)
              }
              className="min-h-[80px]"
              mono
              placeholder="return input;"
            />
          </div>
        </Section>
      )
    }

    case NodeType.FILTER: {
      const fd = data as FilterNodeData
      return (
        <Section title="Configuration">
          <div className="space-y-1">
            <Label className="text-xs">Filter Condition</Label>
            <ExpressionEditor
              value={fd.condition}
              onChange={(v) =>
                update({ condition: v } as Partial<FilterNodeData>)
              }
              className="min-h-[60px]"
              mono
              placeholder="return true;"
            />
          </div>
        </Section>
      )
    }

    case NodeType.AGGREGATE: {
      const ad = data as AggregateNodeData
      return (
        <Section title="Configuration">
          <div className="space-y-1">
            <Label className="text-xs">Operation</Label>
            <Select
              value={ad.operation}
              onValueChange={(v) =>
                update({ operation: v } as Partial<AggregateNodeData>)
              }
            >
              <SelectTrigger className="h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="concat" className="text-xs">Concat</SelectItem>
                <SelectItem value="sum" className="text-xs">Sum</SelectItem>
                <SelectItem value="count" className="text-xs">Count</SelectItem>
                <SelectItem value="merge" className="text-xs">Merge</SelectItem>
                <SelectItem value="custom" className="text-xs">Custom</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {ad.operation === "custom" && (
            <div className="space-y-1">
              <Label className="text-xs">Expression</Label>
              <ExpressionEditor
                value={ad.expression || ""}
                onChange={(v) =>
                  update({ expression: v } as Partial<AggregateNodeData>)
                }
                className="min-h-[60px]"
                mono
              />
            </div>
          )}
        </Section>
      )
    }

    case NodeType.OUTPUT_PARSER: {
      const pd = data as OutputParserNodeData
      return (
        <Section title="Configuration">
          <div className="space-y-1">
            <Label className="text-xs">Parse Mode</Label>
            <Select
              value={pd.strict ? "strict" : "lenient"}
              onValueChange={(v) =>
                update({ strict: v === "strict" } as Partial<OutputParserNodeData>)
              }
            >
              <SelectTrigger className="h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="lenient" className="text-xs">Lenient</SelectItem>
                <SelectItem value="strict" className="text-xs">Strict</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            Parse LLM JSON output into structured data.
            {pd.strict
              ? " Throws error on invalid JSON."
              : " Passes input through on failure."}
          </p>
        </Section>
      )
    }

    case NodeType.RAG_SEARCH: {
      const rd = data as RagSearchNodeData
      return (
        <Section title="Configuration">
          <KnowledgeBaseGroupSelector
            value={rd.knowledgeBaseGroupIds || []}
            onChange={(ids) =>
              update({ knowledgeBaseGroupIds: ids } as Partial<RagSearchNodeData>)
            }
          />
          <div className="space-y-1">
            <Label className="text-xs">Top K Results</Label>
            <Input
              type="number"
              value={rd.topK || 5}
              onChange={(e) =>
                update({ topK: parseInt(e.target.value) || 5 } as Partial<RagSearchNodeData>)
              }
              className="h-7 text-xs"
              min={1}
              max={50}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Query Template</Label>
            <ExpressionEditor
              value={rd.queryTemplate || ""}
              onChange={(v) =>
                update({ queryTemplate: v } as Partial<RagSearchNodeData>)
              }
              className="min-h-[60px]"
              placeholder="{{input.query}}"
            />
          </div>
        </Section>
      )
    }

    case NodeType.STREAM_OUTPUT: {
      const sd = data as StreamOutputNodeData
      return (
        <>
          <Section title="Configuration">
            <ModelSelector
              value={sd.model}
              onChange={(v) =>
                update({ model: v } as Partial<StreamOutputNodeData>)
              }
              error={errors.model}
            />
            <div className="space-y-1">
              <Label className="text-xs">System Prompt</Label>
              <ExpressionEditor
                value={sd.systemPrompt || ""}
                onChange={(v) =>
                  update({ systemPrompt: v } as Partial<StreamOutputNodeData>)
                }
                className="min-h-[80px]"
                placeholder="You are a helpful assistant..."
              />
            </div>
          </Section>
          <Section title="Advanced" defaultOpen={false}>
            <div className="space-y-1">
              <Label className="text-xs">
                Temperature: {sd.temperature?.toFixed(1) ?? "0.7"}
              </Label>
              <Slider
                value={[sd.temperature ?? 0.7]}
                min={0}
                max={2}
                step={0.1}
                onValueChange={([v]) =>
                  update({ temperature: v } as Partial<StreamOutputNodeData>)
                }
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Max Tokens</Label>
              <Input
                type="number"
                value={sd.maxTokens ?? ""}
                onChange={(e) =>
                  update({ maxTokens: e.target.value ? parseInt(e.target.value) : undefined } as Partial<StreamOutputNodeData>)
                }
                className="h-7 text-xs"
                placeholder="Auto"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Top P: {sd.topP?.toFixed(2) ?? "1.0"}</Label>
              <Slider
                value={[sd.topP ?? 1]}
                min={0}
                max={1}
                step={0.05}
                onValueChange={([v]) =>
                  update({ topP: v } as Partial<StreamOutputNodeData>)
                }
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Frequency Penalty: {sd.frequencyPenalty?.toFixed(1) ?? "0"}</Label>
              <Slider
                value={[sd.frequencyPenalty ?? 0]}
                min={-2}
                max={2}
                step={0.1}
                onValueChange={([v]) =>
                  update({ frequencyPenalty: v } as Partial<StreamOutputNodeData>)
                }
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Presence Penalty: {sd.presencePenalty?.toFixed(1) ?? "0"}</Label>
              <Slider
                value={[sd.presencePenalty ?? 0]}
                min={-2}
                max={2}
                step={0.1}
                onValueChange={([v]) =>
                  update({ presencePenalty: v } as Partial<StreamOutputNodeData>)
                }
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Stop Sequences</Label>
              <Input
                value={(sd.stopSequences || []).join(", ")}
                onChange={(e) =>
                  update({ stopSequences: e.target.value ? e.target.value.split(",").map((s) => s.trim()) : [] } as Partial<StreamOutputNodeData>)
                }
                className="h-7 text-xs font-mono"
                placeholder="Comma-separated, e.g. END, STOP"
              />
            </div>
          </Section>
        </>
      )
    }

    case NodeType.DATABASE: {
      const dbd = data as DatabaseNodeData
      return (
        <>
          <Section title="Configuration">
            <div className="space-y-1">
              <Label className="text-xs">SQL Query</Label>
              <ExpressionEditor
                value={dbd.query || ""}
                onChange={(v) => update({ query: v } as Partial<DatabaseNodeData>)}
                className="min-h-[80px]"
                mono
                placeholder="SELECT * FROM users WHERE ..."
              />
              <p className="text-[10px] text-muted-foreground">
                Only SELECT queries are allowed for security.
              </p>
            </div>
          </Section>
          <Section title="Advanced" defaultOpen={false}>
            <div className="space-y-1">
              <Label className="text-xs">Query Timeout</Label>
              <Input
                type="number"
                min={1000}
                max={60000}
                value={dbd.timeout ?? 10000}
                onChange={(e) =>
                  update({
                    timeout: parseInt(e.target.value) || 10000,
                  } as Partial<DatabaseNodeData>)
                }
                className="h-7 text-xs"
                placeholder="Default: 10000"
              />
              <p className="text-[10px] text-muted-foreground">
                Timeout in milliseconds.
              </p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Result Limit</Label>
              <Input
                type="number"
                min={1}
                max={10000}
                value={dbd.resultLimit ?? 1000}
                onChange={(e) =>
                  update({
                    resultLimit: parseInt(e.target.value) || 1000,
                  } as Partial<DatabaseNodeData>)
                }
                className="h-7 text-xs"
                placeholder="Default: 1000"
              />
              <p className="text-[10px] text-muted-foreground">
                Maximum number of rows returned.
              </p>
            </div>
          </Section>
        </>
      )
    }

    case NodeType.STORAGE: {
      const sd = data as StorageNodeData
      return (
        <Section title="Configuration">
          <div className="space-y-1">
            <Label className="text-xs">Operation</Label>
            <Select
              value={sd.operation}
              onValueChange={(v) =>
                update({ operation: v } as Partial<StorageNodeData>)
              }
            >
              <SelectTrigger className="h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="read" className="text-xs">Read File</SelectItem>
                <SelectItem value="list" className="text-xs">List Files</SelectItem>
                <SelectItem value="write" className="text-xs">Write File</SelectItem>
                <SelectItem value="delete" className="text-xs">Delete File</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Path</Label>
            <ExpressionEditor
              value={sd.path || ""}
              onChange={(v) =>
                update({ path: v } as Partial<StorageNodeData>)
              }
              className="min-h-[36px]"
              mono
              rows={1}
              placeholder="e.g., documents/{{ input.filename }}"
            />
            <p className="text-[10px] text-muted-foreground">
              S3-compatible storage path. Supports template expressions.
            </p>
          </div>
        </Section>
      )
    }

    case NodeType.ERROR_HANDLER: {
      const ehd = data as ErrorHandlerNodeData
      return (
        <>
          <Section title="Configuration">
            <p className="text-[10px] text-muted-foreground mb-2">
              Wraps connected &quot;Success&quot; branch in a try-catch. On failure, routes to &quot;Error&quot; branch.
            </p>
            <div className="space-y-1">
              <Label className="text-xs">Retry Count</Label>
              <Input
                type="number"
                value={ehd.retryCount ?? 0}
                onChange={(e) =>
                  update({ retryCount: parseInt(e.target.value) || 0 } as Partial<ErrorHandlerNodeData>)
                }
                className="h-7 text-xs"
                min={0}
                max={10}
                placeholder="Default: 0"
              />
              <p className="text-[10px] text-muted-foreground">
                Number of retry attempts before routing to error branch.
              </p>
            </div>
            {(ehd.retryCount ?? 0) > 0 && (
              <div className="space-y-1">
                <Label className="text-xs">Retry Delay</Label>
                <Input
                  type="number"
                  value={ehd.retryDelay ?? 1000}
                  onChange={(e) =>
                    update({ retryDelay: parseInt(e.target.value) || 1000 } as Partial<ErrorHandlerNodeData>)
                  }
                  className="h-7 text-xs"
                  min={100}
                  placeholder="Default: 1000"
                />
                <p className="text-[10px] text-muted-foreground">
                  Delay in milliseconds between retries. Multiplied by attempt number.
                </p>
              </div>
            )}
          </Section>
          <Section title="Fallback" defaultOpen={false}>
            <div className="space-y-1">
              <Label className="text-xs">Fallback Value</Label>
              <ExpressionEditor
                value={ehd.fallbackValue || ""}
                onChange={(v) =>
                  update({ fallbackValue: v } as Partial<ErrorHandlerNodeData>)
                }
                mono
                rows={2}
                placeholder='e.g. {"status": "fallback"}'
              />
              <p className="text-[10px] text-muted-foreground">
                Optional value passed to the error branch as fallbackValue.
              </p>
            </div>
          </Section>
        </>
      )
    }

    case NodeType.SUB_WORKFLOW: {
      const swd = data as SubWorkflowNodeData
      const mappingEntries = Object.entries(swd.inputMapping || {})
      return (
        <>
          <Section title="Configuration">
            <div className="space-y-1">
              <Label className="text-xs">Workflow</Label>
              <WorkflowSelector
                value={swd.workflowId}
                onChange={(id, name) =>
                  update({ workflowId: id, workflowName: name } as Partial<SubWorkflowNodeData>)
                }
                error={!swd.workflowId ? "Select a workflow" : undefined}
              />
            </div>
          </Section>
          <Section title="Input Mapping" defaultOpen={mappingEntries.length > 0}>
            <p className="text-[10px] text-muted-foreground mb-2">
              Map parent data to child workflow inputs.
            </p>
            {mappingEntries.map(([key, value], i) => (
              <div key={i} className="flex gap-1 items-start mb-1">
                <Input
                  value={key}
                  onChange={(e) => {
                    const newMapping = { ...swd.inputMapping }
                    delete newMapping[key]
                    newMapping[e.target.value] = value
                    update({ inputMapping: newMapping } as Partial<SubWorkflowNodeData>)
                  }}
                  placeholder="param"
                  className="h-7 text-xs w-1/3"
                />
                <ExpressionEditor
                  value={value}
                  onChange={(v) => {
                    const newMapping = { ...swd.inputMapping, [key]: v }
                    update({ inputMapping: newMapping } as Partial<SubWorkflowNodeData>)
                  }}
                  mono
                  rows={1}
                  placeholder="{{ input.field }}"
                  className="flex-1"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={() => {
                    const newMapping = { ...swd.inputMapping }
                    delete newMapping[key]
                    update({ inputMapping: newMapping } as Partial<SubWorkflowNodeData>)
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              className="w-full h-7 text-xs"
              onClick={() => {
                const newMapping = { ...swd.inputMapping, "": "" }
                update({ inputMapping: newMapping } as Partial<SubWorkflowNodeData>)
              }}
            >
              <Plus className="h-3 w-3 mr-1" /> Add Mapping
            </Button>
          </Section>
        </>
      )
    }

    default:
      return (
        <Section title="Configuration">
          <p className="text-xs text-muted-foreground italic">
            No additional configuration needed.
          </p>
        </Section>
      )
  }
}
