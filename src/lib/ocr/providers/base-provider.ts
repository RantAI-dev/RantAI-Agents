/**
 * Abstract Base Provider for OCR
 *
 * Defines the interface that all OCR providers must implement.
 */

import type {
  OCRProvider,
  OCROptions,
  OCRResult,
  HealthCheckResult,
} from "../types";

/**
 * Abstract base class for OCR providers
 */
export abstract class BaseOCRProvider {
  protected name: OCRProvider;

  constructor(name: OCRProvider) {
    this.name = name;
  }

  /**
   * Process a single image and extract text
   */
  abstract processImage(
    image: Buffer,
    mimeType: string,
    options: OCROptions
  ): Promise<OCRResult>;

  /**
   * Check if the provider is available and healthy
   */
  abstract healthCheck(): Promise<HealthCheckResult>;

  /**
   * Get supported models for this provider
   */
  abstract getSupportedModels(): string[];

  /**
   * Get provider name
   */
  getName(): OCRProvider {
    return this.name;
  }

  /**
   * Helper to create a base result object
   */
  protected createResult(
    text: string,
    model: string,
    processingTimeMs: number,
    options: OCROptions
  ): OCRResult {
    return {
      text,
      format: options.outputFormat || "markdown",
      provider: this.name,
      model,
      metadata: {
        processingTimeMs,
        detectedDocumentType: options.documentType,
      },
    };
  }
}
