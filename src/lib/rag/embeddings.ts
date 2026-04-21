/**
 * Embeddings module using OpenRouter API.
 * Model is selected via KB_EMBEDDING_MODEL env (see src/lib/rag/config.ts).
 * Default from the 2026-04-20 SOTA audit: qwen/qwen3-embedding-8b (4096d).
 *
 * Features:
 * - Retry logic with exponential backoff for transient errors
 * - Response validation before processing
 * - Batch processing with rate limiting
 */

import { getRagConfig, resolveApiKey } from "./config";
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;
const BATCH_SIZE = 128;
const EMBED_CONCURRENCY = 4;

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if an error is transient (should be retried)
 */
function isTransientError(status: number): boolean {
  return status >= 500 || status === 429;
}

/**
 * Validate embedding API response structure
 */
function validateEmbeddingResponse(data: unknown): data is { data: Array<{ embedding: number[] }> } {
  if (!data || typeof data !== "object") {
    return false;
  }

  const obj = data as Record<string, unknown>;
  if (!obj.data || !Array.isArray(obj.data)) {
    return false;
  }

  return true;
}

/**
 * Generate embeddings for a single text using OpenRouter
 * This model produces 1536-dimensional vectors
 * Includes retry logic for transient errors
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  let lastError: Error | null = null;
  const cfg = getRagConfig();
  const apiKey = resolveApiKey(cfg.embeddingApiKey);
  if (!apiKey) throw new Error("No API key configured: set KB_EMBEDDING_API_KEY or OPENROUTER_API_KEY");

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(cfg.embeddingBaseUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: cfg.embeddingModel,
          input: text,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();

        // Retry on transient errors
        if (isTransientError(response.status) && attempt < MAX_RETRIES) {
          const delay = Math.min(RETRY_DELAY_MS * Math.pow(2, attempt - 1), 10000);
          console.warn(
            `[Embeddings] Attempt ${attempt}/${MAX_RETRIES} failed (${response.status}), retrying in ${delay}ms...`
          );
          await sleep(delay);
          continue;
        }

        throw new Error(`OpenRouter embedding API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();

      // Validate response structure
      if (!validateEmbeddingResponse(data)) {
        throw new Error(`Invalid embedding response structure: ${JSON.stringify(data).slice(0, 500)}`);
      }

      if (data.data.length === 0) {
        throw new Error("Empty embedding response from API");
      }

      const item = data.data[0];
      if (!item?.embedding || !Array.isArray(item.embedding)) {
        throw new Error(`Invalid embedding item structure: ${JSON.stringify(item).slice(0, 200)}`);
      }

      return item.embedding;
    } catch (error) {
      lastError = error as Error;
      if (attempt === MAX_RETRIES) break;
    }
  }

  throw lastError || new Error("Embedding generation failed");
}

/**
 * Generate embeddings for multiple texts in batch
 * More efficient than calling generateEmbedding multiple times
 * Runs EMBED_CONCURRENCY worker tasks in parallel, each picking the next
 * unfinished batch index from a shared counter. Results are indexed by batch
 * position so output order always matches input order.
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const cfg = getRagConfig();
  const apiKey = resolveApiKey(cfg.embeddingApiKey);
  if (!apiKey) throw new Error("No API key configured: set KB_EMBEDDING_API_KEY or OPENROUTER_API_KEY");

  // Split into batches.
  const batches: string[][] = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    batches.push(texts.slice(i, i + BATCH_SIZE));
  }

  // Results indexed by batch position so output order matches input order.
  const results: number[][][] = new Array(batches.length);

  let nextIdx = 0;
  async function worker(): Promise<void> {
    while (true) {
      const idx = nextIdx++;
      if (idx >= batches.length) return;
      const batch = batches[idx];

      let lastError: Error | null = null;
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          const response = await fetch(cfg.embeddingBaseUrl, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: cfg.embeddingModel,
              input: batch,
            }),
          });

          if (!response.ok) {
            const errorText = await response.text();
            if (isTransientError(response.status) && attempt < MAX_RETRIES) {
              const delay = Math.min(RETRY_DELAY_MS * Math.pow(2, attempt - 1), 10000);
              console.warn(
                `[Embeddings] Batch ${idx + 1}/${batches.length} attempt ${attempt}/${MAX_RETRIES} failed (${response.status}), retrying in ${delay}ms...`
              );
              await sleep(delay);
              continue;
            }
            throw new Error(`OpenRouter embedding API error: ${response.status} - ${errorText}`);
          }

          const data = await response.json();
          if (!validateEmbeddingResponse(data)) {
            throw new Error(`Invalid embedding response structure: ${JSON.stringify(data).slice(0, 500)}`);
          }
          if (data.data.length === 0) {
            console.warn("[Embeddings] Received empty data array from API");
            results[idx] = [];
            break;
          }
          const embeddings = data.data.map((item: { embedding: number[] }, i: number) => {
            if (!item?.embedding || !Array.isArray(item.embedding)) {
              throw new Error(`Invalid embedding item at index ${i}: ${JSON.stringify(item).slice(0, 200)}`);
            }
            return item.embedding;
          });
          results[idx] = embeddings;
          lastError = null;
          break;
        } catch (error) {
          lastError = error as Error;
          if (attempt === MAX_RETRIES) {
            console.error(
              `[Embeddings] Batch ${idx + 1}/${batches.length} failed after ${MAX_RETRIES} retries:`,
              lastError.message
            );
          }
        }
      }
      if (lastError) throw lastError;
    }
  }

  // Run EMBED_CONCURRENCY workers in parallel.
  await Promise.all(Array.from({ length: Math.min(EMBED_CONCURRENCY, batches.length) }, () => worker()));

  // Flatten results in original order.
  const allEmbeddings: number[][] = [];
  for (const batchResult of results) allEmbeddings.push(...batchResult);
  return allEmbeddings;
}

/**
 * Calculate cosine similarity between two vectors
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error("Vectors must have the same length");
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
