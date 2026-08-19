import { prisma } from "@/lib/prisma"
import { computeOverallProgress, computeEtaSeconds, type IngestStep, type StepProgress, type ProgressFlags } from "./progress"

/**
 * IngestJob helpers — the durable record + progress state behind background
 * document ingest.
 *
 * Lifecycle:
 *   createIngestJob()            → status "pending" (worker will claim it)
 *   claimNextPendingJob()        → atomically flips one "pending" → "processing"
 *   updateIngestJobProgress()    → persists step/progress/eta + emits socket
 *   recordIngestJobSuccess()     → status "success", documentId linked, 100%
 *   recordIngestJobFailure()     → status "failed", S3 key preserved for retry
 *   reclaimStaleJobs()           → crash recovery: stuck "processing" → "pending"
 */

export interface ClaimedIngestJob {
  id: string
  organizationId: string | null
  userId: string | null
  documentId: string | null
  s3Key: string | null
  filename: string
  mimeType: string | null
  attempt: number
  params: Record<string, unknown> | null
}

/** Create the durable job row at enqueue time (worker picks it up). */
export async function createIngestJob(params: {
  organizationId: string | null
  userId: string | null
  filename: string
  fileSize: number | null
  mimeType: string | null
  s3Key: string | null
  documentId: string | null
  params: Record<string, unknown>
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
        documentId: params.documentId,
        status: "pending",
        step: "queued",
        params: params.params as object,
      },
      select: { id: true },
    })
    return job.id
  } catch (err) {
    console.warn("[ingest-job] create failed:", err)
    return null
  }
}

/**
 * Atomically claim the oldest pending job. `FOR UPDATE SKIP LOCKED` makes this
 * safe when multiple app instances poll the same table — each grabs a distinct
 * row and never blocks on the other.
 */
export async function claimNextPendingJob(): Promise<ClaimedIngestJob | null> {
  const rows = await prisma.$queryRaw<
    Array<{
      id: string
      organizationId: string | null
      userId: string | null
      documentId: string | null
      s3Key: string | null
      filename: string
      mimeType: string | null
      attempt: number
      params: Record<string, unknown> | null
    }>
  >`
    UPDATE "IngestJob"
       SET status = 'processing', "startedAt" = now(), "updatedAt" = now(), step = 'queued', progress = 0
     WHERE id = (
       SELECT id FROM "IngestJob"
        WHERE status = 'pending'
        ORDER BY "createdAt" ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
     )
    RETURNING id, "organizationId", "userId", "documentId", "s3Key", filename, "mimeType", attempt, params
  `
  return rows[0] ?? null
}

// Throttle DB writes + socket emits per job: always emit on step change,
// otherwise at most ~1/sec. Keeps a 27 MB book's ~400 storing ticks from
// hammering Postgres and the socket.
const lastEmit = new Map<string, { ts: number; step: string }>()

/** Persist current progress + emit `ingest:job:update`. Fire-and-forget. */
export async function updateIngestJobProgress(args: {
  jobId: string
  organizationId: string | null
  documentId: string | null
  flags: ProgressFlags
  startedAt: Date | null
  progress: StepProgress
}): Promise<void> {
  const overall = computeOverallProgress(args.progress, args.flags)
  const etaSeconds = computeEtaSeconds(overall, args.startedAt, Date.now())

  const prev = lastEmit.get(args.jobId)
  const now = Date.now()
  const stepChanged = !prev || prev.step !== args.progress.step
  if (!stepChanged && prev && now - prev.ts < 900) return
  lastEmit.set(args.jobId, { ts: now, step: args.progress.step })

  void prisma.ingestJob
    .update({
      where: { id: args.jobId },
      data: {
        step: args.progress.step,
        progress: overall,
        stepCurrent: args.progress.current ?? null,
        stepTotal: args.progress.total ?? null,
        etaSeconds,
      },
    })
    .catch((err) => console.warn("[ingest-job] progress update failed:", err))

  if (args.organizationId) {
    const { emitToOrgRoom } = await import("@/lib/socket")
    emitToOrgRoom(args.organizationId, "ingest:job:update", {
      jobId: args.jobId,
      documentId: args.documentId,
      status: "processing",
      step: args.progress.step,
      progress: overall,
      stepCurrent: args.progress.current ?? null,
      stepTotal: args.progress.total ?? null,
      etaSeconds,
    })
  }
}

// Terminal-state writes must land: if they are lost to a DB blip the job stays
// "processing" and the stale-reclaim later re-runs a document that already
// finished (or double-reports a failure). One retry after a short delay.
async function updateJobDurably(jobId: string, data: Record<string, unknown>, label: string): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await prisma.ingestJob.update({ where: { id: jobId }, data })
      return
    } catch (err) {
      if (attempt === 0) {
        await new Promise((r) => setTimeout(r, 500))
        continue
      }
      console.warn(`[ingest-job] ${label} update failed:`, err)
    }
  }
}

export async function recordIngestJobSuccess(jobId: string | null, documentId: string): Promise<void> {
  if (!jobId) return
  lastEmit.delete(jobId)
  await updateJobDurably(
    jobId,
    { status: "success", documentId, error: null, step: "done", progress: 100, etaSeconds: 0 },
    "success"
  )
}

export async function recordIngestJobFailure(jobId: string | null, error: string): Promise<void> {
  if (!jobId) return
  lastEmit.delete(jobId)
  await updateJobDurably(jobId, { status: "failed", error: error.slice(0, 1000) }, "failure")
}

/** Touch updatedAt so reclaimStaleJobs never eats a live job during a long,
 *  emit-less step (MinerU can block 20 min inside one extractor call). */
export async function touchIngestJob(jobId: string): Promise<void> {
  await prisma.ingestJob
    .update({ where: { id: jobId }, data: { updatedAt: new Date() } })
    .catch(() => {})
}

/**
 * Emit the terminal `ingest:job:update` (status "ready" | "failed") so the
 * card flips out of its processing state. The per-step progress emits always
 * carry status "processing"; this is the one that ends the stream.
 */
export async function emitIngestTerminal(args: {
  jobId: string
  organizationId: string | null
  documentId: string | null
  status: "ready" | "failed"
  error?: string | null
}): Promise<void> {
  lastEmit.delete(args.jobId)
  if (!args.organizationId) return
  const { emitToOrgRoom } = await import("@/lib/socket")
  emitToOrgRoom(args.organizationId, "ingest:job:update", {
    jobId: args.jobId,
    documentId: args.documentId,
    status: args.status,
    step: args.status === "ready" ? "done" : null,
    progress: args.status === "ready" ? 100 : 0,
    stepCurrent: null,
    stepTotal: null,
    etaSeconds: 0,
    error: args.error ?? null,
  })
}

/**
 * Crash recovery. Jobs left "processing" with no update for `staleMs` (worker
 * died / server restarted mid-run) go back to "pending" for another attempt,
 * or to "failed" once attempts are exhausted. Returns how many were reclaimed.
 */
export async function reclaimStaleJobs(staleMs: number, maxAttempts: number): Promise<number> {
  const cutoff = new Date(Date.now() - staleMs)
  const stale = await prisma.ingestJob.findMany({
    where: { status: "processing", updatedAt: { lt: cutoff } },
    select: { id: true, attempt: true, documentId: true },
  })
  for (const job of stale) {
    if (job.attempt >= maxAttempts) {
      await prisma.ingestJob
        .update({ where: { id: job.id }, data: { status: "failed", error: "ingest stalled (max attempts reached)" } })
        .catch(() => {})
      if (job.documentId) {
        await prisma.document.update({ where: { id: job.documentId }, data: { status: "failed" } }).catch(() => {})
      }
    } else {
      await prisma.ingestJob
        .update({
          where: { id: job.id },
          data: { status: "pending", attempt: { increment: 1 }, startedAt: null, step: "queued", progress: 0 },
        })
        .catch(() => {})
    }
  }
  return stale.length
}

// Re-export for callers that build a StepProgress inline.
export type { IngestStep, StepProgress }
