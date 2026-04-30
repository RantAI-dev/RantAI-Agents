/**
 * Shared helper for indexing artifact content into the RAG vector store.
 * Used by both create_artifact and update_artifact tools.
 */

import { chunkDocument } from "./chunker"
import { generateEmbeddings } from "./embeddings"
import { storeChunks, deleteChunksByDocumentId } from "./vector-store"
import { prisma } from "@/lib/prisma"

/**
 * Index artifact content: chunk, embed, and store in SurrealDB.
 * For updates, deletes existing chunks before re-indexing.
 *
 * On success the artifact's metadata is patched with `ragIndexed: true`;
 * on failure (or zero chunks) it gets `ragIndexed: false`. The panel uses
 * this flag to surface a "not searchable" badge so users aren't surprised
 * when an artifact is missing from semantic search.
 *
 * Pass `artifactType` to skip the per-call DB round-trip inside
 * `resolveTextToEmbed` — callers already know it from the row they just
 * created or updated.
 */
export async function indexArtifactContent(
  documentId: string,
  title: string,
  content: string,
  options?: { isUpdate?: boolean; artifactType?: string | null }
) {
  try {
    if (options?.isUpdate) {
      await deleteChunksByDocumentId(documentId)
    }

    // For script-format text/document artifacts, the raw `content` is JS
    // source — embedding that lets `knowledge_search` match on `import`
    // statements and noise. Run the script and pandoc-extract plain text
    // from the resulting docx so semantic search hits the actual prose.
    // Falls back to the script source if either step fails — code-style
    // search is still better than nothing.
    const textToEmbed = await resolveTextToEmbed(documentId, content, options?.artifactType ?? null)

    const chunks = chunkDocument(textToEmbed, title, "ARTIFACT", undefined, {
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

/**
 * D-47: per-process cache of extracted DOCX text keyed by content hash.
 * Re-indexing the same `text/document` artifact (e.g. after a metadata
 * tweak that bumps `updatedAt` but doesn't change `content`) used to
 * spawn the sandbox + pandoc again every time. Cap entries so a long-
 * running process doesn't accumulate unbounded; FIFO eviction is fine
 * because we're only optimising re-index hot paths, not first-index.
 */
const DOCX_TEXT_CACHE_CAP = 128
const docxTextCache = new Map<string, string>()
function cacheKey(documentId: string, content: string): string {
  // Cheap content hash — keep distinct from the full SHA in cache.ts;
  // collisions across artifacts are bounded by including documentId.
  let h = 5381
  for (let i = 0; i < content.length; i++) {
    h = ((h << 5) + h + content.charCodeAt(i)) | 0
  }
  return `${documentId}:${h}`
}
function setCachedDocxText(key: string, text: string): void {
  if (docxTextCache.size >= DOCX_TEXT_CACHE_CAP) {
    const oldest = docxTextCache.keys().next().value
    if (oldest) docxTextCache.delete(oldest)
  }
  docxTextCache.set(key, text)
}

/**
 * For text/document artifacts, run the JS in sandbox and pandoc-extract
 * plain text. All other types pass through unchanged. Failures fall
 * back to the original content.
 *
 * `artifactType` is required — every in-tree caller of `indexArtifactContent`
 * passes it (the option was made mandatory after `b23e06f` audit confirmed
 * full coverage). Pass `null` for legacy / unknown rows.
 */
async function resolveTextToEmbed(
  documentId: string,
  content: string,
  artifactType: string | null,
): Promise<string> {
  try {
    if (artifactType !== "text/document") {
      return content
    }
    const ck = cacheKey(documentId, content)
    const cached = docxTextCache.get(ck)
    if (cached !== undefined) return cached
    const { runScriptInSandbox } = await import("@/lib/document-script/sandbox-runner")
    const { extractDocxText } = await import("@/lib/document-script/extract-text")
    const r = await runScriptInSandbox(content, {})
    if (!r.ok || !r.buf) {
      console.warn(`[ArtifactIndexer] sandbox failed for ${documentId}, embedding script source: ${r.ok ? "no buffer" : r.error}`)
      return content
    }
    const text = await extractDocxText(r.buf)
    setCachedDocxText(ck, text)
    return text
  } catch (err) {
    console.warn(`[ArtifactIndexer] script extract failed for ${documentId}, embedding script source:`, err)
    return content
  }
}

/**
 * Patch the artifact's `metadata.ragIndexed` field atomically.
 *
 * D-2: previously this was read-then-write (findUnique → spread → update),
 * which let a concurrent metadata write between the two queries silently
 * clobber sibling keys. Postgres `jsonb_set` updates the single key in
 * place server-side — siblings are preserved by definition.
 *
 * The COALESCE guards against rows whose `metadata` is NULL (jsonb_set
 * returns NULL when the source is NULL, which would wipe the field).
 */
async function markRagStatus(documentId: string, indexed: boolean) {
  try {
    await prisma.$executeRaw`
      UPDATE "Document"
      SET "metadata" = jsonb_set(
        COALESCE("metadata", '{}'::jsonb),
        '{ragIndexed}',
        to_jsonb(${indexed}::boolean),
        true
      )
      WHERE "id" = ${documentId}
    `
  } catch (err) {
    console.error("[ArtifactIndexer] Failed to write ragIndexed flag:", err)
  }
}
