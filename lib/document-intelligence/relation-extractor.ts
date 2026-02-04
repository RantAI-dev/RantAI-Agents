/**
 * LLM-based Relation Extractor
 *
 * Uses LLM via OpenRouter to extract relationships between entities
 * Supports universal + domain-specific relations
 *
 * IMPORTANT: Handles token limits by:
 * 1. Batching entities into smaller groups
 * 2. Chunking text for each entity batch
 * 3. Processing batches in parallel
 * 4. Robust JSON parsing for truncated responses
 */
import type { Entity, Relation, RelationExtractionConfig } from "./types";

// Maximum entities to process per LLM call
const DEFAULT_MAX_ENTITIES_PER_BATCH = 15;
// Maximum text characters per chunk
const DEFAULT_MAX_CHUNK_CHARS = 4000;

/**
 * LLM Relation Extractor
 */
export class LLMRelationExtractor {
  private config: Required<RelationExtractionConfig>;

  constructor(config: RelationExtractionConfig = {}) {
    this.config = {
      apiKey: config.apiKey || process.env.OPENROUTER_API_KEY || "",
      baseUrl: config.baseUrl || "https://openrouter.ai/api/v1",
      maxChunkChars: config.maxChunkChars || DEFAULT_MAX_CHUNK_CHARS,
      maxEntitiesPerBatch:
        config.maxEntitiesPerBatch || DEFAULT_MAX_ENTITIES_PER_BATCH,
      maxTokens: config.maxTokens || 3000,
      model:
        config.model ||
        process.env.RELATION_EXTRACTION_LLM_MODEL ||
        "qwen/qwen3-8b",
      temperature: config.temperature ?? 0.1,
    };

    if (!this.config.apiKey) {
      console.warn(
        "[LLMRelationExtractor] No API key provided. Extraction will fail."
      );
    }
  }

  /**
   * Extract relations from text with known entities
   * Uses PARALLEL processing for speed (20+ concurrent requests)
   */
  async extract(
    text: string,
    entities: Entity[],
    fileId?: string,
    userId?: string
  ): Promise<Relation[]> {
    if (entities.length < 2) {
      return []; // Need at least 2 entities to form a relation
    }

    // Batch entities if there are too many
    const entityBatches = this.batchEntities(entities);
    // Chunk text if too long
    const textChunks = this.chunkText(text);

    // Create all batch × chunk combinations
    const tasks: Array<{
      batchIdx: number;
      chunkIdx: number;
      batch: Entity[];
      chunk: string;
    }> = [];
    for (let batchIdx = 0; batchIdx < entityBatches.length; batchIdx++) {
      for (let chunkIdx = 0; chunkIdx < textChunks.length; chunkIdx++) {
        tasks.push({
          batchIdx,
          chunkIdx,
          batch: entityBatches[batchIdx],
          chunk: textChunks[chunkIdx],
        });
      }
    }

    console.log(
      `[LLMRelationExtractor] Processing ${tasks.length} tasks (${entityBatches.length} batches × ${textChunks.length} chunks) in PARALLEL`
    );

    // Process ALL tasks in parallel
    const startTime = Date.now();
    const taskPromises = tasks.map((task) =>
      this.extractFromBatch(task.chunk, task.batch, entities, fileId, userId)
        .then((relations) => {
          console.log(
            `[LLMRelationExtractor] ✓ Batch ${task.batchIdx + 1}, chunk ${task.chunkIdx + 1} done (${relations.length} relations)`
          );
          return relations;
        })
        .catch((error) => {
          console.warn(
            `[LLMRelationExtractor] ✗ Batch ${task.batchIdx + 1}, chunk ${task.chunkIdx + 1} failed:`,
            error
          );
          return [] as Relation[];
        })
    );

    const results = await Promise.all(taskPromises);
    const allRelations = results.flat();

    console.log(
      `[LLMRelationExtractor] All ${tasks.length} tasks completed in ${Date.now() - startTime}ms`
    );

    // Deduplicate relations
    return this.deduplicateRelations(allRelations);
  }

  /**
   * Extract relations from a single batch of entities and text chunk
   */
  private async extractFromBatch(
    text: string,
    batchEntities: Entity[],
    allEntities: Entity[],
    fileId?: string,
    userId?: string
  ): Promise<Relation[]> {
    try {
      const prompt = this.buildPrompt(text, batchEntities);

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
      const finishReason = data.choices[0]?.finish_reason;

      if (!content || content.trim().length === 0) {
        console.warn("[LLMRelationExtractor] No content returned from LLM");
        return [];
      }

      // Check if response was truncated
      if (finishReason === "length") {
        console.warn(
          "[LLMRelationExtractor] Response truncated due to token limit, attempting partial parse"
        );
      }

      // Parse JSON with robust error handling
      const relations = this.parseRelationsFromResponse(
        content,
        allEntities,
        fileId,
        userId
      );
      return relations;
    } catch (error) {
      console.error("[LLMRelationExtractor] Extraction failed:", error);
      return [];
    }
  }

  /**
   * Batch entities into smaller groups
   */
  private batchEntities(entities: Entity[]): Entity[][] {
    const batches: Entity[][] = [];
    const batchSize = this.config.maxEntitiesPerBatch;

    for (let i = 0; i < entities.length; i += batchSize) {
      batches.push(entities.slice(i, i + batchSize));
    }

    return batches;
  }

  /**
   * Chunk text into smaller pieces
   */
  private chunkText(text: string): string[] {
    if (text.length <= this.config.maxChunkChars) {
      return [text];
    }

    const chunks: string[] = [];
    const maxChars = this.config.maxChunkChars;

    // Split by paragraphs
    const paragraphs = text.split(/\n\n+/);
    let currentChunk = "";

    for (const paragraph of paragraphs) {
      if (paragraph.length > maxChars) {
        // Large paragraph - split by sentences
        if (currentChunk) {
          chunks.push(currentChunk.trim());
          currentChunk = "";
        }
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

    return chunks;
  }

  /**
   * Parse relations from LLM response with robust error handling
   */
  private parseRelationsFromResponse(
    content: string,
    entities: Entity[],
    fileId?: string,
    userId?: string
  ): Relation[] {
    // Clean response
    let cleanedContent = content.trim();

    // Remove thinking tags
    cleanedContent = cleanedContent.replace(/<think>[\s\S]*?<\/think>/g, "").trim();

    // Remove leading garbage
    const jsonStart = cleanedContent.indexOf("{");
    if (jsonStart > 0) {
      cleanedContent = cleanedContent.slice(jsonStart);
    }

    // Remove markdown code fences
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
      console.warn("[LLMRelationExtractor] JSON parse failed, attempting repair");
      parsed = this.repairTruncatedJson(cleanedContent);
    }

    if (!parsed) {
      console.error("[LLMRelationExtractor] Could not parse or repair JSON");
      return [];
    }

    const relations: Relation[] = [];

    if (parsed.relations && Array.isArray(parsed.relations)) {
      for (const rel of parsed.relations) {
        // Skip incomplete relations
        if (!rel.source_entity || !rel.target_entity || !rel.relation_type)
          continue;

        // Create relation with metadata for later ID assignment
        relations.push({
          confidence: typeof rel.confidence === "number" ? rel.confidence : 0.8,
          metadata: {
            context: rel.context || "",
            description: rel.description || "",
            source_entity: rel.source_entity,
            target_entity: rel.target_entity,
            file_id: fileId,
            user_id: userId,
            extraction_method: "llm",
          },
          relation_type: rel.relation_type,
        });
      }
    }

    console.log(`[LLMRelationExtractor] Extracted ${relations.length} relations`);
    return relations;
  }

  /**
   * Attempt to repair truncated JSON
   */
  private repairTruncatedJson(
    content: string
  ): { relations: Array<Record<string, unknown>> } | null {
    try {
      const relationsMatch = content.match(/"relations"\s*:\s*\[/);
      if (!relationsMatch) {
        return null;
      }

      const arrayStart = content.indexOf("[", relationsMatch.index);
      const arrayContent = content.slice(arrayStart + 1);

      const relations: Array<Record<string, unknown>> = [];
      let depth = 0;
      let currentRelation = "";
      let inString = false;
      let escapeNext = false;

      for (let i = 0; i < arrayContent.length; i++) {
        const char = arrayContent[i];

        if (escapeNext) {
          currentRelation += char;
          escapeNext = false;
          continue;
        }

        if (char === "\\") {
          currentRelation += char;
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
              currentRelation += char;
              try {
                const parsed = JSON.parse(currentRelation.trim());
                if (
                  parsed.source_entity &&
                  parsed.target_entity &&
                  parsed.relation_type
                ) {
                  relations.push(parsed);
                }
              } catch {
                // Skip invalid relation
              }
              currentRelation = "";
              continue;
            }
          }
        }

        if (depth > 0) {
          currentRelation += char;
        }
      }

      console.log(
        `[LLMRelationExtractor] Repaired JSON, recovered ${relations.length} relations`
      );
      return { relations };
    } catch (error) {
      console.error("[LLMRelationExtractor] JSON repair failed:", error);
      return null;
    }
  }

  /**
   * Deduplicate relations
   */
  private deduplicateRelations(relations: Relation[]): Relation[] {
    const seen = new Map<string, Relation>();

    for (const relation of relations) {
      const key = `${relation.metadata?.source_entity}:${relation.relation_type}:${relation.metadata?.target_entity}`;

      if (!seen.has(key)) {
        seen.set(key, relation);
      } else {
        // Keep relation with higher confidence
        const existing = seen.get(key)!;
        if (relation.confidence > existing.confidence) {
          seen.set(key, relation);
        }
      }
    }

    return Array.from(seen.values());
  }

  /**
   * Build relation extraction prompt - optimized for token efficiency
   */
  private buildPrompt(
    text: string,
    entities: Entity[]
  ): { systemPrompt: string; userPrompt: string } {
    // Create compact entity list
    const entityList = entities.map((e) => `${e.name} (${e.type})`).join(", ");

    const systemPrompt = `You are a relation extraction system. Find relationships between entities and return ONLY valid JSON.

Relation Types:
- MENTIONS, RELATED_TO, PART_OF, CONTAINS, CITES, LOCATED_IN, WORKS_FOR, CREATED_BY, OWNED_BY
- Legal: REFINES, IMPLEMENTS, SUPERSEDES, APPLIES_TO, REQUIRES, PENALIZES
- Financial: TRANSFERS, PAYS, RECEIVES
- Technical: CALLS, RETURNS, THROWS, DEPENDS_ON

IMPORTANT:
- Return ONLY valid JSON, no other text
- Only use entity names from the provided list
- Keep context SHORT (max 80 chars)
- Limit to TOP 20 most important relations

JSON format:
{"relations":[{"source_entity":"...","target_entity":"...","relation_type":"...","confidence":0.9,"context":"..."}]}`;

    // Truncate text if too long
    const truncatedText =
      text.length > this.config.maxChunkChars
        ? text.slice(0, this.config.maxChunkChars) + "...[truncated]"
        : text;

    const userPrompt = `Entities: ${entityList}

Text:
${truncatedText}

Find relationships between the entities listed above.`;

    return { systemPrompt, userPrompt };
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      const dummyEntities: Entity[] = [
        {
          confidence: 1,
          metadata: {},
          name: "John",
          type: "Person",
        },
        {
          confidence: 1,
          metadata: {},
          name: "Acme Corp",
          type: "Organization",
        },
      ];
      const result = await this.extractFromBatch(
        "John works for Acme Corp.",
        dummyEntities,
        dummyEntities
      );
      return result.length > 0;
    } catch {
      return false;
    }
  }
}

/**
 * Helper to create LLM relation extractor
 */
export function createLLMRelationExtractor(
  config?: RelationExtractionConfig
): LLMRelationExtractor {
  return new LLMRelationExtractor(config);
}
