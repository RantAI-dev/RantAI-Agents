import { prisma } from "@/lib/prisma"

/**
 * IngestJob helpers — record every upload attempt for observability + DLQ.
 *
 * Lifecycle:
 *   recordIngestJobStart() at the top of createKnowledgeDocumentForDashboard
 *     → status "pending", attempt=1
 *   recordIngestJobSuccess(jobId, documentId) on success
 *     → status "success", documentId linked
 *   recordIngestJobFailure(jobId, error) on rollback path
 *     → status "failed", S3 key preserved for retry
 *
 * All write helpers are fire-and-forget (errors logged not thrown) — the
 * ingest path must not break on a side-channel write failure.
 */
export async function recordIngestJobStart(params: {
  organizationId: string | null
  userId: string | null
  filename: string
  fileSize: number | null
  mimeType: string | null
  s3Key: string | null
}): Promise<string | null> {
  try {
    const job = await prisma.ingestJob.create({
      data: {
        organizationId: params.organizationId,
        userId: params.userId,
        filename: params.filename,
        fileSize: params.fileSize,
        mimeType: params.mimeType,
        s3Key: params.s3Key,
        status: "pending",
      },
      select: { id: true },
    })
    return job.id
  } catch (err) {
    console.warn("[ingest-job] start failed:", err)
    return null
  }
}

export function recordIngestJobSuccess(jobId: string | null, documentId: string): void {
  if (!jobId) return
  void prisma.ingestJob
    .update({
      where: { id: jobId },
      data: { status: "success", documentId, error: null },
    })
    .catch((err) => console.warn("[ingest-job] success update failed:", err))
}

export function recordIngestJobFailure(jobId: string | null, error: string): void {
  if (!jobId) return
  void prisma.ingestJob
    .update({
      where: { id: jobId },
      data: { status: "failed", error: error.slice(0, 1000) },
    })
    .catch((err) => console.warn("[ingest-job] failure update failed:", err))
}
