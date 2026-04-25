/**
 * Shared helper for indexing artifact content into the RAG vector store.
 * Used by both create_artifact and update_artifact tools.
 */

import { chunkDocument } from "./chunker"
import { generateEmbeddings } from "./embeddings"
import { storeChunks, deleteChunksByDocumentId } from "./vector-store"
import { prisma } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"

/**
 * Index artifact content: chunk, embed, and store in SurrealDB.
 * For updates, deletes existing chunks before re-indexing.
 *
 * On success the artifact's metadata is patched with `ragIndexed: true`;
 * on failure (or zero chunks) it gets `ragIndexed: false`. The panel uses
 * this flag to surface a "not searchable" badge so users aren't surprised
 * when an artifact is missing from semantic search.
 */
export async function indexArtifactContent(
  documentId: string,
  title: string,
  content: string,
  options?: { isUpdate?: boolean }
) {
  try {
    if (options?.isUpdate) {
      await deleteChunksByDocumentId(documentId)
    }

    const chunks = chunkDocument(content, title, "ARTIFACT", undefined, {
      chunkSize: 1000,
      chunkOverlap: 200,
    })
    if (chunks.length === 0) {
      await markRagStatus(documentId, false)
      return
    }

    const chunkTexts = chunks.map((chunk) => `${title}\n\n${chunk.content}`)
    const embeddings = await generateEmbeddings(chunkTexts)
    await storeChunks(documentId, chunks, embeddings)

    await markRagStatus(documentId, true)

    const action = options?.isUpdate ? "Re-indexed" : "Indexed"
    console.log(`[ArtifactIndexer] ${action} ${chunks.length} chunks for "${title}"`)
  } catch (err) {
    // Failures are non-fatal for the parent tool. We record the status so the
    // UI can show a "not searchable" badge instead of silently misleading the
    // user. Do NOT rethrow — callers fire-and-forget this function and would
    // generate an unhandled rejection if the rejection escaped this catch.
    console.error("[ArtifactIndexer] Failed to index artifact:", err)
    await markRagStatus(documentId, false).catch(() => {})
  }
}

/** Patch the artifact's metadata.ragIndexed field without overwriting siblings. */
async function markRagStatus(documentId: string, indexed: boolean) {
  try {
    const existing = await prisma.document.findUnique({
      where: { id: documentId },
      select: { metadata: true },
    })
    if (!existing) return
    const meta = (existing.metadata as Record<string, unknown>) || {}
    await prisma.document.update({
      where: { id: documentId },
      data: {
        metadata: { ...meta, ragIndexed: indexed } as Prisma.InputJsonValue,
      },
    })
  } catch (err) {
    console.error("[ArtifactIndexer] Failed to write ragIndexed flag:", err)
  }
}
