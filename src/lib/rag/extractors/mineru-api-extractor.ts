import { unzipSync } from "fflate"
import type { Extractor, ExtractionResult, ExtractedFigure } from "./types"

/**
 * Client for the HOSTED MinerU API (mineru.net / OpenDataLab) — the cloud
 * counterpart to the on-prem MineruExtractor sidecar. Same engine, so both
 * emit the same ExtractionResult (markdown + figures[]); cloud gets figure
 * extraction without a local GPU.
 *
 * Flow (async): request an upload URL → PUT the file → poll the batch until
 * done → download the result ZIP → read full.md + content_list.json + images/.
 * The API pre-crops figures into the ZIP's images/ folder, so no bbox cropping
 * is needed here (unlike the sidecar). bbox in content_list is 0-1000 → /1000.
 *
 * Env: KB_MINERU_API_KEY (Bearer token). Optional KB_MINERU_API_BASE
 * (default https://mineru.net), KB_MINERU_API_LANG (default "id").
 */
const FIGURE_TYPES = new Set(["image", "chart", "image_block"])
const CAPTION_RE = /^(gambar|figure|fig\.?|tabel|table|chart|grafik|diagram)\b/i

/** Nearest caption-like text block just below a figure on the same page. */
function findNearbyCaption(blocks: ContentBlock[], fig: ContentBlock): string | null {
  const page = fig.page_idx ?? 0
  const figBottom = fig.bbox?.[3] ?? 0
  let best: string | null = null
  let bestGap = Infinity
  for (const b of blocks) {
    if (b === fig || (b.page_idx ?? 0) !== page || !b.text?.trim()) continue
    const top = b.bbox?.[1] ?? 0
    const gap = top - figBottom
    // Just below the figure (allow slight overlap), closest wins.
    if (gap >= -30 && gap < bestGap && gap < 200 && CAPTION_RE.test(b.text.trim())) {
      bestGap = gap
      best = b.text.trim()
    }
  }
  return best
}

interface ContentBlock {
  type?: string
  text?: string
  img_path?: string
  page_idx?: number
  bbox?: [number, number, number, number]
  image_caption?: string[]
  text_level?: number
}

export class MineruApiExtractor implements Extractor {
  readonly name = "MineruApiExtractor"
  private readonly base: string
  private readonly token: string
  private readonly language: string

  constructor(opts?: { token?: string; baseUrl?: string; language?: string }) {
    this.token = opts?.token ?? process.env.KB_MINERU_API_KEY ?? ""
    if (!this.token) {
      throw new Error("MineruApiExtractor requires KB_MINERU_API_KEY")
    }
    this.base = (opts?.baseUrl ?? process.env.KB_MINERU_API_BASE ?? "https://mineru.net").replace(/\/+$/, "")
    this.language = opts?.language ?? process.env.KB_MINERU_API_LANG ?? "id"
  }

  private headers() {
    return { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" }
  }

  async extract(pdfBuffer: Buffer, opts?: { withFigures?: boolean }): Promise<ExtractionResult> {
    const t0 = Date.now()

    // 1. Request a presigned upload URL for one file.
    const batchRes = await fetch(`${this.base}/api/v4/file-urls/batch`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        model_version: "vlm",
        language: this.language,
        enable_table: true,
        enable_formula: true,
        files: [{ name: "document.pdf" }],
      }),
    })
    const batchJson = (await batchRes.json()) as {
      code: number
      msg?: string
      data?: { batch_id: string; file_urls: string[] }
    }
    if (batchJson.code !== 0 || !batchJson.data?.file_urls?.[0]) {
      throw new Error(`mineru api batch request failed: ${batchJson.msg || batchRes.status}`)
    }
    const { batch_id, file_urls } = batchJson.data

    // 2. Upload the file (PUT, no Content-Type per API docs).
    const ab = pdfBuffer.buffer.slice(
      pdfBuffer.byteOffset,
      pdfBuffer.byteOffset + pdfBuffer.byteLength,
    ) as ArrayBuffer
    const putRes = await fetch(file_urls[0], { method: "PUT", body: ab })
    if (!putRes.ok) {
      throw new Error(`mineru api upload failed: ${putRes.status}`)
    }

    // 3. Poll the batch until the file is done (or fails). The API auto-submits
    //    the parse task after upload.
    const deadline = Date.now() + 10 * 60 * 1000
    let zipUrl = ""
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 4000))
      const pollRes = await fetch(`${this.base}/api/v4/extract-results/batch/${batch_id}`, {
        headers: this.headers(),
      })
      const pollJson = (await pollRes.json()) as {
        code: number
        data?: { extract_result?: Array<{ state?: string; full_zip_url?: string; err_msg?: string }> }
      }
      const r = pollJson.data?.extract_result?.[0]
      if (r?.state === "done" && r.full_zip_url) {
        zipUrl = r.full_zip_url
        break
      }
      if (r?.state === "failed") {
        throw new Error(`mineru api extraction failed: ${r.err_msg || "unknown"}`)
      }
    }
    if (!zipUrl) throw new Error("mineru api timed out waiting for extraction")

    // 4. Download + unzip the result.
    const zipRes = await fetch(zipUrl)
    if (!zipRes.ok) throw new Error(`mineru api zip download failed: ${zipRes.status}`)
    const zip = unzipSync(new Uint8Array(await zipRes.arrayBuffer()))

    // Markdown = the first *.md entry.
    const mdKey = Object.keys(zip).find((k) => k.endsWith(".md"))
    const text = mdKey ? new TextDecoder().decode(zip[mdKey]) : ""

    // 5. Figures from content_list.json, reading the pre-cropped images.
    //    We also build a pageMap from the same blocks (text + page_idx) so
    //    text chunks can be tagged with their source page later.
    let figures: ExtractedFigure[] | undefined
    let pageMap: Array<{ page: number; text: string }> | undefined
    const clKey = Object.keys(zip).find((k) => k.endsWith("content_list.json"))
    if (clKey) {
      try {
        const allBlocks = JSON.parse(new TextDecoder().decode(zip[clKey])) as ContentBlock[]
        pageMap = allBlocks
          .filter((b) => b.text?.trim())
          .map((b) => ({ page: b.page_idx ?? 0, text: b.text!.trim() }))
      } catch {
        // pageMap is best-effort; ignore parse issues.
      }
    }
    if (opts?.withFigures) {
      if (clKey) {
        try {
          const blocks = JSON.parse(new TextDecoder().decode(zip[clKey])) as ContentBlock[]
          figures = []
          for (const b of blocks) {
            if (!b.type || !FIGURE_TYPES.has(b.type) || !b.img_path) continue
            // img_path is relative to the ZIP root (e.g. "images/xxx.jpg").
            const imgEntry =
              zip[b.img_path] ??
              zip[Object.keys(zip).find((k) => k.endsWith(b.img_path!.split("/").pop()!)) ?? ""]
            if (!imgEntry) continue
            const bbox = b.bbox
              ? (b.bbox.map((c) => c / 1000) as [number, number, number, number])
              : ([0, 0, 1, 1] as [number, number, number, number])
            figures.push({
              type: b.type,
              page: b.page_idx ?? 0,
              bbox,
              // Prefer an attached image_caption; else find the nearest caption
              // text block below the figure (the API emits captions as separate
              // "text" blocks, e.g. "Gambar 2.1 …").
              caption:
                (Array.isArray(b.image_caption) ? b.image_caption.join(" ").trim() : null) ||
                findNearbyCaption(blocks, b),
              imageBase64: Buffer.from(imgEntry).toString("base64"),
            })
          }
        } catch (err) {
          console.warn(`[mineru-api] figure parse failed: ${err instanceof Error ? err.message : err}`)
        }
      }
    }

    return {
      text,
      ms: Date.now() - t0,
      model: "mineru-api-2.5-pro",
      ...(figures ? { figures } : {}),
      ...(pageMap?.length ? { pageMap } : {}),
    }
  }
}
