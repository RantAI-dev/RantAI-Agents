/**
 * Ollama OCR Provider
 *
 * Supports multiple vision models via Ollama:
 * - GLM-OCR (0.9B): Fast, specialized for text/table/figure recognition
 * - Moondream (1.8B): Lightweight, CPU-friendly
 * - Qwen3-VL (2B/8B): Multilingual
 * - MiniCPM-V (8B): SOTA for handwritten and complex documents
 *
 * Requirements:
 * - Ollama 0.15.5+ (for GLM-OCR)
 * - Models pulled: ollama pull glm-ocr, etc.
 */

import { BaseOCRProvider } from "./base-provider";
import { getGLMCommand } from "../config";
import type {
  OCROptions,
  OCRResult,
  OllamaConfig,
  HealthCheckResult,
  DocumentType,
  OllamaOCRModel,
} from "../types";

/**
 * Ollama API response type
 */
interface OllamaGenerateResponse {
  model: string;
  response: string;
  done: boolean;
  context?: number[];
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  eval_count?: number;
  eval_duration?: number;
}

/**
 * Ollama tags response type
 */
interface OllamaTagsResponse {
  models?: Array<{
    name: string;
    modified_at: string;
    size: number;
  }>;
}

export class OllamaOCRProvider extends BaseOCRProvider {
  private config: OllamaConfig;

  constructor(config: OllamaConfig) {
    super("ollama");
    this.config = config;
  }

  /**
   * Process an image using Ollama vision model
   */
  async processImage(
    image: Buffer,
    mimeType: string,
    options: OCROptions
  ): Promise<OCRResult> {
    const startTime = Date.now();
    const model = options.model || "glm-ocr";

    // Build prompt based on model
    const prompt = this.buildPrompt(model, options);

    // Convert image to base64
    const base64Image = image.toString("base64");

    // Prepare request body
    const requestBody = {
      model,
      prompt,
      images: [base64Image],
      stream: false,
      options: {
        temperature: 0.1,
        // GLM-OCR has 128K context, others typically 4K
        num_ctx: model === "glm-ocr" ? 128000 : 4096,
      },
    };

    // Call Ollama API with retry logic
    const response = await this.callWithRetry(requestBody);
    const rawText = response.response;

    // Format output based on options
    const formattedText = this.formatOutput(rawText, options);

    return this.createResult(formattedText, model, Date.now() - startTime, options);
  }

  /**
   * Call Ollama API with retry logic
   */
  private async callWithRetry(requestBody: Record<string, unknown>): Promise<OllamaGenerateResponse> {
    const maxRetries = this.config.retries ?? 2;
    const retryDelay = this.config.retryDelayMs ?? 1000;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

        const response = await fetch(`${this.config.endpoint}/api/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Ollama API error: ${response.status} - ${errorText}`);
        }

        return (await response.json()) as OllamaGenerateResponse;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry on timeout abort
        if (error instanceof Error && error.name === "AbortError") {
          throw new Error(`Ollama request timed out after ${this.config.timeout}ms`);
        }

        // Wait before retry
        if (attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, retryDelay * (attempt + 1)));
        }
      }
    }

    throw lastError || new Error("Ollama API call failed");
  }

  /**
   * Build prompt based on model type
   */
  private buildPrompt(model: string, options: OCROptions): string {
    // GLM-OCR has specific command format
    if (model === "glm-ocr" || model.startsWith("glm-ocr")) {
      const command = options.glmCommand || getGLMCommand(options.documentType || "unknown");
      return command;
    }

    // Generic prompt for other models
    const outputInstruction = this.getOutputInstruction(options);
    const languageHint = options.language ? ` The text may be in ${options.language}.` : "";

    return `Extract all text from this document image.${languageHint} ${outputInstruction}

Be thorough and accurate. Extract all visible text exactly as it appears.`;
  }

  /**
   * Get output format instruction
   */
  private getOutputInstruction(options: OCROptions): string {
    switch (options.outputFormat) {
      case "markdown":
        return "Format the output as markdown with proper headings, lists, and tables where appropriate.";
      case "json_structured":
        return "Return structured JSON with text regions and their types (text, table, figure, handwriting).";
      case "plain_text":
      default:
        return "Extract all text exactly as it appears, preserving line breaks and spacing.";
    }
  }

  /**
   * Format the output based on options
   */
  private formatOutput(rawText: string, options: OCROptions): string {
    let text = rawText.trim();

    // For GLM-OCR, the response is typically already well-formatted
    // For other models, we may need to clean up the response

    if (options.outputFormat === "markdown") {
      // Ensure proper markdown formatting
      text = this.ensureMarkdownFormat(text);
    }

    return text;
  }

  /**
   * Ensure text is properly formatted as markdown
   */
  private ensureMarkdownFormat(text: string): string {
    // Remove any leading/trailing artifacts
    text = text.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/i, "");

    // Normalize line endings
    text = text.replace(/\r\n/g, "\n");

    return text.trim();
  }

  /**
   * Health check - verify Ollama is running and has required models
   */
  async healthCheck(): Promise<HealthCheckResult> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${this.config.endpoint}/api/tags`, {
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return {
          available: false,
          error: `Ollama not responding: ${response.status}`,
        };
      }

      const data = (await response.json()) as OllamaTagsResponse;
      const models = data.models?.map((m) => m.name) || [];

      // Check for OCR-capable models
      const ocrModels = models.filter(
        (m) =>
          m.includes("glm-ocr") ||
          m.includes("moondream") ||
          m.includes("minicpm") ||
          m.includes("qwen") ||
          m.includes("llava")
      );

      return {
        available: true,
        models: ocrModels.length > 0 ? ocrModels : models,
      };
    } catch (error) {
      return {
        available: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Get supported models
   */
  getSupportedModels(): string[] {
    return [
      "glm-ocr",
      "moondream",
      "qwen3-vl:2b",
      "qwen3-vl:8b",
      "minicpm-v:2.6",
      "minicpm-v:4.5",
    ];
  }

  /**
   * Check if a specific model is available
   */
  async isModelAvailable(model: string): Promise<boolean> {
    const health = await this.healthCheck();
    if (!health.available || !health.models) {
      return false;
    }
    return health.models.some((m) => m.includes(model.split(":")[0]));
  }
}
