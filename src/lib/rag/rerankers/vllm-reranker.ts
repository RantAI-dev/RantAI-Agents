import type { Reranker, RerankCandidate, RerankedResult } from "./types";

/**
 * vLLM / FastAPI rerank sidecar provider. Calls a self-hosted /rerank endpoint
 * that matches Cohere's v2 request/response shape — no auth, configurable base
 * URL. Used to serve open-weight cross-encoder rerankers like
 * nvidia/llama-nemotron-rerank-1b-v2 next to the platform.
 *
 * On the 2026-04-24 SciFact bench (1500 docs / 300 queries), Nemotron 1B v2
 * scored hit@1 = 0.797 (vs no-rerank 0.770, vs cohere/rerank-4-pro 0.807) at
 * 265 ms/query — within 1 pt of Cohere on quality, 2.6× faster, and $0 at
 * inference. See docs/artifact-plans/reranker-bench-2026-04-24.md.
 */
export class VllmReranker implements Reranker {
  readonly name: string;
  private readonly model: string;
  private readonly endpoint: string;

  constructor(baseUrl: string, model: string) {
    if (!baseUrl) throw new Error("VllmReranker: baseUrl is required");
    this.name = model;
    this.model = model;
    this.endpoint = `${baseUrl.replace(/\/+$/, "")}/rerank`;
  }

  async rerank(
    query: string,
    candidates: RerankCandidate[],
    finalK: number
  ): Promise<RerankedResult[]> {
    if (candidates.length === 0) return [];
    if (candidates.length < finalK) {
      return candidates.map((c, i) => ({ id: c.id, finalRank: i, score: finalK - i }));
    }

    const res = await fetch(this.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        query,
        documents: candidates.map((c) => c.text),
        top_n: finalK,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`VllmReranker ${this.model} ${res.status}: ${body.slice(0, 300)}`);
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
