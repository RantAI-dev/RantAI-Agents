/**
 * Verifiable page links for v1 chat references (UAT issue 7: "references
 * cannot be verified — ref [1] could not be checked").
 *
 * What the old engine stores, for the record (found by reading
 * src/lib/rag + the Prisma Document model): NO page images. A document's
 * ORIGINAL upload lives in S3 under `Document.s3Key`
 * (documents/{org|global}/{docId}/{filename}, with `fileType` and
 * `mimeType` on the row), and extracted FIGURE crops live under
 * documents/{org|global}/{docId}/assets/fig-p{page}-{n}.png (see
 * lib/rag/figure-assets.ts). A page of a local book can therefore only be
 * shown through its original — a PDF gets `Content-Type: application/pdf`
 * and the link carries `#page=<n>`; a single-image document is served as
 * the image; anything else (markdown/text) has no page to show, and those
 * sources get no `page_url`. rantai-kb, by contrast, stores page JPEGs
 * (`GET /v1/documents/{id}/structure` → `pages[].imageAssetKey`), so remote
 * sources link straight to the page image.
 *
 * ── Tenancy ─────────────────────────────────────────────────────────────────
 *
 * The token is the ONLY authority for what this route serves. It is minted
 * exclusively from sources an authenticated assistant retrieved for an
 * authenticated request, and it carries the document id and page inside its
 * HMAC-signed payload. This route therefore reads NOTHING from the request
 * except the token: a `documentId` (or any other parameter) in the query
 * string is never consulted — there is no way to ask for a document that
 * retrieval did not surface, in this tenant or any other. The `g` claim
 * (organisation) is carried for the audit trail and parity checks, not
 * re-verified here: whoever could mint a token already had read access to
 * the document.
 */
import { createHmac, timingSafeEqual } from "node:crypto"
import { prisma } from "@/lib/prisma"
import { downloadFile } from "@/lib/s3"
import { remoteKbConfig } from "@/lib/kb-client/routing"
import { remoteAssetDownload } from "@/lib/kb-client/remote-hybrid"
import type { ScoredSource } from "./source-selection"

/** Token payload — kept terse (single letters) because it is a URL. */
export interface PageTokenPayload {
  /** "remote" for rantai-kb sources, "local" for this app's engine. */
  o: "local" | "remote"
  /** Document id the page belongs to. */
  d: string
  /** 0-based page index, the app's numbering throughout. */
  p: number
  /** Organisation whose assistant minted the link; null for org-less. */
  g: string | null
  /** Expiry, unix seconds. */
  e: number
}

export const DEFAULT_LINK_TTL_S = 7 * 24 * 60 * 60 // 7 days

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url")
}

/**
 * HMAC-SHA256 over the payload SEGMENT — the exact characters the client
 * carries back — so verification can never drift from what was signed.
 */
function signSegment(segment: string, secret: string): string {
  return b64url(createHmac("sha256", secret).update(segment, "utf8").digest())
}

/** Mint a token. Exposed mainly so tests can forge specific (e.g. expired)
 *  payloads with a valid signature; production goes through
 *  attachPageUrls / pageUrlForSource. */
export function mintPageToken(payload: PageTokenPayload, secret: string): string {
  const segment = b64url(JSON.stringify(payload))
  return `${segment}.${signSegment(segment, secret)}`
}

/**
 * Verify a token. Null for EVERY way it can be bad — malformed, bad
 * signature, expired — so the caller answers one indistinguishable 403 and
 * a forger learns nothing about which check failed.
 *
 * The signature compare is constant-time. HMAC-SHA256 digests are a fixed
 * length, so a different-length forgery is rejected up front; comparing
 * unequal buffers would otherwise make timingSafeEqual throw.
 */
export function verifyPageToken(
  token: string,
  secret: string,
  now: number = Math.floor(Date.now() / 1000),
): PageTokenPayload | null {
  const dot = token.indexOf(".")
  if (dot <= 0 || dot === token.length - 1) return null
  const segment = token.slice(0, dot)
  const given = Buffer.from(token.slice(dot + 1))
  const expected = Buffer.from(signSegment(segment, secret))
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null

  let payload: PageTokenPayload
  try {
    payload = JSON.parse(Buffer.from(segment, "base64url").toString("utf8"))
  } catch {
    return null
  }
  if (
    (payload.o !== "local" && payload.o !== "remote") ||
    typeof payload.d !== "string" ||
    payload.d.length === 0 ||
    payload.d.length > 200 ||
    !Number.isInteger(payload.p) ||
    payload.p < 0 ||
    !Number.isInteger(payload.e) ||
    (typeof payload.g !== "string" && payload.g !== null)
  ) {
    return null
  }
  if (payload.e <= now) return null
  return payload
}

/**
 * Largest local original the page route will serve, in bytes
 * (AGENT_API_LINK_LOCAL_MAX_BYTES, default 30 MB). The route buffers the whole
 * original in the app process, and textbooks run to 168 MB on a host whose
 * memory is shared with the inference stack, so a bigger book gets no link
 * rather than a link that can pressure the box on every click. A row with no
 * recorded size is treated as too big. rantai-kb sources are unaffected: they
 * serve one page image.
 */
export const DEFAULT_LOCAL_MAX_BYTES = 30 * 1024 * 1024

export function localMaxBytes(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number(env.AGENT_API_LINK_LOCAL_MAX_BYTES)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_LOCAL_MAX_BYTES
}

/** What the page route can serve for a local Document row (see the module
 *  comment): the original is a PDF or an image under the size cap, or there
 *  is nothing to show. */
export function localOriginalKind(
  doc: {
    s3Key: string | null
    fileType: string | null
    mimeType: string | null
    fileSize?: number | null
  },
  env: NodeJS.ProcessEnv = process.env,
): "pdf" | "image" | null {
  if (!doc.s3Key) return null
  if (doc.fileSize == null || doc.fileSize > localMaxBytes(env)) return null
  if (doc.fileType === "pdf" || doc.mimeType === "application/pdf") return "pdf"
  if (doc.fileType === "image" || (doc.mimeType ?? "").startsWith("image/")) return "image"
  return null
}

/**
 * The page link for one source, or null when it must not be emitted: no
 * AGENT_API_LINK_SECRET (the feature is off), no documentId/page to point
 * at, or a LOCAL document the route could not serve (nothing stored for it
 * — see localOriginalKind — so the link would be a dead end).
 *
 * For a local PDF the link carries `#page=<n+1>`: PDF viewers open the
 * fragment 1-based while the app's `page` is 0-based (the dashboard prints
 * `page + 1` as "hal. N"), so a reader lands on the printed page the
 * excerpt came from, not the one before it.
 */
export function pageUrlForSource(
  source: { kbOrigin?: string | null; documentId?: string | null; page?: number | null },
  opts: {
    organizationId: string | null
    /** Local document ids the route can actually serve → what kind of
     *  original it stores. Null (or the id being absent) ⇒ no local link. */
    servableLocalDocs?: Map<string, "pdf" | "image">
    env?: NodeJS.ProcessEnv
    now?: number
  },
): string | null {
  const env = opts.env ?? process.env
  const secret = env.AGENT_API_LINK_SECRET
  if (!secret) return null
  const { documentId, page } = source
  if (!documentId || page == null || !Number.isInteger(page) || page < 0) return null

  const origin: "local" | "remote" = source.kbOrigin === "remote" ? "remote" : "local"
  if (origin === "local") {
    const kind = opts.servableLocalDocs?.get(documentId)
    if (!kind) return null
  }

  const now = opts.now ?? Math.floor(Date.now() / 1000)
  const ttl = linkTtlSeconds(env)
  const token = mintPageToken(
    { o: origin, d: documentId, p: page, g: opts.organizationId, e: now + ttl },
    secret,
  )
  const base = env.AGENT_API_PUBLIC_URL?.replace(/\/+$/, "")
  const path = `/api/v1/sources/page?t=${encodeURIComponent(token)}`
  // Only a local PDF needs the viewer fragment — the route serves it as a
  // whole PDF. A page image (remote) is already exactly the page.
  const fragment = origin === "local" && opts.servableLocalDocs?.get(documentId) === "pdf" ? `#page=${page + 1}` : ""
  return `${base ?? ""}${path}${fragment}`
}

function linkTtlSeconds(env: NodeJS.ProcessEnv): number {
  const n = Number(env.AGENT_API_LINK_TTL_S)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_LINK_TTL_S
}

/**
 * Mint `page_url` onto every scored source in place. Never throws: a
 * minting failure costs the client a link, not the answer. No secret ⇒ a
 * no-op (and the page route 404s), so the feature is entirely off.
 *
 * Local documents are filtered against what the route can serve — one
 * batched Document lookup for the request's local ids — so no link is
 * emitted that would open on a 404.
 */
export async function attachPageUrls(
  sources: ScoredSource[],
  opts: { organizationId: string | null; env?: NodeJS.ProcessEnv; now?: number },
): Promise<void> {
  const env = opts.env ?? process.env
  if (!env.AGENT_API_LINK_SECRET) return

  const localIds = [
    ...new Set(
      sources.filter((s) => s.kbOrigin !== "remote" && s.documentId).map((s) => s.documentId as string),
    ),
  ]
  let servable: Map<string, "pdf" | "image"> | undefined
  if (localIds.length > 0) {
    try {
      const rows = await prisma.document.findMany({
        where: { id: { in: localIds } },
        select: { id: true, s3Key: true, fileType: true, mimeType: true, fileSize: true },
      })
      servable = new Map(
        rows.flatMap((row) => {
          const kind = localOriginalKind(row, env)
          return kind ? ([[row.id, kind]] as const) : []
        }),
      )
    } catch (err) {
      console.warn(
        `[V1 API] page-link document lookup failed: ${err instanceof Error ? err.message.slice(0, 160) : err}`,
      )
    }
  }

  for (const source of sources) {
    const url = pageUrlForSource(source, { ...opts, servableLocalDocs: servable, env })
    if (url) source.page_url = url
  }
}

// ── The page route's logic (src/app/api/v1/sources/page/route.ts) ────────────

const LINK_CACHE_HEADERS = {
  // private: the URL is a signed, per-response token, so no shared proxy
  // should hold it; one hour lets a reader re-open the reference during a
  // session without another round trip.
  "Cache-Control": "private, max-age=3600",
  "Access-Control-Allow-Origin": "*",
}

function jsonError(status: number, message: string, type: string): Response {
  return new Response(JSON.stringify({ error: { message, type } }), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  })
}

/** One status for every bad token — see verifyPageToken. */
function forbidden(): Response {
  return jsonError(403, "This link is not valid or has expired", "permission_error")
}

/**
 * "image/png or whatever the bytes are": magic-byte sniffing rather than
 * trusting a stored mime, so a mislabelled asset still renders. PDF is
 * included because local originals are served from here too.
 */
export function sniffContentType(bytes: Buffer): string | null {
  if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return "image/png"
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg"
  }
  if (bytes.length >= 6 && bytes.toString("ascii", 0, 3) === "GIF") return "image/gif"
  if (
    bytes.length >= 12 &&
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp"
  }
  if (bytes.length >= 5 && bytes.toString("ascii", 0, 5) === "%PDF-") return "application/pdf"
  if (bytes.length >= 2 && bytes[0] === 0x42 && bytes[1] === 0x4d) return "image/bmp"
  if (
    bytes.length >= 4 &&
    (bytes.toString("hex", 0, 4) === "49492a00" || bytes.toString("hex", 0, 4) === "4d4d002a")
  ) {
    return "image/tiff"
  }
  return null
}

/** rantai-kb structure: only the fields the page lookup reads. rantai-kb
 *  pages[].number is 0-based, like every `page` in this app (see
 *  remote-hybrid.ts), so it is compared to the token's p directly. */
interface KbStructureDto {
  pages?: Array<{ number?: number | null; imageAssetKey?: string | null } | null> | null
}

/** In-memory structure cache, per document, ~10 minutes. A page link is
 *  click-verified at most a few times and the structure call is a whole
 *  round trip the bytes do not need; entries are few (only documents a chat
 *  actually cited), so plain TTL expiry is enough — no eviction queue. */
const STRUCTURE_TTL_MS = 10 * 60 * 1000
const structureCache = new Map<
  string,
  { expiresAt: number; pages: Array<{ number: number; imageAssetKey: string | null }> }
>()

/** Tests reset this between cases so a cached structure cannot leak across
 *  an env/fetch change. */
export function __resetSourcePageCachesForTests(): void {
  structureCache.clear()
}

async function remoteStructure(documentId: string, env: NodeJS.ProcessEnv): Promise<
  Array<{ number: number; imageAssetKey: string | null }>
> {
  const cached = structureCache.get(documentId)
  if (cached && cached.expiresAt > Date.now()) return cached.pages

  const cfg = remoteKbConfig(env)
  if (!cfg) throw new Error("KB remote routing is not configured (KB_REMOTE_URL / KB_REMOTE_API_KEY)")

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs)
  try {
    const headers = new Headers()
    headers.set("authorization", `Bearer ${cfg.apiKey}`)
    const res = await fetch(
      `${cfg.baseUrl}/v1/documents/${encodeURIComponent(documentId)}/structure`,
      { headers, signal: controller.signal },
    )
    if (!res.ok) {
      const text = await res.text().catch(() => "")
      throw new Error(`KB remote ${res.status} on structure: ${text.slice(0, 200)}`)
    }
    const dto = (await res.json()) as KbStructureDto
    const pages = (dto.pages ?? []).map((p) => ({
      number: typeof p?.number === "number" ? p.number : -1,
      imageAssetKey: p?.imageAssetKey ?? null,
    }))
    structureCache.set(documentId, { expiresAt: Date.now() + STRUCTURE_TTL_MS, pages })
    return pages
  } finally {
    clearTimeout(timer)
  }
}

/**
 * GET /api/v1/sources/page?t=<token> — thin route, all logic here.
 *
 * No secret configured ⇒ 404: no token can exist, and the route must not
 * hint at what a valid one would look like. Bad token (malformed, tampered,
 * expired) ⇒ 403 with no detail. Valid token ⇒ the page itself:
 *
 *  - remote: rantai-kb structure (cached) → that page's imageAssetKey →
 *    the assets route, served with the sniffed content type.
 *  - local: the Document's stored ORIGINAL (there are no page images —
 *    module comment): a PDF is served as application/pdf (the link's
 *    #page= fragment lands the reader on the right page), an image
 *    document as the sniffed image. Nothing servable stored ⇒ 404 — such
 *    sources never got a page_url in the first place.
 *
 * `deps.downloadFile` exists so tests can stub the S3 read without mocking
 * the module graph; production leaves it unset.
 */
export async function resolveSourcePage(
  token: string | null,
  env: NodeJS.ProcessEnv = process.env,
  deps: { downloadFile?: (key: string) => Promise<Buffer> } = {},
): Promise<Response> {
  const secret = env.AGENT_API_LINK_SECRET
  if (!secret) return jsonError(404, "Not found", "not_found_error")
  // The token — and nothing else in the URL — decides what is served. See
  // the tenancy note at the top of this module.
  if (!token) return forbidden()
  const payload = verifyPageToken(token, secret)
  if (!payload) return forbidden()

  try {
    if (payload.o === "remote") {
      const pages = await remoteStructure(payload.d, env)
      const assetKey = pages.find((p) => p.number === payload.p)?.imageAssetKey
      // Ingest before page images were recorded answers null for
      // imageAssetKey — "never a guess", per the rantai-kb spec.
      if (!assetKey) return jsonError(404, "Page image not available", "not_found_error")
      const bytes = await remoteAssetDownload(payload.d, assetKey)
      return new Response(new Uint8Array(bytes), {
        headers: { ...LINK_CACHE_HEADERS, "Content-Type": sniffContentType(bytes) ?? "application/octet-stream" },
      })
    }

    const doc = await prisma.document.findUnique({
      where: { id: payload.d },
      select: { s3Key: true, fileType: true, mimeType: true, fileSize: true },
    })
    if (!doc?.s3Key) return jsonError(404, "Not found", "not_found_error")
    const kind = localOriginalKind(doc, env)
    if (!kind) return jsonError(404, "Not found", "not_found_error")
    const bytes = await (deps.downloadFile ?? downloadFile)(doc.s3Key)
    const mime =
      sniffContentType(bytes) ??
      (kind === "pdf" ? "application/pdf" : doc.mimeType ?? "application/octet-stream")
    return new Response(new Uint8Array(bytes), {
      headers: { ...LINK_CACHE_HEADERS, "Content-Type": mime },
    })
  } catch (err) {
    // Document ids are not logged — they are tenant data.
    console.warn(
      `[V1 sources/page] could not load the page: ${err instanceof Error ? err.message.slice(0, 160) : err}`,
    )
    return jsonError(502, "The page could not be loaded", "server_error")
  }
}
