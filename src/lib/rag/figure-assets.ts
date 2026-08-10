/**
 * Figure asset layer (multimodal RAG fase 2).
 *
 * Takes the cropped figures MinerU returns at ingest, uploads each crop to the
 * object store, and turns each into a searchable chunk (its caption text) tagged
 * with the crop's object key. Retrieval then surfaces the figure like any other
 * chunk, and the answer can render the original image.
 */
import { uploadFile, S3Paths } from "@/lib/s3"
import type { Chunk } from "./chunker"
import type { ExtractedFigure } from "./extractors/types"

export interface FigureAsset {
  assetKey: string
  page: number
  caption: string | null
  bbox: [number, number, number, number]
  /** Coarse kind for UI badging. MinerU emits image/chart/image_block; we
   *  normalize to a small set the gallery can label. */
  type: "chart" | "table" | "image" | "figure"
}

/** Normalize the extractor's raw block type to a UI-facing figure kind. */
function normalizeFigureType(raw: string): FigureAsset["type"] {
  if (raw === "chart") return "chart"
  if (raw === "table") return "table"
  if (raw === "image" || raw === "image_block") return "image"
  return "figure"
}

/**
 * Upload figure crops to the object store and build one searchable chunk per
 * figure. Best-effort per figure: a failed upload skips that figure rather than
 * failing the whole ingest.
 */
/** Build a page → text index from the document's page-tagged text chunks so a
 *  figure can borrow the prose around it. MinerU leaves most curriculum-book
 *  figures caption-less, so without this the figure's only searchable text is a
 *  positional label ("Figure on page 11") — too generic to ever match a topical
 *  query, so figures never surface in chat retrieval (only in the Files gallery). */
function buildPageText(textChunks: Chunk[] | undefined): Map<number, string> {
  const map = new Map<number, string>()
  for (const c of textChunks ?? []) {
    const p = (c.metadata as { page?: number } | undefined)?.page
    if (typeof p !== "number") continue
    const prev = map.get(p) ?? ""
    if (prev.length < 1200) map.set(p, `${prev} ${c.content}`.trim())
  }
  return map
}

/** Context text for a figure: same page first, then the neighbours (figure page
 *  indexing and text page indexing can differ by one across parsers). */
function contextForPage(pageText: Map<number, string>, page: number): string {
  return (
    pageText.get(page) ||
    pageText.get(page + 1) ||
    pageText.get(page - 1) ||
    ""
  ).trim()
}

/** A short human label for a caption-less figure: the first heading-ish/sentence
 *  fragment of its surrounding text. Used as the gallery caption + section label
 *  so the UI stops showing "Tanpa keterangan" for everything. */
function deriveLabel(context: string): string | null {
  if (!context) return null
  const firstLine = context
    .split(/\n|\.\s|;\s/)
    .map((s) => s.trim())
    .find((s) => s.length >= 8 && s.length <= 120)
  return firstLine || context.slice(0, 100).trim() || null
}

/**
 * Which text chunk does each figure belong to?
 *
 * Production has never had an answer to this. Figure chunks are appended at the
 * END of a document's chunk_index with no positional link to their subject text,
 * so the only route back was caption keyword overlap — structurally blind on the
 * 19-34% of curriculum figures that carry no printed caption at all.
 *
 * The layout parser already knows: `pagesBlocks` lists each page's blocks in
 * reading order with figures inline. We take the text block immediately BEFORE
 * the figure and find the chunk that contains it. Preceding rather than
 * following, because a figure in a textbook illustrates the passage that
 * introduced it; the prose after it has usually moved on.
 *
 * Returns figure id -> chunkIndex. Figures whose neighbouring prose cannot be
 * located are simply absent, and the caller falls back to today's behaviour —
 * this must degrade quietly, since every document ingested before this change
 * has no anchor and must keep working.
 */
export function resolveFigureAnchors(
  pagesBlocks: Array<Array<{ kind: string; id?: string; text?: string }>> | undefined,
  textChunks: Chunk[] | undefined,
): Map<string, number> {
  const out = new Map<string, number>()
  if (!pagesBlocks?.length || !textChunks?.length) return out

  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim()
  const chunks = textChunks
    .filter((c) => c.metadata.chunkType !== "figure")
    .map((c) => ({ idx: c.metadata.chunkIndex, text: norm(c.content) }))

  for (const page of pagesBlocks) {
    for (const [i, b] of page.entries()) {
      if (b.kind !== "figure" || !b.id) continue
      // Walk backwards for the nearest prose. A caption block counts: it is the
      // most specific text the book itself attached to this figure.
      let words: string[] | undefined
      for (let j = i - 1; j >= 0 && !words; j--) {
        const t = page[j]?.text
        if (t && t.trim().length >= 25) words = norm(t).split(" ").filter(Boolean)
      }
      if (!words || words.length < 4) continue

      // Match on a WORD PREFIX, shortening until it hits, rather than on a fixed
      // character slice. A parser block and a chunk rarely share an exact
      // boundary — the chunker splits on its own separators, so a block ending
      // "...gerak benda." lands inside a chunk reading "...gerak benda pada
      // permukaan kasar." A 120-character substring test misses that; the
      // opening words do not. Four words is the floor: shorter than that and a
      // common phrase would anchor a figure to the wrong passage, which is worse
      // than leaving it unanchored.
      let hit: { idx: number } | undefined
      for (let n = Math.min(10, words.length); n >= 4 && !hit; n--) {
        const probe = words.slice(0, n).join(" ")
        hit = chunks.find((c) => c.text.includes(probe))
      }
      if (hit) out.set(b.id, hit.idx)
    }
  }
  return out
}

export async function storeFiguresAsChunks(params: {
  organizationId: string | null
  documentId: string
  documentTitle: string
  category: string
  subcategory?: string
  figures: ExtractedFigure[]
  /** Page-tagged text chunks of the same document, used to enrich caption-less
   *  figures with the prose around them (see buildPageText). Optional — falls
   *  back to a positional label when absent. */
  textChunks?: Chunk[]
  /** Reading-order blocks from the extractor, used to anchor each figure to the
   *  chunk it belongs to. Absent for extractors without layout order, in which
   *  case figures keep today's caption-only behaviour. */
  pagesBlocks?: Array<Array<{ kind: string; id?: string; text?: string }>>
}): Promise<{ chunks: Chunk[]; assets: FigureAsset[] }> {
  const chunks: Chunk[] = []
  const assets: FigureAsset[] = []
  const pageText = buildPageText(params.textChunks)
  const anchors = resolveFigureAnchors(params.pagesBlocks, params.textChunks)

  let n = 0
  for (const fig of params.figures) {
    n++
    const filename = `fig-p${fig.page}-${n}.png`
    const key = S3Paths.documentAsset(params.organizationId, params.documentId, filename)
    try {
      const buffer = Buffer.from(fig.imageBase64, "base64")
      await uploadFile(key, buffer, "image/png", {
        documentId: params.documentId,
        page: String(fig.page),
        kind: "figure",
      })
    } catch (err) {
      console.warn(
        `[figure-assets] upload failed for ${key}, skipping figure: ${err instanceof Error ? err.message : err}`
      )
      continue
    }

    const context = contextForPage(pageText, fig.page)
    const kindWord =
      fig.type === "table" ? "Tabel" : fig.type === "chart" ? "Grafik" : "Gambar"
    const derived = deriveLabel(context)
    // Display caption ("keterangan"): MinerU's printed caption when it detected
    // one; otherwise a synthetic caption that (a) STARTS with the kind word so
    // `isMeaningfulFigureCaption` lets it surface in chat, and (b) carries the
    // surrounding topic words so `autoPlaceFigures` only drops it next to the
    // prose that actually discusses it — irrelevant crops still won't be placed.
    // This is what fixes the gallery's "Tanpa keterangan" everywhere AND lets
    // figures appear inline in answers (both were empty before).
    const caption =
      fig.caption?.trim() ||
      `${kindWord} halaman ${fig.page + 1}${derived ? `: ${derived}` : ""}`

    assets.push({
      assetKey: key,
      page: fig.page,
      caption,
      bbox: fig.bbox,
      type: normalizeFigureType(fig.type),
    })

    // Embedded text = caption + a slice of the page's prose. This is what makes
    // the figure findable by topic ("kincir angin", "sumber energi") so it can
    // be retrieved into a chat answer, not just listed in the gallery.
    const contextSnippet = context ? ` — Konteks: ${context.slice(0, 500)}` : ""
    chunks.push({
      content: `[${kindWord}] ${caption}${contextSnippet}`,
      metadata: {
        documentTitle: params.documentTitle,
        category: params.category,
        subcategory: params.subcategory,
        chunkIndex: -1, // reassigned by the caller after appending
        chunkType: "figure",
        assetKey: key,
        page: fig.page,
        section: caption,
        // The anchor. Retrieval prefers figures whose anchor chunk was actually
        // retrieved; absent, it falls back to caption matching so documents
        // ingested before this change keep working unchanged.
        ...(fig.id && anchors.has(fig.id) ? { anchorChunkIndex: anchors.get(fig.id) } : {}),
      },
    })
  }

  return { chunks, assets }
}
