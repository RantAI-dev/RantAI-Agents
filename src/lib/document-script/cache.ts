import "server-only"
import { createHash } from "node:crypto"
import { uploadFile, downloadFile } from "@/lib/s3"

export function computeContentHash(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex").slice(0, 16)
}

interface Manifest {
  pageCount: number
}

const KEY_PREFIX = "artifact-preview"

function manifestKey(artifactId: string, hash: string): string {
  return `${KEY_PREFIX}/${artifactId}/${hash}/manifest.json`
}
function pageKey(artifactId: string, hash: string, idx: number): string {
  return `${KEY_PREFIX}/${artifactId}/${hash}/page-${idx}.png`
}

export async function getCachedPngs(artifactId: string, hash: string): Promise<Buffer[] | null> {
  let manifest: Manifest
  try {
    const raw = await downloadFile(manifestKey(artifactId, hash))
    manifest = JSON.parse(raw.toString("utf8"))
  } catch (err) {
    const code = (err as { code?: string }).code
    if (code === "NoSuchKey" || code === "NotFound") return null
    throw err
  }
  // D-36: pages are independent S3 GETs — fan them out in parallel. A
  // 50-page document drops from 50 sequential round-trips to 1 batch
  // bounded by S3 client connection pool / network parallelism.
  const indices = Array.from({ length: manifest.pageCount }, (_, i) => i)
  return Promise.all(indices.map((i) => downloadFile(pageKey(artifactId, hash, i))))
}

export async function putCachedPngs(artifactId: string, hash: string, pages: Buffer[]): Promise<void> {
  const manifest: Manifest = { pageCount: pages.length }
  // D-36: upload manifest + all pages in parallel. Manifest is tiny so
  // there's no benefit to writing it before the pages — clients are
  // expected to fetch via /render-status (which returns pageCount from
  // the in-memory pipeline result, not from the manifest), and only hit
  // /render-pages once that succeeds, by which point all writes settled.
  await Promise.all([
    uploadFile(manifestKey(artifactId, hash), Buffer.from(JSON.stringify(manifest)), "application/json"),
    ...pages.map((page, i) => uploadFile(pageKey(artifactId, hash, i), page, "image/png")),
  ])
}
