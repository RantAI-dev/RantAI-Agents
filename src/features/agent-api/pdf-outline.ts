/**
 * Chapter titles from a stored original's PDF outline (bookmarks) — the
 * first-preference source for GET /api/v1/mapel/chapters.
 *
 * Uses `unpdf`, the PDF reader already in the ingest graph
 * (`KB_EXTRACT_PRIMARY=unpdf` / src/lib/rag/extractors), so the chapters
 * route adds no dependency: `getDocumentProxy` hands back the pdf.js
 * document proxy, whose `getOutline()` is the bookmark tree and whose
 * `getDestination`/`getPageIndex` turn each bookmark's destination into a
 * 0-based page index — the same base every other `page` in this API uses.
 *
 * Only the TOP-LEVEL outline entries are returned: a "Bab" picker wants
 * chapters, not the sub-headings nested under them.
 *
 * Live reality (checked on the UGM corpus, 2026-11-19): no book had a real
 * chapter outline. The only outlines found were 2-entry artifacts whose
 * titles are the source filename and whose destinations both resolve to
 * page 0 (PDF-splitter leftovers). chapters.ts therefore treats an outline
 * whose every resolvable entry sits on one page as "no outline" and falls
 * through to the next source.
 */

/** One top-level bookmark: its title and its 0-based page, when the
 *  destination resolved (null when it did not). */
export interface PdfOutlineEntry {
  title: string
  page: number | null
}

/** A destination as pdf.js reports it: a named-destination string, or the
 *  explicit array `[pageRef, …zoom]`. */
type OutlineDest = string | Array<unknown> | null

/** The page-reference shape a pdf.js destination array carries. */
interface PdfRefLike {
  num: number
  gen: number
}

interface OutlineNodeLike {
  title?: string
  dest?: OutlineDest
  items?: OutlineNodeLike[]
}

/** Resolve one bookmark destination to a 0-based page index, or null. */
async function destPageIndex(
  doc: {
    getDestination: (id: string) => Promise<Array<PdfRefLike | unknown> | null>
    getPageIndex: (ref: PdfRefLike) => Promise<number>
  },
  dest: OutlineDest,
): Promise<number | null> {
  try {
    let explicit: Array<PdfRefLike | unknown> | null
    if (typeof dest === "string") {
      explicit = await doc.getDestination(dest)
    } else if (Array.isArray(dest)) {
      explicit = dest
    } else {
      return null
    }
    const first = explicit?.[0]
    if (!first || typeof first !== "object" || !("num" in (first as PdfRefLike))) return null
    // pdf.js represents the page as a ref object `{ num, gen }`.
    return await doc.getPageIndex(first as PdfRefLike)
  } catch {
    return null
  }
}

/**
 * The document's top-level bookmarks with resolved pages. Empty when the
 * PDF has no outline or none of it is readable — callers decide what that
 * means (never this module: it invents nothing).
 */
export async function readPdfOutline(buffer: Buffer): Promise<PdfOutlineEntry[]> {
  const { getDocumentProxy } = await import("unpdf")
  const doc = await getDocumentProxy(new Uint8Array(buffer))
  const outline = (await doc.getOutline()) as OutlineNodeLike[] | null
  if (!outline || outline.length === 0) return []

  const entries: PdfOutlineEntry[] = []
  for (const node of outline) {
    const title = typeof node.title === "string" ? node.title.replace(/\s+/g, " ").trim() : ""
    const page = await destPageIndex(doc, node.dest ?? null)
    entries.push({ title, page })
  }
  return entries
}
