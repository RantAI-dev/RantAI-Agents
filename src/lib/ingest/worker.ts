import { kb } from "@/lib/kb-runtime/runtime"
import {
  claimNextPendingJob,
  reclaimStaleJobs,
  updateIngestJobProgress,
  emitIngestTerminal,
  touchIngestJob,
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
  const { resolveIngestPolicy, parseFigureMode } = await import("./pipeline-policy")
  const jp = (job.params ?? {}) as { figureMode?: string; forceOCR?: boolean }
  const policy = resolveIngestPolicy(job.filename, parseFigureMode(jp.figureMode, jp.forceOCR))
  const flags = { entities: policy.entities, figures: policy.figures }
  let outcome: "ready" | "failed" = "failed"
  let error: string | null = null
  // Heartbeat: long emit-less steps (a 20-min MinerU extraction, a large
  // embedding batch) would otherwise trip the 5-min stale-reclaim and get the
  // same document re-claimed while still running here.
  const heartbeat = setInterval(() => void touchIngestJob(job.id), 60_000)
  try {
    // The processor is a port: the app binds it to the knowledge service, and
    // a standalone KB service would bind its own pipeline.
    outcome = await kb("processor").process(job, (sp) =>
      updateIngestJobProgress({
        jobId: job.id,
        organizationId: job.organizationId,
        documentId: job.documentId,
        flags,
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
      await recordIngestJobFailure(job.id, error)
      if (job.documentId) {
        await kb("documents").setStatus(job.documentId, "failed")
      }
    } catch {
      /* best effort */
    }
  } finally {
    clearInterval(heartbeat)
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

  // Orphan reaper: failed jobs keep their S3 upload for retry; after the
  // replay window nobody used, delete the object so storage doesn't leak.
  const reap = () =>
    void import("./job")
      .then(({ reapFailedJobUploads }) => reapFailedJobUploads())
      .then((n) => {
        if (n > 0) console.log(`[ingest-worker] reaped ${n} orphaned upload(s)`)
      })
      .catch((err) => console.warn("[ingest-worker] reap failed:", err))
  reap()
  setInterval(reap, 3_600_000)
}
