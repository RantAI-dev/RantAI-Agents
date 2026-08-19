import { kb } from "@/lib/kb-runtime/runtime"
import {
  smartChunkDocument,
  generateEmbeddings,
  storeChunks,
  deleteChunksByDocumentId,
  type Chunk,
} from "@/lib/rag"
import { assignChunkPages } from "@/lib/rag/page-map"
import { extractEntities, extractEntitiesAndRelations } from "@/lib/document-intelligence"
import type { ExtractedFigure, PageBlocks } from "@/lib/rag/extractors/types"
import type { IngestPolicy } from "./pipeline-policy"
import type { IngestStep } from "./progress"

/**
 * Indexing — everything between extracted text and a searchable document:
 * chunk → entities → figures → embed → store.
 *
 * Chunking is ALWAYS the table/code-aware chunker; the naive fixed-size
 * splitter shredded spreadsheet rows and code blocks. Which optional steps run
 * is the resolved per-type policy's call, not the caller's.
 *
 * Entity and figure failures are non-fatal (the document is still useful
 * without them); embed/store failures throw, because a document row with zero
 * chunks means the user sees a file that RAG can never answer from — the
 * caller is expected to roll back or mark it failed.
 */

export interface IndexDocumentInput {
  documentId: string
  title: string
  content: string
  categories: string[]
  subcategory?: string | null
  organizationId: string | null
  userId: string | null
  policy: IngestPolicy
  useCombined: boolean
  figures?: ExtractedFigure[]
  pagesBlocks?: PageBlocks[][]
  pageMap?: Array<{ page: number; text: string }>
}

export interface IndexDocumentResult {
  chunks: Chunk[]
  entityCount: number
}

export async function indexDocumentContent(
  input: IndexDocumentInput,
  emit?: (step: IngestStep, current?: number, total?: number) => void | Promise<void>
): Promise<IndexDocumentResult> {
  const { title, content, categories } = input
  let chunks: Chunk[] = []
  let entityCount = 0

  await emit?.("chunking")

  // Always the table/code-aware chunker: the naive fixed-size splitter shredded
  // spreadsheet rows and code blocks (the old failure mode when the "enhanced"
  // toggle was off). Policy decides the optional steps below, not the chunker.
  chunks = await smartChunkDocument(content, title, categories[0], input.subcategory || undefined, {
    maxChunkSize: 800,
    overlapSize: 200,
    preserveCodeBlocks: true,
    respectHeadingBoundaries: true,
  })

  if (input.policy.entities) {
    // Entity/relation extraction is an expensive per-chunk LLM pass. On-prem KBs
    // that only need vector retrieval can disable it with
    // KB_ENTITY_EXTRACTION_ENABLED=false — it otherwise competes with the mineru
    // sidecar for the shared GPU and slows figure/table OCR (pushing dense books
    // past the extractor timeout, which drops them to text-only).
    if (process.env.KB_ENTITY_EXTRACTION_ENABLED === "false") {
      console.log("[Knowledge] entity extraction disabled (KB_ENTITY_EXTRACTION_ENABLED=false)")
    } else try {
      await emit?.("extracting_entities")
      const surrealClient = kb("vectors")
      if (input.useCombined) {
        const { entities, relations } = await extractEntitiesAndRelations(content, input.documentId, input.userId ?? undefined)
        entityCount = entities.length

        const entityIdMap = new Map<string, string>()
        let entityIdx = 0
        for (const entity of entities) {
          await emit?.("extracting_entities", ++entityIdx, entities.length)
          const sanitizedName = entity.name.toLowerCase().replace(/[^a-z0-9]/g, "_")
          const entityId = `entity:${input.documentId}_${sanitizedName}`

          try {
            await surrealClient.query(
              `UPSERT entity:\`${input.documentId}_${sanitizedName}\` CONTENT {
                name: $name,
                type: $type,
                confidence: $confidence,
                document_id: $document_id,
                file_id: $file_id,
                metadata: $metadata,
                updated_at: time::now()
              }`,
              {
                name: entity.name,
                type: entity.type,
                confidence: entity.confidence,
                document_id: input.documentId,
                file_id: input.documentId,
                metadata: entity.metadata,
              }
            )
          } catch (error) {
            console.warn(`[kb-ingest] Failed to upsert entity ${entityId}:`, error)
          }

          entityIdMap.set(entity.name.toLowerCase(), entityId)
        }

        if (relations.length > 0) {
          let storedCount = 0
          let skippedCount = 0
          for (const relation of relations) {
            const sourceName = (relation.metadata?.source_entity as string || "").toLowerCase()
            const targetName = (relation.metadata?.target_entity as string || "").toLowerCase()
            const sourceId = entityIdMap.get(sourceName)
            const targetId = entityIdMap.get(targetName)

            if (!sourceId || !targetId) {
              skippedCount++
              continue
            }

            // Sanitize relation type to valid SurrealDB table name
            const relType = (relation.relation_type || "RELATED_TO")
              .toUpperCase()
              .replace(/[^A-Z0-9_]/g, "_")
              .replace(/^_+|_+$/g, "")
              || "RELATED_TO"

            try {
              await surrealClient.relate(sourceId, relType, targetId, {
                confidence: relation.confidence,
                document_id: input.documentId,
                context: relation.metadata?.context,
                created_at: new Date().toISOString(),
              })
              storedCount++
            } catch (error) {
              console.warn(`[kb-ingest] Failed to create relation ${sourceId} ->${relType}-> ${targetId}:`, error)
            }
          }
          console.log(`[kb-ingest] Relations: ${storedCount} stored, ${skippedCount} skipped (no matching entity), ${relations.length} total`)
        }
      } else {
        const entities = await extractEntities(content, input.documentId, undefined, {
          useLLM: true,
          usePatterns: true,
        })
        entityCount = entities.length

        for (const entity of entities) {
          const sanitizedName = entity.name.toLowerCase().replace(/[^a-z0-9]/g, "_")
          const entityId = `entity:${input.documentId}_${sanitizedName}`

          try {
            await surrealClient.query(
              `UPSERT entity:\`${input.documentId}_${sanitizedName}\` CONTENT {
                name: $name,
                type: $type,
                confidence: $confidence,
                document_id: $document_id,
                file_id: $file_id,
                metadata: $metadata,
                updated_at: time::now()
              }`,
              {
                name: entity.name,
                type: entity.type,
                confidence: entity.confidence,
                document_id: input.documentId,
                file_id: input.documentId,
                metadata: entity.metadata,
              }
            )
          } catch (error) {
            console.warn(`[kb-ingest] Failed to upsert entity ${entityId}:`, error)
          }
        }
      }
    } catch (error) {
      console.error("Entity/Relation extraction failed:", error)
    }
  }

  // Tag text chunks with their source page (from the layout parser's page map)
  // so retrieval sources can show "hal. N". Best-effort; no-op without a map.
  if (input.pageMap?.length) {
    chunks = assignChunkPages(chunks, input.pageMap)
  }

  // ── Figure asset layer (multimodal RAG): upload crops + append searchable
  // figure chunks so retrieval can surface + render the original image. ──
  if (input.figures?.length) {
    await emit?.("processing_figures", 0, input.figures.length)
    try {
      const { storeFiguresAsChunks } = await import("@/lib/rag/figure-assets")
      const { chunks: figChunks, assets } = await storeFiguresAsChunks({
        organizationId: input.organizationId || null,
        documentId: input.documentId,
        documentTitle: title,
        category: categories[0] ?? "general",
        subcategory: input.subcategory || undefined,
        figures: input.figures,
        // Page-tagged text chunks so caption-less figures borrow the prose around
        // them (findability + a real "keterangan" instead of "Tanpa keterangan").
        textChunks: chunks,
        pagesBlocks: input.pagesBlocks,
      })
      if (figChunks.length) {
        // Reindex chunkIndex across the combined set (figure chunks were -1).
        chunks = [...chunks, ...figChunks].map((c, i) => ({
          ...c,
          metadata: { ...c.metadata, chunkIndex: i },
        }))
      }
      if (assets.length) {
        await kb("documents").updateMetadata(input.documentId, { figures: assets })
      }
      console.log(`[kb-ingest] Figures: ${assets.length} stored for document ${input.documentId}`)
    } catch (err) {
      console.warn(`[kb-ingest] Figure asset ingest failed (non-fatal): ${err instanceof Error ? err.message : err}`)
    }
  }

  // Embed + store atomically: if either step fails, the Document row in
  // Postgres is already created (above) but has zero chunks in SurrealDB →
  // user sees the doc in the file list but RAG returns nothing for it. This
  // throws on failure; the caller owns recovery (mark failed for retry, or
  // roll the synchronous path back).
  const chunkTexts = chunks.map((chunk) => `${title}\n\n${chunk.content}`)
  await emit?.("embedding", 0, chunks.length)
  const embeddings = await generateEmbeddings(chunkTexts, {
    onProgress: (done, total) => void emit?.("embedding", done, total),
  })
  const { getRagConfig } = await import("@/lib/rag/config")
  const embeddingModel = getRagConfig().embeddingModel
  await emit?.("storing", 0, chunks.length)
  // Idempotency guard: storeChunks CREATEs chunks under the deterministic id
  // `${documentId}_${i}`, which throws on a pre-existing id. Clearing any
  // stale chunks first makes this step safe to re-run for the same document —
  // the precondition the ingest-retry endpoint needs to recover a
  // half-processed doc (e.g. a request killed by a deploy after some chunks
  // were written). No-op on the happy path (fresh id → zero existing chunks).
  await deleteChunksByDocumentId(input.documentId)
  await storeChunks(input.documentId, chunks, embeddings, embeddingModel)

  return { chunks, entityCount }
}
