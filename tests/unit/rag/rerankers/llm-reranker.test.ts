import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { LlmReranker } from "@/lib/rag/rerankers/llm-reranker"

describe("LlmReranker", () => {
  const originalFetch = global.fetch
  const originalKey = process.env.OPENROUTER_API_KEY

  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = "test"
    global.fetch = vi.fn() as any
  })

  afterEach(() => {
    global.fetch = originalFetch
    process.env.OPENROUTER_API_KEY = originalKey
  })

  it("sends query + numbered candidates and parses the JSON array", async () => {
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "[2, 0, 1]" } }] }),
    })

    const reranker = new LlmReranker("google/gemini-3-flash-preview")
    const result = await reranker.rerank(
      "what is X",
      [
        { id: "a", text: "irrelevant", originalRank: 0, originalScore: 0.9 },
        { id: "b", text: "also nope", originalRank: 1, originalScore: 0.85 },
        { id: "c", text: "X is the answer", originalRank: 2, originalScore: 0.8 },
      ],
      3
    )

    expect(result.map((r) => r.id)).toEqual(["c", "a", "b"])
    expect(result[0].finalRank).toBe(0)

    const body = JSON.parse((global.fetch as any).mock.calls[0][1].body)
    expect(body.model).toBe("google/gemini-3-flash-preview")
    expect(body.temperature).toBe(0)
    expect(body.messages[0].content).toMatch(/Query: what is X/)
  })

  it("falls back to original order when the model output has no parseable array", async () => {
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "sorry, cannot do that" } }] }),
    })

    const reranker = new LlmReranker("google/gemini-3-flash-preview")
    const cands = [
      { id: "a", text: "a", originalRank: 0, originalScore: 0.9 },
      { id: "b", text: "b", originalRank: 1, originalScore: 0.8 },
      { id: "c", text: "c", originalRank: 2, originalScore: 0.7 },
    ]
    const result = await reranker.rerank("q", cands, 2)
    expect(result.map((r) => r.id)).toEqual(["a", "b"])
  })

  it("fills to finalK when the model returns fewer indices", async () => {
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "[1]" } }] }),
    })
    const reranker = new LlmReranker("google/gemini-3-flash-preview")
    const cands = [
      { id: "a", text: "a", originalRank: 0, originalScore: 0.9 },
      { id: "b", text: "b", originalRank: 1, originalScore: 0.8 },
      { id: "c", text: "c", originalRank: 2, originalScore: 0.7 },
      { id: "d", text: "d", originalRank: 3, originalScore: 0.6 },
    ]
    const result = await reranker.rerank("q", cands, 3)
    expect(result.length).toBe(3)
    expect(result[0].id).toBe("b")
    expect(result.slice(1).map((r) => r.id)).toEqual(["a", "c"])
  })

  it("short-circuits when candidates < finalK (no API call)", async () => {
    const reranker = new LlmReranker("google/gemini-3-flash-preview")
    const cands = [
      { id: "a", text: "a", originalRank: 0, originalScore: 0.9 },
      { id: "b", text: "b", originalRank: 1, originalScore: 0.8 },
    ]
    const result = await reranker.rerank("q", cands, 5)
    expect(result.map((r) => r.id)).toEqual(["a", "b"])
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it("throws on API error", async () => {
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => "boom",
    })
    const reranker = new LlmReranker("google/gemini-3-flash-preview")
    await expect(
      reranker.rerank("q", [
        { id: "a", text: "a", originalRank: 0, originalScore: 0.9 },
        { id: "b", text: "b", originalRank: 1, originalScore: 0.8 },
        { id: "c", text: "c", originalRank: 2, originalScore: 0.7 },
      ], 2)
    ).rejects.toThrow(/500/)
  })
})

describe("getDefaultReranker", () => {
  const originalEnv = { ...process.env }
  afterEach(() => { process.env = { ...originalEnv } })

  it("returns null when KB_RERANK_ENABLED is not 'true'", async () => {
    delete process.env.KB_RERANK_ENABLED
    const { getDefaultReranker } = await import("@/lib/rag/rerankers")
    expect(getDefaultReranker()).toBeNull()
  })

  it("returns LlmReranker when KB_RERANK_ENABLED=true", async () => {
    process.env.KB_RERANK_ENABLED = "true"
    process.env.KB_RERANK_MODEL = "anthropic/claude-haiku-4.5"
    const { getDefaultReranker } = await import("@/lib/rag/rerankers")
    const r = getDefaultReranker()
    expect(r).not.toBeNull()
    expect(r?.name).toBe("anthropic/claude-haiku-4.5")
  })
})
