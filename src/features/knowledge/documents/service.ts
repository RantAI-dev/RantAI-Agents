import path from "path"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import {
  smartChunkDocument,
  generateEmbeddings,
  detectFileType,
  storeChunks,
  deleteChunksByDocumentId,
  getDocumentChunkCount,
  getDocumentChunkCounts,
  type Chunk,
} from "@/lib/rag"
import { assignChunkPages } from "@/lib/rag/page-map"
import { extractEntities, extractEntitiesAndRelations } from "@/lib/document-intelligence"
import { getSurrealClient } from "@/lib/surrealdb"
import { uploadFile, S3Paths, validateUpload, deleteFile } from "@/lib/s3"
import { processDocumentOCR, isPDFScanned } from "@/lib/ocr"
import { canEdit, canManage } from "@/lib/organization"
import {
  countKnowledgeDocumentsForScope,
  createKnowledgeDocument,
  updateKnowledgeDocumentMetadata,
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
  // Ingest lifecycle: "ready" (default) | "processing" | "failed".
  status: string
  // Live progress snapshot for a doc still being ingested (null otherwise) —
  // lets the card render its bar on first load / reload without the socket.
  ingest?: {
    jobId: string
    step: string | null
    progress: number
    stepCurrent: number | null
    stepTotal: number | null
    etaSeconds: number | null
    error: string | null
  } | null
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
  chunks: Array<{ id: string; content: string; chunkIndex: number; chunkType: string | null; createdAt: string }>
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
  // Org-scoped doc: caller must be in the same org.
  if (documentOrganizationId) {
    return organizationId !== null && documentOrganizationId === organizationId
  }
  // Null-org (personal/global) doc: any caller in any org context can access.
  // This matches the listing query's permissiveness at repository.ts:16-18,
  // which surfaces null-org docs to org-active callers via the OR clause.
  // Previously this branch returned `organizationId === null`, which meant
  // null-org docs were visible-but-unmutable from any org context — Files
  // page DELETE returned 404 even though the row appeared in the list.
  return true
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
  status?: string | null
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
    status: document.status || "ready",
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
 * Creates a dashboard knowledge document from JSON or a file upload.
 */
export async function createKnowledgeDocumentForDashboard(params: {
  context: KnowledgeDocumentContext
  input: KnowledgeDocumentCreateInput
  // Background-ingest hooks. When the ingest worker drives this it passes the
  // pre-created placeholder documentId, the existing job id, the already-
  // uploaded S3 key/size, and an onProgress sink. All absent on the direct
  // (json) synchronous path, in which case a fresh doc + job are created.
  documentId?: string
  jobId?: string | null
  s3Key?: string
  fileSize?: number
  onProgress?: (sp: import("@/lib/ingest/progress").StepProgress) => void | Promise<void>
}): Promise<Record<string, unknown> | ServiceError> {
  const { createIngestJob, recordIngestJobSuccess, recordIngestJobFailure } = await import("@/lib/ingest/job")
  const isBackground = !!params.documentId
  const emit = params.onProgress
    ? (step: import("@/lib/ingest/progress").IngestStep, current?: number, total?: number) =>
        params.onProgress!({ step, current, total })
    : undefined
  let ingestJobId: string | null = params.jobId ?? null

  if (params.context.organizationId && params.context.role && !canEdit(params.context.role)) {
    return { status: 403, error: "Insufficient permissions" }
  }

  const useCombined = params.input.useCombined !== false
  // Per-type pipeline policy: what runs is decided by file type (+ the PDF-only
  // figureMode knob), not by the legacy useEnhanced toggle (accepted, ignored).
  const { resolveIngestPolicy, parseFigureMode } = await import("@/lib/ingest/pipeline-policy")
  const policy =
    params.input.kind === "file" && params.input.file
      ? resolveIngestPolicy(
          (params.input.file as File).name,
          parseFigureMode(params.input.figureMode, params.input.forceOCR)
        )
      : { entities: true, figures: false, forceLayout: false }
  const groupIds = toStringList(params.input.groupIds)
  const categories = toCategoryList(params.input.categories)
  let title = params.input.title || ""
  let content = params.input.content || ""
  let fileBuffer: Buffer | undefined
  let mimeType: string | undefined
  let originalFilename: string | undefined
  let fileType: "markdown" | "pdf" | "image" = "markdown"
  let extractedFigures: import("@/lib/rag/extractors/types").ExtractedFigure[] | undefined
  /** Reading-order blocks, carried alongside the figures so each one can be
   *  anchored to the text chunk it belongs to rather than matched by caption. */
  let extractedPagesBlocks: import("@/lib/rag/extractors/types").PageBlocks[][] | undefined
  let extractionPageMap: Array<{ page: number; text: string }> | undefined
  let usedOCR = false

  if (params.input.kind === "file") {
    const file = params.input.file as File
    // Validation + quota already ran at enqueue for the background path — skip
    // to avoid a second quota charge (the file is already stored).
    if (!isBackground) {
      const validation = validateUpload("document", file.size, file.type, file.name)
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
    }

    originalFilename = file.name
    mimeType = file.type
    const detectedType = detectFileType(file.name)
    fileBuffer = Buffer.from(await file.arrayBuffer())
    await emit?.("extracting")

    // Extraction failures used to fall back to a literal placeholder string
    // ("Failed to OCR PDF.") which then got chunked + embedded + indexed. RAG
    // hits would surface those placeholder strings as "results". Now: any
    // extraction failure aborts ingest with a 422; the caller can retry with
    // different settings (forceOCR, different documentType) instead of silently
    // poisoning the knowledge base.
    let extractionError: string | null = null

    if (detectedType === "pdf") {
      fileType = "pdf"
      const isScanned = policy.forceLayout || (await isPDFScanned(fileBuffer))

      if (isScanned) {
        // Layout extractors (MinerU/Mistral) — purpose-built for scanned/
        // table-heavy PDFs and return cropped figures. Build an ordered CHAIN
        // from whatever is configured and try each until one yields text, so a
        // provider outage/quota falls through to the next rather than dropping
        // to the (figure-less) legacy OCR pipeline:
        //   1. on-prem MinerU sidecar  (KB_EXTRACT_MINERU_BASE_URL) — GPU, private
        //   2. hosted MinerU API       (KB_MINERU_API_KEY)          — free tier
        //   3. Mistral OCR             (KB_MISTRAL_OCR_KEY)         — payable, EU
        // Override the order with KB_LAYOUT_EXTRACTOR_ORDER (csv of
        // sidecar,mineru-api,mistral). Legacy OCR remains the final fallback.
        const { getRagConfig } = await import("@/lib/rag/config")
        const mineruBaseUrl = getRagConfig().extractMineruBaseUrl
        const available: Record<string, () => Promise<import("@/lib/rag/extractors/types").Extractor>> = {
          sidecar: mineruBaseUrl
            ? async () => new (await import("@/lib/rag/extractors/mineru-extractor")).MineruExtractor(mineruBaseUrl)
            : undefined as never,
          "mineru-api": process.env.KB_MINERU_API_KEY
            ? async () => new (await import("@/lib/rag/extractors/mineru-api-extractor")).MineruApiExtractor()
            : undefined as never,
          mistral: process.env.KB_MISTRAL_OCR_KEY
            ? async () => new (await import("@/lib/rag/extractors/mistral-ocr-extractor")).MistralOcrExtractor()
            : undefined as never,
        }
        const defaultOrder = ["sidecar", "mineru-api", "mistral"]
        const order = (process.env.KB_LAYOUT_EXTRACTOR_ORDER?.split(",").map((x) => x.trim()) || defaultOrder)
          .filter((name) => typeof available[name] === "function")
        for (const name of order) {
          try {
            const extractor = await available[name]()
            const result = await extractor.extract(fileBuffer, { withFigures: policy.figures })
            if (result.text?.trim()) {
              content = result.text
              usedOCR = true
              if (policy.figures && result.figures?.length) extractedFigures = result.figures
              if (result.pagesBlocks?.length) extractedPagesBlocks = result.pagesBlocks
              if (result.pageMap?.length) extractionPageMap = result.pageMap
              console.log(`[Knowledge] Layout extraction via ${name} (${result.figures?.length ?? 0} figures, ${result.pageMap?.length ?? 0} page blocks)`)
              break
            }
            console.warn(`[Knowledge] ${name} returned no text, trying next extractor`)
          } catch (error) {
            console.warn(
              `[Knowledge] ${name} extraction failed, trying next: ${error instanceof Error ? error.message : error}`
            )
          }
        }

        if (!usedOCR) try {
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
          // Per-page extraction (mergePages:false → string[]) so we can build a
          // pageMap and tag every text chunk with its source page, then join
          // for the chunker input.
          const { text } = await extractText(pdf, { mergePages: false })
          const pages = Array.isArray(text) ? text : [text]
          content = pages.join("\n\n")
          extractionPageMap = pages
            .map((t, i) => ({ page: i, text: (t || "").trim() }))
            .filter((p) => p.text.length > 0)
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

  const documentId = params.documentId ?? crypto.randomUUID()
  let s3Key: string | undefined = params.s3Key
  let fileSize: number | undefined = params.fileSize

  // Background path already uploaded the file to S3 at enqueue and carries the
  // key/size on `params` — don't re-upload (would re-push tens of MB).
  if (fileBuffer && !isBackground) {
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

  // Background path already has its IngestJob (created at enqueue). Only the
  // legacy synchronous file path opens one here; text-only / JSON submissions
  // (no file) are not tracked (no DLQ value).
  if (!isBackground && fileBuffer && originalFilename) {
    ingestJobId = await createIngestJob({
      organizationId: params.context.organizationId,
      userId: params.context.userId,
      filename: originalFilename,
      fileSize: fileSize ?? null,
      mimeType: mimeType ?? null,
      s3Key: s3Key ?? null,
      documentId,
      params: {
        useCombined,
        figureMode: parseFigureMode(params.input.figureMode, params.input.forceOCR),
        documentType: params.input.documentType,
        title,
        categories: params.input.categories,
        subcategory: params.input.subcategory,
        groupIds,
      },
    })
  }

  // Belt-and-braces: extraction must yield a string; anything else (a parser
  // resolving an error object, etc.) becomes a clean 422 instead of a 500.
  if (typeof content !== "string" || typeof title !== "string") {
    return {
      status: 422,
      error: `Extraction produced no usable text for "${originalFilename || title}" — the file may be image-only or unsupported. Try converting to PDF (image-heavy decks go through OCR/MinerU there).`,
    }
  }

  // Strip null bytes — PostgreSQL UTF-8 columns reject 0x00
  const sanitize = (s: string) => s.replace(/\0/g, "")

  // Background: the placeholder Document (+ its groups) was created at enqueue.
  // Fill in the now-extracted content instead of creating a second row.
  const document = isBackground
    ? await (async () => {
        await replaceKnowledgeDocumentContent(documentId, {
          content: sanitize(content),
          s3Key,
          fileType,
          fileSize,
          mimeType,
        })
        const doc = await findKnowledgeDocumentById(documentId)
        if (!doc) throw new Error(`Placeholder document ${documentId} not found`)
        return doc
      })()
    : await createKnowledgeDocument({
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

  await emit?.("chunking")

  // Always the table/code-aware chunker: the naive fixed-size splitter shredded
  // spreadsheet rows and code blocks (the old failure mode when the "enhanced"
  // toggle was off). Policy decides the optional steps below, not the chunker.
  chunks = await smartChunkDocument(content, title, categories[0], params.input.subcategory || undefined, {
    maxChunkSize: 800,
    overlapSize: 200,
    preserveCodeBlocks: true,
    respectHeadingBoundaries: true,
  })

  if (policy.entities) {
    // Entity/relation extraction is an expensive per-chunk LLM pass. On-prem KBs
    // that only need vector retrieval can disable it with
    // KB_ENTITY_EXTRACTION_ENABLED=false — it otherwise competes with the mineru
    // sidecar for the shared GPU and slows figure/table OCR (pushing dense books
    // past the extractor timeout, which drops them to text-only).
    if (process.env.KB_ENTITY_EXTRACTION_ENABLED === "false") {
      console.log("[Knowledge] entity extraction disabled (KB_ENTITY_EXTRACTION_ENABLED=false)")
    } else try {
      await emit?.("extracting_entities")
      const surrealClient = await getSurrealClient()
      if (useCombined) {
        const { entities, relations } = await extractEntitiesAndRelations(content, document.id, params.context.userId)
        entityCount = entities.length

        const entityIdMap = new Map<string, string>()
        let entityIdx = 0
        for (const entity of entities) {
          await emit?.("extracting_entities", ++entityIdx, entities.length)
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
  }

  // Tag text chunks with their source page (from the layout parser's page map)
  // so retrieval sources can show "hal. N". Best-effort; no-op without a map.
  if (extractionPageMap?.length) {
    chunks = assignChunkPages(chunks, extractionPageMap)
  }

  // ── Figure asset layer (multimodal RAG): upload crops + append searchable
  // figure chunks so retrieval can surface + render the original image. ──
  if (extractedFigures?.length) {
    await emit?.("processing_figures", 0, extractedFigures.length)
    try {
      const { storeFiguresAsChunks } = await import("@/lib/rag/figure-assets")
      const { chunks: figChunks, assets } = await storeFiguresAsChunks({
        organizationId: params.context.organizationId || null,
        documentId: document.id,
        documentTitle: title,
        category: categories[0] ?? "general",
        subcategory: params.input.subcategory || undefined,
        figures: extractedFigures,
        // Page-tagged text chunks so caption-less figures borrow the prose around
        // them (findability + a real "keterangan" instead of "Tanpa keterangan").
        textChunks: chunks,
        pagesBlocks: extractedPagesBlocks,
      })
      if (figChunks.length) {
        // Reindex chunkIndex across the combined set (figure chunks were -1).
        chunks = [...chunks, ...figChunks].map((c, i) => ({
          ...c,
          metadata: { ...c.metadata, chunkIndex: i },
        }))
      }
      if (assets.length) {
        await updateKnowledgeDocumentMetadata(document.id, { figures: assets })
      }
      console.log(`[Knowledge API] Figures: ${assets.length} stored for document ${document.id}`)
    } catch (err) {
      console.warn(`[Knowledge API] Figure asset ingest failed (non-fatal): ${err instanceof Error ? err.message : err}`)
    }
  }

  // Embed + store atomically: if either step fails, the Document row in
  // Postgres is already created (above) but has zero chunks in SurrealDB →
  // user sees the doc in the file list but RAG returns nothing for it.
  // Roll back the half-ingested document (Prisma + S3) and re-throw so the
  // API route surfaces a real failure to the caller.
  const chunkTexts = chunks.map((chunk) => `${title}\n\n${chunk.content}`)
  try {
    await emit?.("embedding", 0, chunks.length)
    const embeddings = await generateEmbeddings(chunkTexts)
    const { getRagConfig } = await import("@/lib/rag/config")
    const embeddingModel = getRagConfig().embeddingModel
    await emit?.("storing", 0, chunks.length)
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
      `[Knowledge API] Ingest failed for document ${document.id} (${chunks.length} chunks):`,
      err
    )
    if (isBackground) {
      // Keep the row so the card can show "failed" + a Retry button; stale
      // chunks are cleared before re-store on retry (idempotency guard above).
      await prisma.document
        .update({ where: { id: document.id }, data: { status: "failed" } })
        .catch((e) => console.error(`[Knowledge API] mark failed for ${document.id}:`, e))
    } else {
      try {
        await deleteKnowledgeDocument(document.id)
      } catch (rbErr) {
        console.error(`[Knowledge API] Rollback: Document.delete failed for ${document.id}:`, rbErr)
      }
    }
    // NOTE: S3 key intentionally preserved so the DLQ retry endpoint can
    // replay this upload without re-asking the user for the file. The
    // IngestJob row carries the s3Key for that replay; orphaned S3 objects
    // for never-retried jobs are reaped by a separate sweep keyed on
    // IngestJob.status = "failed" + age.
    await recordIngestJobFailure(ingestJobId, (err as Error).message ?? "ingest failed")
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

  if (isBackground) {
    await prisma.document
      .update({ where: { id: document.id }, data: { status: "ready" } })
      .catch((e) => console.error(`[Knowledge API] mark ready for ${document.id}:`, e))
    await emit?.("done")
  }

  await recordIngestJobSuccess(ingestJobId, document.id)

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
    entityCount: policy.entities ? entityCount : undefined,
    enhanced: policy.entities,
    usedOCR,
  }
}

/**
 * Enqueue a file upload for background ingest. Does only the fast, synchronous
 * work the user waits on: validate, quota, store the bytes to S3, create a
 * placeholder Document (status "processing") + a pending IngestJob. The worker
 * (see lib/ingest/worker.ts) picks the job up and runs the heavy pipeline.
 * Returns immediately so the route can respond 202 and the modal can close.
 */
export async function enqueueFileIngest(params: {
  context: KnowledgeDocumentContext
  input: KnowledgeDocumentCreateInput
}): Promise<Record<string, unknown> | ServiceError> {
  const { createIngestJob } = await import("@/lib/ingest/job")

  if (params.context.organizationId && params.context.role && !canEdit(params.context.role)) {
    return { status: 403, error: "Insufficient permissions" }
  }
  if (params.input.kind !== "file") {
    return { status: 400, error: "enqueueFileIngest requires a file upload" }
  }

  const file = params.input.file as File
  const validation = validateUpload("document", file.size, file.type, file.name)
  if (!validation.valid) {
    return { status: 400, error: validation.error }
  }

  const { checkKnowledgeQuota } = await import("@/lib/quota/knowledge")
  const quota = await checkKnowledgeQuota(params.context.organizationId, file.size)
  if (!quota.allowed) {
    return { status: 413, error: quota.reason ?? "Knowledge base quota exceeded" }
  }

  const detectedType = detectFileType(file.name)
  const fileType: "markdown" | "pdf" | "image" =
    detectedType === "pdf" ? "pdf" : detectedType === "image" ? "image" : "markdown"
  const title = (params.input.title || file.name.replace(/\.[^/.]+$/, "")).replace(/\0/g, "")
  const categories = toCategoryList(params.input.categories)
  const groupIds = toStringList(params.input.groupIds)
  const documentId = crypto.randomUUID()

  // Store the bytes first — the placeholder + job are worthless without the
  // file the worker will re-download.
  let s3Key: string
  let fileSize: number
  try {
    const fileBuffer = Buffer.from(await file.arrayBuffer())
    s3Key = S3Paths.document(params.context.organizationId || null, documentId, file.name)
    const uploadResult = await uploadFile(s3Key, fileBuffer, file.type || "application/octet-stream", {
      documentId,
      fileType,
      originalFilename: file.name,
    })
    fileSize = uploadResult.size
  } catch (error) {
    console.error("[Knowledge API] enqueue S3 upload failed:", error)
    return { status: 502, error: "Failed to store the uploaded file. Please try again." }
  }

  const document = await createKnowledgeDocument({
    id: documentId,
    title,
    content: "",
    categories,
    subcategory: params.input.subcategory || null,
    metadata: { fileType } as Prisma.InputJsonValue,
    s3Key,
    fileType,
    fileSize,
    mimeType: file.type || null,
    organizationId: params.context.organizationId || null,
    createdBy: params.context.userId,
    status: "processing",
    groups: groupIds.length > 0 ? { create: groupIds.map((groupId) => ({ groupId })) } : undefined,
  })

  const jobId = await createIngestJob({
    organizationId: params.context.organizationId,
    userId: params.context.userId,
    filename: file.name,
    fileSize,
    mimeType: file.type || null,
    s3Key,
    documentId,
    params: {
      useCombined: params.input.useCombined !== false,
      figureMode: (await import("@/lib/ingest/pipeline-policy")).parseFigureMode(
        params.input.figureMode,
        params.input.forceOCR
      ),
      documentType: params.input.documentType,
      title,
      categories: params.input.categories,
      subcategory: params.input.subcategory,
      groupIds,
    },
  })

  return {
    id: documentId,
    jobId,
    status: "processing",
    title: document.title,
    categories: document.categories,
    groups: document.groups.map((dg) => dg.group),
    fileType,
    fileSize,
    s3Key,
    fileUrl: appFileUrl(s3Key),
    enhanced: (await import("@/lib/ingest/pipeline-policy")).resolveIngestPolicy(file.name).entities,
  }
}

/**
 * Worker entry point: run the full ingest pipeline for a claimed job. Re-
 * downloads the file from S3, wraps it as a File, and drives the (shared)
 * createKnowledgeDocumentForDashboard in background mode so it updates the
 * placeholder Document and streams progress. On any hard failure the Document
 * is marked "failed" (kept for Retry); success flips it to "ready".
 */
export async function processIngestJob(
  job: {
    id: string
    organizationId: string | null
    userId: string | null
    documentId: string | null
    s3Key: string | null
    filename: string
    mimeType: string | null
    attempt: number
    params: Record<string, unknown> | null
  },
  onProgress?: (sp: import("@/lib/ingest/progress").StepProgress) => void | Promise<void>
): Promise<"ready" | "failed"> {
  const { recordIngestJobFailure } = await import("@/lib/ingest/job")

  const markFailed = async (reason: string) => {
    await recordIngestJobFailure(job.id, reason)
    if (job.documentId) {
      await prisma.document.update({ where: { id: job.documentId }, data: { status: "failed" } }).catch(() => {})
    }
  }

  if (!job.documentId || !job.s3Key) {
    await markFailed("job missing documentId or s3Key")
    return "failed"
  }

  const p = (job.params ?? {}) as {
    useEnhanced?: boolean
    useCombined?: boolean
    forceOCR?: boolean
    figureMode?: string
    documentType?: string
    title?: string
    categories?: string[]
    subcategory?: string | null
    groupIds?: string[]
  }

  let fileBuffer: Buffer
  try {
    const { downloadFile } = await import("@/lib/s3")
    fileBuffer = await downloadFile(job.s3Key)
  } catch (err) {
    await markFailed(`S3 download failed: ${(err as Error).message ?? "unknown"}`)
    return "failed"
  }

  const file = new File([new Uint8Array(fileBuffer)], job.filename, {
    type: job.mimeType || "application/octet-stream",
  })

  const result = await createKnowledgeDocumentForDashboard({
    // role null → skip the org edit-permission gate (already authorized at enqueue)
    context: { userId: job.userId ?? "", organizationId: job.organizationId, role: null },
    input: {
      kind: "file",
      file,
      title: p.title,
      categories: p.categories ?? [],
      subcategory: p.subcategory ?? undefined,
      groupIds: p.groupIds ?? [],
      useEnhanced: !!p.useEnhanced,
      useCombined: p.useCombined !== false,
      forceOCR: p.forceOCR,
      figureMode: p.figureMode,
      documentType: p.documentType,
    } as KnowledgeDocumentCreateInput,
    documentId: job.documentId,
    jobId: job.id,
    s3Key: job.s3Key,
    fileSize: undefined,
    onProgress,
  })

  // Validation-style ServiceError (rare — file already validated at enqueue).
  // Hard extraction/index failures throw and are caught by the worker.
  if (result && typeof result === "object" && "status" in result && "error" in result) {
    await markFailed(String((result as ServiceError).error))
    return "failed"
  }
  return "ready"
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
