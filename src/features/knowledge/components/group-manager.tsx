"use client"

import { useOrgFetch } from "@/hooks/use-organization"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Folder, MoreHorizontal, Pencil, Trash2, Plus, ChevronRight } from "@/lib/icons"
import { cn } from "@/lib/utils"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { buildTree, flattenTree, expandSelectionLocally, MAX_KB_DEPTH } from "@/features/knowledge/groups/tree"

export interface KnowledgeGroup {
  id: string
  name: string
  description: string | null
  color: string | null
  /** null = top-level. A KB nested inside another names its parent here. */
  parentId?: string | null
  documentCount: number
  createdAt: string
  updatedAt: string
}

interface GroupManagerProps {
  groups: KnowledgeGroup[]
  selectedGroupId: string | null
  onSelectGroup: (groupId: string | null) => void
  onGroupsChange: () => void
  totalDocumentCount?: number
}

const PRESET_COLORS = [
  "#ef4444", // red
  "#f97316", // orange
  "#eab308", // yellow
  "#22c55e", // green
  "#06b6d4", // cyan
  "#3b82f6", // blue
  "#8b5cf6", // violet
  "#ec4899", // pink
]

export function GroupManager({
  groups,
  selectedGroupId,
  onSelectGroup,
  onGroupsChange,
  totalDocumentCount,
}: GroupManagerProps) {
  const orgFetch = useOrgFetch()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingGroup, setEditingGroup] = useState<KnowledgeGroup | null>(null)
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [color, setColor] = useState(PRESET_COLORS[0])
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<KnowledgeGroup | null>(null)
  const [parentId, setParentId] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  // Set when a delete comes back 409 because the KB still has KBs inside it.
  // Holding the count lets the confirm say how much is about to go.
  const [cascadeWarning, setCascadeWarning] = useState<string | null>(null)

  const rows = flattenTree(buildTree(groups.map((g) => ({ ...g, parentId: g.parentId ?? null }))))
  const childIdsOf = (id: string) => new Set(expandSelectionLocally(
    groups.map((g) => ({ ...g, parentId: g.parentId ?? null })),
    [id],
  ))

  /**
   * Documents in a KB *and* everything nested inside it.
   *
   * The sidebar count has to match what selecting that KB actually searches,
   * or a parent reading "0" would still return answers.
   */
  const subtreeCount = (id: string) => {
    const scope = childIdsOf(id)
    return groups.reduce((sum, g) => (scope.has(g.id) ? sum + g.documentCount : sum), 0)
  }

  const handleCreate = (underParentId: string | null = null) => {
    setEditingGroup(null)
    setName("")
    setDescription("")
    setParentId(underParentId)
    setSaveError(null)
    setColor(PRESET_COLORS[Math.floor(Math.random() * PRESET_COLORS.length)])
    setDialogOpen(true)
  }

  const handleEdit = (group: KnowledgeGroup) => {
    setEditingGroup(group)
    setName(group.name)
    setDescription(group.description || "")
    setColor(group.color || PRESET_COLORS[0])
    setParentId(group.parentId ?? null)
    setSaveError(null)
    setDialogOpen(true)
  }

  /**
   * Parents this KB may be moved under.
   *
   * Excludes itself and its own descendants — nesting a KB inside its own child
   * would cut that whole branch off from the root. The server rejects it too;
   * this just keeps the impossible choice off the menu.
   */
  const parentOptions = (() => {
    if (!editingGroup) return rows
    const blocked = childIdsOf(editingGroup.id)
    return rows.filter((r) => !blocked.has(r.id))
  })()

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return

    try {
      const response = await orgFetch(
        `/api/dashboard/files/groups/${deleteTarget.id}${cascadeWarning ? "?cascade=true" : ""}`,
        { method: "DELETE" },
      )
      if (response.ok) {
        // Anything in the deleted subtree could have been the active view.
        if (childIdsOf(deleteTarget.id).has(selectedGroupId ?? "")) {
          onSelectGroup(null)
        }
        onGroupsChange()
        setDeleteTarget(null)
        setCascadeWarning(null)
        return
      }
      if (response.status === 409) {
        // Has nested KBs. Keep the dialog open and ask again, now explicitly.
        const body = await response.json().catch(() => null)
        setCascadeWarning(body?.error ?? "This knowledge base has others nested inside it.")
        return
      }
      setDeleteTarget(null)
    } catch (error) {
      console.error("Failed to delete group:", error)
      setDeleteTarget(null)
    }
  }

  const handleSave = async () => {
    if (!name.trim()) return

    setSaving(true)
    try {
      const url = editingGroup
        ? `/api/dashboard/files/groups/${editingGroup.id}`
        : "/api/dashboard/files/groups"

      const response = await fetch(url, {
        method: editingGroup ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          color,
          parentId,
        }),
      })

      if (response.ok) {
        setDialogOpen(false)
        onGroupsChange()
      } else {
        // A rejected move (cycle, too deep, parent gone) is a message worth
        // showing — the dialog used to close as if it had worked.
        const body = await response.json().catch(() => null)
        setSaveError(body?.error ?? "Could not save this knowledge base.")
      }
    } catch (error) {
      console.error("Failed to save group:", error)
      setSaveError("Could not reach the server.")
    } finally {
      setSaving(false)
    }
  }

  const totalDocuments = groups.reduce((sum, g) => sum + g.documentCount, 0)

  return (
    <div className="space-y-1">
      {/* All Documents */}
      <button
        onClick={() => onSelectGroup(null)}
        className={cn(
          "group w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-200 relative",
          selectedGroupId === null
            ? "bg-sidebar-accent text-sidebar-foreground"
            : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-hover"
        )}
      >
        <div
          className={cn(
            "absolute left-0 top-1/2 -translate-y-1/2 w-1 rounded-r-sm bg-sidebar-foreground",
            "transition-all duration-150 ease-in-out",
            selectedGroupId === null
              ? "h-10 opacity-100"
              : "h-2 opacity-0 group-hover:h-6 group-hover:opacity-100"
          )}
        />
        <Folder className="h-5 w-5 shrink-0" />
        <span className="flex-1 text-left truncate">All Documents</span>
        <span className="text-xs text-sidebar-muted tabular-nums">{totalDocumentCount ?? totalDocuments}</span>
        {selectedGroupId === null && <ChevronRight className="h-4 w-4 text-sidebar-foreground/60" />}
      </button>

      {/* Groups, nested. Rows arrive depth-first so a child always renders
          directly under its parent; indentation is the only cue needed. */}
      {rows.map((group) => {
        const isActive = selectedGroupId === group.id
        const nested = subtreeCount(group.id)
        const hasChildren = nested !== group.documentCount || rows.some((r) => r.parentId === group.id)

        return (
          <div key={group.id} className="group/item relative">
            <button
              onClick={() => onSelectGroup(group.id)}
              style={{ paddingLeft: `${12 + group.depth * 16}px` }}
              title={
                hasChildren
                  ? `${group.name} — searching this includes ${nested} document${nested === 1 ? "" : "s"} from nested knowledge bases`
                  : group.name
              }
              className={cn(
                "w-full flex items-center gap-3 pr-3 py-2.5 rounded-lg text-sm transition-all duration-200 relative",
                isActive
                  ? "bg-sidebar-accent text-sidebar-foreground"
                  : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-hover"
              )}
            >
              <div
                className={cn(
                  "absolute left-0 top-1/2 -translate-y-1/2 w-1 rounded-r-sm",
                  "transition-all duration-150 ease-in-out",
                  isActive
                    ? "h-10 opacity-100"
                    : "h-2 opacity-0 group-hover/item:h-6 group-hover/item:opacity-100"
                )}
                style={{ backgroundColor: group.color ?? "var(--chart-3)" }}
              />
              <div
                className="h-5 w-5 shrink-0 rounded flex items-center justify-center"
                style={{ backgroundColor: group.color ?? "var(--chart-3)" }}
              >
                <Folder className="h-3.5 w-3.5 text-white" />
              </div>
              <span className="flex-1 text-left truncate">{group.name}</span>
              <span className="text-xs text-sidebar-muted tabular-nums">
                {nested !== group.documentCount ? `${group.documentCount}/${nested}` : group.documentCount}
              </span>
              {isActive && <ChevronRight className="h-4 w-4 text-sidebar-foreground/60" />}
            </button>

            {/* Actions dropdown - visible on hover */}
            <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover/item:opacity-100 transition-opacity">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Group options">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => handleEdit(group)}>
                    <Pencil className="h-4 w-4 mr-2" />
                    Edit
                  </DropdownMenuItem>
                  {group.depth + 1 < MAX_KB_DEPTH && (
                    <DropdownMenuItem onClick={() => handleCreate(group.id)}>
                      <Plus className="h-4 w-4 mr-2" />
                      New nested KB
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    onClick={() => setDeleteTarget(group)}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        )
      })}

      {/* Create Group Button */}
      <button
        onClick={() => handleCreate(null)}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-hover transition-all duration-200"
      >
        <Plus className="h-5 w-5" />
        <span>New Group</span>
      </button>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingGroup ? "Edit Group" : "Create Group"}
            </DialogTitle>
            <DialogDescription>
              {editingGroup
                ? "Update the group details below."
                : "Create a new group to organize your knowledge base documents."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Product Documentation"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What documents belong in this group?"
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="parent">Nest inside (optional)</Label>
              <Select
                value={parentId ?? "__root__"}
                onValueChange={(v) => setParentId(v === "__root__" ? null : v)}
              >
                <SelectTrigger id="parent">
                  <SelectValue placeholder="Top level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__root__">Top level</SelectItem>
                  {parentOptions.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {"\u00A0".repeat(option.depth * 3)}
                      {option.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Picking this knowledge base for an assistant also searches everything nested
                inside it. Pick a nested one on its own to search just that.
              </p>
            </div>

            {saveError && (
              <p className="text-sm text-destructive" role="alert">
                {saveError}
              </p>
            )}

            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex gap-2 flex-wrap">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={cn(
                      "h-8 w-8 rounded-full transition-all",
                      color === c ? "ring-2 ring-offset-2 ring-primary" : ""
                    )}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!name.trim() || saving}>
              {saving ? "Saving..." : editingGroup ? "Save Changes" : "Create Group"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null)
            setCascadeWarning(null)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {cascadeWarning ? "Delete nested knowledge bases too?" : "Delete group"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {cascadeWarning ? (
                <>
                  {cascadeWarning} Deleting it will delete every knowledge base inside it as
                  well. Documents stay — they are unassigned, not deleted.
                </>
              ) : (
                <>
                  Delete &ldquo;{deleteTarget?.name}&rdquo;? Documents will be unassigned but not
                  deleted.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {cascadeWarning ? "Delete all of them" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
