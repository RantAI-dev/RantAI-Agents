import "server-only"
import { runScriptInSandbox } from "@/lib/document-script/sandbox-runner"
import { computeContentHash, getCachedPngs, putCachedPngs } from "@/lib/document-script/cache"
import { docxToPdf } from "./docx-to-pdf"
import { pdfToPngs } from "./pdf-to-pngs"
import { withRenderSlot } from "./render-queue"

export interface PreviewResult {
  hash: string
  pages: Buffer[]
  cached: boolean
}

export async function renderArtifactPreview(artifactId: string, script: string): Promise<PreviewResult> {
  const hash = computeContentHash(script)
  const cached = await getCachedPngs(artifactId, hash).catch(() => null)
  if (cached && cached.length > 0) {
    return { hash, pages: cached, cached: true }
  }
  // Cache miss → CPU-heavy work, gate via semaphore so we don't OOM under load
  return withRenderSlot(async () => {
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
    return { hash, pages: pngs, cached: false }
  })
}
