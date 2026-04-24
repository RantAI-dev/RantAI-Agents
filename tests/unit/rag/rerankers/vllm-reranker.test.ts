import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { VllmReranker } from "@/lib/rag/rerankers/vllm-reranker";

describe("VllmReranker", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn() as any;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("posts {query, documents, top_n} to ${baseUrl}/rerank with no auth header", async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [
          { index: 2, relevance_score: 12.5 },
          { index: 0, relevance_score: 1.1 },
          { index: 1, relevance_score: -3.4 },
        ],
      }),
    });

    const reranker = new VllmReranker("http://localhost:8200", "nvidia/llama-nemotron-rerank-1b-v2");
    const result = await reranker.rerank(
      "what is photosynthesis",
      [
        { id: "a", text: "irrelevant", originalRank: 0, originalScore: 0.9 },
        { id: "b", text: "also nope", originalRank: 1, originalScore: 0.8 },
        { id: "c", text: "Photosynthesis converts sunlight to energy.", originalRank: 2, originalScore: 0.7 },
      ],
      3
    );

    expect(result.map((r) => r.id)).toEqual(["c", "a", "b"]);
    expect(result[0].finalRank).toBe(0);
    expect(result[0].score).toBeCloseTo(12.5);

    const call = (global.fetch as any).mock.calls[0];
    expect(call[0]).toBe("http://localhost:8200/rerank");
    // No Authorization header for local sidecar.
    expect(call[1].headers.Authorization).toBeUndefined();
    const body = JSON.parse(call[1].body);
    expect(body.query).toBe("what is photosynthesis");
    expect(body.top_n).toBe(3);
    expect(body.documents).toEqual(["irrelevant", "also nope", "Photosynthesis converts sunlight to energy."]);
    // model is sent for sidecar logging but the sidecar is single-model so it's optional.
    expect(body.model).toBe("nvidia/llama-nemotron-rerank-1b-v2");
  });

  it("strips trailing slash from baseUrl", async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [{ index: 0, relevance_score: 0.9 }] }),
    });
    const reranker = new VllmReranker("http://localhost:8200/", "x");
    await reranker.rerank(
      "q",
      [
        { id: "a", text: "a", originalRank: 0, originalScore: 1 },
        { id: "b", text: "b", originalRank: 1, originalScore: 1 },
        { id: "c", text: "c", originalRank: 2, originalScore: 1 },
      ],
      3
    );
    expect((global.fetch as any).mock.calls[0][0]).toBe("http://localhost:8200/rerank");
  });

  it("fills to finalK with original-order leftovers when sidecar returns fewer", async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [{ index: 2, relevance_score: 9.9 }] }),
    });
    const reranker = new VllmReranker("http://localhost:8200", "m");
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

  it("short-circuits when candidates < finalK (no HTTP call)", async () => {
    const reranker = new VllmReranker("http://localhost:8200", "m");
    const cands = [
      { id: "a", text: "a", originalRank: 0, originalScore: 0.9 },
      { id: "b", text: "b", originalRank: 1, originalScore: 0.8 },
    ];
    const result = await reranker.rerank("q", cands, 5);
    expect(result.map((r) => r.id)).toEqual(["a", "b"]);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("throws on sidecar error", async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 503,
      text: async () => "model loading",
    });
    const reranker = new VllmReranker("http://localhost:8200", "m");
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
    ).rejects.toThrow(/503/);
  });

  it("throws when baseUrl is empty", () => {
    expect(() => new VllmReranker("", "m")).toThrow(/baseUrl/);
  });
});

describe("getDefaultReranker (vllm provider)", () => {
  const originalEnv = { ...process.env };
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns VllmReranker when KB_RERANK_PROVIDER=vllm", async () => {
    process.env.KB_RERANK_ENABLED = "true";
    process.env.KB_RERANK_PROVIDER = "vllm";
    process.env.KB_RERANK_BASE_URL = "http://localhost:9999";
    process.env.KB_RERANK_MODEL = "nvidia/llama-nemotron-rerank-1b-v2";

    const { getDefaultReranker, VllmReranker: V } = await import("@/lib/rag/rerankers");
    const r = getDefaultReranker();
    expect(r).toBeInstanceOf(V);
    expect(r?.name).toBe("nvidia/llama-nemotron-rerank-1b-v2");
  });

  it("uses default base URL http://localhost:8200 when KB_RERANK_BASE_URL is unset", async () => {
    process.env.KB_RERANK_ENABLED = "true";
    process.env.KB_RERANK_PROVIDER = "vllm";
    delete process.env.KB_RERANK_BASE_URL;
    delete process.env.KB_RERANK_MODEL;
    const { getDefaultReranker, VllmReranker: V } = await import("@/lib/rag/rerankers");
    const r = getDefaultReranker();
    expect(r).toBeInstanceOf(V);
    // Default model when unset.
    expect(r?.name).toBe("nvidia/llama-nemotron-rerank-1b-v2");
  });

  it("KB_RERANK_PROVIDER=openrouter routes to LlmReranker", async () => {
    process.env.KB_RERANK_ENABLED = "true";
    process.env.KB_RERANK_PROVIDER = "openrouter";
    process.env.KB_RERANK_MODEL = "google/gemini-3-flash-preview";
    const { getDefaultReranker, LlmReranker } = await import("@/lib/rag/rerankers");
    const r = getDefaultReranker();
    expect(r).toBeInstanceOf(LlmReranker);
    expect(r?.name).toBe("google/gemini-3-flash-preview");
  });
});
