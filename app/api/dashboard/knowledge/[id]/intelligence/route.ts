import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getSurrealClient } from "@/lib/surrealdb"

interface Entity {
  id: string
  name: string
  type: string
  confidence: number
  document_id: string
  chunk_id?: string
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

// GET - Fetch entities and relations for a document
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { id: documentId } = await params

    const client = await getSurrealClient()

    // Fetch entities for this document
    // SurrealDB JS library returns results directly as arrays, not wrapped in {result: [...]}
    const entityResults = await client.query<Entity>(
      `SELECT * FROM entity WHERE document_id = $document_id ORDER BY confidence DESC`,
      { document_id: documentId }
    )
    const rawEntities = entityResults[0]
    const entities: Entity[] = (Array.isArray(rawEntities) ? rawEntities : (rawEntities as { result?: Entity[] })?.result || []) as Entity[]

    // Fetch relations for this document
    // Relations are stored in dynamic tables created by RELATE syntax (named by relation_type)
    // First, discover what relation tables exist in the database
    let relations: Relation[] = []

    try {
      // Get all tables from database info
      const dbInfo = await client.query<{ tables: Record<string, string> }>(`INFO FOR DB`)
      const rawInfo = dbInfo[0]
      const info = Array.isArray(rawInfo) ? rawInfo[0] : rawInfo

      if (info?.tables) {
        // Filter out non-relation tables (entity, document_chunk)
        const excludedTables = ["entity", "document_chunk"]
        const relationTables = Object.keys(info.tables).filter(
          (table) => !excludedTables.includes(table)
        )

        // Query each relation table for this document's relations
        for (const relType of relationTables) {
          try {
            const typeResults = await client.query<{
              id: string
              in: string
              out: string
              confidence?: number
              context?: string
              document_id?: string
            }>(
              `SELECT * FROM ${relType} WHERE document_id = $document_id`,
              { document_id: documentId }
            )
            const typeData = typeResults[0]
            const typeRelations = Array.isArray(typeData) ? typeData : (typeData as { result?: unknown[] })?.result || []

            // Map to expected format with relation_type and metadata.context
            relations.push(...(typeRelations as Array<{
              id: string
              in: string
              out: string
              confidence?: number
              context?: string
            }>).map(r => ({
              id: r.id,
              in: r.in,
              out: r.out,
              relation_type: relType,
              confidence: r.confidence ?? 0.8,
              metadata: {
                context: r.context,
              }
            })))
          } catch {
            // Query failed for this table, skip
          }
        }
      }
    } catch (infoError) {
      console.error("Failed to get DB info for relation discovery:", infoError)
    }

    return NextResponse.json({
      entities,
      relations,
      status: "completed",
      stats: {
        totalEntities: entities.length,
        totalRelations: relations.length,
        entityTypes: [...new Set(entities.map((e) => e.type))].length,
        relationTypes: [...new Set(relations.map((r) => r.relation_type))].length,
      },
    })
  } catch (error) {
    console.error("Failed to fetch document intelligence:", error)
    return NextResponse.json(
      { error: "Failed to fetch document intelligence" },
      { status: 500 }
    )
  }
}
