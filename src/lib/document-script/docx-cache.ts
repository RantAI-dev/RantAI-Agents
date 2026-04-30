import "server-only"
import { createHash } from "node:crypto"
import { runScriptInSandbox } from "./sandbox-runner"
import { withRenderSlot } from "@/lib/rendering/server/render-queue"

/**
 * Process-local cache + single-flight for the docx-js sandbox output.
 *
 * The download route serves both `?format=docx` and `?format=pdf`. Without
 * this cache, two requests for the same artifact within the cache window
 * each spawn their own sandbox child — bypassing the back-pressure that
 * `docx-preview-pipeline` provides for the preview path. This module gates
 * sandbox runs through `withRenderSlot` (the shared semaphore, default
 * capacity 3) and dedupes concurrent requests via an inFlight Map.
 *
 * Cache keys: `${artifactId}:${sha256(content)[:16]}`. Cap is small because
 * DOCX buffers can be a few hundred KB each — entries are FIFO-evicted when
 * a 16-entry window is full.
 */
const DOCX_CACHE_CAP = 16
const docxCache = new Map<string, Buffer>()
const inFlight = new Map<string, Promise<Buffer>>()

function cacheKey(artifactId: string, content: string): string {
  const h = createHash("sha256").update(content, "utf8").digest("hex").slice(0, 16)
  return `${artifactId}:${h}`
}

function setCachedDocx(key: string, buf: Buffer): void {
  if (docxCache.size >= DOCX_CACHE_CAP) {
    const oldest = docxCache.keys().next().value
    if (oldest) docxCache.delete(oldest)
  }
  docxCache.set(key, buf)
}

/**
 * Return DOCX bytes for the given artifact content, reusing a cached result
 * if available and gating fresh runs through `withRenderSlot` for back-
 * pressure. Two concurrent calls for the same `(artifactId, content)`
 * share one sandbox run.
 *
 * Throws on sandbox failure with the same error message shape as
 * `runScriptInSandbox` (caller should map to HTTP 500).
 */
export async function getOrComputeDocx(
  artifactId: string,
  content: string,
): Promise<Buffer> {
  const key = cacheKey(artifactId, content)
  const cached = docxCache.get(key)
  if (cached) return cached
  const existing = inFlight.get(key)
  if (existing) return existing
  const work = withRenderSlot(async () => {
    const r = await runScriptInSandbox(content, {})
    if (!r.ok || !r.buf) {
      throw new Error(`script failed: ${r.error ?? "unknown"}`)
    }
    setCachedDocx(key, r.buf)
    return r.buf
  }).finally(() => {
    inFlight.delete(key)
  })
  inFlight.set(key, work)
  return work
}
