import { prisma } from "@/lib/prisma"
import { getDocumentChunkCount, getDocumentChunkCounts } from "@/lib/rag"
import { getSurrealClient } from "@/lib/surrealdb"
import {
  countKnowledgeDocumentsForScope,
  findKnowledgeDocumentById,
  listKnowledgeDocumentsByScope,
} from "./repository"
import {
  appFileUrl,
  hasDocumentAccess,
  mapFileType,
  mapGroups,
  mapListItem,
  normalizeSurrealId,
  resolveImageThumbnail,
  type KnowledgeDocumentDetail,
  type KnowledgeDocumentIntelligenceResponse,
  type KnowledgeDocumentListItem,
  type ServiceError,
} from "./service-shared"

/** Read paths for dashboard knowledge documents: listing, detail, graph. */

/**
 * Returns a total document count for the dashboard groups index sidebar.
 * Org-scoped callers see org + global; orgless callers see everything.
 */
export async function countKnowledgeDocumentsForDashboard(
  organizationId: string | null
): Promise<number> {
  return countKnowledgeDocumentsForScope(organizationId)
}

/**
 * Lists dashboard knowledge documents in the current scope.
 */
export async function listKnowledgeDocumentsForDashboard(params: {
  organizationId: string | null
  groupId: string | null
}): Promise<KnowledgeDocumentListItem[]> {
  const documents = await listKnowledgeDocumentsByScope(params)

  // One SurrealDB query for all chunk counts instead of one-per-document (was N+1).
  const chunkCounts = await getDocumentChunkCounts(documents.map((d) => d.id))

  // For docs still being ingested, attach the latest job's progress snapshot so
  // the card renders its bar on first load (the socket only carries deltas).
  // Include failed docs so the card keeps its error + Retry button (with the
  // jobId it needs) across reloads — not just while processing.
  const processingIds = documents
    .filter((d) => d.status === "processing" || d.status === "failed")
    .map((d) => d.id)
  const ingestByDoc = new Map<string, KnowledgeDocumentListItem["ingest"]>()
  if (processingIds.length > 0) {
    const jobs = await prisma.ingestJob.findMany({
      where: { documentId: { in: processingIds } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        documentId: true,
        step: true,
        progress: true,
        stepCurrent: true,
        stepTotal: true,
        etaSeconds: true,
        error: true,
      },
    })
    for (const job of jobs) {
      if (!job.documentId || ingestByDoc.has(job.documentId)) continue // keep newest per doc
      ingestByDoc.set(job.documentId, {
        jobId: job.id,
        step: job.step,
        progress: job.progress,
        stepCurrent: job.stepCurrent,
        stepTotal: job.stepTotal,
        etaSeconds: job.etaSeconds,
        error: job.error,
      })
    }
  }

  // Thumbnails still need per-image S3 presigning, but only for actual images;
  // run those in parallel rather than awaiting sequentially per row.
  return Promise.all(
    documents.map(async (document) => {
      const fileType = mapFileType(document)
      const thumbnailUrl =
        fileType === "image" ? await resolveImageThumbnail(document.s3Key) : undefined

      return {
        ...mapListItem(document),
        chunkCount: chunkCounts.get(document.id) ?? 0,
        thumbnailUrl,
        ingest: ingestByDoc.get(document.id) ?? null,
      }
    })
  )
}

/**
 * Loads a single dashboard knowledge document.
 */
export async function getKnowledgeDocumentForDashboard(params: {
  documentId: string
  organizationId: string | null
}): Promise<KnowledgeDocumentDetail | ServiceError> {
  const document = await findKnowledgeDocumentById(params.documentId)
  if (!document) {
    return { status: 404, error: "Document not found" }
  }

  if (!hasDocumentAccess(document.organizationId, params.organizationId)) {
    return { status: 404, error: "Document not found" }
  }

  const surrealClient = await getSurrealClient()
  const chunkResults = await surrealClient.query<{
    id: unknown
    content: string
    chunk_index: number
    created_at: string
    chunk_type: string | null
  }>(
    `SELECT id, content, chunk_index, created_at, metadata.chunkType AS chunk_type FROM document_chunk WHERE document_id = $document_id ORDER BY chunk_index ASC`,
    { document_id: params.documentId }
  )

  const rawResult = chunkResults[0]
  const chunks = (Array.isArray(rawResult) ? rawResult : (rawResult as { result?: Array<{
    id: unknown
    content: string
    chunk_index: number
    created_at: string
    chunk_type: string | null
  }> })?.result || []) as Array<{
    id: unknown
    content: string
    chunk_index: number
    created_at: string
    chunk_type: string | null
  }>

  // Stream through the app route (RustFS is internal-only) so the browser can
  // actually load the preview instead of a dead presigned rustfs:9000 URL.
  const fileUrl = document.s3Key ? appFileUrl(document.s3Key) : undefined

  return {
    id: document.id,
    title: document.title,
    content: document.content,
    categories: document.categories,
    subcategory: document.subcategory,
    groups: mapGroups(document.groups),
    metadata: document.metadata,
    fileType: mapFileType(document),
    artifactType: document.artifactType || null,
    fileSize: document.fileSize,
    mimeType: document.mimeType,
    s3Key: document.s3Key,
    fileUrl,
    chunks: chunks.map((chunk) => ({
      id: normalizeSurrealId(chunk.id),
      content: chunk.content,
      chunkIndex: chunk.chunk_index,
      chunkType: chunk.chunk_type ?? null,
      createdAt: chunk.created_at,
    })),
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
  }
}

/**
 * Returns the document intelligence view for a knowledge document.
 */
export async function getKnowledgeDocumentIntelligence(params: {
  documentId: string
}): Promise<KnowledgeDocumentIntelligenceResponse> {
  const client = await getSurrealClient()

  const entityResults = await client.query<{
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
  }>(`SELECT * FROM entity WHERE document_id = $document_id ORDER BY confidence DESC`, {
    document_id: params.documentId,
  })
  const rawEntities = entityResults[0]
  const entities = (Array.isArray(rawEntities) ? rawEntities : (rawEntities as { result?: Array<{
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
  }> })?.result || []) as Array<{
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
  }>

  let relations: KnowledgeDocumentIntelligenceResponse["relations"] = []

  try {
    const dbInfo = await client.query<Record<string, unknown>>(`INFO FOR DB`)
    const rawInfo = dbInfo[0]
    // normalizeQueryResult wraps the INFO object as { result: [{ tables: {...}, ... }] }
    const info = ((rawInfo as { result?: unknown[] })?.result?.[0] ?? rawInfo) as Record<string, unknown>
    const tables = (info?.tables ?? {}) as Record<string, unknown>

    if (tables && typeof tables === "object") {
      const excludedTables = ["entity", "document_chunk", "conversation_memory"]
      const relationTables = Object.keys(tables).filter((t) => !excludedTables.includes(t))

      for (const relType of relationTables) {
        try {
          const typeResults = await client.query<{
            id: string
            in: string
            out: string
            confidence?: number
            context?: string
            document_id?: string
          }>(`SELECT * FROM \`${relType}\` WHERE document_id = $document_id`, {
            document_id: params.documentId,
          })
          const typeData = typeResults[0]
          const typeRelations = ((typeData as { result?: unknown[] })?.result ?? (Array.isArray(typeData) ? typeData : [])) as Array<{
            id: string
            in: string
            out: string
            confidence?: number
            context?: string
          }>

          relations.push(
            ...typeRelations.map((relation) => ({
              id: relation.id,
              in: relation.in,
              out: relation.out,
              relation_type: relType,
              confidence: relation.confidence ?? 0.8,
              metadata: {
                context: relation.context,
              },
            }))
          )
        } catch {
          // Skip relation tables that cannot be queried
        }
      }
    }
  } catch (error) {
    console.error("Failed to get DB info for relation discovery:", error)
  }

  console.log(`[Intelligence API] Document ${params.documentId}: ${entities.length} entities, ${relations.length} relations`)

  return {
    entities,
    relations,
    status: "completed",
    stats: {
      totalEntities: entities.length,
      totalRelations: relations.length,
      entityTypes: [...new Set(entities.map((entity) => entity.type))].length,
      relationTypes: [...new Set(relations.map((relation) => relation.relation_type))].length,
    },
  }
}
