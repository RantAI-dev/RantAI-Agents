import { getRagConfig } from "../config";
import { CohereReranker } from "./cohere-reranker";
import { LlmReranker } from "./llm-reranker";
import type { Reranker, RerankCandidate, RerankedResult } from "./types";

export type { Reranker, RerankCandidate, RerankedResult };
export { LlmReranker, CohereReranker };

/**
 * Returns the configured reranker, or null if rerank is disabled.
 * Callers use `null` as "skip rerank, pass raw top-K through".
 */
export function getDefaultReranker(): Reranker | null {
  const { rerankEnabled, rerankModel } = getRagConfig();
  if (!rerankEnabled) return null;

  const provider = (process.env.KB_RERANK_PROVIDER || "").toLowerCase();
  if (provider === "cohere") {
    const model = process.env.KB_RERANK_MODEL || "rerank-v4.0-pro";
    const apiKey = process.env.KB_RERANK_API_KEY || process.env.COHERE_API_KEY || "";
    const baseUrl = process.env.KB_RERANK_BASE_URL || undefined;
    return new CohereReranker(model, apiKey, baseUrl);
  }
  return new LlmReranker(rerankModel);
}
