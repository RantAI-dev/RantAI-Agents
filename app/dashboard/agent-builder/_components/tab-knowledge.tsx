"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Database, ExternalLink, Check, Folder } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface KnowledgeGroup {
  id: string
  name: string
  color: string | null
  documentCount: number
}

interface TabKnowledgeProps {
  useKnowledgeBase: boolean
  knowledgeBaseGroupIds: string[]
  onUseKnowledgeBaseChange: (v: boolean) => void
  onKnowledgeBaseGroupIdsChange: (ids: string[]) => void
}

export function TabKnowledge({
  useKnowledgeBase,
  knowledgeBaseGroupIds,
  onUseKnowledgeBaseChange,
  onKnowledgeBaseGroupIdsChange,
}: TabKnowledgeProps) {
  const [groups, setGroups] = useState<KnowledgeGroup[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const fetchGroups = async () => {
      try {
        setLoading(true)
        const res = await fetch("/api/dashboard/knowledge/groups")
        if (res.ok) {
          const data = await res.json()
          setGroups(data.groups || [])
        }
      } catch {
        // ignore
      } finally {
        setLoading(false)
      }
    }
    if (useKnowledgeBase) fetchGroups()
  }, [useKnowledgeBase])

  const toggleGroup = (groupId: string) => {
    const current = knowledgeBaseGroupIds || []
    if (current.includes(groupId)) {
      onKnowledgeBaseGroupIdsChange(current.filter((id) => id !== groupId))
    } else {
      onKnowledgeBaseGroupIdsChange([...current, groupId])
    }
  }

  return (
    <div className="p-6 max-w-3xl space-y-6">
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
            Select which document groups the agent can search. Leave empty to search all.
          </p>

          {loading ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Loading groups...</p>
          ) : groups.length === 0 ? (
            <div className="text-center py-6">
              <Database className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">No knowledge groups found</p>
              <Button variant="link" size="sm" className="mt-2" asChild>
                <Link href="/dashboard/knowledge">
                  Go to Knowledge
                  <ExternalLink className="ml-1 h-3 w-3" />
                </Link>
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2">
              {groups.map((group) => {
                const isSelected = (knowledgeBaseGroupIds || []).includes(group.id)
                return (
                  <button
                    key={group.id}
                    type="button"
                    onClick={() => toggleGroup(group.id)}
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-lg text-left transition-colors",
                      isSelected
                        ? "bg-primary/10 border border-primary"
                        : "border border-border hover:bg-muted/50"
                    )}
                  >
                    <div
                      className={cn(
                        "h-5 w-5 rounded flex items-center justify-center shrink-0",
                        isSelected ? "bg-primary" : "bg-muted"
                      )}
                    >
                      {isSelected ? (
                        <Check className="h-3 w-3 text-white" />
                      ) : (
                        <Folder className="h-3 w-3 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium">{group.name}</span>
                      <p className="text-xs text-muted-foreground">
                        {group.documentCount} document{group.documentCount !== 1 ? "s" : ""}
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
            <Link href="/dashboard/knowledge">
              Manage Knowledge
              <ExternalLink className="ml-1 h-3 w-3" />
            </Link>
          </Button>
        </div>
      )}
    </div>
  )
}
