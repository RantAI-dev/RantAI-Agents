import "server-only"
import { runScriptInSandbox } from "@/lib/document-script/sandbox-runner"
import { computeContentHash, getCachedPngs, putCachedPngs } from "@/lib/document-script/cache"
import { recordRender } from "@/lib/document-script/metrics"
import { docxToPdf } from "./docx-to-pdf"
import { pdfToPngs } from "./pdf-to-pngs"
import { withRenderSlot } from "./render-queue"

export interface PreviewResult {
  hash: string
  pages: Buffer[]
  cached: boolean
}

/**
 * D-34: per-(artifactId, hash) single-flight map. Two concurrent requests
 * for the same content share the underlying pipeline run instead of each
 * spawning their own sandbox + soffice + pdftoppm. Process-local; entries
 * delete themselves on settle so the Map can't grow without bound.
 */
const inFlight = new Map<string, Promise<PreviewResult>>()

async function runPipeline(
  artifactId: string,
  hash: string,
  script: string,
): Promise<PreviewResult> {
  return withRenderSlot(async () => {
    const startedAt = Date.now()
    try {
      const sandbox = await runScriptInSandbox(script, {})
      if (!sandbox.ok || !sandbox.buf) {
        throw new Error(`sandbox failed: ${sandbox.error ?? "unknown"}`)
      }
      const pdf = await docxToPdf(sandbox.buf)
      const pngs = await pdfToPngs(pdf)
      if (pngs.length === 0) {
        throw new Error("pipeline produced 0 pages")
      }
      // Best-effort cache; don't fail the request if S3 is down
      await putCachedPngs(artifactId, hash, pngs).catch((err) => {
        console.warn("[preview-pipeline] cache write failed:", err)
      })
      recordRender({ ok: true, durationMs: Date.now() - startedAt })
      return { hash, pages: pngs, cached: false }
    } catch (err) {
      recordRender({ ok: false, durationMs: Date.now() - startedAt })
      throw err
    }
  })
}

export async function renderArtifactPreview(artifactId: string, script: string): Promise<PreviewResult> {
  const hash = computeContentHash(script)
  const key = `${artifactId}:${hash}`

  // Single-flight: check the inFlight Map BEFORE the await on getCachedPngs.
  // If another caller is already running this same `(artifactId, hash)` (cache
  // hit + write OR pipeline run), wait for its result instead of racing on
  // the cache check ourselves. This closes the TOCTOU window where two
  // concurrent callers both miss the cache between Map.get() and Map.set().
  const existing = inFlight.get(key)
  if (existing) return existing

  const work = (async (): Promise<PreviewResult> => {
    const cached = await getCachedPngs(artifactId, hash).catch(() => null)
    if (cached && cached.length > 0) {
      return { hash, pages: cached, cached: true }
    }
    return runPipeline(artifactId, hash, script)
  })().finally(() => {
    inFlight.delete(key)
  })
  inFlight.set(key, work)
  return work
}
