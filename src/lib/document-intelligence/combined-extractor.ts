/**
 * Combined Entity + Relation Extractor
 *
 * Single-pass extraction: extracts BOTH entities AND relations in one LLM call per chunk.
 *
 * WHY THIS IS FASTER:
 * - Old approach: Extract entities first (N chunks), then relations (N chunks × M entity batches)
 *   For 84 chunks and 987 entities (66 batches): 84 + (84 × 66) = 5,628 API calls
 *
 * - New approach: One call per chunk extracts everything
 *   For 84 chunks: 84 API calls (98.5% reduction!)
 *
 * HOW IT WORKS:
 * 1. Chunk the document
 * 2. For each chunk, extract entities AND relations between them in ONE call
 * 3. Merge duplicate entities across chunks
 * 4. Resolve relations to use global entity IDs
 *
 * The LLM sees full context per chunk so relations are accurate.
 */
import type {
  Entity,
  Relation,
  CombinedExtractionConfig,
  CombinedExtractionResult,
} from "./types";

interface ChunkExtraction {
  entities: Array<{
    confidence: number;
    description?: string;
    name: string;
    type: string;
  }>;
  relations: Array<{
    confidence: number;
    context: string;
    relation_type: string;
    source: string;
    target: string;
  }>;
}

const DEFAULT_MAX_CHUNK_CHARS = 5000;
const DEFAULT_CONCURRENCY = 10; // Reduced from 20 to prevent rate limiting
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_DELAY_MS = 1000;
const DEFAULT_BATCH_DELAY_MS = 500;

export class CombinedExtractor {
  private config: Required<CombinedExtractionConfig>;

  constructor(config: CombinedExtractionConfig = {}) {
    this.config = {
      apiKey: config.apiKey || process.env.OPENROUTER_API_KEY || "",
      baseUrl: config.baseUrl || "https://openrouter.ai/api/v1",
      concurrencyLimit: config.concurrencyLimit || DEFAULT_CONCURRENCY,
      maxChunkChars: config.maxChunkChars || DEFAULT_MAX_CHUNK_CHARS,
      maxTokens: config.maxTokens || 4000,
      model:
        config.model ||
        process.env.ENTITY_EXTRACTION_LLM_MODEL ||
        "xiaomi/mimo-v2-flash",
      temperature: config.temperature ?? 0.1,
      maxRetries: config.maxRetries ?? DEFAULT_MAX_RETRIES,
      retryDelayMs: config.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS,
      batchDelayMs: config.batchDelayMs ?? DEFAULT_BATCH_DELAY_MS,
    };

    if (!this.config.apiKey) {
      console.warn(
        "[CombinedExtractor] No API key provided. Extraction will fail."
      );
    }
  }

  /**
   * Check if an error is transient (should be retried)
   */
  private isTransientError(error: unknown): boolean {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return (
        message.includes("500") ||
        message.includes("502") ||
        message.includes("503") ||
        message.includes("504") ||
        message.includes("timeout") ||
        message.includes("network") ||
        message.includes("econnreset") ||
        message.includes("econnrefused")
      );
    }
    return false;
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Extract entities AND relations from document text in a single pass
   */
  async extract(
    text: string,
    fileId?: string,
    userId?: string
  ): Promise<CombinedExtractionResult> {
    const chunks = this.chunkText(text);
    console.log(
      `[CombinedExtractor] Processing ${chunks.length} chunks (single-pass extraction)`
    );

    const startTime = Date.now();

    // Process chunks in parallel with concurrency limit
    const chunkResults = await this.processChunksParallel(
      chunks,
      fileId,
      userId
    );

    console.log(
      `[CombinedExtractor] All ${chunks.length} chunks completed in ${Date.now() - startTime}ms`
    );

    // Merge and deduplicate results
    const { entities, entityNameMap } = this.mergeEntities(
      chunkResults,
      fileId,
      userId
    );
    const relations = this.mergeRelations(
      chunkResults,
      entityNameMap,
      fileId,
      userId
    );

    console.log(
      `[CombinedExtractor] Final: ${entities.length} entities, ${relations.length} relations`
    );

    return { entities, relations };
  }

  /**
   * Process chunks with controlled parallelism and batch delays
   */
  private async processChunksParallel(
    chunks: string[],
    fileId?: string,
    userId?: string
  ): Promise<ChunkExtraction[]> {
    const results: ChunkExtraction[] = [];
    const limit = this.config.concurrencyLimit;
    const batchDelay = this.config.batchDelayMs;

    // Process in batches to avoid overwhelming the API
    for (let i = 0; i < chunks.length; i += limit) {
      const batch = chunks.slice(i, i + limit);
      const batchPromises = batch.map((chunk, idx) =>
        this.extractFromChunkWithRetry(chunk, i + idx, chunks.length)
      );

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // Add delay between batches (except for last batch)
      if (i + limit < chunks.length && batchDelay > 0) {
        await this.sleep(batchDelay);
      }
    }

    return results;
  }

  /**
   * Extract from chunk with retry logic for transient errors
   */
  private async extractFromChunkWithRetry(
    chunk: string,
    chunkIndex: number,
    totalChunks: number
  ): Promise<ChunkExtraction> {
    const maxRetries = this.config.maxRetries;
    const baseDelay = this.config.retryDelayMs;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.extractFromChunk(chunk, chunkIndex, totalChunks);
      } catch (error) {
        lastError = error as Error;

        // Only retry on transient errors (5xx, network issues)
        if (this.isTransientError(error) && attempt < maxRetries) {
          const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), 10000);
          console.warn(
            `[CombinedExtractor] Chunk ${chunkIndex + 1} attempt ${attempt}/${maxRetries} failed, retrying in ${delay}ms...`
          );
          await this.sleep(delay);
          continue;
        }

        // Don't retry client errors (4xx) or if max retries reached
        break;
      }
    }

    // All retries exhausted
    console.error(
      `[CombinedExtractor] ✗ Chunk ${chunkIndex + 1} failed after ${maxRetries} retries:`,
      lastError?.message
    );
    return { entities: [], relations: [] };
  }

  /**
   * Extract entities and relations from a single chunk
   */
  private async extractFromChunk(
    chunk: string,
    chunkIndex: number,
    totalChunks: number
  ): Promise<ChunkExtraction> {
    const prompt = this.buildPrompt(chunk);

    const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
      body: JSON.stringify({
        max_tokens: this.config.maxTokens,
        messages: [
          { content: prompt.systemPrompt, role: "system" },
          { content: prompt.userPrompt, role: "user" },
        ],
        model: this.config.model,
        response_format: { type: "json_object" },
        temperature: this.config.temperature,
      }),
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://rantai.dev",
        "X-Title": "RantAI Document Intelligence",
      },
      method: "POST",
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`LLM API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;

    if (!content) {
      return { entities: [], relations: [] };
    }

    const result = this.parseResponse(content);
    console.log(
      `[CombinedExtractor] ✓ Chunk ${chunkIndex + 1}/${totalChunks}: ${result.entities.length} entities, ${result.relations.length} relations`
    );

    return result;
  }

  /**
   * Build the combined extraction prompt
   */
  private buildPrompt(text: string): {
    systemPrompt: string;
    userPrompt: string;
  } {
    const systemPrompt = `You are an expert at extracting structured knowledge from text.
Your task is to extract:
1. ENTITIES: People, organizations, locations, products, concepts, dates, events, laws, regulations, etc.
2. RELATIONS: How entities are connected (e.g., "works_for", "located_in", "regulates", "founded_by", etc.)

Output JSON with this exact structure:
{
  "entities": [
    {"name": "Entity Name", "type": "PERSON|ORG|LOCATION|DATE|EVENT|CONCEPT|REGULATION|PRODUCT|OTHER", "description": "brief description", "confidence": 0.9}
  ],
  "relations": [
    {"source": "Entity A", "target": "Entity B", "relation_type": "relationship_type", "context": "text supporting this relation", "confidence": 0.85}
  ]
}

Guidelines:
- Extract ALL meaningful entities, not just the most prominent ones
- Extract relations ONLY between entities you extracted
- Use consistent entity names (same entity = same name)
- Confidence: 0.9+ for explicit mentions, 0.7-0.9 for inferred
- relation_type should be lowercase with underscores (e.g., works_for, part_of)
- Keep context short (the phrase showing the relationship)
- Be thorough but precise`;

    const userPrompt = `Extract all entities and relations from this text:

${text}

Return ONLY valid JSON with "entities" and "relations" arrays.`;

    return { systemPrompt, userPrompt };
  }

  /**
   * Parse LLM response with robust error handling
   */
  private parseResponse(content: string): ChunkExtraction {
    let cleaned = content.trim();

    // Remove thinking tags
    cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/g, "").trim();

    // Find JSON start
    const jsonStart = cleaned.indexOf("{");
    if (jsonStart > 0) {
      cleaned = cleaned.slice(jsonStart);
    }

    // Remove code fences
    if (cleaned.startsWith("```json")) {
      cleaned = cleaned.replace(/^```json\s*/, "").replace(/\s*```$/, "");
    } else if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```\s*/, "").replace(/\s*```$/, "");
    }

    try {
      const parsed = JSON.parse(cleaned);
      return {
        entities: Array.isArray(parsed.entities) ? parsed.entities : [],
        relations: Array.isArray(parsed.relations) ? parsed.relations : [],
      };
    } catch {
      // Try to repair truncated JSON
      const repaired = this.repairTruncatedJson(cleaned);
      if (repaired) {
        return {
          entities: Array.isArray(repaired.entities) ? repaired.entities : [],
          relations: Array.isArray(repaired.relations)
            ? repaired.relations
            : [],
        };
      }
      return { entities: [], relations: [] };
    }
  }

  /**
   * Attempt to repair truncated JSON
   */
  private repairTruncatedJson(content: string): ChunkExtraction | null {
    try {
      // Count open/close brackets
      const openBraces = (content.match(/{/g) || []).length;
      const closeBraces = (content.match(/}/g) || []).length;
      const openBrackets = (content.match(/\[/g) || []).length;
      const closeBrackets = (content.match(/]/g) || []).length;

      let repaired = content.trim();

      // Remove trailing incomplete items
      repaired = repaired.replace(/,\s*$/, "");
      repaired = repaired.replace(/,\s*"[^"]*$/, "");
      repaired = repaired.replace(/,\s*{[^}]*$/, "");

      // Add missing brackets
      for (let i = 0; i < openBrackets - closeBrackets; i++) {
        repaired += "]";
      }
      for (let i = 0; i < openBraces - closeBraces; i++) {
        repaired += "}";
      }

      return JSON.parse(repaired);
    } catch {
      return null;
    }
  }

  /**
   * Merge entities from all chunks, deduplicating by name+type
   */
  private mergeEntities(
    chunkResults: ChunkExtraction[],
    fileId?: string,
    userId?: string
  ): { entities: Entity[]; entityNameMap: Map<string, string> } {
    const entityMap = new Map<string, Entity>();
    const entityNameMap = new Map<string, string>(); // normalized name -> canonical name

    for (const result of chunkResults) {
      for (const entity of result.entities) {
        const normalizedName = entity.name.toLowerCase().trim();
        const key = `${normalizedName}::${entity.type}`;

        if (entityMap.has(key)) {
          // Merge: keep higher confidence
          const existing = entityMap.get(key)!;
          if (entity.confidence > existing.confidence) {
            existing.confidence = entity.confidence;
          }
          // Track name variant
          entityNameMap.set(entity.name, existing.name);
        } else {
          const newEntity: Entity = {
            confidence: entity.confidence,
            documentId: fileId,
            id: `entity:${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            metadata: {
              description: entity.description,
              extraction_method: "combined-llm",
            },
            name: entity.name,
            type: entity.type,
          };
          entityMap.set(key, newEntity);
          entityNameMap.set(entity.name, entity.name);
          entityNameMap.set(normalizedName, entity.name);
        }
      }
    }

    return {
      entities: Array.from(entityMap.values()),
      entityNameMap,
    };
  }

  /**
   * Merge relations from all chunks, resolving entity names and deduplicating
   */
  private mergeRelations(
    chunkResults: ChunkExtraction[],
    entityNameMap: Map<string, string>,
    fileId?: string,
    userId?: string
  ): Relation[] {
    const relationMap = new Map<string, Relation>();

    for (const result of chunkResults) {
      for (const rel of result.relations) {
        // Resolve entity names to canonical names
        const sourceName =
          entityNameMap.get(rel.source) ||
          entityNameMap.get(rel.source.toLowerCase());
        const targetName =
          entityNameMap.get(rel.target) ||
          entityNameMap.get(rel.target.toLowerCase());

        // Skip if entities not found
        if (!sourceName || !targetName) {
          continue;
        }

        const key = `${sourceName}::${rel.relation_type}::${targetName}`;

        if (!relationMap.has(key)) {
          relationMap.set(key, {
            confidence: rel.confidence,
            id: `relation:${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            metadata: {
              context: rel.context,
              extraction_method: "combined-llm",
              file_id: fileId,
              source_entity: sourceName,
              target_entity: targetName,
              user_id: userId,
            },
            relation_type: rel.relation_type,
          });
        } else {
          // Keep higher confidence
          const existing = relationMap.get(key)!;
          if (rel.confidence > existing.confidence) {
            existing.confidence = rel.confidence;
          }
        }
      }
    }

    return Array.from(relationMap.values());
  }

  /**
   * Chunk text into smaller pieces
   */
  private chunkText(text: string): string[] {
    const chunks: string[] = [];
    const maxChars = this.config.maxChunkChars;

    // Split by paragraphs
    const paragraphs = text.split(/\n\n+/);
    let currentChunk = "";

    for (const paragraph of paragraphs) {
      if (paragraph.length > maxChars) {
        // Push current chunk
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

    return chunks.length > 0 ? chunks : [text.slice(0, maxChars)];
  }
}

/**
 * Helper to create combined extractor
 */
export function createCombinedExtractor(
  config?: CombinedExtractionConfig
): CombinedExtractor {
  return new CombinedExtractor(config);
}
