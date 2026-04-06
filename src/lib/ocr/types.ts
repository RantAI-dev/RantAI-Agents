/**
 * OCR Pipeline Type Definitions
 *
 * Flexible OCR system supporting multiple models via Ollama
 * with OpenRouter fallback.
 */

// ============================================
// Provider Types
// ============================================

/**
 * OCR provider types
 */
export type OCRProvider = "ollama" | "openrouter";

/**
 * Supported OCR models via Ollama
 */
export type OllamaOCRModel =
  | "glm-ocr" // 0.9B, fast, tables/figures/printed text
  | "moondream" // 1.8B, CPU-friendly
  | "qwen3-vl:2b" // 2B, multilingual, CPU-friendly
  | "qwen3-vl:8b" // 8B, complex layouts
  | "minicpm-v:2.6" // 8B, high-res images
  | "minicpm-v:4.5" // 8B, SOTA handwriting
  | string; // Allow custom models

// ============================================
// Document Types
// ============================================

/**
 * Document types for intelligent model routing
 */
export type DocumentType =
  | "printed_text" // Clean printed documents
  | "scanned_pdf" // Scanned PDFs
  | "handwritten" // Handwritten text
  | "form" // Forms with fields
  | "table" // Documents with tables
  | "mixed" // Mixed content
  | "figure" // Diagrams/charts
  | "unknown";

/**
 * OCR output format
 */
export type OCROutputFormat =
  | "plain_text" // Raw text output
  | "markdown" // Markdown formatted
  | "json_structured"; // Structured JSON with regions

/**
 * GLM-OCR specific commands
 */
export type GLMOCRCommand =
  | "Text Recognition:"
  | "Table Recognition:"
  | "Figure Recognition:";

// ============================================
// OCR Options & Results
// ============================================

/**
 * OCR processing options
 */
export interface OCROptions {
  /** Output format (default: markdown) */
  outputFormat?: OCROutputFormat;

  /** Provider to use (default: from config) */
  provider?: OCRProvider;

  /** Specific model to use (overrides config routing) */
  model?: OllamaOCRModel;

  /** Document type hint (auto-detected if not provided) */
  documentType?: DocumentType;

  /** GLM-OCR specific command */
  glmCommand?: GLMOCRCommand;

  /** Enable preprocessing (deskew, enhance) */
  preprocess?: boolean;

  /** Enable postprocessing (text cleanup) */
  postprocess?: boolean;

  /** Language hint for OCR */
  language?: string;

  /** Maximum processing time in ms */
  timeout?: number;

  /** Confidence threshold (0-1) */
  confidenceThreshold?: number;
}

/**
 * OCR result structure
 */
export interface OCRResult {
  /** Extracted text content */
  text: string;

  /** Output format used */
  format: OCROutputFormat;

  /** Provider used */
  provider: OCRProvider;

  /** Model used */
  model: string;

  /** Confidence score if available */
  confidence?: number;

  /** Processing metadata */
  metadata: OCRMetadata;

  /** Structured regions (for json_structured format) */
  regions?: OCRRegion[];
}

/**
 * OCR region for structured output
 */
export interface OCRRegion {
  type: "text" | "table" | "figure" | "handwriting";
  content: string;
  boundingBox?: BoundingBox;
  confidence?: number;
}

/**
 * Bounding box coordinates
 */
export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Processing metadata
 */
export interface OCRMetadata {
  /** Processing time in ms */
  processingTimeMs: number;

  /** Original image dimensions */
  imageWidth?: number;
  imageHeight?: number;

  /** Page number (for multi-page docs) */
  pageNumber?: number;
  totalPages?: number;

  /** Detected document type */
  detectedDocumentType?: DocumentType;

  /** Preprocessing applied */
  preprocessingApplied?: string[];

  /** Postprocessing applied */
  postprocessingApplied?: string[];
}

// ============================================
// Batch Processing
// ============================================

/**
 * Batch processing result
 */
export interface BatchOCRResult {
  /** Results per page */
  pages: OCRResult[];

  /** Combined text (all pages) */
  combinedText: string;

  /** Total processing time */
  totalProcessingTimeMs: number;

  /** Success/failure counts */
  successCount: number;
  failureCount: number;

  /** Errors if any */
  errors?: Array<{
    pageNumber: number;
    error: string;
  }>;
}

// ============================================
// Configuration Types
// ============================================

/**
 * Ollama server configuration
 */
export interface OllamaConfig {
  /** Ollama API endpoint */
  endpoint: string;

  /** Request timeout in ms */
  timeout: number;

  /** Maximum concurrent requests */
  maxConcurrency?: number;

  /** Retry configuration */
  retries?: number;
  retryDelayMs?: number;
}

/**
 * OpenRouter fallback configuration
 */
export interface OpenRouterConfig {
  /** API key */
  apiKey: string;

  /** Model to use */
  model: string;

  /** Max tokens for response */
  maxTokens?: number;
}

/**
 * Model routing configuration
 */
export interface ModelRoutingConfig {
  /** Default model for general OCR */
  default: OllamaOCRModel;

  /** Model for handwritten text */
  handwritten: OllamaOCRModel;

  /** Model for tables/forms */
  table: OllamaOCRModel;

  /** Model for figures/diagrams */
  figure: OllamaOCRModel;
}

/**
 * Fallback configuration
 */
export interface FallbackConfig {
  /** Enable fallback to OpenRouter */
  enabled: boolean;

  /** Fallback model */
  model: string;

  /** API key for fallback provider */
  apiKey?: string;
}

/**
 * Preprocessing configuration
 */
export interface PreprocessingConfig {
  /** Enable auto-deskew */
  autoDeskew: boolean;

  /** Enable contrast enhancement */
  enhanceContrast: boolean;

  /** Enable noise reduction */
  denoiseEnabled: boolean;

  /** Target DPI for scaling */
  targetDPI?: number;
}

/**
 * Postprocessing configuration
 */
export interface PostprocessingConfig {
  /** Remove extra whitespace */
  normalizeWhitespace: boolean;

  /** Fix common OCR errors */
  fixOCRErrors: boolean;

  /** Format tables as markdown */
  formatTables: boolean;

  /** Remove page artifacts (headers/footers) */
  removeArtifacts: boolean;
}

/**
 * Batch processing configuration
 */
export interface BatchConfig {
  /** Maximum pages to process in parallel */
  maxParallel: number;

  /** Delay between batches (rate limiting) */
  batchDelayMs: number;

  /** Stop on first error */
  failFast: boolean;
}

/**
 * OCR pipeline configuration
 */
export interface OCRConfig {
  /** Ollama configuration */
  ollama: OllamaConfig;

  /** Model selection from env vars */
  models: ModelRoutingConfig;

  /** Fallback configuration */
  fallback: FallbackConfig;

  /** Preprocessing options */
  preprocessing?: PreprocessingConfig;

  /** Postprocessing options */
  postprocessing?: PostprocessingConfig;

  /** Batch processing options */
  batch?: BatchConfig;
}

// ============================================
// PDF Conversion Types
// ============================================

/**
 * PDF conversion options
 */
export interface PDFConversionOptions {
  /** Target DPI (default: 300) */
  dpi?: number;

  /** Output format (default: png) */
  format?: "png" | "jpeg";

  /** Specific pages to convert (default: all) */
  pages?: number[];

  /** Maximum dimension (scale if larger) */
  maxDimension?: number;
}

/**
 * Converted PDF page
 */
export interface ConvertedPage {
  pageNumber: number;
  image: Buffer;
  mimeType: string;
  width: number;
  height: number;
}

// ============================================
// Provider Interface
// ============================================

/**
 * Health check result
 */
export interface HealthCheckResult {
  available: boolean;
  models?: string[];
  version?: string;
  error?: string;
}
