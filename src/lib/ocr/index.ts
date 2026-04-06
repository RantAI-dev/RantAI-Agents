/**
 * OCR Pipeline Module
 *
 * Flexible OCR system supporting multiple local models via Ollama
 * with OpenRouter fallback.
 *
 * @example
 * ```typescript
 * import { processDocumentOCR, createOCRPipeline } from "@/lib/ocr";
 *
 * // Quick usage - uses models from env vars
 * const result = await processDocumentOCR(imageBuffer, "image/png", {
 *   outputFormat: "markdown",
 * });
 *
 * // Create pipeline with custom config
 * const pipeline = createOCRPipeline({
 *   ollama: { endpoint: "http://ollama:11434" },
 * });
 *
 * // Process with document type hint
 * const result = await pipeline.processImage(imageBuffer, "image/png", {
 *   documentType: "handwritten",
 * });
 *
 * // Process PDF (auto-detects scanned vs digital)
 * const pdfResult = await pipeline.processPDF(pdfBuffer);
 * ```
 */

// Main pipeline
export {
  OCRPipeline,
  createOCRPipeline,
  processDocumentOCR,
  checkOCRHealth,
} from "./ocr-pipeline";

// Configuration
export {
  getOCRConfig,
  getOllamaConfig,
  getModelForDocumentType,
  getGLMCommand,
  MODEL_SPECS,
  HARDWARE_RECOMMENDATIONS,
} from "./config";

// Providers
export {
  BaseOCRProvider,
  OllamaOCRProvider,
  OpenRouterOCRProvider,
} from "./providers";

// PDF utilities
export {
  isPDFScanned,
  extractPDFText,
  convertPDFToImages,
  convertPDFPageToImage,
  getPDFPageCount,
} from "./pdf-converter";

// Types
export type {
  // Provider types
  OCRProvider,
  OllamaOCRModel,

  // Document types
  DocumentType,
  OCROutputFormat,
  GLMOCRCommand,

  // Options and results
  OCROptions,
  OCRResult,
  OCRRegion,
  BoundingBox,
  OCRMetadata,
  BatchOCRResult,

  // Configuration
  OCRConfig,
  OllamaConfig,
  OpenRouterConfig,
  ModelRoutingConfig,
  FallbackConfig,
  PreprocessingConfig,
  PostprocessingConfig,
  BatchConfig,

  // PDF types
  PDFConversionOptions,
  ConvertedPage,

  // Health check
  HealthCheckResult,
} from "./types";
