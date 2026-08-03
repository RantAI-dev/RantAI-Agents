import type { Reranker, RerankCandidate, RerankedResult } from "./types";

/**
 * Reranker for a Hugging Face Text-Embeddings-Inference (TEI) `/rerank`
 * endpoint — the service actually deployed on the GB10 stack
 * (ghcr.io/huggingface/text-embeddings-inference serving BAAI/bge-reranker-v2-m3).
 *
 * NOTE: this is NOT the same wire protocol as VllmReranker. TEI expects
 *   { query, texts: string[], truncate?, raw_scores? }
 * and returns a bare array  [{ index, score }, ...]  (sigmoid 0..1 by default),
 * whereas VllmReranker sends { documents, top_n } and reads { results: [...] }.
 * Pointing "vllm" at a TEI server 422s ("Failed to deserialize the JSON body")
 * and the whole rerank stage silently falls back to fused order — so text AND
 * figure reranking were dead until this was added. Select with
 * KB_RERANK_PROVIDER=tei.
 */
export class TeiReranker implements Reranker {
  readonly name: string;
  private readonly endpoint: string;

  constructor(baseUrl: string, model: string) {
    if (!baseUrl) throw new Error("TeiReranker: baseUrl is required");
    this.name = `TEI ${model}`;
    this.endpoint = `${baseUrl.replace(/\/+$/, "")}/rerank`;
  }

  async rerank(
    query: string,
    candidates: RerankCandidate[],
    finalK: number,
  ): Promise<RerankedResult[]> {
    if (candidates.length === 0) return [];

    const res = await fetch(this.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        // TEI rejects empty strings; substitute a single space so indices stay aligned.
        texts: candidates.map((c) => (c.text && c.text.trim() ? c.text : " ")),
        truncate: true, // clamp over-long chunks to the model's max tokens instead of erroring
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`TeiReranker ${this.name} ${res.status}: ${body.slice(0, 300)}`);
    }

    // TEI returns a bare array: [{ index, score }, ...], already sorted by score desc.
    const data = (await res.json()) as Array<{ index: number; score: number }>;
    const rows = Array.isArray(data) ? data : [];

    const out: RerankedResult[] = [];
    const picked = new Set<string>();
    for (const r of rows) {
      const cand = candidates[r.index];
      if (!cand || picked.has(cand.id)) continue;
      picked.add(cand.id);
      out.push({ id: cand.id, finalRank: out.length, score: r.score });
      if (out.length >= finalK) break;
    }
    // Backfill any candidates TEI didn't return (shouldn't happen) so callers
    // that map by id still resolve everything.
    for (const cand of candidates) {
      if (out.length >= finalK) break;
      if (picked.has(cand.id)) continue;
      picked.add(cand.id);
      out.push({ id: cand.id, finalRank: out.length, score: 0 });
    }
    return out;
  }
}
