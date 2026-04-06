/**
 * Re-ranker Module
 *
 * Uses embedding-based re-ranking to improve search result relevance.
 * Generates embeddings for query and documents, then ranks by cosine similarity.
 */

import { generateEmbedding, generateEmbeddings } from "./embeddings";

/**
 * Re-ranker configuration
 */
export interface RerankerConfig {
  /** Number of top results to return (default: 10) */
  topK?: number;
  /** Minimum score threshold (0-1, default: 0) */
  threshold?: number;
}

/**
 * Single re-rank result
 */
export interface RerankResult {
  /** Original index in input list */
  index: number;
  /** Relevance score (0-1) */
  score: number;
  /** Original text */
  text: string;
}

/**
 * Re-rank response
 */
export interface RerankResponse {
  /** Re-ranked results */
  results: RerankResult[];
  /** Processing time in milliseconds */
  processingTimeMs: number;
}

const DEFAULT_CONFIG: Required<RerankerConfig> = {
  topK: 10,
  threshold: 0,
};

/**
 * Re-ranker class using embedding similarity
 */
export class Reranker {
  private config: Required<RerankerConfig>;

  constructor(config: RerankerConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Re-rank documents based on query relevance
   */
  async rerank(query: string, documents: string[]): Promise<RerankResponse> {
    const startTime = Date.now();

    try {
      if (documents.length === 0) {
        return {
          results: [],
          processingTimeMs: Date.now() - startTime,
        };
      }

      // 1. Generate embedding for query
      const queryEmbedding = await generateEmbedding(query);

      // 2. Generate embeddings for all documents (batch)
      const documentEmbeddings = await generateEmbeddings(documents);

      // 3. Calculate cosine similarity scores
      const scores = documentEmbeddings.map((docEmbedding) =>
        this.cosineSimilarity(queryEmbedding, docEmbedding)
      );

      // 4. Build results with scores
      const results: RerankResult[] = documents
        .map((text, index) => ({
          index,
          score: scores[index] || 0,
          text,
        }))
        .filter((r) => r.score >= this.config.threshold)
        .sort((a, b) => b.score - a.score)
        .slice(0, this.config.topK);

      return {
        results,
        processingTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      console.error("[Reranker] Re-ranking failed:", error);

      // Fallback: return original order with decaying scores
      return {
        results: documents.slice(0, this.config.topK).map((text, index) => ({
          index,
          score: 1 - index * 0.01,
          text,
        })),
        processingTimeMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Re-rank search results with their original data preserved
   */
  async rerankResults<T extends { content: string }>(
    query: string,
    results: T[]
  ): Promise<Array<T & { rerankScore: number }>> {
    if (results.length === 0) {
      return [];
    }

    const texts = results.map((r) => r.content);
    const { results: reranked } = await this.rerank(query, texts);

    // Map reranked results back to original objects
    return reranked.map((rr) => ({
      ...results[rr.index],
      rerankScore: rr.score,
    }));
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (vecA.length !== vecB.length) {
      console.warn(
        `[Reranker] Vector length mismatch: ${vecA.length} vs ${vecB.length}`
      );
      return 0;
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    if (denominator === 0) {
      return 0;
    }

    return dotProduct / denominator;
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      const result = await this.rerank("test query", ["test document"]);
      return result.results.length > 0;
    } catch {
      return false;
    }
  }
}

/**
 * Create reranker instance
 */
export function createReranker(config?: RerankerConfig): Reranker {
  return new Reranker(config);
}

/**
 * Quick rerank function
 */
export async function rerank(
  query: string,
  documents: string[],
  options?: RerankerConfig
): Promise<RerankResponse> {
  const reranker = new Reranker(options);
  return reranker.rerank(query, documents);
}

/**
 * Rerank search results
 */
export async function rerankResults<T extends { content: string }>(
  query: string,
  results: T[],
  options?: RerankerConfig
): Promise<Array<T & { rerankScore: number }>> {
  const reranker = new Reranker(options);
  return reranker.rerankResults(query, results);
}
