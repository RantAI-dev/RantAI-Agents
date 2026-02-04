"use client"

import { memo, useState, useEffect } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Users, Link2, Network, Loader2 } from "lucide-react"
import EntityList from "./entity-list"
import RelationList from "./relation-list"
import KnowledgeGraph from "./knowledge-graph"

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

interface IntelligenceData {
  entities: Entity[]
  relations: Relation[]
  status: "pending" | "processing" | "completed" | "failed"
  stats?: {
    totalEntities: number
    totalRelations: number
    entityTypes: number
    relationTypes: number
  }
}

interface DocumentIntelligenceProps {
  documentId: string
}

type ViewMode = "entities" | "relations" | "graph"

const DocumentIntelligence = memo<DocumentIntelligenceProps>(({ documentId }) => {
  const [viewMode, setViewMode] = useState<ViewMode>("entities")
  const [data, setData] = useState<IntelligenceData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      setError(null)

      try {
        const response = await fetch(`/api/dashboard/knowledge/${documentId}/intelligence`)

        if (!response.ok) {
          throw new Error("Failed to fetch document intelligence")
        }

        const result = await response.json()
        setData(result)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load data")
      } finally {
        setLoading(false)
      }
    }

    if (documentId) {
      fetchData()
    }
  }, [documentId])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Loading document intelligence...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center text-muted-foreground">
          <p className="text-sm">{error}</p>
          <p className="text-xs mt-1">Please try again later</p>
        </div>
      </div>
    )
  }

  const entities = data?.entities || []
  const relations = data?.relations || []

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Tabs
        value={viewMode}
        onValueChange={(v) => setViewMode(v as ViewMode)}
        className="flex flex-col h-full overflow-hidden"
      >
        <TabsList className="flex-shrink-0 h-8 w-fit">
          <TabsTrigger value="entities" className="gap-1.5 h-7 text-xs px-3">
            <Users className="h-3 w-3" />
            Entities
            {entities.length > 0 && (
              <span className="text-[10px] text-muted-foreground">({entities.length})</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="relations" className="gap-1.5 h-7 text-xs px-3">
            <Link2 className="h-3 w-3" />
            Relations
            {relations.length > 0 && (
              <span className="text-[10px] text-muted-foreground">({relations.length})</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="graph" className="gap-1.5 h-7 text-xs px-3">
            <Network className="h-3 w-3" />
            Graph
          </TabsTrigger>
        </TabsList>

        <TabsContent value="entities" className="flex-1 mt-3 overflow-hidden">
          <EntityList entities={entities} loading={loading} />
        </TabsContent>

        <TabsContent value="relations" className="flex-1 mt-3 overflow-hidden">
          <RelationList relations={relations} entities={entities} loading={loading} />
        </TabsContent>

        <TabsContent value="graph" className="flex-1 mt-3 overflow-hidden">
          <KnowledgeGraph entities={entities} relations={relations} loading={loading} />
        </TabsContent>
      </Tabs>
    </div>
  )
})

DocumentIntelligence.displayName = "DocumentIntelligence"

export default DocumentIntelligence
