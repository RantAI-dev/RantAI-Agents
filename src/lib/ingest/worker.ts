import {
  claimNextPendingJob,
  reclaimStaleJobs,
  updateIngestJobProgress,
  emitIngestTerminal,
  type ClaimedIngestJob,
} from "./job"

/**
 * In-process ingest worker. Polls the IngestJob table, atomically claims
 * pending jobs, and runs the heavy pipeline (extract → chunk → entities →
 * figures → embed → store) off the request path, streaming progress via
 * updateIngestJobProgress (persist + socket).
 *
 * State lives entirely in Postgres, so the worker is crash-safe: a job left
 * "processing" by a killed/restarted process is reclaimed to "pending" by
 * reclaimStaleJobs and retried (up to KB_INGEST_MAX_ATTEMPTS).
 *
 * Tunables (all env, sensible defaults):
 *   KB_INGEST_CONCURRENCY  jobs in flight at once      (1)
 *   KB_INGEST_POLL_MS      claim poll interval          (3000)
 *   KB_INGEST_STALE_MS     "processing" staleness cutoff (300000 = 5 min)
 *   KB_INGEST_MAX_ATTEMPTS attempts before terminal fail (3)
 *   KB_INGEST_RECLAIM_MS   stale-reclaim sweep interval  (60000)
 */

const CONCURRENCY = Math.max(1, parseInt(process.env.KB_INGEST_CONCURRENCY || "1", 10))
const POLL_MS = Math.max(500, parseInt(process.env.KB_INGEST_POLL_MS || "3000", 10))
const STALE_MS = Math.max(60000, parseInt(process.env.KB_INGEST_STALE_MS || "300000", 10))
const MAX_ATTEMPTS = Math.max(1, parseInt(process.env.KB_INGEST_MAX_ATTEMPTS || "3", 10))
const RECLAIM_MS = Math.max(15000, parseInt(process.env.KB_INGEST_RECLAIM_MS || "60000", 10))

let active = 0
let started = false

async function runOne(job: ClaimedIngestJob): Promise<void> {
  const startedAt = new Date()
  const enhanced = !!(job.params as { useEnhanced?: boolean } | null)?.useEnhanced
  let outcome: "ready" | "failed" = "failed"
  let error: string | null = null
  try {
    // Imported lazily to keep the worker module free of the heavy service graph
    // until a job actually runs.
    const { processIngestJob } = await import("@/features/knowledge/documents/service")
    outcome = await processIngestJob(job, (sp) =>
      updateIngestJobProgress({
        jobId: job.id,
        organizationId: job.organizationId,
        documentId: job.documentId,
        enhanced,
        startedAt,
        progress: sp,
      })
    )
  } catch (err) {
    // processIngestJob marks most failures itself; this is the backstop for a
    // hard throw out of the pipeline (e.g. extraction 422).
    console.error(`[ingest-worker] job ${job.id} threw:`, err)
    outcome = "failed"
    error = (err as Error)?.message ?? "ingest crashed"
    try {
      const { recordIngestJobFailure } = await import("./job")
      recordIngestJobFailure(job.id, error)
      if (job.documentId) {
        const { prisma } = await import("@/lib/prisma")
        await prisma.document.update({ where: { id: job.documentId }, data: { status: "failed" } }).catch(() => {})
      }
    } catch {
      /* best effort */
    }
  } finally {
    active--
    // Tell the client the stream ended (progress emits only carry "processing").
    void emitIngestTerminal({
      jobId: job.id,
      organizationId: job.organizationId,
      documentId: job.documentId,
      status: outcome,
      error,
    })
  }
}

async function tick(): Promise<void> {
  while (active < CONCURRENCY) {
    // Reserve the slot BEFORE the await so overlapping ticks can't both claim
    // past CONCURRENCY.
    active++
    let job: ClaimedIngestJob | null = null
    try {
      job = await claimNextPendingJob()
    } catch (err) {
      active--
      console.warn("[ingest-worker] claim failed:", err)
      break
    }
    if (!job) {
      active--
      break
    }
    void runOne(job)
  }
}

export function startIngestWorker(): void {
  if (started) return
  started = true
  console.log(`[ingest-worker] started (concurrency=${CONCURRENCY}, poll=${POLL_MS}ms)`)

  const reclaim = () =>
    void reclaimStaleJobs(STALE_MS, MAX_ATTEMPTS)
      .then((n) => {
        if (n > 0) console.log(`[ingest-worker] reclaimed ${n} stale job(s)`)
      })
      .catch((err) => console.warn("[ingest-worker] reclaim failed:", err))

  reclaim() // sweep on boot (recovers jobs stranded by the last restart)
  setInterval(reclaim, RECLAIM_MS)
  setInterval(() => void tick().catch((err) => console.warn("[ingest-worker] tick error:", err)), POLL_MS)
}
