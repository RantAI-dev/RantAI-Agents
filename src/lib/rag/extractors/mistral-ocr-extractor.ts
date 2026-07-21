import type { Extractor, ExtractionResult, ExtractedFigure } from "./types"

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
    if (opts?.withFigures) {
      figures = []
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
          figures.push({
            type: "image",
            page: p.index,
            bbox,
            caption: null, // Mistral embeds images inline; nearby markdown chunk gives context.
            imageBase64: b64,
          })
        }
      }
    }

    return {
      text,
      ms: Date.now() - t0,
      pages: pages.length,
      model: this.model,
      ...(figures ? { figures } : {}),
    }
  }
}
