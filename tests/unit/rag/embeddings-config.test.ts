import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

describe("generateEmbedding model selection", () => {
  const originalFetch = global.fetch
  const originalEnv = { ...process.env }

  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = "test-key"
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ embedding: new Array(4096).fill(0.1) }] }),
    }) as any
    vi.resetModules()
  })

  afterEach(() => {
    global.fetch = originalFetch
    process.env = { ...originalEnv }
  })

  it("uses KB_EMBEDDING_MODEL when set", async () => {
    process.env.KB_EMBEDDING_MODEL = "openai/text-embedding-3-large"
    const { generateEmbedding } = await import("@/lib/rag/embeddings")
    await generateEmbedding("hello")
    const body = JSON.parse((global.fetch as any).mock.calls[0][1].body)
    expect(body.model).toBe("openai/text-embedding-3-large")
  })

  it("defaults to qwen/qwen3-embedding-8b when env unset", async () => {
    delete process.env.KB_EMBEDDING_MODEL
    delete process.env.KB_EMBEDDING_DIM
    const { generateEmbedding } = await import("@/lib/rag/embeddings")
    await generateEmbedding("hello")
    const body = JSON.parse((global.fetch as any).mock.calls[0][1].body)
    expect(body.model).toBe("qwen/qwen3-embedding-8b")
  })

  it("batch call uses the same configured model", async () => {
    process.env.KB_EMBEDDING_MODEL = "openai/text-embedding-3-small"
    const { generateEmbeddings } = await import("@/lib/rag/embeddings")
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          { embedding: new Array(1536).fill(0) },
          { embedding: new Array(1536).fill(0) },
        ],
      }),
    })
    await generateEmbeddings(["a", "b"])
    const body = JSON.parse((global.fetch as any).mock.calls[0][1].body)
    expect(body.model).toBe("openai/text-embedding-3-small")
    expect(body.input).toEqual(["a", "b"])
  })
})
