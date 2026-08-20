"use client"

import Link from "next/link"
import { Database, ExternalLink, Check, Folder } from "@/lib/icons"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useKnowledgeBases, type KnowledgeBase } from "@/hooks/use-knowledge-bases"
import { buildTree, flattenTree, expandSelectionLocally } from "@/features/knowledge/groups/tree"

interface TabKnowledgeProps {
  useKnowledgeBase: boolean
  knowledgeBaseGroupIds: string[]
  /**
   * Server-rendered KB list passed in by the Agent Builder page hydration so
   * the first paint shows the correct counts; thereafter useKnowledgeBases
   * keeps the local copy in sync with sidebar / Files page mutations via the
   * `knowledge-bases-updated` event.
   */
  initialKnowledgeGroups: KnowledgeBase[]
  onUseKnowledgeBaseChange: (v: boolean) => void
  onKnowledgeBaseGroupIdsChange: (ids: string[]) => void
}

export function TabKnowledge({
  useKnowledgeBase,
  knowledgeBaseGroupIds,
  initialKnowledgeGroups,
  onUseKnowledgeBaseChange,
  onKnowledgeBaseGroupIdsChange,
}: TabKnowledgeProps) {
  const { knowledgeBases: groups } = useKnowledgeBases({
    groups: initialKnowledgeGroups,
  })

  const flat = groups.map((g) => ({ ...g, parentId: g.parentId ?? null }))
  const rows = flattenTree(buildTree(flat))

  /**
   * Only the ticked KBs are stored, never their descendants.
   *
   * The server expands a selection to its subtree on every retrieval, so
   * storing the expansion here would freeze the tree as it looked the day the
   * assistant was saved: a KB added under a selected parent tomorrow would
   * silently not be searched. Storing the intent and expanding late keeps the
   * assistant correct as the library changes.
   */
  const toggleGroup = (groupId: string) => {
    const current = knowledgeBaseGroupIds || []
    if (current.includes(groupId)) {
      onKnowledgeBaseGroupIdsChange(current.filter((id) => id !== groupId))
    } else {
      // Ticking a parent makes any separately-ticked descendant redundant —
      // drop them so the saved list says what the user means, not more.
      const covered = new Set(expandSelectionLocally(flat, [groupId]))
      covered.delete(groupId)
      onKnowledgeBaseGroupIdsChange([...current.filter((id) => !covered.has(id)), groupId])
    }
  }

  const selectedIds = knowledgeBaseGroupIds || []
  // What retrieval will actually search, previewed locally.
  const searchedIds = new Set(expandSelectionLocally(flat, selectedIds))
  const docsFor = (id: string) => {
    const scope = new Set(expandSelectionLocally(flat, [id]))
    return flat.reduce((sum, g) => (scope.has(g.id) ? sum + g.documentCount : sum), 0)
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Knowledge Base</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Enable RAG (Retrieval-Augmented Generation) to let the agent search your documents.
        </p>
      </div>

      {/* Toggle */}
      <div className="flex items-center gap-3">
        <Switch
          id="use-kb"
          checked={useKnowledgeBase}
          onCheckedChange={onUseKnowledgeBaseChange}
        />
        <Label htmlFor="use-kb" className="text-sm">
          Enable Knowledge Base
        </Label>
      </div>

      {/* Group Selection */}
      {useKnowledgeBase && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Select which knowledge bases the agent can search. Leave empty to search all.
            Choosing one also searches everything nested inside it — pick a nested knowledge
            base on its own to limit the agent to just that one.
          </p>

          {groups.length === 0 ? (
            <div className="text-center py-6">
              <Database className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">No knowledge groups found</p>
              <Button variant="link" size="sm" className="mt-2" asChild>
                <Link href="/dashboard/files">
                  Go to Files
                  <ExternalLink className="ml-1 h-3 w-3" />
                </Link>
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2">
              {rows.map((group) => {
                const isSelected = selectedIds.includes(group.id)
                // Covered by an ancestor the user ticked: shown as included but
                // not itself stored, which is why it reads differently.
                const isInherited = !isSelected && searchedIds.has(group.id)
                const nested = docsFor(group.id)
                return (
                  <button
                    key={group.id}
                    type="button"
                    onClick={() => toggleGroup(group.id)}
                    style={{ marginLeft: `${group.depth * 20}px` }}
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-lg text-left transition-colors",
                      isSelected
                        ? "bg-primary/10 border border-primary"
                        : isInherited
                          ? "border border-primary/30 bg-primary/5"
                          : "border border-border hover:bg-muted/50"
                    )}
                  >
                    <div
                      className={cn(
                        "h-5 w-5 rounded flex items-center justify-center shrink-0",
                        isSelected ? "bg-primary" : isInherited ? "bg-primary/40" : "bg-muted"
                      )}
                    >
                      {isSelected || isInherited ? (
                        <Check className="h-3 w-3 text-white" />
                      ) : (
                        <Folder className="h-3 w-3 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium">{group.name}</span>
                      <p className="text-xs text-muted-foreground">
                        {nested !== group.documentCount
                          ? `${group.documentCount} here · ${nested} with nested`
                          : `${group.documentCount} document${group.documentCount !== 1 ? "s" : ""}`}
                        {isInherited ? " · included via parent" : ""}
                      </p>
                    </div>
                    {group.color && (
                      <div
                        className="h-3 w-3 rounded-full shrink-0"
                        style={{ backgroundColor: group.color }}
                      />
                    )}
                  </button>
                )
              })}
            </div>
          )}

          {/* Link to manage */}
          <Button variant="link" size="sm" className="px-0 text-xs" asChild>
            <Link href="/dashboard/files">
              Manage Files
              <ExternalLink className="ml-1 h-3 w-3" />
            </Link>
          </Button>
        </div>
      )}
    </div>
  )
}
