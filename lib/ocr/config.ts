/**
 * OCR Pipeline Configuration
 *
 * Loads configuration from environment variables.
 * Developer chooses models based on their hardware.
 */

import type {
  OCRConfig,
  OllamaConfig,
  ModelRoutingConfig,
  FallbackConfig,
  PreprocessingConfig,
  PostprocessingConfig,
  BatchConfig,
  OllamaOCRModel,
  DocumentType,
} from "./types";

// ============================================
// Default Values
// ============================================

const DEFAULT_OLLAMA_ENDPOINT = "http://localhost:11434";
const DEFAULT_OLLAMA_TIMEOUT = 120000; // 2 minutes
const DEFAULT_MODEL = "glm-ocr";
const DEFAULT_FALLBACK_MODEL = "openai/gpt-4o-mini";

// ============================================
// Configuration Loader
// ============================================

/**
 * Get OCR configuration from environment variables
 */
export function getOCRConfig(): OCRConfig {
  const defaultModel = (process.env.OCR_MODEL_DEFAULT || DEFAULT_MODEL) as OllamaOCRModel;

  return {
    ollama: getOllamaConfig(),
    models: getModelRoutingConfig(defaultModel),
    fallback: getFallbackConfig(),
    preprocessing: getPreprocessingConfig(),
    postprocessing: getPostprocessingConfig(),
    batch: getBatchConfig(),
  };
}

/**
 * Get Ollama server configuration
 */
export function getOllamaConfig(): OllamaConfig {
  return {
    endpoint: process.env.OLLAMA_ENDPOINT || DEFAULT_OLLAMA_ENDPOINT,
    timeout: parseInt(process.env.OLLAMA_TIMEOUT || String(DEFAULT_OLLAMA_TIMEOUT)),
    maxConcurrency: parseInt(process.env.OLLAMA_MAX_CONCURRENCY || "3"),
    retries: parseInt(process.env.OLLAMA_RETRIES || "2"),
    retryDelayMs: parseInt(process.env.OLLAMA_RETRY_DELAY || "1000"),
  };
}

/**
 * Get model routing configuration
 * Developer selects models via environment variables
 */
export function getModelRoutingConfig(defaultModel: OllamaOCRModel): ModelRoutingConfig {
  return {
    default: defaultModel,
    handwritten: (process.env.OCR_MODEL_HANDWRITTEN || defaultModel) as OllamaOCRModel,
    table: (process.env.OCR_MODEL_TABLE || defaultModel) as OllamaOCRModel,
    figure: (process.env.OCR_MODEL_FIGURE || defaultModel) as OllamaOCRModel,
  };
}

/**
 * Get fallback configuration
 */
export function getFallbackConfig(): FallbackConfig {
  return {
    enabled: process.env.OCR_ENABLE_FALLBACK !== "false",
    model: process.env.OCR_FALLBACK_MODEL || DEFAULT_FALLBACK_MODEL,
    apiKey: process.env.OPENROUTER_API_KEY,
  };
}

/**
 * Get preprocessing configuration
 */
export function getPreprocessingConfig(): PreprocessingConfig {
  return {
    autoDeskew: process.env.OCR_PREPROCESS_DESKEW !== "false",
    enhanceContrast: process.env.OCR_PREPROCESS_ENHANCE !== "false",
    denoiseEnabled: process.env.OCR_PREPROCESS_DENOISE === "true",
    targetDPI: parseInt(process.env.OCR_TARGET_DPI || "300"),
  };
}

/**
 * Get postprocessing configuration
 */
export function getPostprocessingConfig(): PostprocessingConfig {
  return {
    normalizeWhitespace: process.env.OCR_POSTPROCESS_WHITESPACE !== "false",
    fixOCRErrors: process.env.OCR_POSTPROCESS_FIX_ERRORS !== "false",
    formatTables: process.env.OCR_POSTPROCESS_FORMAT_TABLES !== "false",
    removeArtifacts: process.env.OCR_POSTPROCESS_REMOVE_ARTIFACTS === "true",
  };
}

/**
 * Get batch processing configuration
 */
export function getBatchConfig(): BatchConfig {
  return {
    maxParallel: parseInt(process.env.OCR_BATCH_MAX_PARALLEL || "3"),
    batchDelayMs: parseInt(process.env.OCR_BATCH_DELAY || "500"),
    failFast: process.env.OCR_BATCH_FAIL_FAST === "true",
  };
}

// ============================================
// Model Selection Helper
// ============================================

/**
 * Get the appropriate model for a document type
 */
export function getModelForDocumentType(
  documentType: DocumentType,
  config?: ModelRoutingConfig
): OllamaOCRModel {
  const routing = config || getModelRoutingConfig(DEFAULT_MODEL as OllamaOCRModel);

  switch (documentType) {
    case "handwritten":
      return routing.handwritten;
    case "table":
    case "form":
      return routing.table;
    case "figure":
      return routing.figure;
    case "printed_text":
    case "scanned_pdf":
    case "mixed":
    case "unknown":
    default:
      return routing.default;
  }
}

/**
 * Get GLM-OCR command for document type
 */
export function getGLMCommand(documentType: DocumentType): string {
  switch (documentType) {
    case "table":
    case "form":
      return "Table Recognition:";
    case "figure":
      return "Figure Recognition:";
    default:
      return "Text Recognition:";
  }
}

// ============================================
// Model Specifications (for documentation)
// ============================================

/**
 * Model specifications for documentation and validation
 */
export const MODEL_SPECS = {
  "glm-ocr": {
    parameters: "0.9B",
    size: "2.2GB",
    vram: "2-3GB",
    contextLength: 128000,
    minOllamaVersion: "0.15.5",
    commands: ["Text Recognition:", "Table Recognition:", "Figure Recognition:"],
    strengths: ["Fast", "Low VRAM", "Excellent table/figure recognition"],
    weaknesses: ["May struggle with handwriting"],
    benchmark: "94.62% OmniDocBench",
  },
  moondream: {
    parameters: "1.8B",
    size: "~3GB",
    vram: "3-4GB",
    contextLength: 4096,
    strengths: ["Lightweight", "CPU-friendly", "Good general vision"],
    weaknesses: ["Not specialized for OCR"],
  },
  "qwen3-vl:2b": {
    parameters: "2B",
    size: "~4GB",
    vram: "4GB",
    contextLength: 4096,
    strengths: ["Multilingual", "CPU-friendly"],
    weaknesses: ["Lower accuracy than larger models"],
  },
  "qwen3-vl:8b": {
    parameters: "8B",
    size: "~8GB",
    vram: "6-8GB",
    contextLength: 4096,
    strengths: ["Good accuracy", "Multilingual", "Complex layouts"],
    weaknesses: ["Slower than smaller models"],
  },
  "minicpm-v:2.6": {
    parameters: "8B",
    size: "~8GB",
    vram: "8GB",
    maxPixels: 1800000,
    strengths: ["High-res images", "Good OCR"],
    weaknesses: ["Higher VRAM requirement"],
  },
  "minicpm-v:4.5": {
    parameters: "8B",
    size: "~10-12GB",
    vram: "10-12GB",
    maxPixels: 1800000,
    strengths: ["SOTA OCRBench", "Excellent handwriting", "Complex documents"],
    weaknesses: ["Higher VRAM requirement", "Slower"],
    benchmark: "SOTA OCRBench",
  },
} as const;

/**
 * Hardware recommendations
 */
export const HARDWARE_RECOMMENDATIONS = {
  cpu_only: ["moondream", "qwen3-vl:2b"],
  low_vram: ["glm-ocr", "moondream"],
  medium_vram: ["glm-ocr", "qwen3-vl:8b", "minicpm-v:2.6"],
  high_vram: ["glm-ocr", "minicpm-v:4.5", "qwen3-vl:8b"],
} as const;
