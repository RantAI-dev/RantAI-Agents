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

describe("retriever — query expansion with parallel embed", () => {
  const originalEnv = { ...process.env }
  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = "test"
    process.env.KB_HYBRID_BM25_ENABLED = "false"
    process.env.KB_RERANK_ENABLED = "false"
    process.env.KB_QUERY_EXPANSION_ENABLED = "true"
    process.env.KB_QUERY_EXPANSION_PARAPHRASES = "2"
    vi.resetModules()
  })
  afterEach(() => { process.env = { ...originalEnv } })

  it("expands query, embeds all variants in ONE batched call, runs N searches in parallel", async () => {
    const embedFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [0,1,2].map(() => ({ embedding: new Array(4096).fill(0.1) })) }),
    })
    const chatFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '["para1","para2"]' } }] }),
    })
    global.fetch = (async (url: string, init: any) => {
      if (url.endsWith("/embeddings")) return embedFetch(url, init)
      return chatFetch(url, init)
    }) as any

    const vectorMock = vi.fn().mockResolvedValue([
      { id: "v", content: "", documentId: "d", documentTitle: "t", categories: [], subcategory: null, section: null, similarity: 0.9 },
    ])
    vi.doMock("@/lib/rag/vector-store", () => ({
      searchWithThreshold: vectorMock,
      searchSimilar: vi.fn(),
      searchByVector: vectorMock,
      searchSimilarBatch: async (queries: string[], limit: number) => {
        // Simulate batched embed then per-query search
        const embedRes = await embedFetch("https://openrouter.ai/api/v1/embeddings", { body: JSON.stringify({ input: queries }) })
        await embedRes.json()
        return Promise.all(queries.map(() => vectorMock()))
      },
    }))
    vi.doMock("@/lib/rag/bm25-search", () => ({ bm25Search: async () => [] }))

    const { retrieveContext } = await import("@/lib/rag/retriever")
    await retrieveContext("original question", { maxChunks: 5 })

    // One /embeddings batch call with 3 inputs (original + 2 paraphrases).
    expect(embedFetch).toHaveBeenCalledTimes(1)
    const embedBody = JSON.parse(embedFetch.mock.calls[0][1].body)
    expect(embedBody.input).toEqual(["original question", "para1", "para2"])

    // 3 vector searches fanned out in parallel.
    expect(vectorMock).toHaveBeenCalledTimes(3)
  })
})
