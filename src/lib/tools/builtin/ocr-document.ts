import { z } from "zod"
import type { ToolDefinition } from "../types"

export const ocrDocumentTool: ToolDefinition = {
  name: "ocr_document",
  displayName: "OCR Document",
  description:
    "Extract text from documents (images, PDFs) stored in S3. Downloads the file by S3 key, runs OCR, and returns extracted text. Useful for document verification, content extraction, and fraud detection.",
  category: "builtin",
  parameters: z.object({
    s3_key: z.string().describe("S3 object key of the document to process"),
    filename: z.string().optional().describe("Original filename (for logging)"),
    mime_type: z
      .string()
      .optional()
      .describe("MIME type of the document (auto-detected from S3 if not provided)"),
    document_type: z
      .string()
      .optional()
      .describe(
        "Document type hint for OCR model selection: printed_text, scanned_pdf, handwritten, form, table, mixed, figure, medical"
      ),
  }),
  execute: async (params) => {
    const s3Key = params.s3_key as string
    const filename = (params.filename as string) || s3Key.split("/").pop() || "unknown"
    const documentType = (params.document_type as string) || undefined

    if (!s3Key) {
      return {
        success: false,
        text: "",
        error: "No s3_key provided",
        filename,
        has_documents: false,
      }
    }

    try {
      // Dynamic imports to avoid bundling issues
      const { downloadFile, getFileMetadata } = await import("@/lib/s3")
      const { processDocumentOCR } = await import("@/lib/ocr")

      // Get metadata to determine mime type if not provided
      let mimeType = params.mime_type as string | undefined
      if (!mimeType) {
        const meta = await getFileMetadata(s3Key)
        mimeType = meta?.contentType || "application/octet-stream"
      }

      // Download file from S3
      const buffer = await downloadFile(s3Key)

      // Run OCR
      const result = await processDocumentOCR(buffer, mimeType, {
        documentType: documentType as import("@/lib/ocr").DocumentType,
        outputFormat: "markdown",
      })

      // Handle batch result (PDF with multiple pages)
      if ("pages" in result) {
        return {
          success: true,
          text: result.combinedText,
          page_count: result.pages.length,
          provider: result.pages[0]?.provider || "unknown",
          model: result.pages[0]?.model || "unknown",
          processing_ms: result.totalProcessingTimeMs,
          filename,
          has_documents: true,
        }
      }

      // Single page result
      return {
        success: true,
        text: result.text,
        page_count: 1,
        provider: result.provider,
        model: result.model,
        processing_ms: result.metadata.processingTimeMs,
        filename,
        has_documents: true,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return {
        success: false,
        text: "",
        error: message,
        filename,
        has_documents: false,
      }
    }
  },
}
