import { getRagConfig } from "../config";
import { LlmReranker } from "./llm-reranker";
import type { Reranker, RerankCandidate, RerankedResult } from "./types";

export type { Reranker, RerankCandidate, RerankedResult };
export { LlmReranker };

/**
 * Returns the configured reranker, or null if rerank is disabled.
 * Callers use `null` as "skip rerank, pass raw top-K through".
 */
export function getDefaultReranker(): Reranker | null {
  const { rerankEnabled, rerankModel } = getRagConfig();
  if (!rerankEnabled) return null;
  return new LlmReranker(rerankModel);
}
