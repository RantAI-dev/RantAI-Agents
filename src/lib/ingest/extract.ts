import path from "path"
import { detectFileType } from "@/lib/rag"
import { processDocumentOCR, isPDFScanned } from "@/lib/ocr"
import type { ExtractedFigure, PageBlocks } from "@/lib/rag/extractors/types"
import type { IngestPolicy } from "./pipeline-policy"

/**
 * Text extraction — the first pipeline step, and the one that decides what the
 * rest of the KB ever sees.
 *
 * Branches on the detected file type and the resolved per-type policy:
 * scanned (or force-layout) PDFs go through the layout-extractor chain that
 * returns cropped figures; text-layer PDFs take the fast per-page path that
 * builds a page map; images go through OCR; everything else through the
 * parser registry.
 *
 * Extraction failures used to fall back to a literal placeholder string
 * ("Failed to OCR PDF.") which then got chunked + embedded + indexed, so RAG
 * would surface those placeholders as "results". Now any failure returns an
 * `error` and the caller aborts ingest — retrying with different settings
 * (figureMode, documentType) beats silently poisoning the knowledge base.
 */

type SupportedImageExt = ".png" | ".jpg" | ".jpeg" | ".gif" | ".webp" | ".heic"

export interface ExtractionResult {
  /** Extracted text; empty when `error` is set. */
  content: string
  fileType: "markdown" | "pdf" | "image"
  usedOCR: boolean
  figures?: ExtractedFigure[]
  /** Reading-order blocks, carried alongside figures so each can be anchored
   *  to the text chunk it belongs to rather than matched by caption. */
  pagesBlocks?: PageBlocks[][]
  pageMap?: Array<{ page: number; text: string }>
  /** Set when extraction failed; the caller must abort (HTTP 422). */
  error?: string
}

export async function extractDocumentText(
  file: { name: string; type: string },
  fileBuffer: Buffer,
  policy: IngestPolicy,
  options: { documentType?: string } = {}
): Promise<ExtractionResult> {
  const detectedType = detectFileType(file.name)
  let content = ""
  let fileType: "markdown" | "pdf" | "image" = "markdown"
  let usedOCR = false
  let extractedFigures: ExtractedFigure[] | undefined
  let extractedPagesBlocks: PageBlocks[][] | undefined
  let extractionPageMap: Array<{ page: number; text: string }> | undefined

  let extractionError: string | null = null

  if (detectedType === "pdf") {
    fileType = "pdf"
    const isScanned = policy.forceLayout || (await isPDFScanned(fileBuffer))

    if (isScanned) {
      // Layout extractors (MinerU/Mistral) — purpose-built for scanned/
      // table-heavy PDFs and return cropped figures. Build an ordered CHAIN
      // from whatever is configured and try each until one yields text, so a
      // provider outage/quota falls through to the next rather than dropping
      // to the (figure-less) legacy OCR pipeline:
      //   1. on-prem MinerU sidecar  (KB_EXTRACT_MINERU_BASE_URL) — GPU, private
      //   2. hosted MinerU API       (KB_MINERU_API_KEY)          — free tier
      //   3. Mistral OCR             (KB_MISTRAL_OCR_KEY)         — payable, EU
      // Override the order with KB_LAYOUT_EXTRACTOR_ORDER (csv of
      // sidecar,mineru-api,mistral). Legacy OCR remains the final fallback.
      const { getRagConfig } = await import("@/lib/rag/config")
      const mineruBaseUrl = getRagConfig().extractMineruBaseUrl
      const available: Record<string, () => Promise<import("@/lib/rag/extractors/types").Extractor>> = {
        sidecar: mineruBaseUrl
          ? async () => new (await import("@/lib/rag/extractors/mineru-extractor")).MineruExtractor(mineruBaseUrl)
          : undefined as never,
        "mineru-api": process.env.KB_MINERU_API_KEY
          ? async () => new (await import("@/lib/rag/extractors/mineru-api-extractor")).MineruApiExtractor()
          : undefined as never,
        mistral: process.env.KB_MISTRAL_OCR_KEY
          ? async () => new (await import("@/lib/rag/extractors/mistral-ocr-extractor")).MistralOcrExtractor()
          : undefined as never,
      }
      const defaultOrder = ["sidecar", "mineru-api", "mistral"]
      const order = (process.env.KB_LAYOUT_EXTRACTOR_ORDER?.split(",").map((x) => x.trim()) || defaultOrder)
        .filter((name) => typeof available[name] === "function")
      for (const name of order) {
        try {
          const extractor = await available[name]()
          const result = await extractor.extract(fileBuffer, { withFigures: policy.figures })
          if (result.text?.trim()) {
            content = result.text
            usedOCR = true
            if (policy.figures && result.figures?.length) extractedFigures = result.figures
            if (result.pagesBlocks?.length) extractedPagesBlocks = result.pagesBlocks
            if (result.pageMap?.length) extractionPageMap = result.pageMap
            console.log(`[Knowledge] Layout extraction via ${name} (${result.figures?.length ?? 0} figures, ${result.pageMap?.length ?? 0} page blocks)`)
            break
          }
          console.warn(`[Knowledge] ${name} returned no text, trying next extractor`)
        } catch (error) {
          console.warn(
            `[Knowledge] ${name} extraction failed, trying next: ${error instanceof Error ? error.message : error}`
          )
        }
      }

      if (!usedOCR) try {
        const ocrResult = await processDocumentOCR(fileBuffer, "application/pdf", {
          outputFormat: "markdown",
          documentType: options.documentType as
            | "printed_text"
            | "handwritten"
            | "table"
            | "form"
            | "figure"
            | "mixed"
            | undefined,
        })
        content = "combinedText" in ocrResult ? ocrResult.combinedText : ocrResult.text
        usedOCR = true
      } catch (error) {
        console.error("OCR processing error:", error)
        extractionError = `OCR failed for "${file.name}": ${(error as Error).message?.slice(0, 200) ?? "unknown error"}`
      }
    } else {
      try {
        const { extractText, getDocumentProxy } = await import("unpdf")
        const pdf = await getDocumentProxy(new Uint8Array(fileBuffer))
        // Per-page extraction (mergePages:false → string[]) so we can build a
        // pageMap and tag every text chunk with its source page, then join
        // for the chunker input.
        const { text } = await extractText(pdf, { mergePages: false })
        const pages = Array.isArray(text) ? text : [text]
        content = pages.join("\n\n")
        extractionPageMap = pages
          .map((t, i) => ({ page: i, text: (t || "").trim() }))
          .filter((p) => p.text.length > 0)
      } catch (error) {
        console.error("PDF parsing error:", error)
        extractionError = `PDF parse failed for "${file.name}": ${(error as Error).message?.slice(0, 200) ?? "unknown error"}`
      }
    }
  } else if (detectedType === "image") {
    fileType = "image"
    try {
      const ext = path.extname(file.name).toLowerCase() as SupportedImageExt | string
      const mimeTypes: Record<string, string> = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".gif": "image/gif",
        ".webp": "image/webp",
        ".heic": "image/heic",
      }
      const imgMimeType = mimeTypes[ext] || "image/png"

      const ocrResult = await processDocumentOCR(fileBuffer, imgMimeType, {
        outputFormat: "markdown",
        documentType: options.documentType as
          | "printed_text"
          | "handwritten"
          | "table"
          | "form"
          | "figure"
          | "mixed"
          | undefined,
      })
      const text = "combinedText" in ocrResult ? ocrResult.combinedText : ocrResult.text
      content = `[Image: ${file.name}]\n\n${text}`
      usedOCR = true
    } catch (error) {
      console.error("OCR processing error:", error)
      extractionError = `Image OCR failed for "${file.name}": ${(error as Error).message?.slice(0, 200) ?? "unknown error"}`
    }
  } else if (detectedType === "document" || detectedType === "text") {
    fileType = "markdown"
    try {
      const { EXT_TO_MIME } = await import("@/lib/files/mime-types")
      const { extractTextFromBuffer } = await import("@/lib/files/parsers")
      const detectedMime = EXT_TO_MIME[path.extname(file.name).toLowerCase()] || file.type || "text/plain"
      content = await extractTextFromBuffer(fileBuffer, detectedMime, file.name)
    } catch (error) {
      console.error("File extraction error:", error)
      extractionError = `Text extraction failed for "${file.name}": ${(error as Error).message?.slice(0, 200) ?? "unknown error"}`
    }
  } else {
    fileType = "markdown"
    content = fileBuffer.toString("utf-8")
  }

  if (extractionError) {
    return { content: "", fileType, usedOCR, error: extractionError }
  }

  return {
    content,
    fileType,
    usedOCR,
    figures: extractedFigures,
    pagesBlocks: extractedPagesBlocks,
    pageMap: extractionPageMap,
  }
}
