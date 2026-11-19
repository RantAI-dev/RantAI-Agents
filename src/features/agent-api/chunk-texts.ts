/**
 * One document's chunks, in document order, for chapter-title extraction
 * (GET /api/v1/mapel/chapters, third-preference source).
 *
 * A chapter picker needs the document's text in order — not a similarity
 * search. The chunk store (SurrealDB `document_chunk`, same table every
 * retrieval arm reads) holds `content` + `chunk_index` + the metadata page
 * per chunk; the bulk re-embed job already reads exactly this shape
 * (`SELECT … ORDER BY chunk_index`), so this is the established read, kept
 * in its own module so the chapters route can be unit-tested without the
 * vector store wired up.
 */
import { kb } from "@/lib/kb-runtime/runtime"

/** The fields the heading scan reads off one chunk. */
export interface ChunkTextUnit {
  text: string
  /** 0-based page of the chunk, null when the chunk has none. */
  page: number | null
}

interface ChunkRow {
  content?: string | null
  chunk_index?: number | null
  metadata?: { page?: number | null } | null
}

/**
 * Every text chunk of `documentId`, ordered by position in the document.
 * Throws when the vector store is unreachable — the caller treats that as
 * "this source has nothing" and falls through, never as a failed request.
 */
export async function listDocumentChunkTexts(documentId: string): Promise<ChunkTextUnit[]> {
  const client = kb("vectors")
  const result = await client.query<ChunkRow>(
    `SELECT content, chunk_index, metadata FROM document_chunk WHERE document_id = $documentId ORDER BY chunk_index`,
    { documentId },
  )
  const rows = result[0]?.result ?? []
  return rows
    .filter((c) => typeof c.content === "string" && c.content.length > 0)
    .map((c) => ({
      text: c.content as string,
      page: typeof c.metadata?.page === "number" ? c.metadata.page : null,
    }))
}
