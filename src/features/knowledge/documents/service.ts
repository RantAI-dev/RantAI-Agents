import path from "path"
import { Prisma } from "@prisma/client"
import {
  chunkDocument,
  smartChunkDocument,
  generateEmbeddings,
  detectFileType,
  storeChunks,
  getDocumentChunkCount,
  type Chunk,
} from "@/lib/rag"
import { extractEntities, extractEntitiesAndRelations } from "@/lib/document-intelligence"
import { getSurrealClient } from "@/lib/surrealdb"
import { uploadFile, S3Paths, validateUpload, getPresignedDownloadUrl, deleteFile } from "@/lib/s3"
import { processDocumentOCR, isPDFScanned } from "@/lib/ocr"
import { canEdit, canManage } from "@/lib/organization"
import {
  createKnowledgeDocument,
  deleteKnowledgeDocument,
  findKnowledgeDocumentAccessById,
  findKnowledgeDocumentById,
  listKnowledgeDocumentsByScope,
  updateKnowledgeDocumentWithGroups,
} from "./repository"
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

async function resolveImageThumbnail(s3Key: string | null | undefined) {
  if (!s3Key) return undefined

  try {
    return await getPresignedDownloadUrl(s3Key, 3600)
  } catch {
    return undefined
  }
}

/**
 * Lists dashboard knowledge documents in the current scope.
 */
export async function listKnowledgeDocumentsForDashboard(params: {
  organizationId: string | null
  groupId: string | null
}): Promise<KnowledgeDocumentListItem[]> {
  const documents = await listKnowledgeDocumentsByScope(params)

  return Promise.all(
    documents.map(async (document) => {
      const fileType = mapFileType(document)
      const thumbnailUrl = fileType === "image" ? await resolveImageThumbnail(document.s3Key) : undefined
      const chunkCount = await getDocumentChunkCount(document.id)

      return {
        ...mapListItem(document),
        chunkCount,
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

  let fileUrl: string | undefined
  if (document.s3Key) {
    try {
      fileUrl = await getPresignedDownloadUrl(document.s3Key)
    } catch (error) {
      console.error("[Knowledge API] Failed to generate presigned URL:", error)
    }
  }

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

    originalFilename = file.name
    mimeType = file.type
    const detectedType = detectFileType(file.name)
    fileBuffer = Buffer.from(await file.arrayBuffer())

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
          content = `[PDF Document: ${title || file.name}]\n\nFailed to OCR PDF.`
        }
      } else {
        try {
          const { extractText, getDocumentProxy } = await import("unpdf")
          const pdf = await getDocumentProxy(new Uint8Array(fileBuffer))
          const { text } = await extractText(pdf, { mergePages: true })
          content = text
        } catch (error) {
          console.error("PDF parsing error:", error)
          content = `[PDF Document: ${title || file.name}]\n\nFailed to extract text from PDF.`
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
        content = `[Image: ${file.name}]\n\nFailed to process image with OCR.`
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
        content = `[${file.name}]\n\nFailed to extract text from file.`
      }
    } else {
      fileType = "markdown"
      content = fileBuffer.toString("utf-8")
    }

    if (!title) {
      title = file.name.replace(/\.[^/.]+$/, "")
    }
  }

  if (!title || !content || categories.length === 0) {
    return {
      status: 400,
      error: "Title, content, and at least one category are required",
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

  const chunkTexts = chunks.map((chunk) => `${title}\n\n${chunk.content}`)
  const embeddings = await generateEmbeddings(chunkTexts)
  await storeChunks(document.id, chunks, embeddings)

  let fileUrl: string | undefined
  if (s3Key) {
    try {
      fileUrl = await getPresignedDownloadUrl(s3Key)
    } catch (error) {
      console.error("[Knowledge API] Failed to generate presigned URL:", error)
    }
  }

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

  return {
    id: document.id,
    title: document.title,
    categories: document.categories,
    subcategory: document.subcategory,
    groups: mapGroups(document.groups),
  }
}

/**
 * Deletes a dashboard knowledge document and its external assets.
 */
export async function deleteKnowledgeDocumentForDashboard(params: {
  documentId: string
  organizationId: string | null
  role: string | null | undefined
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

  const surrealClient = await getSurrealClient()
  const cleanupStats = await surrealClient.cleanupDocumentIntelligence(params.documentId)

  if (existing.s3Key) {
    try {
      await deleteFile(existing.s3Key)
    } catch (error) {
      console.error(`[Knowledge API] Failed to delete S3 file ${existing.s3Key}:`, error)
    }
  }

  await deleteKnowledgeDocument(params.documentId)
  console.log(
    `Deleted document ${params.documentId}: cleaned up relations from ${cleanupStats.deletedRelationTables} tables, entities: ${cleanupStats.entitiesDeleted}, chunks: ${cleanupStats.chunksDeleted}`
  )

  return { success: true }
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
