import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type { Chunk } from "@/lib/rag/chunker"

function makeChunk(overrides?: Partial<Chunk["metadata"]>): Chunk {
  return {
    content: "hello world",
    metadata: {
      documentTitle: "doc",
      category: "test",
      chunkIndex: 0,
      ...overrides,
    },
  }
}

describe("storeChunks — SurrealDB option<string> field handling", () => {
  beforeEach(() => {
    vi.resetModules()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("omits contextual_prefix and embedding_model from the SET clause when both are absent", async () => {
    const surrealQuery = vi.fn().mockResolvedValue([{ status: "OK", result: [] }])
    vi.doMock("@/lib/surrealdb", () => ({
      getSurrealClient: async () => ({ query: surrealQuery }),
    }))
    vi.doMock("@/lib/rag/config", () => ({
      getRagConfig: () => ({ embeddingDim: 4 }),
    }))
    vi.doMock("@/lib/prisma", () => ({ prisma: {} }))

    const { storeChunks } = await import("@/lib/rag/vector-store")
    await storeChunks("doc1", [makeChunk()], [[0.1, 0.2, 0.3, 0.4]])

    expect(surrealQuery).toHaveBeenCalledTimes(1)
    const [sql, vars] = surrealQuery.mock.calls[0]
    expect(sql).not.toMatch(/contextual_prefix/)
    expect(sql).not.toMatch(/embedding_model/)
    expect(vars).not.toHaveProperty("contextual_prefix")
    expect(vars).not.toHaveProperty("embedding_model")
  })

  it("includes contextual_prefix in the SET clause when the chunk metadata carries one", async () => {
    const surrealQuery = vi.fn().mockResolvedValue([{ status: "OK", result: [] }])
    vi.doMock("@/lib/surrealdb", () => ({
      getSurrealClient: async () => ({ query: surrealQuery }),
    }))
    vi.doMock("@/lib/rag/config", () => ({
      getRagConfig: () => ({ embeddingDim: 4 }),
    }))
    vi.doMock("@/lib/prisma", () => ({ prisma: {} }))

    const { storeChunks } = await import("@/lib/rag/vector-store")
    await storeChunks(
      "doc1",
      [makeChunk({ contextualPrefix: "Document is about PSAK 71" })],
      [[0.1, 0.2, 0.3, 0.4]],
    )

    const [sql, vars] = surrealQuery.mock.calls[0]
    expect(sql).toMatch(/contextual_prefix = \$contextual_prefix/)
    expect(vars.contextual_prefix).toBe("Document is about PSAK 71")
  })

  it("includes embedding_model in the SET clause when the caller passes one", async () => {
    const surrealQuery = vi.fn().mockResolvedValue([{ status: "OK", result: [] }])
    vi.doMock("@/lib/surrealdb", () => ({
      getSurrealClient: async () => ({ query: surrealQuery }),
    }))
    vi.doMock("@/lib/rag/config", () => ({
      getRagConfig: () => ({ embeddingDim: 4 }),
    }))
    vi.doMock("@/lib/prisma", () => ({ prisma: {} }))

    const { storeChunks } = await import("@/lib/rag/vector-store")
    await storeChunks("doc1", [makeChunk()], [[0.1, 0.2, 0.3, 0.4]], "bge-m3")

    const [sql, vars] = surrealQuery.mock.calls[0]
    expect(sql).toMatch(/embedding_model = \$embedding_model/)
    expect(vars.embedding_model).toBe("bge-m3")
  })

  it("treats empty-string contextual_prefix as absent", async () => {
    const surrealQuery = vi.fn().mockResolvedValue([{ status: "OK", result: [] }])
    vi.doMock("@/lib/surrealdb", () => ({
      getSurrealClient: async () => ({ query: surrealQuery }),
    }))
    vi.doMock("@/lib/rag/config", () => ({
      getRagConfig: () => ({ embeddingDim: 4 }),
    }))
    vi.doMock("@/lib/prisma", () => ({ prisma: {} }))

    const { storeChunks } = await import("@/lib/rag/vector-store")
    await storeChunks(
      "doc1",
      [makeChunk({ contextualPrefix: "" })],
      [[0.1, 0.2, 0.3, 0.4]],
    )

    const [sql, vars] = surrealQuery.mock.calls[0]
    expect(sql).not.toMatch(/contextual_prefix/)
    expect(vars).not.toHaveProperty("contextual_prefix")
  })
})
