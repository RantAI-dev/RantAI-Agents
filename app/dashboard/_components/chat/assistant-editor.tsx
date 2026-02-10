"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { Database, Trash2, Folder, Check, Wrench, AlertTriangle, Search, Package, Plug, ChevronDown, ChevronRight, Cpu } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { AVAILABLE_MODELS, DEFAULT_MODEL_ID } from "@/lib/models"
import type { Assistant, AssistantInput } from "@/lib/types/assistant"

interface KnowledgeGroup {
  id: string
  name: string
  color: string | null
  documentCount: number
}

const EMOJI_OPTIONS = ["💬", "🤖", "🧠", "📚", "🎯", "💡", "🔮", "⭐", "🌟", "🏠", "💼", "🎧"]

interface AssistantEditorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  assistant?: Assistant | null
  onSave: (input: AssistantInput) => void
  onDelete?: (id: string) => void
}

export function AssistantEditor({
  open,
  onOpenChange,
  assistant,
  onSave,
  onDelete,
}: AssistantEditorProps) {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [emoji, setEmoji] = useState("💬")
  const [systemPrompt, setSystemPrompt] = useState("")
  const [selectedModel, setSelectedModel] = useState(DEFAULT_MODEL_ID)
  const [useKnowledgeBase, setUseKnowledgeBase] = useState(false)
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([])
  const [groups, setGroups] = useState<KnowledgeGroup[]>([])
  const [loadingGroups, setLoadingGroups] = useState(false)
  const [availableTools, setAvailableTools] = useState<{ id: string; name: string; displayName: string; description: string; category: string; enabled: boolean }[]>([])
  const [selectedToolIds, setSelectedToolIds] = useState<string[]>([])
  const [loadingTools, setLoadingTools] = useState(false)

  const isEditing = !!assistant
  const canDelete = assistant?.isEditable && onDelete

  // Fetch tools when dialog opens
  const fetchTools = useCallback(async () => {
    setLoadingTools(true)
    try {
      const res = await fetch("/api/dashboard/tools")
      if (res.ok) {
        const data = await res.json()
        setAvailableTools(data.filter((t: { enabled: boolean }) => t.enabled))
      }
    } catch {
      // ignore
    } finally {
      setLoadingTools(false)
    }
  }, [])

  const fetchAssistantTools = useCallback(async (assistantId: string) => {
    try {
      const res = await fetch(`/api/assistants/${assistantId}/tools`)
      if (res.ok) {
        const data = await res.json()
        setSelectedToolIds(data.map((t: { id: string }) => t.id))
      }
    } catch {
      // ignore
    }
  }, [])

  // Fetch groups when dialog opens
  const fetchGroups = useCallback(async () => {
    setLoadingGroups(true)
    try {
      const response = await fetch("/api/dashboard/knowledge/groups")
      if (response.ok) {
        const data = await response.json()
        setGroups(data.groups)
      }
    } catch (error) {
      console.error("Failed to fetch groups:", error)
    } finally {
      setLoadingGroups(false)
    }
  }, [])

  // Reset form when dialog opens or assistant changes
  useEffect(() => {
    if (open) {
      fetchGroups()
      fetchTools()
      if (assistant) {
        setName(assistant.name)
        setDescription(assistant.description)
        setEmoji(assistant.emoji)
        setSystemPrompt(assistant.systemPrompt)
        setSelectedModel(assistant.model || DEFAULT_MODEL_ID)
        setUseKnowledgeBase(assistant.useKnowledgeBase)
        setSelectedGroupIds(assistant.knowledgeBaseGroupIds || [])
        fetchAssistantTools(assistant.id)
      } else {
        setName("")
        setDescription("")
        setEmoji("💬")
        setSystemPrompt("You are a helpful assistant.")
        setSelectedModel(DEFAULT_MODEL_ID)
        setUseKnowledgeBase(false)
        setSelectedGroupIds([])
        setSelectedToolIds([])
      }
    }
  }, [open, assistant, fetchGroups, fetchTools, fetchAssistantTools])

  const toggleGroup = (groupId: string) => {
    setSelectedGroupIds(prev =>
      prev.includes(groupId)
        ? prev.filter(id => id !== groupId)
        : [...prev, groupId]
    )
  }

  const toggleTool = (toolId: string) => {
    setSelectedToolIds(prev =>
      prev.includes(toolId)
        ? prev.filter(id => id !== toolId)
        : [...prev, toolId]
    )
  }

  const handleSave = async () => {
    if (!name.trim() || !systemPrompt.trim()) return

    onSave({
      name: name.trim(),
      description: description.trim(),
      emoji,
      systemPrompt: systemPrompt.trim(),
      model: selectedModel,
      useKnowledgeBase,
      knowledgeBaseGroupIds: useKnowledgeBase && selectedGroupIds.length > 0 ? selectedGroupIds : undefined,
    })

    // Save tool bindings if editing an existing assistant
    if (assistant?.id) {
      try {
        await fetch(`/api/assistants/${assistant.id}/tools`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ toolIds: selectedToolIds }),
        })
      } catch {
        // Tool save failure is non-blocking
      }
    }

    onOpenChange(false)
  }

  const handleDelete = () => {
    if (assistant && onDelete) {
      onDelete(assistant.id)
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-4 overflow-hidden p-6 sm:max-w-[500px]">
        <DialogHeader className="shrink-0">
          <DialogTitle className="text-lg font-semibold">
            {isEditing ? "Edit Assistant" : "Create New Assistant"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Modify your assistant's configuration."
              : "Create a custom assistant with its own personality and capabilities."}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto py-4">
          {/* Emoji Picker */}
          <div className="space-y-2">
            <Label>Icon</Label>
            <div className="flex flex-wrap gap-2">
              {EMOJI_OPTIONS.map((e) => (
                <button
                  key={e}
                  type="button"
                  className={`w-10 h-10 text-xl rounded-lg border transition-all ${
                    emoji === e
                      ? "border-primary bg-primary/10"
                      : "border-border hover:border-primary/50"
                  }`}
                  onClick={() => setEmoji(e)}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>

          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Assistant"
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A helpful assistant for..."
            />
          </div>

          {/* System Prompt */}
          <div className="space-y-2">
            <Label htmlFor="systemPrompt">System Prompt</Label>
            <Textarea
              id="systemPrompt"
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="You are a helpful assistant..."
              className="min-h-[120px] resize-none"
            />
            <p className="text-xs text-muted-foreground">
              This prompt defines the assistant's personality and behavior.
            </p>
          </div>

          {/* Model Selector */}
          <div className="space-y-2">
            <Label>Model</Label>
            <Select value={selectedModel} onValueChange={setSelectedModel}>
              <SelectTrigger>
                <div className="flex items-center gap-2">
                  <Cpu className="h-4 w-4 text-muted-foreground" />
                  <SelectValue />
                </div>
              </SelectTrigger>
              <SelectContent>
                {AVAILABLE_MODELS.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    <div className="flex items-center gap-2">
                      <span>{m.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {m.provider}
                        {m.pricing.input === 0 ? " · Free" : ""}
                      </span>
                      {m.capabilities.functionCalling && (
                        <span className="text-[10px] bg-primary/10 text-primary px-1 rounded">
                          Tools
                        </span>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {(() => {
              const modelInfo = AVAILABLE_MODELS.find((m) => m.id === selectedModel)
              if (selectedToolIds.length > 0 && modelInfo && !modelInfo.capabilities.functionCalling) {
                return (
                  <p className="text-xs text-destructive flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    This model does not support tool calling. Tools will not work. Choose a model with the &quot;Tools&quot; badge.
                  </p>
                )
              }
              return null
            })()}
          </div>

          {/* Knowledge Base Section */}
          <div className="space-y-3 rounded-lg border p-3">
            {/* Toggle */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Database className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Connect to Knowledge Base</p>
                  <p className="text-xs text-muted-foreground">
                    Enable RAG to retrieve relevant information
                  </p>
                </div>
              </div>
              <Switch
                checked={useKnowledgeBase}
                onCheckedChange={(checked) => {
                  setUseKnowledgeBase(checked)
                  // Auto-select all groups if enabling and none selected
                  if (checked && selectedGroupIds.length === 0 && groups.length > 0) {
                    // Don't auto-select - let user choose
                  }
                }}
              />
            </div>

            {/* Knowledge Base Group Selector - Always visible when groups exist */}
            {groups.length > 0 && (
              <div className={cn("space-y-2", !useKnowledgeBase && "opacity-50")}>
                <Label className="text-xs">Select Knowledge Bases</Label>
                <div className="grid grid-cols-2 gap-2 max-h-[120px] overflow-y-auto">
                  {loadingGroups ? (
                    <p className="text-sm text-muted-foreground col-span-2 text-center py-2">
                      Loading...
                    </p>
                  ) : (
                    groups.map((group) => {
                      const isSelected = selectedGroupIds.includes(group.id)
                      return (
                        <button
                          key={group.id}
                          type="button"
                          disabled={!useKnowledgeBase}
                          onClick={() => toggleGroup(group.id)}
                          className={cn(
                            "flex items-center gap-2 p-2 rounded-md text-sm transition-colors text-left",
                            isSelected
                              ? "bg-primary/10 border border-primary"
                              : "border border-border hover:bg-muted",
                            !useKnowledgeBase && "cursor-not-allowed"
                          )}
                        >
                          <div
                            className="h-4 w-4 rounded flex items-center justify-center shrink-0"
                            style={{ backgroundColor: group.color ?? "var(--chart-3)" }}
                          >
                            {isSelected ? (
                              <Check className="h-3 w-3 text-white" />
                            ) : (
                              <Folder className="h-2.5 w-2.5 text-white" />
                            )}
                          </div>
                          <span className="truncate flex-1">{group.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {group.documentCount}
                          </span>
                        </button>
                      )
                    })
                  )}
                </div>
                {useKnowledgeBase && selectedGroupIds.length === 0 && (
                  <p className="text-xs text-chart-1">
                    No groups selected - will use all documents
                  </p>
                )}
                {useKnowledgeBase && selectedGroupIds.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {selectedGroupIds.length} group{selectedGroupIds.length !== 1 ? "s" : ""} selected
                  </p>
                )}
              </div>
            )}

            {/* No groups message */}
            {!loadingGroups && groups.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No knowledge bases available. Create one in the Knowledge section.
              </p>
            )}
          </div>
        </div>

        {/* Agent Tools Section */}
        {availableTools.length > 0 && (
          <ToolsSection
            availableTools={availableTools}
            selectedToolIds={selectedToolIds}
            toggleTool={toggleTool}
            isEditing={isEditing}
            loadingTools={loadingTools}
            modelSupportsFunctionCalling={
              AVAILABLE_MODELS.find((m) => m.id === selectedModel)?.capabilities.functionCalling ?? false
            }
          />
        )}

        <DialogFooter className="shrink-0 flex flex-row flex-wrap justify-between gap-2">
          {canDelete ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Assistant?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete "{assistant?.name}". This action
                    cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete}>
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : (
            <div />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!name.trim() || !systemPrompt.trim()}>
              {isEditing ? "Save Changes" : "Create Assistant"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Extracted Tools Section with categories, search, and descriptions ──

interface ToolsSectionProps {
  availableTools: Array<{
    id: string
    name: string
    displayName: string
    description: string
    category: string
    enabled: boolean
  }>
  selectedToolIds: string[]
  toggleTool: (toolId: string) => void
  isEditing: boolean
  loadingTools: boolean
  modelSupportsFunctionCalling: boolean
}

const CATEGORY_META: Record<string, { label: string; icon: React.ElementType }> = {
  builtin: { label: "Built-in", icon: Package },
  custom: { label: "Custom", icon: Wrench },
  mcp: { label: "MCP", icon: Plug },
}

function ToolsSection({
  availableTools,
  selectedToolIds,
  toggleTool,
  isEditing,
  loadingTools,
  modelSupportsFunctionCalling,
}: ToolsSectionProps) {
  const [toolSearch, setToolSearch] = useState("")
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set())

  const toggleCategory = (category: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev)
      if (next.has(category)) {
        next.delete(category)
      } else {
        next.add(category)
      }
      return next
    })
  }

  const groupedTools = useMemo(() => {
    const q = toolSearch.toLowerCase()
    const filtered = q
      ? availableTools.filter(
          (t) =>
            t.displayName.toLowerCase().includes(q) ||
            t.name.toLowerCase().includes(q) ||
            t.description.toLowerCase().includes(q)
        )
      : availableTools

    const groups: Record<string, typeof filtered> = {}
    for (const tool of filtered) {
      const cat = tool.category || "custom"
      if (!groups[cat]) groups[cat] = []
      groups[cat].push(tool)
    }
    return groups
  }, [availableTools, toolSearch])

  const categoryOrder = ["builtin", "custom", "mcp"]

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="flex items-center gap-3">
        <Wrench className="h-5 w-5 text-muted-foreground" />
        <div>
          <p className="text-sm font-medium">Agent Tools</p>
          <p className="text-xs text-muted-foreground">
            Enable tools this assistant can use during conversations
          </p>
        </div>
      </div>

      {!isEditing && (
        <p className="text-xs text-amber-600 flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" />
          Save the assistant first, then edit to configure tools
        </p>
      )}

      {isEditing && !modelSupportsFunctionCalling && selectedToolIds.length > 0 && (
        <p className="text-xs text-destructive flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" />
          Selected model does not support tools. Switch to a model with the &quot;Tools&quot; badge.
        </p>
      )}

      {isEditing && (
        <div className="space-y-2">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search tools..."
              value={toolSearch}
              onChange={(e) => setToolSearch(e.target.value)}
              className="pl-7 h-8 text-sm"
            />
          </div>

          {/* Grouped Tool List */}
          <div className="max-h-[200px] overflow-y-auto space-y-2">
            {loadingTools ? (
              <p className="text-sm text-muted-foreground text-center py-2">
                Loading...
              </p>
            ) : Object.keys(groupedTools).length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-2">
                No tools match your search
              </p>
            ) : (
              categoryOrder
                .filter((cat) => groupedTools[cat]?.length)
                .map((category) => {
                  const meta = CATEGORY_META[category] || {
                    label: category,
                    icon: Wrench,
                  }
                  const CategoryIcon = meta.icon
                  const isCollapsed = collapsedCategories.has(category)
                  const tools = groupedTools[category]

                  return (
                    <div key={category}>
                      <button
                        type="button"
                        className="flex items-center gap-1.5 w-full text-left py-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                        onClick={() => toggleCategory(category)}
                      >
                        {isCollapsed ? (
                          <ChevronRight className="h-3 w-3" />
                        ) : (
                          <ChevronDown className="h-3 w-3" />
                        )}
                        <CategoryIcon className="h-3 w-3" />
                        {meta.label}
                        <span className="text-[10px]">({tools.length})</span>
                      </button>

                      {!isCollapsed && (
                        <div className="grid grid-cols-1 gap-1.5 mt-1">
                          {tools.map((tool) => {
                            const isSelected = selectedToolIds.includes(tool.id)
                            return (
                              <button
                                key={tool.id}
                                type="button"
                                onClick={() => toggleTool(tool.id)}
                                className={cn(
                                  "flex items-start gap-2 p-2 rounded-md text-sm transition-colors text-left",
                                  isSelected
                                    ? "bg-primary/10 border border-primary"
                                    : "border border-border hover:bg-muted"
                                )}
                              >
                                <div
                                  className={cn(
                                    "h-4 w-4 rounded flex items-center justify-center shrink-0 mt-0.5",
                                    isSelected ? "bg-primary" : "bg-muted"
                                  )}
                                >
                                  {isSelected ? (
                                    <Check className="h-3 w-3 text-white" />
                                  ) : (
                                    <Wrench className="h-2.5 w-2.5 text-muted-foreground" />
                                  )}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <span className="font-medium truncate block">
                                    {tool.displayName}
                                  </span>
                                  <span className="text-xs text-muted-foreground line-clamp-1">
                                    {tool.description}
                                  </span>
                                </div>
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })
            )}
          </div>

          {selectedToolIds.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {selectedToolIds.length} tool
              {selectedToolIds.length !== 1 ? "s" : ""} enabled
            </p>
          )}
        </div>
      )}
    </div>
  )
}
