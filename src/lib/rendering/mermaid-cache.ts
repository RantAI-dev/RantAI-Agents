/**
 * Server-side cache helpers for mermaid PNG renders.
 *
 * Storage backend is intentionally hidden behind the `getCachedMermaid`
 * / `putCachedMermaid` function signatures. Today entries live in a
 * Postgres `MermaidRender` row with a `Bytes` column. When/if storage
 * pressure grows, the swap to S3 is internal to this file — callers
 * don't change.
 *
 * Hash: content-addressed via `hashMermaidInput`. Scoping to an
 * organization happens at the query level (NOT in the hash) so the
 * hash stays a pure function of content. The server resolves
 * `organizationId` from the session; clients cannot spoof it.
 */

import { prisma } from "@/lib/prisma"
import { MERMAID_CACHE_MAX_BYTES } from "./mermaid-constants"

export { MERMAID_CACHE_MAX_BYTES } from "./mermaid-constants"

/**
 * Inputs that together determine a unique mermaid render. Anything that
 * affects the output bytes MUST go in here, or stale cache entries will
 * be returned after the underlying rendering changes.
 */
export interface MermaidHashInput {
  source: string
  theme: string
  width: number
  height: number
  mermaidVersion: string
}

/**
 * Deterministic sha256 hex digest of the render inputs. Runs in both
 * browser and Node (Node 20+ exposes `globalThis.crypto.subtle`).
 *
 * Fields are separated by NUL so "foo" + "bar" ≠ "fo" + "obar".
 */
export async function hashMermaidInput(
  input: MermaidHashInput,
): Promise<string> {
  const enc = new TextEncoder()
  const data = enc.encode(
    [
      input.source,
      input.theme,
      `${input.width}x${input.height}`,
      input.mermaidVersion,
    ].join("\x00"),
  )
  const buf = await globalThis.crypto.subtle.digest("SHA-256", data)
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

export interface MermaidCacheEntry {
  png: Buffer
  width: number
  height: number
}

/**
 * Look up a cached render. Returns null on miss OR on any DB error
 * (caller treats that as a cache miss, never as a fatal).
 */
export async function getCachedMermaid(params: {
  hash: string
  organizationId: string | null
}): Promise<MermaidCacheEntry | null> {
  try {
    const row = await prisma.mermaidRender.findFirst({
      where: { hash: params.hash, organizationId: params.organizationId },
      select: { id: true, png: true, width: true, height: true },
    })
    if (!row) return null

    // Update lastAccessedAt for future LRU tracking. Fire-and-forget —
    // the read must not block on this.
    prisma.mermaidRender
      .update({
        where: { id: row.id },
        data: { lastAccessedAt: new Date() },
      })
      .catch((err) => {
        console.warn("[mermaid-cache] lastAccessedAt update failed:", err)
      })

    return {
      png: Buffer.from(row.png),
      width: row.width,
      height: row.height,
    }
  } catch (err) {
    console.warn("[mermaid-cache] lookup failed:", err)
    return null
  }
}

/**
 * Store a render. Uses findFirst + conditional create (not upsert)
 * because `@@unique([hash, organizationId])` isn't viable — PostgreSQL
 * treats NULL organizationId as non-equal in unique constraints, which
 * silently permits duplicates via upsert. Rare race duplicates are
 * acceptable: identical hash means identical bytes, and a follow-up LRU
 * cleanup cron will dedupe.
 *
 * Oversized entries (> MERMAID_CACHE_MAX_BYTES) are rejected with a
 * warn — the caller already has the rendered PNG, the cache just opts
 * out for this entry.
 */
export async function putCachedMermaid(params: {
  hash: string
  organizationId: string | null
  png: Buffer
  width: number
  height: number
  mermaidVersion: string
}): Promise<void> {
  if (params.png.byteLength > MERMAID_CACHE_MAX_BYTES) {
    console.warn(
      `[mermaid-cache] skip store, size=${params.png.byteLength} bytes exceeds cap=${MERMAID_CACHE_MAX_BYTES}`,
    )
    return
  }
  try {
    const existing = await prisma.mermaidRender.findFirst({
      where: { hash: params.hash, organizationId: params.organizationId },
      select: { id: true },
    })
    if (existing) {
      // Already cached by a concurrent writer. Refresh access time and move on.
      await prisma.mermaidRender.update({
        where: { id: existing.id },
        data: { lastAccessedAt: new Date() },
      })
      return
    }
    await prisma.mermaidRender.create({
      data: {
        hash: params.hash,
        organizationId: params.organizationId,
        png: params.png,
        width: params.width,
        height: params.height,
        mermaidVersion: params.mermaidVersion,
      },
    })
  } catch (err) {
    console.warn("[mermaid-cache] store failed:", err)
  }
}
