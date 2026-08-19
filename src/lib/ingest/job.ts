import { kb } from "@/lib/kb-runtime/runtime"
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
  return kb("jobs").create(params)
}

/**
 * Atomically claim the oldest pending job. The store's implementation must be
 * safe when multiple app instances poll concurrently — each grabs a distinct
 * row and never blocks on the other.
 */
export async function claimNextPendingJob(): Promise<ClaimedIngestJob | null> {
  return kb("jobs").claimNextPending()
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

  void kb("jobs").updateProgress(args.jobId, {
    step: args.progress.step,
    progress: overall,
    stepCurrent: args.progress.current ?? null,
    stepTotal: args.progress.total ?? null,
    etaSeconds,
  })

  if (args.organizationId) {
    await kb("progress").emit(args.organizationId, "ingest:job:update", {
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
// finished (or double-reports a failure). The store's `finish` retries once.
export async function recordIngestJobSuccess(jobId: string | null, documentId: string): Promise<void> {
  if (!jobId) return
  lastEmit.delete(jobId)
  await kb("jobs").finish(jobId, {
    status: "success",
    documentId,
    error: null,
    step: "done",
    progress: 100,
    etaSeconds: 0,
  })
}

export async function recordIngestJobFailure(jobId: string | null, error: string): Promise<void> {
  if (!jobId) return
  lastEmit.delete(jobId)
  await kb("jobs").finish(jobId, { status: "failed", error: error.slice(0, 1000) })
}

/** Touch updatedAt so reclaimStaleJobs never eats a live job during a long,
 *  emit-less step (MinerU can block 20 min inside one extractor call). */
export async function touchIngestJob(jobId: string): Promise<void> {
  await kb("jobs").touch(jobId)
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
  await kb("progress").emit(args.organizationId, "ingest:job:update", {
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
  return kb("jobs").reclaimStale(staleMs, maxAttempts)
}

/**
 * Reap stored files of failed jobs nobody retried. After `maxAgeDays` the
 * replay window closes: delete the S3 object and null the key — the retry
 * route then answers "re-upload" instead of replaying a vanished object.
 * (Referenced by the DLQ design comments in documents/service.ts; this is
 * the sweep that used to not exist.)
 */
export async function reapFailedJobUploads(maxAgeDays = 7): Promise<number> {
  const jobs = await kb("jobs").listReapable(maxAgeDays, 100)
  let reaped = 0
  for (const job of jobs) {
    try {
      await kb("blob").delete(job.s3Key!)
      await kb("jobs").clearS3Key(job.id)
      reaped++
    } catch (err) {
      console.warn(`[ingest-job] reap failed for ${job.id}:`, err)
    }
  }
  return reaped
}

// Re-export for callers that build a StepProgress inline.
export type { IngestStep, StepProgress }
