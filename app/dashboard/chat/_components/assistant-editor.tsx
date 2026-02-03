"use client"

import { useState, useEffect, useCallback } from "react"
import { Database, Trash2, Folder, Check } from "lucide-react"
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
import { cn } from "@/lib/utils"
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
  const [useKnowledgeBase, setUseKnowledgeBase] = useState(false)
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([])
  const [groups, setGroups] = useState<KnowledgeGroup[]>([])
  const [loadingGroups, setLoadingGroups] = useState(false)

  const isEditing = !!assistant
  const canDelete = assistant?.isEditable && onDelete

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
      if (assistant) {
        setName(assistant.name)
        setDescription(assistant.description)
        setEmoji(assistant.emoji)
        setSystemPrompt(assistant.systemPrompt)
        setUseKnowledgeBase(assistant.useKnowledgeBase)
        setSelectedGroupIds(assistant.knowledgeBaseGroupIds || [])
      } else {
        setName("")
        setDescription("")
        setEmoji("💬")
        setSystemPrompt("You are a helpful assistant.")
        setUseKnowledgeBase(false)
        setSelectedGroupIds([])
      }
    }
  }, [open, assistant, fetchGroups])

  const toggleGroup = (groupId: string) => {
    setSelectedGroupIds(prev =>
      prev.includes(groupId)
        ? prev.filter(id => id !== groupId)
        : [...prev, groupId]
    )
  }

  const handleSave = () => {
    if (!name.trim() || !systemPrompt.trim()) return

    onSave({
      name: name.trim(),
      description: description.trim(),
      emoji,
      systemPrompt: systemPrompt.trim(),
      useKnowledgeBase,
      knowledgeBaseGroupIds: useKnowledgeBase && selectedGroupIds.length > 0 ? selectedGroupIds : undefined,
    })
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
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit Assistant" : "Create New Assistant"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Modify your assistant's configuration."
              : "Create a custom assistant with its own personality and capabilities."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
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
                            style={{ backgroundColor: group.color || "#3b82f6" }}
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
                  <p className="text-xs text-amber-600">
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

        <DialogFooter className="flex-row justify-between sm:justify-between">
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
