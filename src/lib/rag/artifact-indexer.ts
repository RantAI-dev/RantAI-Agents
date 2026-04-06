/**
 * Shared helper for indexing artifact content into the RAG vector store.
 * Used by both create_artifact and update_artifact tools.
 */

import { chunkDocument } from "./chunker"
import { generateEmbeddings } from "./embeddings"
import { storeChunks, deleteChunksByDocumentId } from "./vector-store"

/**
 * Index artifact content: chunk, embed, and store in SurrealDB.
 * For updates, deletes existing chunks before re-indexing.
 */
export async function indexArtifactContent(
  documentId: string,
  title: string,
  content: string,
  options?: { isUpdate?: boolean }
) {
  if (options?.isUpdate) {
    await deleteChunksByDocumentId(documentId)
  }

  const chunks = chunkDocument(content, title, "ARTIFACT", undefined, {
    chunkSize: 1000,
    chunkOverlap: 200,
  })
  if (chunks.length === 0) return

  const chunkTexts = chunks.map((chunk) => `${title}\n\n${chunk.content}`)
  const embeddings = await generateEmbeddings(chunkTexts)
  await storeChunks(documentId, chunks, embeddings)

  const action = options?.isUpdate ? "Re-indexed" : "Indexed"
  console.log(`[ArtifactIndexer] ${action} ${chunks.length} chunks for "${title}"`)
}
