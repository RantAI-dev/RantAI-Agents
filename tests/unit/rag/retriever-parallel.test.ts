import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

describe("retriever — parallel vector + BM25", () => {
  const originalFetch = global.fetch
  const originalEnv = { ...process.env }

  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = "test"
    process.env.KB_HYBRID_BM25_ENABLED = "true"
    process.env.KB_RERANK_ENABLED = "false"
    process.env.KB_QUERY_EXPANSION_ENABLED = "false"
    vi.resetModules()
  })

  afterEach(() => { global.fetch = originalFetch; process.env = { ...originalEnv } })

  it("fires searchWithThreshold and bm25Search concurrently (Promise.all)", async () => {
    const timings: number[] = []
    const vectorMock = vi.fn().mockImplementation(async () => {
      const start = Date.now(); timings.push(start)
      await new Promise((r) => setTimeout(r, 50))
      return [{ id: "v1", content: "v1 text", documentId: "d", documentTitle: "t", categories: [], subcategory: null, section: null, similarity: 0.9 }]
    })
    const bm25Mock = vi.fn().mockImplementation(async () => {
      const start = Date.now(); timings.push(start)
      await new Promise((r) => setTimeout(r, 50))
      return [{ id: "b1", documentId: "d", content: "b1 text", score: 3.5 }]
    })
    vi.doMock("@/lib/rag/vector-store", () => ({ searchWithThreshold: vectorMock, searchSimilar: vi.fn() }))
    vi.doMock("@/lib/rag/bm25-search", () => ({ bm25Search: bm25Mock }))

    const { retrieveContext } = await import("@/lib/rag/retriever")
    const t0 = Date.now()
    const r = await retrieveContext("some query", { maxChunks: 5 })
    const elapsed = Date.now() - t0

    expect(vectorMock).toHaveBeenCalledTimes(1)
    expect(bm25Mock).toHaveBeenCalledTimes(1)
    // Both started within 5ms of each other — proves concurrency.
    expect(Math.abs(timings[0] - timings[1])).toBeLessThan(5)
    // Wall-clock is ~50ms (parallel) not ~100ms (sequential).
    expect(elapsed).toBeLessThan(90)

    // Result includes both arms' chunks via RRF merge.
    const ids = r.chunks.map((c: any) => c.id)
    expect(ids).toContain("v1")
    expect(ids).toContain("b1")
  })

  it("skips BM25 when KB_HYBRID_BM25_ENABLED=false", async () => {
    process.env.KB_HYBRID_BM25_ENABLED = "false"
    const vectorMock = vi.fn().mockResolvedValue([
      { id: "v1", content: "", documentId: "d", documentTitle: "t", categories: [], subcategory: null, section: null, similarity: 0.9 },
    ])
    const bm25Mock = vi.fn()
    vi.doMock("@/lib/rag/vector-store", () => ({ searchWithThreshold: vectorMock, searchSimilar: vi.fn() }))
    vi.doMock("@/lib/rag/bm25-search", () => ({ bm25Search: bm25Mock }))

    const { retrieveContext } = await import("@/lib/rag/retriever")
    await retrieveContext("q", { maxChunks: 5 })
    expect(bm25Mock).not.toHaveBeenCalled()
  })
})
