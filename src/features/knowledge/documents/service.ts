import path from "path"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import {
  chunkDocument,
  smartChunkDocument,
  generateEmbeddings,
  detectFileType,
  storeChunks,
  deleteChunksByDocumentId,
  getDocumentChunkCount,
  getDocumentChunkCounts,
  type Chunk,
} from "@/lib/rag"
import { extractEntities, extractEntitiesAndRelations } from "@/lib/document-intelligence"
import { getSurrealClient } from "@/lib/surrealdb"
import { uploadFile, S3Paths, validateUpload, deleteFile } from "@/lib/s3"
import { processDocumentOCR, isPDFScanned } from "@/lib/ocr"
import { canEdit, canManage } from "@/lib/organization"
import {
  countKnowledgeDocumentsForScope,
  createKnowledgeDocument,
  deleteKnowledgeDocument,
  findKnowledgeDocumentAccessById,
  findKnowledgeDocumentById,
  listKnowledgeDocumentsByScope,
  replaceKnowledgeDocumentContent,
  restoreKnowledgeDocument,
  softDeleteKnowledgeDocument,
  updateKnowledgeDocumentWithGroups,
} from "./repository"
import { recordKnowledgeAudit } from "@/lib/audit/knowledge"
import type { KnowledgeDocumentCreateInput, KnowledgeDocumentUpdateInput } from "./schema"

export interface ServiceError {
  status: number
  error: string
}

export interface KnowledgeDocumentContext {
  userId: string
  organizationId: string | null
  role?: string | null
}

export interface KnowledgeDocumentListItem {
  id: string
  title: string
  categories: string[]
  subcategory: string | null
  fileType: string
  artifactType: string | null
  fileSize: number | null
  hasS3File: boolean
  thumbnailUrl?: string
  chunkCount: number
  groups: Array<{ id: string; name: string; color: string | null }>
  createdAt: string
  updatedAt: string
}

export interface KnowledgeDocumentDetail {
  id: string
  title: string
  content: string
  categories: string[]
  subcategory: string | null
  groups: Array<{ id: string; name: string; color: string | null }>
  metadata: Prisma.JsonValue | null
  fileType: string
  artifactType: string | null
  fileSize: number | null
  mimeType: string | null
  s3Key: string | null
  fileUrl?: string
  chunks: Array<{ id: string; content: string; chunkIndex: number; createdAt: string }>
  createdAt: string
  updatedAt: string
}

export interface KnowledgeDocumentIntelligenceResponse {
  entities: Array<{
    id: string
    name: string
    type: string
    confidence: number
    document_id: string
    chunk_id?: string
    metadata?: { context?: string; source?: "pattern" | "llm" }
  }>
  relations: Array<{
    id: string
    in: string
    out: string
    relation_type: string
    confidence: number
    metadata?: { context?: string; description?: string }
  }>
  status: "completed"
  stats: {
    totalEntities: number
    totalRelations: number
    entityTypes: number
    relationTypes: number
  }
}

type SupportedImageExt = ".png" | ".jpg" | ".jpeg" | ".gif" | ".webp" | ".heic"

function mapFileType(document: {
  fileType?: string | null
  metadata?: Prisma.JsonValue | null
}) {
  return document.fileType || (document.metadata as { fileType?: string } | null)?.fileType || "markdown"
}

function mapGroups(groups: Array<{ group: { id: string; name: string; color: string | null } }>) {
  return groups.map((entry) => entry.group)
}

function normalizeSurrealId(value: unknown): string {
  if (typeof value === "string") {
    return value
  }

  if (value && typeof value === "object") {
    const record = value as { tb?: unknown; id?: unknown }
    if (typeof record.tb === "string" && typeof record.id === "string") {
      return `${record.tb}:${record.id}`
    }
    if (typeof record.id === "string") {
      return record.id
    }
  }

  return String(value)
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue
}

function toCategoryList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0)
  }

  if (typeof value === "string" && value.length > 0) {
    return [value]
  }

  return []
}

function toStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0)
  }

  return []
}

function hasDocumentAccess(documentOrganizationId: string | null, organizationId: string | null) {
  if (documentOrganizationId) {
    return organizationId !== null && documentOrganizationId === organizationId
  }

  return organizationId === null
}

function mapListItem(document: {
  id: string
  title: string
  categories: string[]
  subcategory: string | null
  fileType?: string | null
  metadata?: Prisma.JsonValue | null
  artifactType?: string | null
  fileSize: number | null
  s3Key: string | null
  groups: Array<{ group: { id: string; name: string; color: string | null } }>
  createdAt: Date
  updatedAt: Date
}) {
  return {
    id: document.id,
    title: document.title,
    categories: document.categories,
    subcategory: document.subcategory,
    fileType: mapFileType(document),
    artifactType: document.artifactType || null,
    fileSize: document.fileSize,
    hasS3File: Boolean(document.s3Key),
    groups: mapGroups(document.groups),
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
  }
}

/**
 * Same-origin streaming URL for a stored file. RustFS is internal-only (no
 * published port), so a presigned `http://rustfs:9000/...` URL is unreachable
 * from the browser — hand it `/api/files/[...key]` instead, which streams the
 * bytes through the (auth + org-scoped) app route.
 */
function appFileUrl(s3Key: string): string {
  const encoded = s3Key.split("/").map(encodeURIComponent).join("/")
  return `/api/files/${encoded}`
}

function resolveImageThumbnail(s3Key: string | null | undefined) {
  if (!s3Key) return undefined
  return appFileUrl(s3Key)
}

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
  }>(
    `SELECT id, content, chunk_index, created_at FROM document_chunk WHERE document_id = $document_id ORDER BY chunk_index ASC`,
    { document_id: params.documentId }
  )

  const rawResult = chunkResults[0]
  const chunks = (Array.isArray(rawResult) ? rawResult : (rawResult as { result?: Array<{
    id: unknown
    content: string
    chunk_index: number
    created_at: string
  }> })?.result || []) as Array<{
    id: unknown
    content: string
    chunk_index: number
    created_at: string
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
      createdAt: chunk.created_at,
    })),
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
  }
}

/**
 * Creates a dashboard knowledge document from JSON or a file upload.
 */
export async function createKnowledgeDocumentForDashboard(params: {
  context: KnowledgeDocumentContext
  input: KnowledgeDocumentCreateInput
}): Promise<Record<string, unknown> | ServiceError> {
  const { recordIngestJobStart, recordIngestJobSuccess, recordIngestJobFailure } = await import("@/lib/ingest/job")
  let ingestJobId: string | null = null

  if (params.context.organizationId && params.context.role && !canEdit(params.context.role)) {
    return { status: 403, error: "Insufficient permissions" }
  }

  const useEnhanced = params.input.useEnhanced
  const useCombined = params.input.useCombined !== false
  const groupIds = toStringList(params.input.groupIds)
  const categories = toCategoryList(params.input.categories)
  let title = params.input.title || ""
  let content = params.input.content || ""
  let fileBuffer: Buffer | undefined
  let mimeType: string | undefined
  let originalFilename: string | undefined
  let fileType: "markdown" | "pdf" | "image" = "markdown"
  let usedOCR = false

  if (params.input.kind === "file") {
    const file = params.input.file as File
    const validation = validateUpload("document", file.size, file.type)
    if (!validation.valid) {
      return { status: 400, error: validation.error }
    }

    // Per-org quota check. Both maxDocuments and maxStorageBytes are nullable
    // on Organization → checkKnowledgeQuota returns allowed=true when no limits
    // are set, so this is a no-op for unbounded orgs.
    const { checkKnowledgeQuota } = await import("@/lib/quota/knowledge")
    const quota = await checkKnowledgeQuota(params.context.organizationId, file.size)
    if (!quota.allowed) {
      return { status: 413, error: quota.reason ?? "Knowledge base quota exceeded" }
    }

    originalFilename = file.name
    mimeType = file.type
    const detectedType = detectFileType(file.name)
    fileBuffer = Buffer.from(await file.arrayBuffer())

    // Extraction failures used to fall back to a literal placeholder string
    // ("Failed to OCR PDF.") which then got chunked + embedded + indexed. RAG
    // hits would surface those placeholder strings as "results". Now: any
    // extraction failure aborts ingest with a 422; the caller can retry with
    // different settings (forceOCR, different documentType) instead of silently
    // poisoning the knowledge base.
    let extractionError: string | null = null

    if (detectedType === "pdf") {
      fileType = "pdf"
      const isScanned = params.input.forceOCR || (await isPDFScanned(fileBuffer))

      if (isScanned) {
        try {
          const ocrResult = await processDocumentOCR(fileBuffer, "application/pdf", {
            outputFormat: "markdown",
            documentType: params.input.documentType as
              | "printed_text"
              | "handwritten"
              | "table"
              | "form"
              | "figure"
              | "mixed"
              | undefined,
          })
          content = "combinedText" in ocrResult ? ocrResult.combinedText : ocrResult.text
          usedOCR = true
        } catch (error) {
          console.error("OCR processing error:", error)
          extractionError = `OCR failed for "${file.name}": ${(error as Error).message?.slice(0, 200) ?? "unknown error"}`
        }
      } else {
        try {
          const { extractText, getDocumentProxy } = await import("unpdf")
          const pdf = await getDocumentProxy(new Uint8Array(fileBuffer))
          const { text } = await extractText(pdf, { mergePages: true })
          content = text
        } catch (error) {
          console.error("PDF parsing error:", error)
          extractionError = `PDF parse failed for "${file.name}": ${(error as Error).message?.slice(0, 200) ?? "unknown error"}`
        }
      }
    } else if (detectedType === "image") {
      fileType = "image"
      try {
        const ext = path.extname(file.name).toLowerCase() as SupportedImageExt | string
        const mimeTypes: Record<string, string> = {
          ".png": "image/png",
          ".jpg": "image/jpeg",
          ".jpeg": "image/jpeg",
          ".gif": "image/gif",
          ".webp": "image/webp",
          ".heic": "image/heic",
        }
        const imgMimeType = mimeTypes[ext] || "image/png"

        const ocrResult = await processDocumentOCR(fileBuffer, imgMimeType, {
          outputFormat: "markdown",
          documentType: params.input.documentType as
            | "printed_text"
            | "handwritten"
            | "table"
            | "form"
            | "figure"
            | "mixed"
            | undefined,
        })
        const text = "combinedText" in ocrResult ? ocrResult.combinedText : ocrResult.text
        content = `[Image: ${file.name}]\n\n${text}`
        usedOCR = true
      } catch (error) {
        console.error("OCR processing error:", error)
        extractionError = `Image OCR failed for "${file.name}": ${(error as Error).message?.slice(0, 200) ?? "unknown error"}`
      }
    } else if (detectedType === "document" || detectedType === "text") {
      fileType = "markdown"
      try {
        const { EXT_TO_MIME } = await import("@/lib/files/mime-types")
        const { extractTextFromBuffer } = await import("@/lib/files/parsers")
        const detectedMime = EXT_TO_MIME[path.extname(file.name).toLowerCase()] || file.type || "text/plain"
        content = await extractTextFromBuffer(fileBuffer, detectedMime, file.name)
      } catch (error) {
        console.error("File extraction error:", error)
        extractionError = `Text extraction failed for "${file.name}": ${(error as Error).message?.slice(0, 200) ?? "unknown error"}`
      }
    } else {
      fileType = "markdown"
      content = fileBuffer.toString("utf-8")
    }

    if (extractionError) {
      return { status: 422, error: extractionError }
    }

    if (!title) {
      title = file.name.replace(/\.[^/.]+$/, "")
    }
  }

  if (!title || !content) {
    return {
      status: 400,
      error: "Title and content are required",
    }
  }

  const documentId = crypto.randomUUID()
  let s3Key: string | undefined
  let fileSize: number | undefined

  if (fileBuffer) {
    try {
      s3Key = S3Paths.document(
        params.context.organizationId || null,
        documentId,
        originalFilename || "file"
      )
      const uploadResult = await uploadFile(s3Key, fileBuffer, mimeType || "application/octet-stream", {
        documentId,
        fileType,
        originalFilename: originalFilename || "file",
      })
      fileSize = uploadResult.size
    } catch (error) {
      console.error("[Knowledge API] S3 upload failed:", error)
      s3Key = undefined
    }
  }

  // Open the IngestJob row now that we know s3Key + fileSize. We don't track
  // text-only / JSON-mode submissions (no file = no DLQ value).
  if (fileBuffer && originalFilename) {
    ingestJobId = await recordIngestJobStart({
      organizationId: params.context.organizationId,
      userId: params.context.userId,
      filename: originalFilename,
      fileSize: fileSize ?? null,
      mimeType: mimeType ?? null,
      s3Key: s3Key ?? null,
    })
  }

  // Strip null bytes — PostgreSQL UTF-8 columns reject 0x00
  const sanitize = (s: string) => s.replace(/\0/g, "")

  const document = await createKnowledgeDocument({
    id: documentId,
    title: sanitize(title),
    content: sanitize(content),
    categories,
    subcategory: params.input.subcategory || null,
    metadata: { fileType } as Prisma.InputJsonValue,
    s3Key,
    fileType,
    fileSize,
    mimeType,
    organizationId: params.context.organizationId || null,
    createdBy: params.context.userId,
    groups:
      groupIds.length > 0
        ? {
            create: groupIds.map((groupId) => ({
              groupId,
            })),
          }
        : undefined,
  })

  let chunks: Chunk[] = []
  let entityCount = 0

  if (useEnhanced) {
    chunks = await smartChunkDocument(content, title, categories[0], params.input.subcategory || undefined, {
      maxChunkSize: 800,
      overlapSize: 200,
      preserveCodeBlocks: true,
      respectHeadingBoundaries: true,
    })

    try {
      const surrealClient = await getSurrealClient()
      if (useCombined) {
        const { entities, relations } = await extractEntitiesAndRelations(content, document.id, params.context.userId)
        entityCount = entities.length

        const entityIdMap = new Map<string, string>()
        for (const entity of entities) {
          const sanitizedName = entity.name.toLowerCase().replace(/[^a-z0-9]/g, "_")
          const entityId = `entity:${document.id}_${sanitizedName}`

          try {
            await surrealClient.query(
              `UPSERT entity:\`${document.id}_${sanitizedName}\` CONTENT {
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
                document_id: document.id,
                file_id: document.id,
                metadata: entity.metadata,
              }
            )
          } catch (error) {
            console.warn(`[Knowledge API] Failed to upsert entity ${entityId}:`, error)
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
                document_id: document.id,
                context: relation.metadata?.context,
                created_at: new Date().toISOString(),
              })
              storedCount++
            } catch (error) {
              console.warn(`[Knowledge API] Failed to create relation ${sourceId} ->${relType}-> ${targetId}:`, error)
            }
          }
          console.log(`[Knowledge API] Relations: ${storedCount} stored, ${skippedCount} skipped (no matching entity), ${relations.length} total`)
        }
      } else {
        const entities = await extractEntities(content, document.id, undefined, {
          useLLM: true,
          usePatterns: true,
        })
        entityCount = entities.length

        for (const entity of entities) {
          const sanitizedName = entity.name.toLowerCase().replace(/[^a-z0-9]/g, "_")
          const entityId = `entity:${document.id}_${sanitizedName}`

          try {
            await surrealClient.query(
              `UPSERT entity:\`${document.id}_${sanitizedName}\` CONTENT {
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
                document_id: document.id,
                file_id: document.id,
                metadata: entity.metadata,
              }
            )
          } catch (error) {
            console.warn(`[Knowledge API] Failed to upsert entity ${entityId}:`, error)
          }
        }
      }
    } catch (error) {
      console.error("Entity/Relation extraction failed:", error)
    }
  } else {
    chunks = chunkDocument(content, title, categories[0], params.input.subcategory || undefined, {
      chunkSize: 1000,
      chunkOverlap: 200,
    })
  }

  // Embed + store atomically: if either step fails, the Document row in
  // Postgres is already created (above) but has zero chunks in SurrealDB →
  // user sees the doc in the file list but RAG returns nothing for it.
  // Roll back the half-ingested document (Prisma + S3) and re-throw so the
  // API route surfaces a real failure to the caller.
  const chunkTexts = chunks.map((chunk) => `${title}\n\n${chunk.content}`)
  try {
    const embeddings = await generateEmbeddings(chunkTexts)
    const { getRagConfig } = await import("@/lib/rag/config")
    const embeddingModel = getRagConfig().embeddingModel
    // Idempotency guard: storeChunks CREATEs chunks under the deterministic id
    // `${documentId}_${i}`, which throws on a pre-existing id. Clearing any
    // stale chunks first makes this step safe to re-run for the same
    // document.id — the precondition a future ingest-retry endpoint/cron needs
    // to recover a half-processed doc (e.g. a request killed by a deploy after
    // some chunks were written). No-op on the happy path (fresh random id →
    // zero existing chunks).
    await deleteChunksByDocumentId(document.id)
    await storeChunks(document.id, chunks, embeddings, embeddingModel)
  } catch (err) {
    console.error(
      `[Knowledge API] Ingest failed for document ${document.id} (${chunks.length} chunks); rolling back:`,
      err
    )
    try {
      await deleteKnowledgeDocument(document.id)
    } catch (rbErr) {
      console.error(`[Knowledge API] Rollback: Document.delete failed for ${document.id}:`, rbErr)
    }
    // NOTE: S3 key intentionally preserved so the DLQ retry endpoint can
    // replay this upload without re-asking the user for the file. The
    // IngestJob row carries the s3Key for that replay; orphaned S3 objects
    // for never-retried jobs are reaped by a separate sweep keyed on
    // IngestJob.status = "failed" + age.
    recordIngestJobFailure(ingestJobId, (err as Error).message ?? "ingest failed")
    throw err
  }

  // Same-origin streaming URL (RustFS is internal-only) — see appFileUrl.
  const fileUrl = s3Key ? appFileUrl(s3Key) : undefined

  recordKnowledgeAudit({
    organizationId: params.context.organizationId,
    userId: params.context.userId,
    action: "document.create",
    entityType: "document",
    entityId: document.id,
    detail: { title: document.title, fileType, fileSize, chunkCount: chunks.length, entityCount },
  })

  recordIngestJobSuccess(ingestJobId, document.id)

  return {
    id: document.id,
    title: document.title,
    categories: document.categories,
    groups: document.groups.map((dg) => dg.group),
    fileType,
    fileSize,
    s3Key,
    fileUrl,
    chunkCount: chunks.length,
    entityCount: useEnhanced ? entityCount : undefined,
    enhanced: useEnhanced,
    usedOCR,
  }
}

/**
 * Updates a dashboard knowledge document.
 */
export async function updateKnowledgeDocumentForDashboard(params: {
  documentId: string
  organizationId: string | null
  role: string | null | undefined
  /** Acting user id — written to AuditLog so we can answer "who did this?". */
  userId: string | null
  input: KnowledgeDocumentUpdateInput
}): Promise<Record<string, unknown> | ServiceError> {
  const existing = await findKnowledgeDocumentAccessById(params.documentId)
  if (!existing) {
    return { status: 404, error: "Document not found" }
  }

  if (!hasDocumentAccess(existing.organizationId, params.organizationId)) {
    return { status: 404, error: "Document not found" }
  }

  if (existing.organizationId && params.role && !canEdit(params.role)) {
    return { status: 403, error: "Insufficient permissions" }
  }

  const groupIds = params.input.groupIds === undefined ? undefined : toStringList(params.input.groupIds)

  const document = await updateKnowledgeDocumentWithGroups(
    params.documentId,
    {
      ...(params.input.title && { title: params.input.title }),
      ...(params.input.categories !== undefined && { categories: toCategoryList(params.input.categories) }),
      ...(params.input.subcategory !== undefined && {
        subcategory: params.input.subcategory || null,
      }),
    },
    groupIds
  )

  if (!document) {
    return { status: 404, error: "Document not found" }
  }

  recordKnowledgeAudit({
    organizationId: params.organizationId,
    userId: params.userId,
    action: "document.update",
    entityType: "document",
    entityId: params.documentId,
    detail: {
      title: params.input.title,
      categories: params.input.categories,
      subcategory: params.input.subcategory,
      groupIds,
    },
  })

  return {
    id: document.id,
    title: document.title,
    categories: document.categories,
    subcategory: document.subcategory,
    groups: mapGroups(document.groups),
  }
}

/**
 * Soft-deletes a knowledge document by default (recoverable for `retentionDays`
 * before the retention sweep hard-deletes). Pass `hard: true` for the legacy
 * permanent-delete path that also cleans up S3 + SurrealDB chunks immediately.
 */
export async function deleteKnowledgeDocumentForDashboard(params: {
  documentId: string
  organizationId: string | null
  role: string | null | undefined
  userId: string | null
  hard?: boolean
}): Promise<{ success: true; mode: "soft" | "hard" } | ServiceError> {
  const existing = await findKnowledgeDocumentAccessById(params.documentId)
  if (!existing) {
    return { status: 404, error: "Document not found" }
  }

  if (!hasDocumentAccess(existing.organizationId, params.organizationId)) {
    return { status: 404, error: "Document not found" }
  }

  if (existing.organizationId && params.role && !canManage(params.role)) {
    return { status: 403, error: "Insufficient permissions" }
  }

  if (!params.hard) {
    // Soft delete: row stays, deletedAt timestamp filters it out everywhere.
    // Chunks in SurrealDB stay until the retention sweep — retrieval skips
    // them because the Postgres join filters deletedAt: null.
    await softDeleteKnowledgeDocument(params.documentId)
    recordKnowledgeAudit({
      organizationId: params.organizationId,
      userId: params.userId,
      action: "document.delete",
      entityType: "document",
      entityId: params.documentId,
      detail: { mode: "soft" },
    })
    console.log(`Soft-deleted document ${params.documentId}`)
    return { success: true, mode: "soft" }
  }

  // Hard-delete order (postgres-first):
  //   1. delete Document row in Postgres — this is the only step we can do
  //      atomically. If it fails, nothing changes; user retries.
  //   2. cleanup SurrealDB chunks + entities — best-effort. If it fails, the
  //      chunks are now orphans (no parent Document.id in Postgres) and will
  //      be filtered out at retrieval (vector-store.ts uses an inner join +
  //      deletedAt:null filter, so missing doc → chunk dropped from results).
  //      A retention sweep can hard-drop the orphan chunks later.
  //   3. delete S3 file — best-effort, same logic; orphan S3 objects are
  //      cheap and recoverable by a periodic scan of S3 vs Document.s3Key.
  //
  // Old order (surreal → s3 → postgres) had the failure mode: if Postgres
  // delete failed AFTER surreal+s3 cleared, the doc stayed visible in the UI
  // but RAG silently returned zero chunks. New order avoids that by leaving
  // the doc fully present if its row delete fails.
  let cleanupStats: { deletedRelationTables: number; entitiesDeleted: boolean; chunksDeleted: boolean } = {
    deletedRelationTables: 0,
    entitiesDeleted: false,
    chunksDeleted: false,
  }
  try {
    await deleteKnowledgeDocument(params.documentId)
  } catch (err) {
    console.error(`[Knowledge API] Hard delete: Postgres delete failed for ${params.documentId}:`, err)
    return {
      status: 500,
      error: `Failed to delete document row: ${(err as Error).message?.slice(0, 200) ?? "unknown"}`,
    }
  }

  try {
    const surrealClient = await getSurrealClient()
    cleanupStats = await surrealClient.cleanupDocumentIntelligence(params.documentId)
  } catch (err) {
    console.error(
      `[Knowledge API] Hard delete: SurrealDB cleanup failed for ${params.documentId} (Postgres row already deleted; chunks orphan and will be filtered at retrieval). Manual sweep needed:`,
      err
    )
  }

  if (existing.s3Key) {
    try {
      await deleteFile(existing.s3Key)
    } catch (error) {
      console.error(
        `[Knowledge API] Hard delete: S3 delete failed for ${existing.s3Key} (Postgres row already deleted; file orphan). Manual sweep needed:`,
        error
      )
    }
  }

  recordKnowledgeAudit({
    organizationId: params.organizationId,
    userId: params.userId,
    action: "document.hard_delete",
    entityType: "document",
    entityId: params.documentId,
    detail: {
      mode: "hard",
      relationTablesCleaned: cleanupStats.deletedRelationTables,
      entitiesDeleted: cleanupStats.entitiesDeleted,
      chunksDeleted: cleanupStats.chunksDeleted,
    },
    riskLevel: "high",
  })
  console.log(
    `Hard-deleted document ${params.documentId}: cleaned up relations from ${cleanupStats.deletedRelationTables} tables, entities: ${cleanupStats.entitiesDeleted}, chunks: ${cleanupStats.chunksDeleted}`
  )

  return { success: true, mode: "hard" }
}

/**
 * Restore a previously soft-deleted document.
 */
export async function restoreKnowledgeDocumentForDashboard(params: {
  documentId: string
  organizationId: string | null
  role: string | null | undefined
  userId: string | null
}): Promise<{ success: true } | ServiceError> {
  const existing = await findKnowledgeDocumentAccessById(params.documentId)
  if (!existing) {
    return { status: 404, error: "Document not found" }
  }

  if (!hasDocumentAccess(existing.organizationId, params.organizationId)) {
    return { status: 404, error: "Document not found" }
  }

  if (existing.organizationId && params.role && !canManage(params.role)) {
    return { status: 403, error: "Insufficient permissions" }
  }

  await restoreKnowledgeDocument(params.documentId)
  recordKnowledgeAudit({
    organizationId: params.organizationId,
    userId: params.userId,
    action: "document.restore",
    entityType: "document",
    entityId: params.documentId,
  })
  console.log(`Restored document ${params.documentId}`)
  return { success: true }
}

/**
 * Replace a document's content in place — keeps the same Document.id (so
 * groups, sessions, assistant bindings, audit history stay attached), cleans
 * old chunks + entities + S3 file, then re-ingests with the new file or text.
 *
 * Used when a doc gets a revised version (e.g. PSAK 113 amendment) without
 * losing the doc identity. Soft-delete + re-upload would orphan everything
 * keyed off the old id.
 */
export async function replaceKnowledgeDocumentContentForDashboard(params: {
  context: KnowledgeDocumentContext
  documentId: string
  input: KnowledgeDocumentCreateInput
}): Promise<Record<string, unknown> | ServiceError> {
  const existing = await findKnowledgeDocumentAccessById(params.documentId)
  if (!existing) return { status: 404, error: "Document not found" }
  if (!hasDocumentAccess(existing.organizationId, params.context.organizationId)) {
    return { status: 404, error: "Document not found" }
  }
  if (existing.organizationId && params.context.role && !canManage(params.context.role)) {
    return { status: 403, error: "Insufficient permissions" }
  }

  // Extract the new content using the same path the create flow uses. The
  // simplest implementation: call createKnowledgeDocumentForDashboard to do
  // a fresh ingest, then atomically swap the new content/s3Key onto the
  // existing row and hard-delete the duplicate id. Less wasteful: factor
  // out the extraction, but that's a bigger refactor — keep the duplication
  // local for now. createKnowledgeDocumentForDashboard already handles quota,
  // OCR, smart router, embeddings, chunks, entities — re-running it here is
  // correct, just slightly wasteful.
  const created = await createKnowledgeDocumentForDashboard({
    context: params.context,
    input: params.input,
  })
  if ("status" in created) return created as ServiceError

  const newDocId = (created as { id: string }).id
  if (newDocId === params.documentId) {
    // Edge case: createKnowledgeDocumentForDashboard generated the same id (extremely unlikely with cuid).
    return created
  }

  // Move the new content/s3Key onto the existing row, then nuke the freshly-
  // created duplicate. This keeps the original Document.id stable.
  const surrealClient = await getSurrealClient()
  // 1) wipe the OLD document's chunks + entities + S3 file so retrieval stops
  //    returning the stale content while we swap.
  const cleanupStats = await surrealClient.cleanupDocumentIntelligence(params.documentId)
  if (existing.s3Key) {
    try { await deleteFile(existing.s3Key) } catch (err) {
      console.warn(`[Knowledge API] Replace: old S3 delete failed for ${existing.s3Key}:`, err)
    }
  }

  // 2) Re-key the NEW doc's chunks under the existing documentId.
  await surrealClient.query(
    `UPDATE document_chunk SET document_id = $oldId WHERE document_id = $newId`,
    { oldId: params.documentId, newId: newDocId }
  )
  await surrealClient.query(
    `UPDATE entity SET document_id = $oldId WHERE document_id = $newId`,
    { oldId: params.documentId, newId: newDocId }
  )

  // 3) Copy new content + s3Key fields onto the existing Document row.
  const newRow = (created as {
    title: string; chunkCount: number; fileType?: string | null; fileSize?: number | null; s3Key?: string | null;
  })
  const newDocFull = await prisma.document.findUnique({
    where: { id: newDocId },
    select: { content: true, s3Key: true, fileType: true, fileSize: true, mimeType: true },
  })
  if (newDocFull) {
    await replaceKnowledgeDocumentContent(params.documentId, {
      content: newDocFull.content,
      s3Key: newDocFull.s3Key,
      fileType: newDocFull.fileType,
      fileSize: newDocFull.fileSize,
      mimeType: newDocFull.mimeType,
    })
  }

  // 4) Delete the duplicate Document row (its chunks/entities now point at
  //    the original id, so deleting the row is safe — chunks survive).
  await prisma.document.delete({ where: { id: newDocId } })

  recordKnowledgeAudit({
    organizationId: params.context.organizationId,
    userId: params.context.userId,
    action: "document.reembed",
    entityType: "document",
    entityId: params.documentId,
    detail: {
      newTitle: newRow.title,
      newChunkCount: newRow.chunkCount,
      oldChunkCount: cleanupStats.chunksDeleted,
    },
    riskLevel: "medium",
  })

  return {
    id: params.documentId,
    title: newRow.title,
    fileType: newRow.fileType,
    fileSize: newRow.fileSize,
    s3Key: newRow.s3Key,
    chunkCount: newRow.chunkCount,
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
