import type { Reranker, RerankCandidate, RerankedResult } from "./types";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const CANDIDATE_TEXT_LIMIT = 400;

/**
 * LLM-as-reranker. Sends a numbered list of candidate passages to the configured
 * chat model and parses back a JSON array of indices. Measured +5.7 pts hit@1
 * vs no-rerank, +11.4 pts vs cohere/rerank-v3.5 on the 2026-04-20 SOTA audit
 * with qwen/qwen3-embedding-8b as the retriever.
 *
 * Deterministic (temperature=0). If the model returns fewer than finalK usable
 * indices, the result is filled from the original order so callers always get
 * exactly finalK items.
 */
export class LlmReranker implements Reranker {
  readonly name: string;
  private readonly model: string;

  constructor(model: string) {
    this.name = model;
    this.model = model;
  }

  async rerank(
    query: string,
    candidates: RerankCandidate[],
    finalK: number
  ): Promise<RerankedResult[]> {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set");

    if (candidates.length === 0) return [];
    // Only short-circuit when strictly fewer candidates than requested — we
    // still want to reorder when counts are equal.
    if (candidates.length < finalK) {
      return candidates.map((c, i) => ({ id: c.id, finalRank: i, score: finalK - i }));
    }

    const numbered = candidates
      .map(
        (c, i) =>
          `[${i}] ${c.text.slice(0, CANDIDATE_TEXT_LIMIT).replace(/\n/g, " ")}`
      )
      .join("\n\n");
    const prompt = `You are a retrieval reranker. Given a query and candidate passages, output the indices of the top ${finalK} most relevant passages in descending order of relevance, as a JSON array of integers. Output ONLY the JSON array.

Query: ${query}

Passages:
${numbered}

Top ${finalK} indices:`;

    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 200,
        temperature: 0,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`LlmReranker ${this.model} ${res.status}: ${body.slice(0, 300)}`);
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = data.choices?.[0]?.message?.content ?? "";
    const match = raw.match(/\[[\d,\s]+\]/);

    let picked: number[] = [];
    if (match) {
      try {
        picked = JSON.parse(match[0]);
      } catch {
        picked = [];
      }
    }

    const pickedIds = new Set<string>();
    const out: RerankedResult[] = [];
    for (const idx of picked) {
      const cand = candidates[idx];
      if (!cand || pickedIds.has(cand.id)) continue;
      pickedIds.add(cand.id);
      out.push({ id: cand.id, finalRank: out.length, score: finalK - out.length });
      if (out.length >= finalK) break;
    }

    // Fill with remaining candidates in original rank order.
    for (const cand of candidates) {
      if (out.length >= finalK) break;
      if (pickedIds.has(cand.id)) continue;
      pickedIds.add(cand.id);
      out.push({ id: cand.id, finalRank: out.length, score: finalK - out.length });
    }

    return out;
  }
}
