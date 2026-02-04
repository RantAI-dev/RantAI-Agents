"use client"

import { memo, useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Filter, LayoutGrid, List, ChevronDown } from "lucide-react"

interface Entity {
  id: string
  name: string
  type: string
  confidence: number
  metadata?: {
    context?: string
    source?: "pattern" | "llm"
  }
}

interface EntityListProps {
  entities: Entity[]
  loading?: boolean
}

// Entity type outline styles (consistent with knowledge badges)
const ENTITY_TYPE_OUTLINE: Record<string, string> = {
  PERSON: "border-sky-500 text-sky-700 dark:border-sky-400 dark:text-sky-300",
  Person: "border-sky-500 text-sky-700 dark:border-sky-400 dark:text-sky-300",
  ORG: "border-rose-500 text-rose-700 dark:border-rose-400 dark:text-rose-300",
  Organization: "border-rose-500 text-rose-700 dark:border-rose-400 dark:text-rose-300",
  LOCATION: "border-emerald-500 text-emerald-700 dark:border-emerald-400 dark:text-emerald-300",
  Location: "border-emerald-500 text-emerald-700 dark:border-emerald-400 dark:text-emerald-300",
  PRODUCT: "border-amber-500 text-amber-700 dark:border-amber-400 dark:text-amber-300",
  Product: "border-amber-500 text-amber-700 dark:border-amber-400 dark:text-amber-300",
  Technology: "border-violet-500 text-violet-700 dark:border-violet-400 dark:text-violet-300",
  DATE: "border-indigo-500 text-indigo-700 dark:border-indigo-400 dark:text-indigo-300",
  Date: "border-indigo-500 text-indigo-700 dark:border-indigo-400 dark:text-indigo-300",
  Money: "border-green-500 text-green-700 dark:border-green-400 dark:text-green-300",
  Email: "border-pink-500 text-pink-700 dark:border-pink-400 dark:text-pink-300",
  URL: "border-teal-500 text-teal-700 dark:border-teal-400 dark:text-teal-300",
  Phone: "border-orange-500 text-orange-700 dark:border-orange-400 dark:text-orange-300",
  EVENT: "border-lime-500 text-lime-700 dark:border-lime-400 dark:text-lime-300",
  Event: "border-lime-500 text-lime-700 dark:border-lime-400 dark:text-lime-300",
  CONCEPT: "border-cyan-500 text-cyan-700 dark:border-cyan-400 dark:text-cyan-300",
  Concept: "border-cyan-500 text-cyan-700 dark:border-cyan-400 dark:text-cyan-300",
  Document: "border-fuchsia-500 text-fuchsia-700 dark:border-fuchsia-400 dark:text-fuchsia-300",
  REGULATION: "border-purple-500 text-purple-700 dark:border-purple-400 dark:text-purple-300",
  Regulation: "border-purple-500 text-purple-700 dark:border-purple-400 dark:text-purple-300",
  OTHER: "border-slate-500 text-slate-700 dark:border-slate-400 dark:text-slate-300",
  Other: "border-slate-500 text-slate-700 dark:border-slate-400 dark:text-slate-300",
}

const EntityList = memo<EntityListProps>(({ entities, loading }) => {
  const [selectedTypes, setSelectedTypes] = useState<string[]>([])
  const [viewMode, setViewMode] = useState<"all" | "grouped">("all")

  // Get unique entity types
  const entityTypes = useMemo(() => {
    const types = new Set(entities.map((e) => e.type))
    return Array.from(types).sort()
  }, [entities])

  // Filter entities by selected types
  const filteredEntities = useMemo(() => {
    if (selectedTypes.length === 0) return entities
    return entities.filter((e) => selectedTypes.includes(e.type))
  }, [entities, selectedTypes])

  // Group entities by type
  const groupedEntities = useMemo(() => {
    const groups: Record<string, Entity[]> = {}
    for (const entity of filteredEntities) {
      if (!groups[entity.type]) {
        groups[entity.type] = []
      }
      groups[entity.type].push(entity)
    }
    return groups
  }, [filteredEntities])

  const toggleType = (type: string) => {
    setSelectedTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-6 text-muted-foreground">
        Loading entities...
      </div>
    )
  }

  if (entities.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-6 text-muted-foreground">
        <p className="text-sm">No entities extracted</p>
        <p className="text-xs mt-1">Upload a document with enhanced processing enabled</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full gap-2 overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {/* Type Filter */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <Filter className="h-4 w-4" />
              Filter
              {selectedTypes.length > 0 && (
                <Badge variant="outline" className="ml-1 h-5 px-1.5">
                  {selectedTypes.length}
                </Badge>
              )}
              <ChevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            {entityTypes.map((type) => (
              <DropdownMenuCheckboxItem
                key={type}
                checked={selectedTypes.includes(type)}
                onCheckedChange={() => toggleType(type)}
              >
                <Badge
                  variant="outline"
                  className={`mr-2 text-xs ${ENTITY_TYPE_OUTLINE[type] || ENTITY_TYPE_OUTLINE.Other}`}
                >
                  {type}
                </Badge>
                <span className="text-xs text-muted-foreground ml-auto">
                  {entities.filter((e) => e.type === type).length}
                </span>
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* View Mode Toggle */}
        <div className="flex items-center border rounded-md">
          <Button
            variant={viewMode === "all" ? "secondary" : "ghost"}
            size="sm"
            className="h-8 px-2 rounded-r-none"
            onClick={() => setViewMode("all")}
          >
            <List className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === "grouped" ? "secondary" : "ghost"}
            size="sm"
            className="h-8 px-2 rounded-l-none"
            onClick={() => setViewMode("grouped")}
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
        </div>

        <span className="text-xs text-muted-foreground ml-auto">
          {filteredEntities.length} of {entities.length} entities
        </span>
      </div>

      {/* Entity List */}
      <ScrollArea className="flex-1 min-h-0">
        {viewMode === "all" ? (
          <div className="space-y-2 pr-2">
            {filteredEntities.map((entity) => (
              <EntityCard key={entity.id} entity={entity} />
            ))}
          </div>
        ) : (
          <div className="space-y-4 pr-2">
            {Object.entries(groupedEntities)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([type, typeEntities]) => (
                <div key={type}>
                  <div className="flex items-center gap-2 mb-2 sticky top-0 bg-background py-1">
                    <Badge
                      variant="outline"
                      className={`text-xs ${ENTITY_TYPE_OUTLINE[type] || ENTITY_TYPE_OUTLINE.Other}`}
                    >
                      {type}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {typeEntities.length} entities
                    </span>
                  </div>
                  <div className="space-y-2 pl-2">
                    {typeEntities.map((entity) => (
                      <EntityCard key={entity.id} entity={entity} showType={false} />
                    ))}
                  </div>
                </div>
              ))}
          </div>
        )}
      </ScrollArea>
    </div>
  )
})

EntityList.displayName = "EntityList"

// Entity Card Component
const EntityCard = memo<{ entity: Entity; showType?: boolean }>(
  ({ entity, showType = true }) => {
    return (
      <div className="border rounded-lg p-3 bg-card hover:border-primary/50 transition-colors">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-sm truncate">{entity.name}</span>
              {showType && (
                <Badge
                  variant="outline"
                  className={`text-xs ${
                    ENTITY_TYPE_OUTLINE[entity.type] || ENTITY_TYPE_OUTLINE.Other
                  }`}
                >
                  {entity.type}
                </Badge>
              )}
            </div>
            {entity.metadata?.context && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                {entity.metadata.context}
              </p>
            )}
          </div>
          <div className="flex flex-col items-end gap-1 flex-shrink-0">
            <span className="text-xs text-muted-foreground">
              {(entity.confidence * 100).toFixed(0)}%
            </span>
            {entity.metadata?.source && (
              <Badge variant="outline" className="text-[10px] px-1.5">
                {entity.metadata.source}
              </Badge>
            )}
          </div>
        </div>
      </div>
    )
  }
)

EntityCard.displayName = "EntityCard"

export default EntityList
