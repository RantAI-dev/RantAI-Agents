/**
 * Chat File Processor
 *
 * Processes file attachments for chat with a hybrid strategy:
 * - Small files (text, images, short PDFs) → inline text extraction
 * - Large PDFs (10+ pages) → RAG embedding pipeline
 */

import { processDocumentOCR, isPDFScanned, extractPDFText, getPDFPageCount } from "@/lib/ocr"
import type { OCRResult, BatchOCRResult } from "@/lib/ocr"
import { smartChunkDocument } from "@/lib/rag/smart-chunker"
import { generateEmbeddings } from "@/lib/rag/embeddings"
import { prepareChunkForEmbedding } from "@/lib/rag/chunker"
import { prisma } from "@/lib/prisma"
import { getSurrealClient } from "@/lib/surrealdb"

export interface FileProcessingResult {
  type: "inline" | "rag"
  fileName: string
  mimeType: string
  text?: string
  documentId?: string
  pageCount?: number
  chunkCount?: number
}

const DEFAULT_PAGE_THRESHOLD = 10

function getOCRText(result: OCRResult | BatchOCRResult): string {
  if ("text" in result) return result.text
  return result.combinedText
}

export async function processChatFile(
  buffer: Buffer,
  mimeType: string,
  fileName: string,
  options: {
    sessionId?: string
    organizationId?: string
    userId?: string
    pageThreshold?: number
  } = {}
): Promise<FileProcessingResult> {
  const pageThreshold = options.pageThreshold ?? DEFAULT_PAGE_THRESHOLD

  // Text/Markdown: read as UTF-8, return inline
  if (mimeType === "text/plain" || mimeType === "text/markdown") {
    const text = buffer.toString("utf-8")
    return {
      type: "inline",
      fileName,
      mimeType,
      text,
    }
  }

  // Images: try OCR first, then describe visually if little text found
  if (mimeType.startsWith("image/")) {
    let text = ""

    // Try OCR for text extraction
    try {
      const ocrResult = await processDocumentOCR(buffer, mimeType, {
        outputFormat: "markdown",
      })
      text = getOCRText(ocrResult)
    } catch (error) {
      console.warn("[FileProcessor] OCR failed for image:", error)
    }

    // If OCR returned little/no text, get a visual description
    const textLength = text.replace(/\s+/g, "").length
    if (textLength < 50) {
      try {
        const description = await describeImage(buffer, mimeType)
        text = description
          ? (text ? `${text}\n\n[Visual description]\n${description}` : `[Visual description]\n${description}`)
          : text || "(No text or visual content could be extracted)"
      } catch (error) {
        console.warn("[FileProcessor] Image description failed:", error)
      }
    }

    return {
      type: "inline",
      fileName,
      mimeType,
      text,
    }
  }

  // PDFs: check page count to decide inline vs RAG
  if (mimeType === "application/pdf") {
    const pageCount = await getPDFPageCount(buffer)

    if (pageCount < pageThreshold) {
      // Small PDF → inline
      const text = await extractPDFTextWithOCRFallback(buffer)
      return {
        type: "inline",
        fileName,
        mimeType,
        text,
        pageCount,
      }
    }

    // Large PDF → RAG pipeline
    const text = await extractPDFTextWithOCRFallback(buffer)
    const chunks = await smartChunkDocument(text, fileName, "CHAT_ATTACHMENT")

    if (chunks.length === 0) {
      // No meaningful content extracted, return inline with whatever we got
      return {
        type: "inline",
        fileName,
        mimeType,
        text,
        pageCount,
      }
    }

    // Generate embeddings
    const textsForEmbedding = chunks.map(prepareChunkForEmbedding)
    const embeddings = await generateEmbeddings(textsForEmbedding)

    // Store document in PostgreSQL
    const document = await prisma.document.create({
      data: {
        title: fileName,
        content: text.substring(0, 50000), // Cap stored content
        categories: ["CHAT_ATTACHMENT"],
        subcategory: options.sessionId || null,
        metadata: {
          source: "chat_attachment",
          sessionId: options.sessionId,
          userId: options.userId,
          pageCount,
          createdAt: new Date().toISOString(),
        },
      },
    })

    // Store chunks with embeddings in SurrealDB
    const surrealClient = await getSurrealClient()
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]
      const embedding = embeddings[i]
      const chunkId = `${document.id}_${i}`

      await surrealClient.query(
        `CREATE document_chunk SET
          id = $id,
          document_id = $document_id,
          content = $content,
          chunk_index = $chunk_index,
          embedding = $embedding,
          metadata = $metadata,
          created_at = time::now()`,
        {
          id: chunkId,
          document_id: document.id,
          content: chunk.content,
          chunk_index: chunk.metadata.chunkIndex,
          embedding,
          metadata: chunk.metadata,
        }
      )
    }

    console.log(
      `[FileProcessor] Stored "${fileName}" as RAG document ${document.id} with ${chunks.length} chunks (${pageCount} pages)`
    )

    return {
      type: "rag",
      fileName,
      mimeType,
      documentId: document.id,
      pageCount,
      chunkCount: chunks.length,
    }
  }

  // All other supported types (office, structured data, code, etc.) → inline text
  try {
    const { extractTextFromBuffer } = await import("@/lib/files/parsers")
    const text = await extractTextFromBuffer(buffer, mimeType, fileName)
    return { type: "inline", fileName, mimeType, text }
  } catch (err) {
    throw new Error(`Unsupported file type: ${mimeType} (${err instanceof Error ? err.message : err})`)
  }
}

async function extractPDFTextWithOCRFallback(buffer: Buffer): Promise<string> {
  const scanned = await isPDFScanned(buffer)

  if (scanned) {
    try {
      const ocrResult = await processDocumentOCR(buffer, "application/pdf", {
        outputFormat: "markdown",
      })
      return getOCRText(ocrResult)
    } catch (error) {
      console.warn("[FileProcessor] OCR failed for scanned PDF, falling back to text extraction:", error)
      // Fall through to text extraction — may return empty for fully scanned PDFs
    }
  }

  return extractPDFText(buffer)
}

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"

/**
 * Describe an image visually using a vision model via OpenRouter.
 * Used when OCR returns little/no text (e.g. photos, artwork, diagrams).
 */
async function describeImage(buffer: Buffer, mimeType: string): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) return ""

  const model = process.env.OCR_FALLBACK_MODEL || "google/gemini-2.0-flash-001"
  const base64 = buffer.toString("base64")
  const dataUrl = `data:${mimeType};base64,${base64}`

  const response = await fetch(OPENROUTER_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Describe this image in detail. Include: what the image depicts, key visual elements, colors, style, any text visible, and any other notable details. Be thorough but concise.",
            },
            {
              type: "image_url",
              image_url: { url: dataUrl },
            },
          ],
        },
      ],
      max_tokens: 1000,
    }),
  })

  if (!response.ok) {
    console.warn("[FileProcessor] Image description API error:", response.status)
    return ""
  }

  const data = await response.json()
  return data.choices?.[0]?.message?.content?.trim() || ""
}
