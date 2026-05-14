import { prisma } from "@/lib/prisma"
import { getSurrealClient } from "@/lib/surrealdb"
import { getRagConfig } from "./config"
import { generateEmbeddings } from "./embeddings"

export interface ReEmbedResult {
  documentId: string
  documentTitle: string
  chunkCount: number
  /** ms wallclock for the embed+update of this doc. */
  durationMs: number
  /** "ok" | "skip-no-chunks" | "skip-no-title" | "error" */
  status: "ok" | "skip-no-chunks" | "skip-no-title" | "error"
  errorMessage?: string
}

export interface BulkReEmbedSummary {
  attempted: number
  succeeded: number
  skipped: number
  failed: number
  totalChunks: number
  totalMs: number
  embeddingModel: string
  results: ReEmbedResult[]
}

interface ChunkRow {
  id: string
  content: string
  chunk_index: number
}

const DEFAULT_CONCURRENCY = 2

/**
 * Re-embed all chunks of a single document with the currently-configured model
 * and update embedding_model on each row. Content stays the same — only the
 * vector + model tag change. Bounded concurrency at the doc-level wrapper.
 */
async function reEmbedOneDocument(documentId: string, embeddingModel: string): Promise<ReEmbedResult> {
  const start = Date.now()
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    select: { id: true, title: true, deletedAt: true },
  })
  if (!doc || doc.deletedAt) {
    return {
      documentId,
      documentTitle: doc?.title ?? "(unknown)",
      chunkCount: 0,
      durationMs: Date.now() - start,
      status: "skip-no-title",
      errorMessage: doc?.deletedAt ? "soft-deleted" : "not-found",
    }
  }

  const client = await getSurrealClient()
  const chunkRes = await client.query<ChunkRow>(
    `SELECT id, content, chunk_index FROM document_chunk WHERE document_id = $documentId ORDER BY chunk_index`,
    { documentId }
  )
  const chunks = ((chunkRes[0]?.result as ChunkRow[]) || []).filter((c) => c.content)
  if (chunks.length === 0) {
    return {
      documentId,
      documentTitle: doc.title,
      chunkCount: 0,
      durationMs: Date.now() - start,
      status: "skip-no-chunks",
    }
  }

  const texts = chunks.map((c) => `${doc.title}\n\n${c.content}`)
  let embeddings: number[][]
  try {
    embeddings = await generateEmbeddings(texts)
  } catch (err) {
    return {
      documentId,
      documentTitle: doc.title,
      chunkCount: chunks.length,
      durationMs: Date.now() - start,
      status: "error",
      errorMessage: `embed failed: ${(err as Error).message?.slice(0, 200) ?? "unknown"}`,
    }
  }
  if (embeddings.length !== chunks.length) {
    return {
      documentId,
      documentTitle: doc.title,
      chunkCount: chunks.length,
      durationMs: Date.now() - start,
      status: "error",
      errorMessage: `embed count mismatch: ${embeddings.length} vs ${chunks.length}`,
    }
  }
  // Dim guard: writing a 1024-dim vector into a 4096-dim MTREE index (or vice
  // versa) corrupts retrieval. Same logic as storeChunks — fail loud per-doc
  // so the operator can fix env/schema before the bulk run does damage.
  const expectedDim = getRagConfig().embeddingDim
  const firstDim = embeddings[0]?.length ?? 0
  if (firstDim !== expectedDim) {
    return {
      documentId,
      documentTitle: doc.title,
      chunkCount: chunks.length,
      durationMs: Date.now() - start,
      status: "error",
      errorMessage: `dim ${firstDim} != KB_EMBEDDING_DIM=${expectedDim}; fix env or redefine MTREE index at dim=${firstDim}`,
    }
  }
  for (let i = 0; i < embeddings.length; i++) {
    if (embeddings[i].length !== firstDim) {
      return {
        documentId,
        documentTitle: doc.title,
        chunkCount: chunks.length,
        durationMs: Date.now() - start,
        status: "error",
        errorMessage: `mid-batch dim drift at index ${i}: ${embeddings[i].length} vs first ${firstDim}`,
      }
    }
  }

  try {
    // Update in place, two chunks at a time to keep load bounded.
    const STORE_CONC = 4
    for (let start2 = 0; start2 < chunks.length; start2 += STORE_CONC) {
      const slice = chunks.slice(start2, start2 + STORE_CONC)
      await Promise.all(
        slice.map((c, idx) =>
          client.query(
            `UPDATE document_chunk:\`${c.id}\` SET embedding = $embedding, embedding_model = $embedding_model`,
            {
              embedding: embeddings[start2 + idx],
              embedding_model: embeddingModel,
            }
          )
        )
      )
    }
  } catch (err) {
    return {
      documentId,
      documentTitle: doc.title,
      chunkCount: chunks.length,
      durationMs: Date.now() - start,
      status: "error",
      errorMessage: `update failed: ${(err as Error).message?.slice(0, 200) ?? "unknown"}`,
    }
  }

  return {
    documentId,
    documentTitle: doc.title,
    chunkCount: chunks.length,
    durationMs: Date.now() - start,
    status: "ok",
  }
}

/**
 * Bulk re-embed driver. Either re-embeds the explicit `documentIds`, or — when
 * `onlyStale: true` — finds every chunk whose `embedding_model` doesn't match
 * the current config and re-embeds those documents.
 *
 * Concurrency-bounded at the document level (default 2 docs in flight) so we
 * don't flood the embedding provider. Returns a per-doc breakdown for the
 * admin UI / cron logs.
 */
export async function bulkReEmbed(params: {
  documentIds?: string[]
  onlyStale?: boolean
  organizationId?: string | null
  concurrency?: number
}): Promise<BulkReEmbedSummary> {
  const overallStart = Date.now()
  const cfg = getRagConfig()
  const embeddingModel = cfg.embeddingModel
  const concurrency = Math.max(1, Math.min(params.concurrency ?? DEFAULT_CONCURRENCY, 8))

  let targets: string[] = params.documentIds ?? []
  if (params.onlyStale) {
    const client = await getSurrealClient()
    const res = await client.query<string>(
      `SELECT VALUE document_id FROM document_chunk WHERE embedding_model IS NONE OR embedding_model != $current`,
      { current: embeddingModel }
    )
    const staleDocIds = [...new Set(((res[0]?.result as unknown as string[]) || []))]
    targets = [...new Set([...targets, ...staleDocIds])]
  }

  if (params.organizationId !== undefined) {
    // Restrict to docs visible to the org (own + null/global).
    const visible = await prisma.document.findMany({
      where: {
        id: { in: targets },
        deletedAt: null,
        ...(params.organizationId !== null
          ? { OR: [{ organizationId: params.organizationId }, { organizationId: null }] }
          : { organizationId: null }),
      },
      select: { id: true },
    })
    const visibleSet = new Set(visible.map((d) => d.id))
    targets = targets.filter((id) => visibleSet.has(id))
  }

  const results: ReEmbedResult[] = []
  let nextIdx = 0
  async function worker() {
    while (true) {
      const idx = nextIdx++
      if (idx >= targets.length) return
      results.push(await reEmbedOneDocument(targets[idx], embeddingModel))
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, targets.length) }, () => worker()))

  return {
    attempted: results.length,
    succeeded: results.filter((r) => r.status === "ok").length,
    skipped: results.filter((r) => r.status.startsWith("skip")).length,
    failed: results.filter((r) => r.status === "error").length,
    totalChunks: results.reduce((s, r) => s + r.chunkCount, 0),
    totalMs: Date.now() - overallStart,
    embeddingModel,
    results,
  }
}
