"use client"

import { useState, useCallback } from "react"
import { Search, ChevronDown, ChevronRight } from "lucide-react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import {
  NODE_CATEGORIES,
  type NodeCategory,
  type NodeType,
} from "@/lib/workflow/types"
import { NODE_ICON_MAP } from "./nodes/node-icons"
import { useWorkflowEditor } from "@/hooks/use-workflow-editor"

export function NodePalette() {
  const [search, setSearch] = useState("")
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const addNodeAtCenter = useWorkflowEditor((s) => s.addNodeAtCenter)

  const toggleCategory = useCallback((cat: string) => {
    setCollapsed((prev) => ({ ...prev, [cat]: !prev[cat] }))
  }, [])

  const onDragStart = useCallback(
    (e: React.DragEvent, nodeType: NodeType) => {
      e.dataTransfer.setData("application/workflow-node", nodeType)
      e.dataTransfer.effectAllowed = "move"
    },
    []
  )

  const onClick = useCallback(
    (nodeType: NodeType) => {
      addNodeAtCenter(nodeType)
    },
    [addNodeAtCenter]
  )

  const lowerSearch = search.toLowerCase()

  return (
    <div className="flex flex-col h-full border-r bg-background w-[220px] shrink-0">
      <div className="p-2 border-b">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search nodes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-7 pl-7 text-xs"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-1">
        {(Object.entries(NODE_CATEGORIES) as [NodeCategory, (typeof NODE_CATEGORIES)[NodeCategory]][]).map(
          ([catKey, catMeta]) => {
            const filteredTypes = catMeta.types.filter(
              (t) =>
                !search ||
                t.label.toLowerCase().includes(lowerSearch) ||
                t.description.toLowerCase().includes(lowerSearch)
            )

            if (filteredTypes.length === 0) return null

            const isCollapsed = collapsed[catKey] && !search

            return (
              <div key={catKey} className="mb-1">
                <button
                  onClick={() => toggleCategory(catKey)}
                  className="flex items-center gap-1.5 w-full px-2 py-1 text-xs font-semibold text-muted-foreground hover:text-foreground rounded transition-colors"
                >
                  {isCollapsed ? (
                    <ChevronRight className="h-3 w-3" />
                  ) : (
                    <ChevronDown className="h-3 w-3" />
                  )}
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: catMeta.headerColor }}
                  />
                  {catMeta.label}
                </button>

                {!isCollapsed && (
                  <div className="flex flex-col gap-0.5 ml-1">
                    {filteredTypes.map((nodeType) => (
                      <div
                        key={nodeType.type}
                        draggable
                        onDragStart={(e) => onDragStart(e, nodeType.type)}
                        onClick={() => onClick(nodeType.type)}
                        className={cn(
                          "flex items-start gap-2 px-2.5 py-1.5 rounded cursor-pointer active:cursor-grabbing",
                          "hover:bg-muted/80 transition-colors border border-transparent hover:border-border active:bg-muted"
                        )}
                      >
                        {(() => {
                          const Icon = NODE_ICON_MAP[nodeType.type]
                          return Icon ? (
                            <span
                              className="shrink-0 mt-0.5 flex items-center justify-center w-5 h-5 rounded"
                              style={{ color: catMeta.headerColor }}
                            >
                              <Icon className="h-3.5 w-3.5" />
                            </span>
                          ) : null
                        })()}
                        <div className="flex flex-col gap-0 min-w-0">
                          <span className="text-xs font-medium text-foreground">
                            {nodeType.label}
                          </span>
                          <span className="text-[10px] text-muted-foreground leading-tight">
                            {nodeType.description}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          }
        )}
      </div>
    </div>
  )
}
