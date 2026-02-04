/**
 * OCR Pipeline
 *
 * Main orchestrator that combines all components:
 * - Model selection from env vars (developer's choice)
 * - Ollama provider for local inference
 * - OpenRouter fallback for cloud inference
 * - PDF handling (scanned vs digital detection)
 * - Batch processing for multi-page documents
 */

import { OllamaOCRProvider } from "./providers/ollama-provider";
import { OpenRouterOCRProvider } from "./providers/openrouter-provider";
import {
  isPDFScanned,
  extractPDFText,
  convertPDFToImages,
  getPDFPageCount,
} from "./pdf-converter";
import { getOCRConfig, getModelForDocumentType } from "./config";
import type {
  OCROptions,
  OCRResult,
  BatchOCRResult,
  OCRConfig,
  DocumentType,
} from "./types";

/**
 * OCR Pipeline class
 */
export class OCRPipeline {
  private config: OCRConfig;
  private ollamaProvider: OllamaOCRProvider;
  private openrouterProvider: OpenRouterOCRProvider | null = null;

  constructor(config?: Partial<OCRConfig>) {
    const defaultConfig = getOCRConfig();
    this.config = {
      ...defaultConfig,
      ...config,
      ollama: { ...defaultConfig.ollama, ...config?.ollama },
      models: { ...defaultConfig.models, ...config?.models },
      fallback: { ...defaultConfig.fallback, ...config?.fallback },
    };

    this.ollamaProvider = new OllamaOCRProvider(this.config.ollama);

    if (this.config.fallback.enabled && this.config.fallback.apiKey) {
      this.openrouterProvider = new OpenRouterOCRProvider({
        apiKey: this.config.fallback.apiKey,
        model: this.config.fallback.model,
        maxTokens: 4000,
      });
    }
  }

  /**
   * Process a single image
   */
  async processImage(
    image: Buffer,
    mimeType: string,
    options: OCROptions = {}
  ): Promise<OCRResult> {
    const startTime = Date.now();

    // Determine document type if not provided
    const documentType = options.documentType || "unknown";

    // Get model from options or config
    const model = options.model || getModelForDocumentType(documentType, this.config.models);

    // Merge options
    const mergedOptions: OCROptions = {
      ...options,
      documentType,
      model,
    };

    // Try Ollama first
    let result: OCRResult;
    try {
      result = await this.ollamaProvider.processImage(image, mimeType, mergedOptions);
    } catch (error) {
      // Fallback to OpenRouter if configured
      if (this.openrouterProvider) {
        console.warn("[OCRPipeline] Ollama failed, falling back to OpenRouter:", error);
        result = await this.openrouterProvider.processImage(image, mimeType, mergedOptions);
      } else {
        throw error;
      }
    }

    // Update processing time to include full pipeline
    result.metadata.processingTimeMs = Date.now() - startTime;
    result.metadata.detectedDocumentType = documentType;

    return result;
  }

  /**
   * Process a PDF document
   *
   * Automatically detects if PDF is scanned or digital:
   * - Digital PDF: Uses unpdf for direct text extraction (fast)
   * - Scanned PDF: Converts to images and runs OCR (slower)
   */
  async processPDF(
    pdfBuffer: Buffer,
    options: OCROptions = {}
  ): Promise<BatchOCRResult> {
    const startTime = Date.now();

    // Check if PDF is scanned or digital
    const isScanned = await isPDFScanned(pdfBuffer);

    if (!isScanned) {
      // Digital PDF - use direct text extraction
      const text = await extractPDFText(pdfBuffer);
      const pageCount = await getPDFPageCount(pdfBuffer);

      return {
        pages: [
          {
            text,
            format: "plain_text",
            provider: "ollama",
            model: "unpdf",
            metadata: {
              processingTimeMs: Date.now() - startTime,
              pageNumber: 1,
              totalPages: pageCount,
            },
          },
        ],
        combinedText: text,
        totalProcessingTimeMs: Date.now() - startTime,
        successCount: 1,
        failureCount: 0,
      };
    }

    // Scanned PDF - convert to images and OCR
    console.log("[OCRPipeline] Detected scanned PDF, converting to images...");
    const pages = await convertPDFToImages(pdfBuffer);

    return this.processBatch(
      pages.map((p) => ({
        image: p.image,
        mimeType: p.mimeType,
        pageNumber: p.pageNumber,
      })),
      options
    );
  }

  /**
   * Process multiple images/pages in batch
   */
  async processBatch(
    items: Array<{ image: Buffer; mimeType: string; pageNumber?: number }>,
    options: OCROptions = {}
  ): Promise<BatchOCRResult> {
    const startTime = Date.now();
    const results: OCRResult[] = [];
    const errors: Array<{ pageNumber: number; error: string }> = [];

    const batchConfig = this.config.batch || {
      maxParallel: 3,
      batchDelayMs: 500,
      failFast: false,
    };

    // Process in batches
    for (let i = 0; i < items.length; i += batchConfig.maxParallel) {
      const batch = items.slice(i, i + batchConfig.maxParallel);

      const batchPromises = batch.map(async (item, idx) => {
        const pageNum = item.pageNumber || i + idx + 1;
        try {
          const result = await this.processImage(item.image, item.mimeType, options);
          return {
            success: true as const,
            result: {
              ...result,
              metadata: {
                ...result.metadata,
                pageNumber: pageNum,
                totalPages: items.length,
              },
            },
          };
        } catch (error) {
          if (batchConfig.failFast) throw error;
          return {
            success: false as const,
            error: {
              pageNumber: pageNum,
              error: error instanceof Error ? error.message : String(error),
            },
          };
        }
      });

      const batchResults = await Promise.all(batchPromises);

      for (const res of batchResults) {
        if (res.success) {
          results.push(res.result);
        } else {
          errors.push(res.error);
        }
      }

      // Delay between batches to avoid rate limiting
      if (i + batchConfig.maxParallel < items.length && batchConfig.batchDelayMs > 0) {
        await new Promise((r) => setTimeout(r, batchConfig.batchDelayMs));
      }
    }

    // Sort results by page number and combine text
    const sortedResults = results.sort(
      (a, b) => (a.metadata.pageNumber || 0) - (b.metadata.pageNumber || 0)
    );

    const combinedText = sortedResults.map((r) => r.text).join("\n\n---\n\n");

    return {
      pages: sortedResults,
      combinedText,
      totalProcessingTimeMs: Date.now() - startTime,
      successCount: results.length,
      failureCount: errors.length,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Health check for all providers
   */
  async healthCheck(): Promise<{
    ollama: { available: boolean; models?: string[]; error?: string };
    openrouter?: { available: boolean; error?: string };
  }> {
    const ollama = await this.ollamaProvider.healthCheck();
    const openrouter = this.openrouterProvider
      ? await this.openrouterProvider.healthCheck()
      : undefined;

    return { ollama, openrouter };
  }

  /**
   * Get current configuration
   */
  getConfig(): OCRConfig {
    return this.config;
  }
}

// ============================================
// Factory Functions
// ============================================

/**
 * Create a new OCR pipeline with optional config overrides
 */
export function createOCRPipeline(config?: Partial<OCRConfig>): OCRPipeline {
  return new OCRPipeline(config);
}

// ============================================
// Quick Helper Functions
// ============================================

/**
 * Quick helper to process a document (image or PDF)
 *
 * Uses models from environment variables (developer's choice)
 */
export async function processDocumentOCR(
  content: Buffer,
  mimeType: string,
  options?: OCROptions
): Promise<OCRResult | BatchOCRResult> {
  const pipeline = new OCRPipeline();

  if (mimeType === "application/pdf") {
    return pipeline.processPDF(content, options);
  }

  return pipeline.processImage(content, mimeType, options);
}

/**
 * Quick helper to check if OCR services are available
 */
export async function checkOCRHealth(): Promise<{
  ollama: { available: boolean; models?: string[]; error?: string };
  openrouter?: { available: boolean; error?: string };
}> {
  const pipeline = new OCRPipeline();
  return pipeline.healthCheck();
}
