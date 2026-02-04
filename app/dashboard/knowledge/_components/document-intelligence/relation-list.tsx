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
import { Filter, ArrowRight, ChevronDown } from "lucide-react"

interface Entity {
  id: string
  name: string
  type: string
  confidence: number
}

interface Relation {
  id: string
  in: string
  out: string
  relation_type: string
  confidence: number
  metadata?: {
    context?: string
    description?: string
  }
}

interface RelationListProps {
  relations: Relation[]
  entities: Entity[]
  loading?: boolean
}

// Relation type colors
const RELATION_TYPE_COLORS: Record<string, string> = {
  APPLIES_TO: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  CREATED_BY: "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200",
  DEPENDS_ON: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  IMPLEMENTS: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  LOCATED_IN: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",
  MENTIONS: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  PART_OF: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  RELATED_TO: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  SUPERSEDES: "bg-lime-100 text-lime-800 dark:bg-lime-900 dark:text-lime-200",
  WORKS_FOR: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
}

// Entity type colors for badges
const ENTITY_TYPE_COLORS: Record<string, string> = {
  Person: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  Organization: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  Location: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  Product: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  Technology: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  Other: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200",
}

const RelationList = memo<RelationListProps>(({ relations, entities, loading }) => {
  const [selectedTypes, setSelectedTypes] = useState<string[]>([])

  // Create entity lookup map
  const entityMap = useMemo(() => {
    const map = new Map<string, Entity>()
    entities.forEach((e) => {
      if (e.id) map.set(e.id, e)
    })
    return map
  }, [entities])

  // Get unique relation types
  const relationTypes = useMemo(() => {
    const types = new Set(relations.map((r) => r.relation_type))
    return Array.from(types).sort()
  }, [relations])

  // Filter relations by selected types
  const filteredRelations = useMemo(() => {
    if (selectedTypes.length === 0) return relations
    return relations.filter((r) => selectedTypes.includes(r.relation_type))
  }, [relations, selectedTypes])

  const toggleType = (type: string) => {
    setSelectedTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-6 text-muted-foreground">
        Loading relations...
      </div>
    )
  }

  if (relations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-6 text-muted-foreground">
        <p className="text-sm">No relations extracted</p>
        <p className="text-xs mt-1">
          Relation extraction will be available in a future update
        </p>
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
            {relationTypes.map((type) => (
              <DropdownMenuCheckboxItem
                key={type}
                checked={selectedTypes.includes(type)}
                onCheckedChange={() => toggleType(type)}
              >
                <Badge
                  variant="secondary"
                  className={`mr-2 text-xs ${
                    RELATION_TYPE_COLORS[type] ||
                    "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200"
                  }`}
                >
                  {type}
                </Badge>
                <span className="text-xs text-muted-foreground ml-auto">
                  {relations.filter((r) => r.relation_type === type).length}
                </span>
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <span className="text-xs text-muted-foreground ml-auto">
          {filteredRelations.length} of {relations.length} relations
        </span>
      </div>

      {/* Relation List */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="space-y-2 pr-2">
          {filteredRelations.map((relation, idx) => {
            const sourceEntity = relation.in ? entityMap.get(relation.in) : null
            const targetEntity = relation.out ? entityMap.get(relation.out) : null

            return (
              <div
                key={relation.id || idx}
                className="border rounded-lg p-3 bg-card hover:border-primary/50 transition-colors"
              >
                <div className="space-y-2">
                  {/* Source Entity */}
                  {sourceEntity && (
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{sourceEntity.name}</span>
                      <Badge
                        variant="secondary"
                        className={`text-xs ${
                          ENTITY_TYPE_COLORS[sourceEntity.type] || ENTITY_TYPE_COLORS.Other
                        }`}
                      >
                        {sourceEntity.type}
                      </Badge>
                    </div>
                  )}

                  {/* Relation Type Arrow */}
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <ArrowRight className="h-4 w-4" />
                    <Badge
                      variant="secondary"
                      className={
                        RELATION_TYPE_COLORS[relation.relation_type] ||
                        "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200"
                      }
                    >
                      {relation.relation_type}
                    </Badge>
                    <ArrowRight className="h-4 w-4" />
                  </div>

                  {/* Target Entity */}
                  {targetEntity && (
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{targetEntity.name}</span>
                      <Badge
                        variant="secondary"
                        className={`text-xs ${
                          ENTITY_TYPE_COLORS[targetEntity.type] || ENTITY_TYPE_COLORS.Other
                        }`}
                      >
                        {targetEntity.type}
                      </Badge>
                    </div>
                  )}

                  {/* Confidence */}
                  <div className="text-xs text-muted-foreground">
                    Confidence: {(relation.confidence * 100).toFixed(0)}%
                  </div>

                  {/* Context */}
                  {relation.metadata?.context && (
                    <div className="text-xs text-muted-foreground bg-muted/50 rounded p-2 mt-2">
                      <strong>Context:</strong> {relation.metadata.context}
                    </div>
                  )}

                  {/* Description */}
                  {relation.metadata?.description && (
                    <div className="text-xs text-muted-foreground bg-muted/50 rounded p-2">
                      <strong>Description:</strong> {relation.metadata.description}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </ScrollArea>

      {/* Summary Footer */}
      <div className="flex items-center justify-between border-t pt-2 text-xs text-muted-foreground flex-shrink-0">
        <span>Total: {filteredRelations.length} relations</span>
        <span>{relationTypes.length} types</span>
      </div>
    </div>
  )
})

RelationList.displayName = "RelationList"

export default RelationList
