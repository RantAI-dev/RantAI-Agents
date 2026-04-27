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
  const pages: Buffer[] = []
  for (let i = 0; i < manifest.pageCount; i++) {
    pages.push(await downloadFile(pageKey(artifactId, hash, i)))
  }
  return pages
}

export async function putCachedPngs(artifactId: string, hash: string, pages: Buffer[]): Promise<void> {
  const manifest: Manifest = { pageCount: pages.length }
  await uploadFile(manifestKey(artifactId, hash), Buffer.from(JSON.stringify(manifest)), "application/json")
  for (let i = 0; i < pages.length; i++) {
    await uploadFile(pageKey(artifactId, hash, i), pages[i], "image/png")
  }
}
