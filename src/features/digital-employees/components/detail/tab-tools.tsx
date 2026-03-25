"use client"

import { useState } from "react"
import {
  Search, X, Wrench, Check, Plus, Users, Package, Loader2, Trash2,
} from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { DynamicIcon } from "@/components/ui/dynamic-icon"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { BUILTIN_TOOL_ICONS, CATEGORY_LABELS } from "@/lib/digital-employee/shared-constants"
import type { ToolItem } from "@/hooks/use-tools"

interface CustomToolItem {
  id: string
  digitalEmployeeId: string
  name: string
  description: string | null
  parameters: unknown
  code: string
  language: string
  enabled: boolean
  approved: boolean
  createdBy: string
  createdAt: string
  updatedAt: string
}

interface TabToolsProps {
  employeeName: string
  employeeEmoji: string
  allPlatformTools: ToolItem[]
  customTools: CustomToolItem[]
  toolsLoading: boolean
  enabledToolIds: Set<string>
  onToggleAssistantTool: (toolId: string) => Promise<void>
  toggleCustomTool: (toolId: string, enabled: boolean) => Promise<void>
  deleteCustomTool: (toolId: string) => Promise<void>
  onCreateToolOpen: () => void
}

export function TabTools({
  employeeName,
  employeeEmoji,
  allPlatformTools,
  customTools,
  toolsLoading,
  enabledToolIds,
  onToggleAssistantTool,
  toggleCustomTool,
  deleteCustomTool,
  onCreateToolOpen,
}: TabToolsProps) {
  const [toolSearch, setToolSearch] = useState("")

  return (
    <div className="flex-1 overflow-auto p-5 space-y-6">
      {/* Platform Tools */}
      <div>
        <h2 className="text-sm font-medium mb-1">Platform Tools</h2>
        <p className="text-xs text-muted-foreground mb-3">
          Toggle tools to enable/disable on {employeeEmoji} {employeeName}.
        </p>

        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search tools..."
            value={toolSearch}
            onChange={(e) => setToolSearch(e.target.value)}
            className="pl-8 h-9"
          />
          {toolSearch && (
            <button
              onClick={() => setToolSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground transition-colors cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {toolsLoading ? (
          <p className="text-sm text-muted-foreground text-center py-4">Loading tools...</p>
        ) : (() => {
          const q = toolSearch.toLowerCase()
          const filtered = allPlatformTools.filter(
            (t) => !q || t.displayName.toLowerCase().includes(q) || t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)
          )
          return filtered.length === 0 ? (
            <div className="text-center py-6 border border-dashed rounded-md">
              <Wrench className="h-6 w-6 mx-auto text-muted-foreground/40 mb-1.5" />
              <p className="text-xs text-muted-foreground">{toolSearch ? "No tools match your search" : "No tools available"}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((tool) => {
                const isEnabled = enabledToolIds.has(tool.id)
                const toolIcon = tool.icon || (tool.category === "builtin" ? BUILTIN_TOOL_ICONS[tool.name] : undefined)
                const categoryBadge = (() => {
                  switch (tool.category) {
                    case "builtin":
                      return (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                          <Package className="h-2.5 w-2.5 mr-0.5" />
                          Built-in
                        </Badge>
                      )
                    case "community":
                      return (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-indigo-600 border-indigo-200 dark:text-indigo-400 dark:border-indigo-800">
                          <Users className="h-2.5 w-2.5 mr-0.5" />
                          Community
                        </Badge>
                      )
                    default:
                      return (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          <Wrench className="h-2.5 w-2.5 mr-0.5" />
                          {CATEGORY_LABELS[tool.category] ?? tool.category}
                        </Badge>
                      )
                  }
                })()
                return (
                  <button
                    key={tool.id}
                    type="button"
                    onClick={() => onToggleAssistantTool(tool.id)}
                    className={cn(
                      "flex items-start gap-3 p-3 rounded-lg text-left transition-all w-full border",
                      isEnabled
                        ? "bg-primary/5 border-primary ring-1 ring-primary/20"
                        : "border-border hover:bg-muted/50"
                    )}
                  >
                    <div className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-lg shrink-0",
                      isEnabled ? "bg-primary/10" : "bg-muted"
                    )}>
                      <DynamicIcon
                        icon={toolIcon ?? undefined}
                        fallback={Wrench}
                        className={cn("h-4 w-4", isEnabled ? "text-primary" : "text-muted-foreground")}
                        emojiClassName="text-base"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium truncate">{tool.displayName}</span>
                        {categoryBadge}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{tool.description}</p>
                      {tool.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {tool.tags.map((tag) => (
                            <Badge key={tag} variant="outline" className="text-[10px] px-1.5 py-0">{tag}</Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="shrink-0 mt-1">
                      <div className={cn(
                        "h-5 w-5 rounded-full border-2 flex items-center justify-center transition-colors",
                        isEnabled ? "border-primary bg-primary" : "border-muted-foreground/30"
                      )}>
                        {isEnabled && <Check className="h-3 w-3 text-primary-foreground" />}
                      </div>
                    </div>
                  </button>
                )
              })}
              <p className="text-xs text-muted-foreground">
                {enabledToolIds.size} tool{enabledToolIds.size !== 1 ? "s" : ""} enabled
              </p>
            </div>
          )
        })()}
      </div>

      <div className="h-px bg-border" />

      {/* Custom Tools */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium">Custom Tools</h3>
          <Button size="sm" variant="outline" onClick={onCreateToolOpen}>
            <Plus className="h-4 w-4 mr-1.5" />
            Create Tool
          </Button>
        </div>
        {customTools.length === 0 ? (
          <p className="text-xs text-muted-foreground py-4 text-center border border-dashed rounded-md">No custom tools yet</p>
        ) : (
          <div className="space-y-2">
            {customTools.map((tool) => (
              <div key={tool.id} className="flex items-center gap-3 p-3 rounded-lg border bg-card">
                <span className="text-lg shrink-0">🛠️</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{tool.name}</span>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">{tool.language}</Badge>
                    {tool.approved ? (
                      <Badge variant="default" className="text-[10px] px-1.5 py-0 bg-emerald-500/10 text-emerald-500">Approved</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Pending</Badge>
                    )}
                  </div>
                  {tool.description && (
                    <p className="text-xs text-muted-foreground truncate">{tool.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Switch
                    checked={tool.enabled}
                    onCheckedChange={async (checked) => {
                      try {
                        await toggleCustomTool(tool.id, checked)
                      } catch {
                        toast.error("Failed to toggle tool")
                      }
                    }}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                    onClick={async () => {
                      try {
                        await deleteCustomTool(tool.id)
                        toast.success("Tool deleted")
                      } catch {
                        toast.error("Failed to delete tool")
                      }
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
