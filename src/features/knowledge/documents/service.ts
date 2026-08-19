import path from "path"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import {
  detectFileType,
  getDocumentChunkCount,
  getDocumentChunkCounts,
  type Chunk,
} from "@/lib/rag"
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


import {
  appFileUrl,
  hasDocumentAccess,
  toCategoryList,
  toStringList,
  type KnowledgeDocumentContext,
  type ServiceError,
} from "./service-shared"

// Read and write paths live in sibling modules; re-exported here so every
// existing consumer keeps importing "./service".
export * from "./service-shared"
export * from "./service-read"
export * from "./service-write"

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
    fileBuffer = Buffer.from(await file.arrayBuffer())
    await emit?.("extracting")

    const { extractDocumentText } = await import("@/lib/ingest/extract")
    const extraction = await extractDocumentText(file, fileBuffer, policy, {
      documentType: params.input.documentType,
    })
    if (extraction.error) {
      return { status: 422, error: extraction.error }
    }
    content = extraction.content
    fileType = extraction.fileType
    usedOCR = extraction.usedOCR
    extractedFigures = extraction.figures
    extractedPagesBlocks = extraction.pagesBlocks
    extractionPageMap = extraction.pageMap

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

  // Indexing (chunk → entities → figures → embed → store) lives in the engine.
  // Embed/store failures throw; the catch below owns the app-side recovery
  // (mark failed for retry, or roll the synchronous path back).
  let chunks: Chunk[] = []
  let entityCount = 0
  try {
    const { indexDocumentContent } = await import("@/lib/ingest/index-document")
    const indexed = await indexDocumentContent(
      {
        documentId: document.id,
        title,
        content,
        categories,
        subcategory: params.input.subcategory,
        organizationId: params.context.organizationId,
        userId: params.context.userId,
        policy,
        useCombined,
        figures: extractedFigures,
        pagesBlocks: extractedPagesBlocks,
        pageMap: extractionPageMap,
      },
      emit
    )
    chunks = indexed.chunks
    entityCount = indexed.entityCount
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
