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
}

/**
 * Upload figure crops to the object store and build one searchable chunk per
 * figure. Best-effort per figure: a failed upload skips that figure rather than
 * failing the whole ingest.
 */
export async function storeFiguresAsChunks(params: {
  organizationId: string | null
  documentId: string
  documentTitle: string
  category: string
  subcategory?: string
  figures: ExtractedFigure[]
}): Promise<{ chunks: Chunk[]; assets: FigureAsset[] }> {
  const chunks: Chunk[] = []
  const assets: FigureAsset[] = []

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

    assets.push({ assetKey: key, page: fig.page, caption: fig.caption, bbox: fig.bbox })

    // The embedded text is what makes the figure findable. MinerU's printed
    // caption ("Gambar 2.1 Grafik ...") is more reliable than a VLM guess;
    // fall back to a positional label when none was detected.
    const captionText = fig.caption?.trim() || `Figure on page ${fig.page + 1}`
    chunks.push({
      content: `[${fig.type === "chart" ? "Chart" : "Figure"}] ${captionText}`,
      metadata: {
        documentTitle: params.documentTitle,
        category: params.category,
        subcategory: params.subcategory,
        chunkIndex: -1, // reassigned by the caller after appending
        chunkType: "figure",
        assetKey: key,
        page: fig.page,
        section: captionText,
      },
    })
  }

  return { chunks, assets }
}
