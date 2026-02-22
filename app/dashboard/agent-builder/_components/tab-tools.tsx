"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import {
  Search,
  Wrench,
  Package,
  Plug,
  FileJson,
  ChevronDown,
  ChevronRight,
  Check,
  AlertTriangle,
  ExternalLink,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useTools, type ToolItem } from "@/hooks/use-tools"
import { OpenApiImportDialog } from "./openapi-import-dialog"

const CATEGORY_META: Record<string, { label: string; icon: React.ElementType }> = {
  builtin: { label: "Built-in", icon: Package },
  custom: { label: "Custom", icon: Wrench },
  openapi: { label: "OpenAPI", icon: FileJson },
  mcp: { label: "MCP", icon: Plug },
}

const CATEGORY_ORDER = ["builtin", "custom", "openapi", "mcp"]

interface TabToolsProps {
  selectedToolIds: string[]
  onToggleTool: (toolId: string) => void
  modelSupportsFunctionCalling: boolean
  isNew: boolean
}

export function TabTools({
  selectedToolIds,
  onToggleTool,
  modelSupportsFunctionCalling,
  isNew,
}: TabToolsProps) {
  const { tools, isLoading, fetchTools } = useTools()
  const [search, setSearch] = useState("")
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [openApiOpen, setOpenApiOpen] = useState(false)

  const toggleCategory = (cat: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })
  }

  const grouped = useMemo(() => {
    const q = search.toLowerCase()
    const filtered = q
      ? tools.filter(
          (t) =>
            t.displayName.toLowerCase().includes(q) ||
            t.name.toLowerCase().includes(q) ||
            t.description.toLowerCase().includes(q)
        )
      : tools

    const groups: Record<string, ToolItem[]> = {}
    for (const tool of filtered) {
      const cat = tool.category || "custom"
      if (!groups[cat]) groups[cat] = []
      groups[cat].push(tool)
    }
    return groups
  }, [tools, search])

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Agent Tools</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Enable tools this agent can use during conversations.
        </p>
      </div>

      {isNew && (
        <p className="text-xs text-amber-600 flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" />
          Save the agent first, then configure tools.
        </p>
      )}

      {!modelSupportsFunctionCalling && selectedToolIds.length > 0 && (
        <p className="text-xs text-destructive flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" />
          Selected model does not support tools. Switch to a model with the
          &quot;Tools&quot; badge.
        </p>
      )}

      {/* Search + Actions */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search tools..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setOpenApiOpen(true)}
          className="shrink-0"
        >
          <FileJson className="h-3.5 w-3.5 mr-1.5" />
          Import OpenAPI
        </Button>
      </div>

      {/* Tool Groups */}
      <div className="space-y-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground text-center py-4">Loading tools...</p>
        ) : Object.keys(grouped).length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No tools found</p>
        ) : (
          CATEGORY_ORDER.filter((cat) => grouped[cat]?.length).map((category) => {
            const meta = CATEGORY_META[category] || { label: category, icon: Wrench }
            const CatIcon = meta.icon
            const isCollapsed = collapsed.has(category)
            const catTools = grouped[category]

            return (
              <div key={category}>
                <button
                  type="button"
                  className="flex items-center gap-2 w-full text-left py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => toggleCategory(category)}
                >
                  {isCollapsed ? (
                    <ChevronRight className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5" />
                  )}
                  <CatIcon className="h-3.5 w-3.5" />
                  {meta.label}
                  <span className="text-[10px] font-normal">({catTools.length})</span>
                </button>

                {!isCollapsed && (
                  <div className="grid grid-cols-1 gap-2 mt-2 ml-6">
                    {catTools.map((tool) => {
                      const isSelected = selectedToolIds.includes(tool.id)
                      return (
                        <button
                          key={tool.id}
                          type="button"
                          onClick={() => onToggleTool(tool.id)}
                          disabled={isNew}
                          className={cn(
                            "flex items-start gap-3 p-3 rounded-lg text-sm text-left transition-colors",
                            isSelected
                              ? "bg-primary/10 border border-primary"
                              : "border border-border hover:bg-muted/50",
                            isNew && "opacity-50 cursor-not-allowed"
                          )}
                        >
                          <div
                            className={cn(
                              "h-5 w-5 rounded flex items-center justify-center shrink-0 mt-0.5",
                              isSelected ? "bg-primary" : "bg-muted"
                            )}
                          >
                            {isSelected ? (
                              <Check className="h-3 w-3 text-white" />
                            ) : (
                              <Wrench className="h-3 w-3 text-muted-foreground" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <span className="font-medium">{tool.displayName}</span>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {tool.description}
                            </p>
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
          {selectedToolIds.length} tool{selectedToolIds.length !== 1 ? "s" : ""} enabled
        </p>
      )}

      {/* Link to manage tools */}
      <Button variant="link" size="sm" className="px-0 text-xs" asChild>
        <Link href="/dashboard/settings/tools">
          Manage Tools
          <ExternalLink className="ml-1 h-3 w-3" />
        </Link>
      </Button>

      {/* OpenAPI Import Dialog */}
      <OpenApiImportDialog
        open={openApiOpen}
        onOpenChange={setOpenApiOpen}
        onImported={() => fetchTools()}
      />
    </div>
  )
}
