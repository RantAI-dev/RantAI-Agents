import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

describe("generateEmbeddings concurrency", () => {
  const originalFetch = global.fetch
  const originalEnv = { ...process.env }

  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = "test-key"
    process.env.KB_EMBEDDING_MODEL = "qwen/qwen3-embedding-8b"
    vi.resetModules()
  })

  afterEach(() => {
    global.fetch = originalFetch
    process.env = { ...originalEnv }
  })

  it("runs up to 4 fetches concurrently, preserving order of results", async () => {
    const times: number[] = []
    let inFlight = 0
    let maxInFlight = 0
    global.fetch = vi.fn().mockImplementation(async (_url: string, init: any) => {
      inFlight++
      maxInFlight = Math.max(maxInFlight, inFlight)
      times.push(Date.now())
      const body = JSON.parse(init.body)
      const inputCount = Array.isArray(body.input) ? body.input.length : 1
      // Emit a marker embedding per input so we can verify order below: [i, i, i, ...]
      // Use the first-input's index position encoded in the value.
      const firstIdx = body.input[0] === "x0" ? 0 : parseInt(body.input[0].replace("x", ""), 10)
      const data = Array.from({ length: inputCount }, (_, j) => ({
        embedding: new Array(8).fill(firstIdx + j),
      }))
      await new Promise((r) => setTimeout(r, 30))
      inFlight--
      return { ok: true, json: async () => ({ data }) }
    }) as any

    // 512 inputs at batch=128 → 4 batches.
    const inputs = Array.from({ length: 512 }, (_, i) => `x${i}`)
    const { generateEmbeddings } = await import("@/lib/rag/embeddings")
    const out = await generateEmbeddings(inputs)

    expect(out.length).toBe(512)
    // Concurrency of 4 means the 4 batches start within a small window of each other.
    expect(maxInFlight).toBeGreaterThanOrEqual(3)
    // First inputs should have value 0; last should have value 511.
    expect(out[0][0]).toBe(0)
    expect(out[511][0]).toBe(511)
  })

  it("preserves order across 10 batches with concurrency cap", async () => {
    global.fetch = vi.fn().mockImplementation(async (_url: string, init: any) => {
      const body = JSON.parse(init.body)
      const firstIdx = parseInt(body.input[0].replace("n", ""), 10)
      const inputCount = body.input.length
      const data = Array.from({ length: inputCount }, (_, j) => ({
        embedding: new Array(4).fill(firstIdx + j),
      }))
      // Variable delay so fastest batches complete out of order; results must still be ordered.
      await new Promise((r) => setTimeout(r, Math.random() * 20))
      return { ok: true, json: async () => ({ data }) }
    }) as any

    const inputs = Array.from({ length: 1280 }, (_, i) => `n${i}`)
    const { generateEmbeddings } = await import("@/lib/rag/embeddings")
    const out = await generateEmbeddings(inputs)

    expect(out.length).toBe(1280)
    for (let i = 0; i < 1280; i++) expect(out[i][0]).toBe(i)
  })
})
