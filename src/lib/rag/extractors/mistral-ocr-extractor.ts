import type { Extractor, ExtractionResult, ExtractedFigure, PageBlocks } from "./types"

/**
 * Client for the Mistral OCR API (api.mistral.ai/v1/ocr) — a hosted, EU-based,
 * pay-per-page alternative to the MinerU sidecar/API for cloud deployments
 * without a GPU. Synchronous (single call, no polling) and billable with a
 * normal international card, unlike mineru.net's China payment rails.
 *
 * Emits the same ExtractionResult (markdown + figures[]) as the other
 * extractors, so ingest/retrieval/render are unchanged.
 *
 * Env: KB_MISTRAL_OCR_KEY (Bearer). Optional KB_MISTRAL_OCR_MODEL
 * (default "mistral-ocr-latest"), KB_MISTRAL_OCR_BASE (default
 * https://api.mistral.ai).
 */
interface MistralPage {
  index: number
  markdown?: string
  images?: Array<{
    id: string
    top_left_x?: number
    top_left_y?: number
    bottom_right_x?: number
    bottom_right_y?: number
    image_base64?: string
  }>
  dimensions?: { dpi?: number; height?: number; width?: number }
}

/**
 * Reading-order blocks for one page, from Mistral's own markdown.
 *
 * Mistral embeds each crop inline as `![id](id)` at the point in the page where
 * it appears, so the markdown IS the reading order — the same fact the MinerU
 * sidecar reports explicitly as `pages_blocks`. Splitting on those markers gives
 * text and figure blocks in sequence, which is exactly what
 * `resolveFigureAnchors` consumes.
 *
 * That makes Mistral anchor-capable without a second extraction pass or any
 * change on the Mistral side: the information was already in the response and we
 * were using it only to hunt for captions.
 */
export function blocksFromMarkdown(markdown: string, pageIndex: number): PageBlocks[] {
  const out: PageBlocks[] = []
  if (!markdown) return out
  // Capture the id from ![id](...) — Mistral repeats the id as the alt text.
  const re = /!\[([^\]]*)\]\([^)]*\)/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(markdown))) {
    const before = markdown.slice(last, m.index).trim()
    if (before) out.push({ kind: "text", text: before })
    out.push({ kind: "figure", id: `p${pageIndex}-${m[1]}` })
    last = m.index + m[0].length
  }
  const tail = markdown.slice(last).trim()
  if (tail) out.push({ kind: "text", text: tail })
  return out
}

/**
 * Find the printed caption for a Mistral image by its `id`. Mistral embeds the
 * image in the page markdown as `![id](id)`; the caption is normally the first
 * non-empty line just after that reference (Indonesian textbooks: "Gambar 1.1
 * …", "Tabel 2.3 …", "Sumber: …"). Falls back to the line just before, then to
 * null so the downstream fallback ("Figure on page N") still applies.
 */
function captionForImage(markdown: string, imageId: string): string | null {
  if (!markdown || !imageId) return null
  const lines = markdown.split(/\r?\n/)
  const refIdx = lines.findIndex((l) => l.includes(`](${imageId})`) || l.includes(imageId))
  if (refIdx === -1) return null

  const isImageRef = (l: string) => /!\[[^\]]*\]\([^)]*\)/.test(l)
  const clean = (l: string) =>
    l
      .replace(/^#+\s*/, "")
      .replace(/^[>*\-\s]+/, "")
      .trim()
      .slice(0, 200)
  // Real figure captions in ID textbooks: "Gambar 1.1 …", "Tabel 2.3 …",
  // "Foto/Diagram/Grafik/Bagan …", "Sumber: …".
  const isCaptionLike = (l: string) => /^(gambar|tabel|foto|diagram|grafik|bagan|ilustrasi|sumber)\b/i.test(l)

  const window: string[] = []
  for (let i = refIdx - 3; i <= refIdx + 3; i++) {
    if (i < 0 || i >= lines.length || i === refIdx) continue
    const raw = lines[i]
    if (!raw?.trim() || isImageRef(raw)) continue
    window.push(clean(raw))
  }
  // 1) Prefer an explicit caption-pattern line anywhere in the window.
  const captioned = window.find((l) => isCaptionLike(l))
  if (captioned) return captioned
  // 2) Else the nearest non-empty line (below preferred, then above).
  for (const dir of [1, -1]) {
    for (let i = refIdx + dir; i >= 0 && i < lines.length && Math.abs(i - refIdx) <= 3; i += dir) {
      const raw = lines[i]
      if (!raw?.trim() || isImageRef(raw)) continue
      const c = clean(raw)
      if (c.length >= 3) return c
    }
  }
  return null
}

/** Infer figure kind from its printed caption (ID textbook conventions). */
function figureTypeFromCaption(caption: string | null): "image" | "table" | "chart" {
  if (!caption) return "image"
  if (/^tabel\b/i.test(caption)) return "table"
  if (/^(grafik|diagram|bagan|chart|kurva)\b/i.test(caption)) return "chart"
  return "image"
}

export class MistralOcrExtractor implements Extractor {
  readonly name = "MistralOcrExtractor"
  private readonly base: string
  private readonly token: string
  private readonly model: string

  constructor(opts?: { token?: string; baseUrl?: string; model?: string }) {
    this.token = opts?.token ?? process.env.KB_MISTRAL_OCR_KEY ?? ""
    if (!this.token) {
      throw new Error("MistralOcrExtractor requires KB_MISTRAL_OCR_KEY")
    }
    this.base = (opts?.baseUrl ?? process.env.KB_MISTRAL_OCR_BASE ?? "https://api.mistral.ai").replace(/\/+$/, "")
    this.model = opts?.model ?? process.env.KB_MISTRAL_OCR_MODEL ?? "mistral-ocr-latest"
  }

  async extract(pdfBuffer: Buffer, opts?: { withFigures?: boolean }): Promise<ExtractionResult> {
    const t0 = Date.now()
    const dataUrl = `data:application/pdf;base64,${pdfBuffer.toString("base64")}`

    const res = await fetch(`${this.base}/v1/ocr`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        document: { type: "document_url", document_url: dataUrl },
        include_image_base64: !!opts?.withFigures,
      }),
    })
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`mistral ocr ${res.status}: ${body.slice(0, 300)}`)
    }
    const data = (await res.json()) as { pages?: MistralPage[] }
    const pages = data.pages ?? []

    const text = pages
      .map((p) => p.markdown ?? "")
      .filter(Boolean)
      .join("\n\n")

    let figures: ExtractedFigure[] | undefined
    let pagesBlocks: PageBlocks[][] | undefined
    if (opts?.withFigures) {
      figures = []
      pagesBlocks = []
      for (const p of pages) {
        const W = p.dimensions?.width || 0
        const H = p.dimensions?.height || 0
        for (const img of p.images ?? []) {
          if (!img.image_base64) continue
          // Strip an optional data: prefix that some responses include.
          const b64 = img.image_base64.includes(",")
            ? img.image_base64.slice(img.image_base64.indexOf(",") + 1)
            : img.image_base64
          const bbox: [number, number, number, number] =
            W > 0 && H > 0
              ? [
                  (img.top_left_x ?? 0) / W,
                  (img.top_left_y ?? 0) / H,
                  (img.bottom_right_x ?? W) / W,
                  (img.bottom_right_y ?? H) / H,
                ]
              : [0, 0, 1, 1]
          // Mistral returns images inline in the page markdown as `![id](id)`,
          // with the printed caption ("Gambar 1.1 …") usually on the next
          // non-empty line. Pair it here so the figure chunk is searchable by
          // its real caption instead of a generic "Figure on page N".
          const caption = captionForImage(p.markdown ?? "", img.id)
          figures.push({
            // Mistral tags every crop as a generic image; infer a finer type
            // from the printed caption so the UI can filter Gambar/Tabel/Chart.
            type: figureTypeFromCaption(caption),
            page: p.index,
            bbox,
            caption,
            imageBase64: b64,
            // Mistral's image ids are only unique within a page ("img-0.jpeg"
            // recurs), so qualify them. The same id is used in pagesBlocks below,
            // and the two must agree for anchoring to resolve.
            id: `p${p.index}-${img.id}`,
          })
        }
        pagesBlocks.push(blocksFromMarkdown(p.markdown ?? "", p.index))
      }
    }

    return {
      text,
      ms: Date.now() - t0,
      pages: pages.length,
      model: this.model,
      ...(figures ? { figures } : {}),
      ...(pagesBlocks ? { pagesBlocks } : {}),
    }
  }
}
