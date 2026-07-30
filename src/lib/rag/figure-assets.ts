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
}): Promise<{ chunks: Chunk[]; assets: FigureAsset[] }> {
  const chunks: Chunk[] = []
  const assets: FigureAsset[] = []
  const pageText = buildPageText(params.textChunks)

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
      },
    })
  }

  return { chunks, assets }
}
