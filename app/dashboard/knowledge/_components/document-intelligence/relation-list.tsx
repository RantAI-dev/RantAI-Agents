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

// Relation type outline styles (consistent with knowledge badges)
const RELATION_TYPE_OUTLINE: Record<string, string> = {
  APPLIES_TO: "border-orange-500 text-orange-700 dark:border-orange-400 dark:text-orange-300",
  CREATED_BY: "border-pink-500 text-pink-700 dark:border-pink-400 dark:text-pink-300",
  DEPENDS_ON: "border-red-500 text-red-700 dark:border-red-400 dark:text-red-300",
  IMPLEMENTS: "border-amber-500 text-amber-700 dark:border-amber-400 dark:text-amber-300",
  LOCATED_IN: "border-cyan-500 text-cyan-700 dark:border-cyan-400 dark:text-cyan-300",
  MENTIONS: "border-blue-500 text-blue-700 dark:border-blue-400 dark:text-blue-300",
  PART_OF: "border-green-500 text-green-700 dark:border-green-400 dark:text-green-300",
  RELATED_TO: "border-purple-500 text-purple-700 dark:border-purple-400 dark:text-purple-300",
  SUPERSEDES: "border-lime-500 text-lime-700 dark:border-lime-400 dark:text-lime-300",
  WORKS_FOR: "border-indigo-500 text-indigo-700 dark:border-indigo-400 dark:text-indigo-300",
}

const ENTITY_TYPE_OUTLINE: Record<string, string> = {
  Person: "border-blue-500 text-blue-700 dark:border-blue-400 dark:text-blue-300",
  Organization: "border-red-500 text-red-700 dark:border-red-400 dark:text-red-300",
  Location: "border-green-500 text-green-700 dark:border-green-400 dark:text-green-300",
  Product: "border-amber-500 text-amber-700 dark:border-amber-400 dark:text-amber-300",
  Technology: "border-purple-500 text-purple-700 dark:border-purple-400 dark:text-purple-300",
  Other: "border-gray-500 text-gray-700 dark:border-gray-400 dark:text-gray-300",
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
                <Badge variant="outline" className="ml-1 h-5 px-1.5">
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
                  variant="outline"
                  className={`mr-2 text-xs ${
                    RELATION_TYPE_OUTLINE[type] ||
                    "border-gray-500 text-gray-700 dark:border-gray-400 dark:text-gray-300"
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
                        variant="outline"
                        className={`text-xs ${
                          ENTITY_TYPE_OUTLINE[sourceEntity.type] || ENTITY_TYPE_OUTLINE.Other
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
                      variant="outline"
                      className={`text-xs ${
                        RELATION_TYPE_OUTLINE[relation.relation_type] ||
                        "border-gray-500 text-gray-700 dark:border-gray-400 dark:text-gray-300"
                      }`}
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
                        variant="outline"
                        className={`text-xs ${
                          ENTITY_TYPE_OUTLINE[targetEntity.type] || ENTITY_TYPE_OUTLINE.Other
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
