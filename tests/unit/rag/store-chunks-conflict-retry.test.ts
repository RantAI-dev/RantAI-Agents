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

function mockSurreal(query: ReturnType<typeof vi.fn>) {
  vi.doMock("@/lib/surrealdb", () => ({
    getSurrealClient: async () => ({ query }),
  }))
  vi.doMock("@/lib/rag/config", () => ({
    getRagConfig: () => ({ embeddingDim: 4 }),
  }))
  vi.doMock("@/lib/prisma", () => ({ prisma: {} }))
}

describe("storeChunks — MTREE conflict retry", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it("retries CREATE on 'Failed to commit transaction' until it succeeds", async () => {
    const surrealQuery = vi
      .fn()
      .mockRejectedValueOnce(
        new Error(
          "Failed to commit transaction due to a read or write conflict. This transaction can be retried",
        ),
      )
      .mockRejectedValueOnce(new Error("read or write conflict; retry"))
      .mockResolvedValue([{ status: "OK", result: [] }])
    mockSurreal(surrealQuery)

    const { storeChunks } = await import("@/lib/rag/vector-store")
    const promise = storeChunks("doc1", [makeChunk()], [[0.1, 0.2, 0.3, 0.4]])
    // Drain the backoff timers without waiting in real wall-clock.
    await vi.runAllTimersAsync()
    await promise

    expect(surrealQuery).toHaveBeenCalledTimes(3)
  })

  it("propagates non-conflict errors without retrying", async () => {
    const surrealQuery = vi
      .fn()
      .mockRejectedValue(new Error("Schema validation failed: missing field"))
    mockSurreal(surrealQuery)

    const { storeChunks } = await import("@/lib/rag/vector-store")
    await expect(
      storeChunks("doc1", [makeChunk()], [[0.1, 0.2, 0.3, 0.4]]),
    ).rejects.toThrow(/Schema validation failed/)
    expect(surrealQuery).toHaveBeenCalledTimes(1)
  })

  it("gives up after the retry budget is exhausted", async () => {
    const surrealQuery = vi
      .fn()
      .mockRejectedValue(
        new Error("Failed to commit transaction due to a read or write conflict"),
      )
    mockSurreal(surrealQuery)

    const { storeChunks } = await import("@/lib/rag/vector-store")
    const promise = storeChunks("doc1", [makeChunk()], [[0.1, 0.2, 0.3, 0.4]])
    // Attach a swallowing handler so the unhandled-rejection guard doesn't
    // fire while we drain the fake timers; the actual assertion happens
    // through rejects.toThrow on the same promise below.
    const settled = promise.catch((e) => e)
    await vi.runAllTimersAsync()
    await settled
    await expect(promise).rejects.toThrow(/Failed to commit transaction/)
    // 5 attempts = 1 original + 4 retries
    expect(surrealQuery).toHaveBeenCalledTimes(5)
  })
})
