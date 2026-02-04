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

// Entity type colors (Tailwind classes) - vibrant colors for visibility
const ENTITY_TYPE_COLORS: Record<string, string> = {
  // Core entity types with distinct, vibrant colors
  PERSON: "bg-sky-500 text-white dark:bg-sky-500 dark:text-white",
  Person: "bg-sky-500 text-white dark:bg-sky-500 dark:text-white",
  ORG: "bg-rose-500 text-white dark:bg-rose-500 dark:text-white",
  Organization: "bg-rose-500 text-white dark:bg-rose-500 dark:text-white",
  LOCATION: "bg-emerald-500 text-white dark:bg-emerald-500 dark:text-white",
  Location: "bg-emerald-500 text-white dark:bg-emerald-500 dark:text-white",
  PRODUCT: "bg-amber-500 text-white dark:bg-amber-500 dark:text-white",
  Product: "bg-amber-500 text-white dark:bg-amber-500 dark:text-white",
  Technology: "bg-violet-500 text-white dark:bg-violet-500 dark:text-white",
  DATE: "bg-indigo-500 text-white dark:bg-indigo-500 dark:text-white",
  Date: "bg-indigo-500 text-white dark:bg-indigo-500 dark:text-white",
  Money: "bg-green-500 text-white dark:bg-green-500 dark:text-white",
  Email: "bg-pink-500 text-white dark:bg-pink-500 dark:text-white",
  URL: "bg-teal-500 text-white dark:bg-teal-500 dark:text-white",
  Phone: "bg-orange-500 text-white dark:bg-orange-500 dark:text-white",
  EVENT: "bg-lime-500 text-white dark:bg-lime-600 dark:text-white",
  Event: "bg-lime-500 text-white dark:bg-lime-600 dark:text-white",
  CONCEPT: "bg-cyan-500 text-white dark:bg-cyan-500 dark:text-white",
  Concept: "bg-cyan-500 text-white dark:bg-cyan-500 dark:text-white",
  Document: "bg-fuchsia-500 text-white dark:bg-fuchsia-500 dark:text-white",
  REGULATION: "bg-purple-600 text-white dark:bg-purple-500 dark:text-white",
  Regulation: "bg-purple-600 text-white dark:bg-purple-500 dark:text-white",
  OTHER: "bg-slate-500 text-white dark:bg-slate-500 dark:text-white",
  Other: "bg-slate-500 text-white dark:bg-slate-500 dark:text-white",
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
                <Badge variant="secondary" className="ml-1 h-5 px-1.5">
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
                  variant="secondary"
                  className={`mr-2 ${ENTITY_TYPE_COLORS[type] || ENTITY_TYPE_COLORS.Other}`}
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
                      variant="secondary"
                      className={ENTITY_TYPE_COLORS[type] || ENTITY_TYPE_COLORS.Other}
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
                  variant="secondary"
                  className={`text-xs ${
                    ENTITY_TYPE_COLORS[entity.type] || ENTITY_TYPE_COLORS.Other
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
