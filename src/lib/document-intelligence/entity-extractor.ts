/**
 * LLM-based Entity Extractor
 *
 * Uses LLM (xiaomi/mimo-v2-flash via OpenRouter) to extract semantic entities from text.
 * Handles large documents by chunking and processing in parallel.
 * Includes robust JSON parsing for handling truncated responses.
 */

import { Entity, LLMExtractionConfig } from "./types";

const DEFAULT_CONFIG: Required<LLMExtractionConfig> = {
  apiKey: process.env.OPENROUTER_API_KEY || "",
  baseUrl: "https://openrouter.ai/api/v1",
  model: "xiaomi/mimo-v2-flash", // Same model as chat
  maxTokens: 4000,
  temperature: 0.1,
  maxChunkChars: 6000, // ~1500 tokens per chunk
};

// Approximate tokens per character ratio
const CHARS_PER_TOKEN = 4;
// Maximum input tokens to leave room for output
const MAX_INPUT_TOKENS = 4000;
// Maximum characters for input text
const MAX_INPUT_CHARS = MAX_INPUT_TOKENS * CHARS_PER_TOKEN;

/**
 * LLM Entity Extractor
 */
export class LLMEntityExtractor {
  private config: Required<LLMExtractionConfig>;

  constructor(config: LLMExtractionConfig = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      apiKey: config.apiKey || process.env.OPENROUTER_API_KEY || "",
    };

    if (!this.config.apiKey) {
      console.warn(
        "[LLMEntityExtractor] No API key provided. Extraction will fail."
      );
    }
  }

  /**
   * Extract entities using LLM with automatic chunking for large texts
   */
  async extract(
    text: string,
    documentId?: string,
    chunkId?: string
  ): Promise<Entity[]> {
    // If text is small enough, process directly
    if (text.length <= MAX_INPUT_CHARS) {
      return this.extractFromChunk(text, documentId, chunkId);
    }

    // For large texts, chunk and process in parallel
    console.log(
      `[LLMEntityExtractor] Text too large (${text.length} chars), chunking into pieces`
    );
    const chunks = this.chunkText(text);
    console.log(
      `[LLMEntityExtractor] Processing ${chunks.length} chunks in parallel`
    );

    // Process all chunks in parallel
    const startTime = Date.now();
    const chunkPromises = chunks.map((chunk, i) =>
      this.extractFromChunk(chunk, documentId, chunkId)
        .then((entities) => {
          console.log(
            `[LLMEntityExtractor] Chunk ${i + 1}/${chunks.length} done (${entities.length} entities)`
          );
          return entities;
        })
        .catch((error) => {
          console.warn(`[LLMEntityExtractor] Chunk ${i + 1} failed:`, error);
          return [] as Entity[];
        })
    );

    const results = await Promise.all(chunkPromises);
    const allEntities = results.flat();

    console.log(
      `[LLMEntityExtractor] All ${chunks.length} chunks completed in ${Date.now() - startTime}ms`
    );

    // Deduplicate entities by name+type
    return this.deduplicateEntities(allEntities);
  }

  /**
   * Extract entities from a single chunk
   */
  private async extractFromChunk(
    text: string,
    documentId?: string,
    chunkId?: string
  ): Promise<Entity[]> {
    try {
      const prompt = this.buildPrompt(text);

      const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://rantai.com",
          "X-Title": "RantAI Document Intelligence",
        },
        body: JSON.stringify({
          model: this.config.model,
          messages: [
            { role: "system", content: prompt.systemPrompt },
            { role: "user", content: prompt.userPrompt },
          ],
          max_tokens: this.config.maxTokens,
          temperature: this.config.temperature,
          response_format: { type: "json_object" },
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`LLM API error: ${response.status} - ${error}`);
      }

      const data = await response.json();
      const content = data.choices[0]?.message?.content;
      const finishReason = data.choices[0]?.finish_reason;

      if (!content) {
        throw new Error("No content returned from LLM");
      }

      // Check if response was truncated
      if (finishReason === "length") {
        console.warn(
          "[LLMEntityExtractor] Response truncated due to token limit, attempting partial parse"
        );
      }

      // Parse JSON with robust error handling
      return this.parseEntitiesFromResponse(content, documentId, chunkId);
    } catch (error) {
      console.error("[LLMEntityExtractor] Extraction failed:", error);
      return [];
    }
  }

  /**
   * Chunk text into smaller pieces for processing
   */
  private chunkText(text: string): string[] {
    const chunks: string[] = [];
    const maxChars = this.config.maxChunkChars;

    // Split by paragraphs first
    const paragraphs = text.split(/\n\n+/);
    let currentChunk = "";

    for (const paragraph of paragraphs) {
      // If single paragraph is too large, split by sentences
      if (paragraph.length > maxChars) {
        if (currentChunk) {
          chunks.push(currentChunk.trim());
          currentChunk = "";
        }
        // Split large paragraph by sentences
        const sentences = paragraph.split(/(?<=[.!?])\s+/);
        for (const sentence of sentences) {
          if (currentChunk.length + sentence.length > maxChars) {
            if (currentChunk) {
              chunks.push(currentChunk.trim());
            }
            // If single sentence is too large, truncate
            currentChunk =
              sentence.length > maxChars ? sentence.slice(0, maxChars) : sentence;
          } else {
            currentChunk += (currentChunk ? " " : "") + sentence;
          }
        }
      } else if (currentChunk.length + paragraph.length > maxChars) {
        chunks.push(currentChunk.trim());
        currentChunk = paragraph;
      } else {
        currentChunk += (currentChunk ? "\n\n" : "") + paragraph;
      }
    }

    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }

  /**
   * Parse entities from LLM response with robust error handling
   */
  private parseEntitiesFromResponse(
    content: string,
    documentId?: string,
    chunkId?: string
  ): Entity[] {
    // Clean response
    let cleanedContent = content.trim();

    // Remove thinking tags if present (some models include these)
    cleanedContent = cleanedContent
      .replace(/<think>[\s\S]*?<\/think>/g, "")
      .trim();

    // Remove any leading non-JSON content
    const jsonStart = cleanedContent.indexOf("{");
    if (jsonStart > 0) {
      console.warn(
        `[LLMEntityExtractor] Removing ${jsonStart} chars of leading content`
      );
      cleanedContent = cleanedContent.slice(jsonStart);
    }

    // Remove markdown code fences if present
    if (cleanedContent.startsWith("```json")) {
      cleanedContent = cleanedContent
        .replace(/^```json\s*/, "")
        .replace(/\s*```$/, "");
    } else if (cleanedContent.startsWith("```")) {
      cleanedContent = cleanedContent
        .replace(/^```\s*/, "")
        .replace(/\s*```$/, "");
    }

    // Try to parse JSON
    let parsed;
    try {
      parsed = JSON.parse(cleanedContent);
    } catch {
      // JSON parse failed - try to repair truncated JSON
      console.warn(
        "[LLMEntityExtractor] JSON parse failed, attempting repair"
      );
      parsed = this.repairTruncatedJson(cleanedContent);
    }

    if (!parsed) {
      console.error("[LLMEntityExtractor] Could not parse or repair JSON");
      return [];
    }

    const entities: Entity[] = [];

    // Convert to Entity format
    if (parsed.entities && Array.isArray(parsed.entities)) {
      for (const ent of parsed.entities) {
        // Skip incomplete entities
        if (!ent.name || !ent.type) continue;

        entities.push({
          name: ent.name,
          type: ent.type,
          confidence: typeof ent.confidence === "number" ? ent.confidence : 0.8,
          documentId,
          chunkId,
          metadata: {
            context: ent.context || "",
            description: ent.description || "",
            ...ent.metadata,
          },
        });
      }
    }

    console.log(`[LLMEntityExtractor] Extracted ${entities.length} entities`);
    return entities;
  }

  /**
   * Attempt to repair truncated JSON by closing open brackets
   */
  private repairTruncatedJson(
    content: string
  ): { entities: Record<string, unknown>[] } | null {
    try {
      // Find the entities array
      const entitiesMatch = content.match(/"entities"\s*:\s*\[/);
      if (!entitiesMatch || entitiesMatch.index === undefined) {
        console.error("[LLMEntityExtractor] No entities array found");
        return null;
      }

      const arrayStart = content.indexOf("[", entitiesMatch.index);
      const arrayContent = content.slice(arrayStart + 1);

      // Find all complete entity objects
      const entities: Record<string, unknown>[] = [];
      let depth = 0;
      let currentEntity = "";
      let inString = false;
      let escapeNext = false;

      for (let i = 0; i < arrayContent.length; i++) {
        const char = arrayContent[i];

        if (escapeNext) {
          currentEntity += char;
          escapeNext = false;
          continue;
        }

        if (char === "\\") {
          currentEntity += char;
          escapeNext = true;
          continue;
        }

        if (char === '"') {
          inString = !inString;
        }

        if (!inString) {
          if (char === "{") {
            depth++;
          } else if (char === "}") {
            depth--;
            if (depth === 0) {
              currentEntity += char;
              try {
                const parsed = JSON.parse(currentEntity.trim());
                if (parsed.name && parsed.type) {
                  entities.push(parsed);
                }
              } catch {
                // Skip invalid entity
              }
              currentEntity = "";
              continue;
            }
          }
        }

        if (depth > 0) {
          currentEntity += char;
        }
      }

      console.log(
        `[LLMEntityExtractor] Repaired JSON, recovered ${entities.length} entities`
      );
      return { entities };
    } catch (error) {
      console.error("[LLMEntityExtractor] JSON repair failed:", error);
      return null;
    }
  }

  /**
   * Deduplicate entities by name+type
   */
  private deduplicateEntities(entities: Entity[]): Entity[] {
    const seen = new Map<string, Entity>();

    for (const entity of entities) {
      const key = `${entity.type}:${entity.name.toLowerCase()}`;

      if (!seen.has(key)) {
        seen.set(key, entity);
      } else {
        // Keep entity with higher confidence
        const existing = seen.get(key)!;
        if (entity.confidence > existing.confidence) {
          seen.set(key, entity);
        }
      }
    }

    return Array.from(seen.values());
  }

  /**
   * Build extraction prompt
   */
  private buildPrompt(text: string): {
    systemPrompt: string;
    userPrompt: string;
  } {
    const systemPrompt = `You are an entity extraction system. Extract entities and return ONLY valid JSON.

Entity Types:
- Person, Organization, Location, Date, Event, Concept, Product, Number
- Technology, API, Function, Error
- Transaction, Account, Currency

IMPORTANT:
- Return ONLY valid JSON, no other text
- Keep descriptions SHORT (max 50 chars)
- Keep context SHORT (max 100 chars)
- Limit to TOP 30 most important entities per chunk

JSON format:
{"entities":[{"name":"...","type":"...","confidence":0.9,"context":"...","description":"..."}]}`;

    // Truncate text if still too long
    const truncatedText =
      text.length > this.config.maxChunkChars
        ? text.slice(0, this.config.maxChunkChars) + "...[truncated]"
        : text;

    const userPrompt = `Extract entities from this text:\n\n${truncatedText}`;

    return { systemPrompt, userPrompt };
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      const result = await this.extractFromChunk(
        "Test person John works at Acme Corp."
      );
      return result.length > 0;
    } catch {
      return false;
    }
  }
}

/**
 * Helper to create LLM extractor
 */
export function createLLMExtractor(
  config?: LLMExtractionConfig
): LLMEntityExtractor {
  return new LLMEntityExtractor(config);
}

/**
 * Helper to extract entities with LLM
 */
export async function extractEntitiesWithLLM(
  text: string,
  documentId?: string,
  chunkId?: string,
  config?: LLMExtractionConfig
): Promise<Entity[]> {
  const extractor = new LLMEntityExtractor(config);
  return extractor.extract(text, documentId, chunkId);
}
