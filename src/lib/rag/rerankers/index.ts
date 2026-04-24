import { getRagConfig } from "../config";
import { CohereReranker } from "./cohere-reranker";
import { LlmReranker } from "./llm-reranker";
import { VllmReranker } from "./vllm-reranker";
import type { Reranker, RerankCandidate, RerankedResult } from "./types";

export type { Reranker, RerankCandidate, RerankedResult };
export { LlmReranker, CohereReranker, VllmReranker };

/**
 * Returns the configured reranker, or null if rerank is disabled.
 * Callers use `null` as "skip rerank, pass raw top-K through".
 *
 * KB_RERANK_PROVIDER selects the implementation:
 *   - "vllm"       → VllmReranker against a self-hosted /rerank sidecar
 *                    (Nemotron 1B v2 default; KB_RERANK_BASE_URL, default http://localhost:8200)
 *   - "cohere"     → CohereReranker against Cohere's managed v2/rerank API
 *                    (KB_RERANK_API_KEY or COHERE_API_KEY required)
 *   - "openrouter" → LlmReranker (LLM-as-reranker via OpenRouter chat completions)
 *   - anything else (incl. unset) → LlmReranker, for back-compat with the original default
 */
export function getDefaultReranker(): Reranker | null {
  const { rerankEnabled, rerankModel } = getRagConfig();
  if (!rerankEnabled) return null;

  const provider = (process.env.KB_RERANK_PROVIDER || "").toLowerCase();

  if (provider === "vllm") {
    const baseUrl = process.env.KB_RERANK_BASE_URL || "http://localhost:8200";
    const model = process.env.KB_RERANK_MODEL || "nvidia/llama-nemotron-rerank-1b-v2";
    return new VllmReranker(baseUrl, model);
  }

  if (provider === "cohere") {
    const model = process.env.KB_RERANK_MODEL || "rerank-v4.0-pro";
    const apiKey = process.env.KB_RERANK_API_KEY || process.env.COHERE_API_KEY || "";
    const baseUrl = process.env.KB_RERANK_BASE_URL || undefined;
    return new CohereReranker(model, apiKey, baseUrl);
  }

  return new LlmReranker(rerankModel);
}
