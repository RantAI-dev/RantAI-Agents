import type { Reranker, RerankCandidate, RerankedResult } from "./types";

const DEFAULT_ENDPOINT = "https://api.cohere.com/v2/rerank";

/**
 * Cohere rerank provider. Calls Cohere's managed rerank endpoint with the
 * configured model id (e.g. "rerank-v4.0-pro", "rerank-v4.0-fast"). Ships as
 * an alternative to LlmReranker; not the default. The 2026-04-20 SOTA audit
 * measured rerank-v3.5 at -11.4 hit@1 vs the LLM reranker, so enabling this
 * requires a per-corpus bench to justify the switch.
 */
export class CohereReranker implements Reranker {
  readonly name: string;
  private readonly model: string;
  private readonly apiKey: string;
  private readonly endpoint: string;

  constructor(model: string, apiKey: string, endpoint?: string) {
    this.name = model;
    this.model = model;
    this.apiKey = apiKey;
    this.endpoint = endpoint || DEFAULT_ENDPOINT;
  }

  async rerank(
    query: string,
    candidates: RerankCandidate[],
    finalK: number
  ): Promise<RerankedResult[]> {
    if (!this.apiKey) throw new Error("CohereReranker: apiKey is required");

    if (candidates.length === 0) return [];
    if (candidates.length < finalK) {
      return candidates.map((c, i) => ({ id: c.id, finalRank: i, score: finalK - i }));
    }

    const res = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        query,
        documents: candidates.map((c) => c.text),
        top_n: finalK,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`CohereReranker ${this.model} ${res.status}: ${body.slice(0, 300)}`);
    }

    const data = (await res.json()) as {
      results?: Array<{ index: number; relevance_score: number }>;
    };
    const results = data.results ?? [];

    const pickedIds = new Set<string>();
    const out: RerankedResult[] = [];
    for (const r of results) {
      const cand = candidates[r.index];
      if (!cand || pickedIds.has(cand.id)) continue;
      pickedIds.add(cand.id);
      out.push({ id: cand.id, finalRank: out.length, score: r.relevance_score });
      if (out.length >= finalK) break;
    }

    for (const cand of candidates) {
      if (out.length >= finalK) break;
      if (pickedIds.has(cand.id)) continue;
      pickedIds.add(cand.id);
      out.push({ id: cand.id, finalRank: out.length, score: 0 });
    }

    return out;
  }
}
