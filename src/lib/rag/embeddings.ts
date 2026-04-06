/**
 * Embeddings module using OpenRouter API
 * Uses OpenAI's text-embedding-3-small model via OpenRouter
 *
 * Features:
 * - Retry logic with exponential backoff for transient errors
 * - Response validation before processing
 * - Batch processing with rate limiting
 */

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/embeddings";
const EMBEDDING_MODEL = "openai/text-embedding-3-small";
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;
const BATCH_SIZE = 50; // Reduced from 100 to prevent rate limiting

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

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(OPENROUTER_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: EMBEDDING_MODEL,
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
 * Includes retry logic and response validation
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) {
    return [];
  }

  const allEmbeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await fetch(OPENROUTER_API_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: EMBEDDING_MODEL,
            input: batch,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();

          // Retry on transient errors
          if (isTransientError(response.status) && attempt < MAX_RETRIES) {
            const delay = Math.min(RETRY_DELAY_MS * Math.pow(2, attempt - 1), 10000);
            console.warn(
              `[Embeddings] Batch ${Math.floor(i / BATCH_SIZE) + 1} attempt ${attempt}/${MAX_RETRIES} failed (${response.status}), retrying in ${delay}ms...`
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
          console.warn("[Embeddings] Received empty data array from API");
          // Continue with empty array rather than failing
          break;
        }

        // Validate each item before mapping
        const embeddings = data.data.map((item: { embedding: number[] }, idx: number) => {
          if (!item?.embedding || !Array.isArray(item.embedding)) {
            throw new Error(
              `Invalid embedding item at index ${idx}: ${JSON.stringify(item).slice(0, 200)}`
            );
          }
          return item.embedding;
        });

        allEmbeddings.push(...embeddings);
        lastError = null;
        break; // Success, exit retry loop

      } catch (error) {
        lastError = error as Error;
        if (attempt === MAX_RETRIES) {
          console.error(
            `[Embeddings] Batch ${Math.floor(i / BATCH_SIZE) + 1} failed after ${MAX_RETRIES} retries:`,
            lastError.message
          );
        }
      }
    }

    // If all retries failed for this batch, throw
    if (lastError) {
      throw lastError;
    }

    // Small delay between batches to prevent rate limiting
    if (i + BATCH_SIZE < texts.length) {
      await sleep(100);
    }
  }

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
