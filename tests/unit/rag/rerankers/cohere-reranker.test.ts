import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CohereReranker } from "@/lib/rag/rerankers/cohere-reranker";

describe("CohereReranker", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn() as any;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("sends {model, query, documents, top_n} and orders by returned indices", async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [
          { index: 2, relevance_score: 0.98 },
          { index: 0, relevance_score: 0.55 },
          { index: 1, relevance_score: 0.12 },
        ],
      }),
    });

    const reranker = new CohereReranker("rerank-v4.0-pro", "test-key");
    const result = await reranker.rerank(
      "what is X",
      [
        { id: "a", text: "irrelevant", originalRank: 0, originalScore: 0.9 },
        { id: "b", text: "also nope", originalRank: 1, originalScore: 0.85 },
        { id: "c", text: "X is the answer", originalRank: 2, originalScore: 0.8 },
      ],
      3
    );

    expect(result.map((r) => r.id)).toEqual(["c", "a", "b"]);
    expect(result[0].finalRank).toBe(0);
    expect(result[0].score).toBeCloseTo(0.98);

    const call = (global.fetch as any).mock.calls[0];
    expect(call[0]).toBe("https://api.cohere.com/v2/rerank");
    expect(call[1].headers.Authorization).toBe("Bearer test-key");
    const body = JSON.parse(call[1].body);
    expect(body.model).toBe("rerank-v4.0-pro");
    expect(body.query).toBe("what is X");
    expect(body.top_n).toBe(3);
    expect(body.documents).toEqual(["irrelevant", "also nope", "X is the answer"]);
  });

  it("honors a custom endpoint", async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [{ index: 0, relevance_score: 0.9 }] }),
    });
    const reranker = new CohereReranker("rerank-v4.0-pro", "k", "http://proxy/rerank");
    await reranker.rerank(
      "q",
      [
        { id: "a", text: "a", originalRank: 0, originalScore: 1 },
        { id: "b", text: "b", originalRank: 1, originalScore: 1 },
        { id: "c", text: "c", originalRank: 2, originalScore: 1 },
      ],
      3
    );
    expect((global.fetch as any).mock.calls[0][0]).toBe("http://proxy/rerank");
  });

  it("fills to finalK with original-order leftovers when Cohere returns fewer", async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [{ index: 2, relevance_score: 0.9 }] }),
    });
    const reranker = new CohereReranker("rerank-v4.0-pro", "k");
    const cands = [
      { id: "a", text: "a", originalRank: 0, originalScore: 0.9 },
      { id: "b", text: "b", originalRank: 1, originalScore: 0.8 },
      { id: "c", text: "c", originalRank: 2, originalScore: 0.7 },
      { id: "d", text: "d", originalRank: 3, originalScore: 0.6 },
    ];
    const result = await reranker.rerank("q", cands, 3);
    expect(result.length).toBe(3);
    expect(result[0].id).toBe("c");
    expect(result.slice(1).map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("short-circuits when candidates < finalK (no API call)", async () => {
    const reranker = new CohereReranker("rerank-v4.0-pro", "k");
    const cands = [
      { id: "a", text: "a", originalRank: 0, originalScore: 0.9 },
      { id: "b", text: "b", originalRank: 1, originalScore: 0.8 },
    ];
    const result = await reranker.rerank("q", cands, 5);
    expect(result.map((r) => r.id)).toEqual(["a", "b"]);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("throws on API error", async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => "unauthorized",
    });
    const reranker = new CohereReranker("rerank-v4.0-pro", "bad-key");
    await expect(
      reranker.rerank(
        "q",
        [
          { id: "a", text: "a", originalRank: 0, originalScore: 0.9 },
          { id: "b", text: "b", originalRank: 1, originalScore: 0.8 },
          { id: "c", text: "c", originalRank: 2, originalScore: 0.7 },
        ],
        2
      )
    ).rejects.toThrow(/401/);
  });

  it("throws when apiKey is empty", async () => {
    const reranker = new CohereReranker("rerank-v4.0-pro", "");
    await expect(
      reranker.rerank(
        "q",
        [
          { id: "a", text: "a", originalRank: 0, originalScore: 0.9 },
          { id: "b", text: "b", originalRank: 1, originalScore: 0.8 },
          { id: "c", text: "c", originalRank: 2, originalScore: 0.7 },
        ],
        2
      )
    ).rejects.toThrow(/apiKey/);
  });
});

describe("getDefaultReranker (cohere provider)", () => {
  const originalEnv = { ...process.env };
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns CohereReranker when KB_RERANK_PROVIDER=cohere", async () => {
    process.env.KB_RERANK_ENABLED = "true";
    process.env.KB_RERANK_PROVIDER = "cohere";
    process.env.KB_RERANK_API_KEY = "cohere-test-key";
    delete process.env.KB_RERANK_MODEL;

    const { getDefaultReranker, CohereReranker: C } = await import("@/lib/rag/rerankers");
    const r = getDefaultReranker();
    expect(r).toBeInstanceOf(C);
    expect(r?.name).toBe("rerank-v4.0-pro");
  });

  it("falls back to COHERE_API_KEY when KB_RERANK_API_KEY is unset", async () => {
    process.env.KB_RERANK_ENABLED = "true";
    process.env.KB_RERANK_PROVIDER = "cohere";
    delete process.env.KB_RERANK_API_KEY;
    process.env.COHERE_API_KEY = "fallback-key";

    const { getDefaultReranker } = await import("@/lib/rag/rerankers");
    const r = getDefaultReranker();
    expect(r).not.toBeNull();
  });

  it("still returns LlmReranker when KB_RERANK_PROVIDER is absent", async () => {
    process.env.KB_RERANK_ENABLED = "true";
    delete process.env.KB_RERANK_PROVIDER;
    process.env.KB_RERANK_MODEL = "openai/gpt-4.1-nano";
    const { getDefaultReranker, LlmReranker } = await import("@/lib/rag/rerankers");
    expect(getDefaultReranker()).toBeInstanceOf(LlmReranker);
  });
});
