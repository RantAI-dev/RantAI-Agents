/**
 * Chapter list per subject for the v1 API (UAT issue 9) — the data behind
 * `GET /api/v1/mapel/chapters?mapel=<name>`, which fills a client's
 * "Bab / Topik" picker.
 *
 * The subject resolves exactly the way a chat or practice request's `mapel`
 * does (`listMapelForAssistant` + `resolveMapel`), and the chapter titles
 * come from three per-document sources, in order of preference:
 *
 *   1. the PDF outline (bookmarks) of the stored original (`Document.s3Key`,
 *      read with the unpdf already in the ingest graph — pdf-outline.ts);
 *   2. for a group the route table switched to rantai-kb, whatever the KB
 *      exposes for the migrated copy — 0.6.0 that is the page text of
 *      OCR'd pages (`/v1/documents/{id}/structure`, see
 *      kb-client/remote-structure.ts for what that is worth today);
 *   3. chapter headings (`^BAB? … / ^Chapter N …`) in the document's own
 *      chunks, read in document order.
 *
 * A book none of the sources can title contributes nothing — titles are
 * never invented. What actually exists in the UGM corpus (verified
 * 2026-11-19): no book has a real PDF outline (only 2-entry
 * splitter-artifact bookmarks, which the degenerate-outline guard below
 * rejects), the routed books' KB pages carry no `ocrText` and their search
 * chunks no `section`, so the chunk headings are what fills the picker in
 * practice.
 *
 * Results are cached per document: an in-process LRU keyed by
 * `<docId>:<updatedAt>` (a re-ingest changes `updatedAt` and rebuilds) and
 * an S3 sidecar `…/<docId>/assets/chapters.json` beside the original, so
 * after the first call the route is a map lookup or one S3 GET — well under
 * a second. No new database table.
 */
import { prisma } from "@/lib/prisma"
import { aliveDocumentWhere } from "@/features/knowledge/documents/where-alive"
import { expandGroupIds } from "@/features/knowledge/groups/tree"
import { listMapelForAssistant, resolveMapel, type AvailableMapel } from "./mapel"
import { resolveRemoteRoute, type RemoteRoute } from "@/lib/kb-client/routing"
import { readPdfOutline } from "./pdf-outline"
import { listDocumentChunkTexts } from "./chunk-texts"
import { remoteDocumentTexts } from "@/lib/kb-client/remote-structure"
import { downloadFile, uploadFile } from "@/lib/s3"
import { LruCache } from "@/lib/rag/lru-cache"

/** One chapter in the wire shape of /api/v1/mapel/chapters. */
export interface Chapter {
  title: string
  /** Chapter number parsed from the heading/outline title, null when the
   *  source names no number (roman numerals are converted). */
  number: number | null
  documentId: string
  documentTitle: string
  /** 0-based page of the stored original, the same base as every other
   *  `page` in this API. Null when the source could not place it. */
  page: number | null
}

export interface ChaptersBody {
  object: "list"
  mapel: string
  data: Chapter[]
}

/** Success payload, or the error the route should answer with. */
export type ChaptersResult =
  | { ok: true; body: ChaptersBody }
  | { ok: false; status: number; message: string; type: string }

/** The document fields the chapter sources read. */
interface DocumentRow {
  id: string
  title: string
  s3Key: string | null
  fileType: string | null
  updatedAt: Date | string | number
}

// ── chapter numbers ─────────────────────────────────────────────────────────

const ROMAN_VALUES: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 }

/** Standard subtractive reading of a roman numeral, null when malformed. */
function parseRoman(s: string): number | null {
  let total = 0
  for (let i = 0; i < s.length; i++) {
    const v = ROMAN_VALUES[s[i]]
    if (!v) return null
    const next = i + 1 < s.length ? ROMAN_VALUES[s[i + 1]] : 0
    total += next > v ? -v : v
  }
  return total > 0 ? total : null
}

/** "3" → 3, "III" → 3, "abc" → null. */
export function parseChapterNumber(raw: string): number | null {
  const s = raw.trim().toUpperCase()
  if (/^\d+$/.test(s)) {
    const n = Number(s)
    return n > 0 && n <= 30 ? n : null
  }
  if (/^[IVXLCDM]+$/.test(s)) {
    const n = parseRoman(s)
    return n !== null && n <= 30 ? n : null
  }
  return null
}

/** The `Bab N` / `Chapter N` prefix a heading or outline title may carry. */
const NUMBERED_TITLE = /^(?:bab|chapter)\s+([0-9]+|[ivxlcdm]+)\b[ \t]*(.*)$/i

/** Number + bare title of a heading-style entry, or nulls when untitled. */
function splitNumberedTitle(title: string): { number: number | null; title: string } {
  const m = NUMBERED_TITLE.exec(title.trim())
  if (!m) return { number: null, title: title.replace(/\s+/g, " ").trim() }
  return { number: parseChapterNumber(m[1]), title: m[2].replace(/\s+/g, " ").trim() || title.trim() }
}

// ── source 3a: headings in text units ───────────────────────────────────────

/** What a heading scan reads: one chunk's (or page's) text and its page. */
export interface TextUnit {
  text: string
  page: number | null
}

/** Number + title + page of one heading candidate. */
interface HeadingCandidate {
  number: number
  title: string
  page: number | null
}

/**
 * Clean the part after `Bab N` into a chapter title, or null when the line
 * is not a title: TOC entries keep dot leaders (with or without the printed
 * page number after them — "Pemuaian .205" is a leader's last remnant, also
 * stripped); body sentences that merely start with the words ("Bab 3 ini,
 * kamu …") start lowercase and fail the capital check; running headers keep
 * the printed page number, which is stripped because the response reports
 * the 0-based PDF page instead.
 */
function headingTitlePart(raw: string): string | null {
  if (/\.{3,}/.test(raw)) return null
  let t = raw
    .replace(/[.\s]+\d{1,4}\s*$/, "")
    .replace(/^[\s|·—–:\-.]+/, "")
    .replace(/\s+/g, " ")
    .trim()
  if (t.length < 3 || t.length > 100) return null
  if (!/^[A-Z]/.test(t)) return null
  return t
}

/** One line stripped of the markdown furniture the extractors add. */
function bareLine(line: string): string {
  return line
    .replace(/^[#>]+\s*/, "")
    .replace(/\*\*/g, "")
    .trim()
}

/**
 * Chapter headings found in a document's text units (chunks in document
 * order, or a remote document's page texts), first occurrence per chapter
 * number. Entries whose number does not parse are skipped — a number is the
 * one thing this source relies on to dedupe repeated running headers.
 */
export function chaptersFromTextUnits(units: TextUnit[]): Array<Pick<Chapter, "title" | "number" | "page">> {
  const stream: HeadingCandidate[] = []

  for (const unit of units) {
    const cands: HeadingCandidate[] = []
    for (const line of unit.text.split(/\r?\n/)) {
      const bare = bareLine(line)
      // A line holding TWO heading patterns is several contents entries run
      // together, not one heading (real corpus: "Bab 4 Kesetaraan …; Bab V
      // Kesehatan"). Counted on the whole line — the title part alone no
      // longer carries the first "Bab N".
      if (((bare.match(/(?:bab|chapter)\s+(?:[0-9]+|[ivxlcdm]+)\b/gi)) ?? []).length >= 2) continue
      const m = NUMBERED_TITLE.exec(bare)
      if (!m) continue
      const number = parseChapterNumber(m[1])
      if (number === null) continue
      const title = headingTitlePart(m[2])
      if (!title) continue
      cands.push({ number, title, page: unit.page })
    }
    // A unit holding several distinct chapters is a contents/index page,
    // not chapter openings — drop every heading it contains. Real chapter
    // pages hold at most the opening heading plus the previous chapter's
    // running header.
    if (cands.length >= 3) continue
    stream.push(...cands)
  }

  const byNumber = new Map<number, HeadingCandidate>()
  for (const cand of stream) {
    if (!byNumber.has(cand.number)) byNumber.set(cand.number, cand)
  }
  return [...byNumber.values()].map((c) => ({ title: c.title, number: c.number, page: c.page }))
}

// ── source 1: the PDF outline ────────────────────────────────────────────────

/**
 * Chapters from the stored original's bookmarks, or null when the outline
 * is unusable. An outline is only usable when at least two entries resolve
 * to at least two DISTINCT pages: the only outlines this corpus's books
 * actually carry are 2-entry splitter artifacts (filename titles, every
 * destination page 0) — an outline that cannot move a reader between pages
 * cannot fill a chapter picker, so it is treated as absent and the next
 * source is tried.
 */
async function outlineChapters(doc: DocumentRow): Promise<Chapter[] | null> {
  if (!doc.s3Key || (doc.fileType && doc.fileType.toLowerCase() !== "pdf")) return null
  const buffer = await downloadFile(doc.s3Key)
  const entries = await readPdfOutline(buffer)
  const usable = entries.filter((e) => e.title.length > 0 && e.page !== null)
  if (usable.length < 2) return null
  const distinctPages = new Set(usable.map((e) => e.page))
  if (distinctPages.size < 2) return null

  const chapters: Chapter[] = []
  for (const e of usable) {
    const { number, title } = splitNumberedTitle(e.title)
    chapters.push({
      title,
      number,
      documentId: doc.id,
      documentTitle: doc.title,
      page: e.page,
    })
  }
  return chapters
}

// ── source 2: the routed group's KB copy ────────────────────────────────────

/** Chapter headings from the KB copy's page texts, null when it has none. */
async function remoteChapters(doc: DocumentRow, route: RemoteRoute): Promise<Chapter[] | null> {
  const units = await remoteDocumentTexts(doc.id, route.remoteKbIds)
  if (!units) return null
  const found = chaptersFromTextUnits(units)
  if (found.length === 0) return null
  return found.map((c) => ({ ...c, documentId: doc.id, documentTitle: doc.title }))
}

// ── source 3: the document's own chunks ──────────────────────────────────────

/** Chapter headings from the document's chunks, in document order. */
async function chunkHeadingChapters(doc: DocumentRow): Promise<Chapter[]> {
  const units = await listDocumentChunkTexts(doc.id)
  return chaptersFromTextUnits(units).map((c) => ({
    ...c,
    documentId: doc.id,
    documentTitle: doc.title,
  }))
}

// ── per-document cache: LRU + S3 sidecar ─────────────────────────────────────

/** Held on globalThis for the same reason lib/prisma holds its client:
 *  Next.js can instantiate this module more than once per process. */
const globalForChapters = globalThis as unknown as { __v1ChaptersCache?: LruCache<string, Chapter[]> }
globalForChapters.__v1ChaptersCache ??= new LruCache<string, Chapter[]>({ maxSize: 256 })

/** Test seam: drop the in-process cache so a fresh build can be forced. */
export function __resetChaptersCacheForTests(): void {
  globalForChapters.__v1ChaptersCache?.clear()
}

function cacheKey(doc: DocumentRow): string {
  const at = new Date(doc.updatedAt).getTime()
  return `${doc.id}:${Number.isFinite(at) ? at : String(doc.updatedAt)}`
}

/** `…/<docId>/assets/chapters.json` beside the original (S3Paths layout:
 *  `documents/{org|global}/{docId}/<file>`), null for documents with no
 *  stored original. */
function sidecarKey(s3Key: string | null): string | null {
  if (!s3Key) return null
  const cut = s3Key.lastIndexOf("/")
  if (cut <= 0) return null
  return `${s3Key.slice(0, cut)}/assets/chapters.json`
}

interface SidecarBody {
  v?: unknown
  documentId?: unknown
  updatedAt?: unknown
  chapters?: unknown
}

/** Read the sidecar, or null when absent/stale/unparsable. */
async function readSidecar(doc: DocumentRow): Promise<Chapter[] | null> {
  const key = sidecarKey(doc.s3Key)
  if (!key) return null
  let body: SidecarBody
  try {
    body = JSON.parse((await downloadFile(key)).toString("utf8")) as SidecarBody
  } catch {
    return null
  }
  if (body.v !== 1 || body.documentId !== doc.id) return null
  const updated = new Date(doc.updatedAt).toISOString()
  if (body.updatedAt !== updated) return null
  if (!Array.isArray(body.chapters)) return null
  const chapters: Chapter[] = []
  for (const c of body.chapters) {
    if (!c || typeof c !== "object") return null
    const ch = c as Record<string, unknown>
    if (typeof ch.title !== "string" || ch.title.length === 0) return null
    if (ch.number !== null && typeof ch.number !== "number") return null
    if (ch.page !== null && typeof ch.page !== "number") return null
    chapters.push({
      title: ch.title,
      number: (ch.number as number | null) ?? null,
      documentId: doc.id,
      documentTitle: doc.title,
      page: (ch.page as number | null) ?? null,
    })
  }
  return chapters
}

/** Best-effort write of the sidecar; never throws, never blocks. */
function writeSidecar(doc: DocumentRow, chapters: Chapter[]): void {
  const key = sidecarKey(doc.s3Key)
  if (!key) return
  const body = JSON.stringify({
    v: 1,
    documentId: doc.id,
    updatedAt: new Date(doc.updatedAt).toISOString(),
    chapters: chapters.map(({ title, number, page }) => ({ title, number, page })),
  })
  uploadFile(key, Buffer.from(body, "utf8"), "application/json").catch((err) => {
    console.warn(`[V1 Chapters] sidecar write failed for ${doc.id}: ${(err as Error).message?.slice(0, 120)}`)
  })
}

/**
 * One document's chapters through the cache: LRU hit, else sidecar hit,
 * else built source by source (each failure falls to the next, one warn
 * line each — a broken source must not break the route), then cached in
 * both layers.
 */
async function chaptersForDocument(doc: DocumentRow, route: RemoteRoute | null): Promise<Chapter[]> {
  const cache = globalForChapters.__v1ChaptersCache!
  const key = cacheKey(doc)
  const hit = cache.get(key)
  if (hit) return hit

  const fromSidecar = await readSidecar(doc).catch(() => null)
  if (fromSidecar) {
    cache.set(key, fromSidecar)
    return fromSidecar
  }

  let built: Chapter[] | null = null
  try {
    built = await outlineChapters(doc)
  } catch (err) {
    console.warn(`[V1 Chapters] outline source failed for ${doc.id}: ${(err as Error).message?.slice(0, 160)}`)
  }
  if (built === null && route) {
    try {
      built = await remoteChapters(doc, route)
    } catch (err) {
      console.warn(`[V1 Chapters] remote source failed for ${doc.id}: ${(err as Error).message?.slice(0, 160)}`)
    }
  }
  if (built === null) {
    try {
      built = await chunkHeadingChapters(doc)
    } catch (err) {
      console.warn(`[V1 Chapters] chunk-heading source failed for ${doc.id}: ${(err as Error).message?.slice(0, 160)}`)
    }
  }

  const chapters = built ?? []
  cache.set(key, chapters)
  writeSidecar(doc, chapters)
  return chapters
}

// ── the route's entry point ─────────────────────────────────────────────────

/** Same cap as the chat path's directory listing (listDocumentsInKnowledgeGroups). */
const MAX_DOCUMENTS = 200

async function documentsInGroups(groupIds: string[]): Promise<DocumentRow[]> {
  // TENANCY: `groupIds` here are exactly the ids `resolveMapel` returned for
  // the AUTHENTICATED assistant's own scope (listMapelForAssistant narrows by
  // the assistant's organization and knowledgeBaseGroupIds before
  // resolveMapel picks the subject), so this query may only ever meet that
  // subject's groups. It must never widen to request input: the document set
  // below is filtered by `groupId IN` those ids alone, the same confinement
  // the chat path's directory listing uses. A document from another grade's
  // or another tenant's group is unreachable by construction — it has no
  // DocumentGroup row in this scope.
  const scope = await expandGroupIds(groupIds)
  if (scope.length === 0) return []
  return prisma.document.findMany({
    where: {
      ...aliveDocumentWhere,
      groups: { some: { groupId: { in: scope } } },
    },
    select: { id: true, title: true, s3Key: true, fileType: true, updatedAt: true },
    orderBy: { title: "asc" },
    take: MAX_DOCUMENTS,
  })
}

/**
 * Chapters of every book in a subject's knowledge-base groups — book order
 * (title ascending, the same order the chat path's document directory uses)
 * then chapter order within each book — or the 400 a chat request with the
 * same unknown subject gets.
 */
export async function chaptersForAssistantMapel(
  assistant: { organizationId: string | null; knowledgeBaseGroupIds: string[] },
  requested: string,
): Promise<ChaptersResult> {
  const available = await listMapelForAssistant(assistant)
  const picked = resolveMapel(available, requested)
  if ("error" in picked) {
    return {
      ok: false,
      status: 400,
      message: `${picked.error} Available: ${picked.available.join(", ")}`,
      type: "invalid_request_error",
    }
  }
  const subject: AvailableMapel | undefined = available.find(
    (a) => a.knowledge_base_id === picked.ids[0],
  )

  // The route table decides whether this subject's groups are served by
  // rantai-kb — the KB copy then carries the chapter data for source 2.
  const route = resolveRemoteRoute(picked.ids)

  const docs = await documentsInGroups(picked.ids)
  const data: Chapter[] = []
  for (const doc of docs) {
    data.push(...(await chaptersForDocument(doc, route)))
  }
  return {
    ok: true,
    body: { object: "list", mapel: subject?.mapel ?? requested, data },
  }
}
