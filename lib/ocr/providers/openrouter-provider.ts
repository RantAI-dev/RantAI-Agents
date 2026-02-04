/**
 * OpenRouter OCR Provider (Fallback)
 *
 * Uses OpenRouter API for OCR when local Ollama is unavailable.
 * Default model: openai/gpt-4o-mini
 */

import { BaseOCRProvider } from "./base-provider";
import type {
  OCROptions,
  OCRResult,
  OpenRouterConfig,
  HealthCheckResult,
} from "../types";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

/**
 * OpenRouter API response type
 */
interface OpenRouterResponse {
  id: string;
  choices: Array<{
    message: {
      content: string;
      role: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class OpenRouterOCRProvider extends BaseOCRProvider {
  private config: OpenRouterConfig;

  constructor(config: OpenRouterConfig) {
    super("openrouter");
    this.config = config;
  }

  /**
   * Process an image using OpenRouter vision model
   */
  async processImage(
    image: Buffer,
    mimeType: string,
    options: OCROptions
  ): Promise<OCRResult> {
    const startTime = Date.now();

    if (!this.config.apiKey) {
      throw new Error("OpenRouter API key not configured (OPENROUTER_API_KEY)");
    }

    // Convert image to base64 data URL
    const base64Image = image.toString("base64");
    const dataUrl = `data:${mimeType};base64,${base64Image}`;

    // Build prompt
    const prompt = this.buildPrompt(options);

    // Call OpenRouter API
    const response = await fetch(OPENROUTER_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.config.model,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              {
                type: "image_url",
                image_url: { url: dataUrl },
              },
            ],
          },
        ],
        max_tokens: this.config.maxTokens || 4000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
    }

    const data = (await response.json()) as OpenRouterResponse;
    const rawText = data.choices[0]?.message?.content || "";

    // Format output
    const formattedText = this.formatOutput(rawText, options);

    return this.createResult(
      formattedText,
      this.config.model,
      Date.now() - startTime,
      options
    );
  }

  /**
   * Build prompt for OpenRouter vision model
   */
  private buildPrompt(options: OCROptions): string {
    const outputInstruction = this.getOutputInstruction(options);
    const languageHint = options.language ? ` The text may be in ${options.language}.` : "";
    const documentTypeHint = options.documentType
      ? ` This appears to be a ${options.documentType.replace("_", " ")} document.`
      : "";

    return `Analyze this document image and extract all text.${documentTypeHint}${languageHint}

${outputInstruction}

Be thorough and accurate. Extract all visible text exactly as it appears.`;
  }

  /**
   * Get output format instruction
   */
  private getOutputInstruction(options: OCROptions): string {
    switch (options.outputFormat) {
      case "markdown":
        return `Format the output as markdown:
- Use proper headings (# ## ###) for document structure
- Format tables using markdown table syntax
- Use lists where appropriate
- Preserve paragraph breaks`;
      case "json_structured":
        return `Return structured JSON with the following format:
{
  "regions": [
    { "type": "text|table|figure|handwriting", "content": "..." }
  ]
}`;
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

    // Clean up common artifacts
    text = text.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/i, "");

    return text;
  }

  /**
   * Health check - verify OpenRouter API key is configured
   */
  async healthCheck(): Promise<HealthCheckResult> {
    if (!this.config.apiKey) {
      return {
        available: false,
        error: "OpenRouter API key not configured",
      };
    }

    // We don't actually call the API for health check
    // Just verify the key is present
    return {
      available: true,
      models: [this.config.model],
    };
  }

  /**
   * Get supported models
   */
  getSupportedModels(): string[] {
    return [
      "openai/gpt-4o-mini",
      "openai/gpt-4o",
      "anthropic/claude-3-5-sonnet",
      "google/gemini-2.0-flash",
    ];
  }
}
