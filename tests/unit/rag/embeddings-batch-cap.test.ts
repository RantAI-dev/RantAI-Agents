import { describe, it, expect } from "vitest"
import { resolveEmbedBatchSize } from "@/lib/rag/embeddings"

// Regression: the demo KB switched KB_EMBEDDING_MODEL to google/gemini-embedding-001
// for latency. Gemini's BatchEmbedContents caps a batch at 100 items and rejects
// anything larger with a non-retryable 400, so the default batch of 128 dropped
// every full batch — book-sized documents ingested with almost no embeddings.
describe("resolveEmbedBatchSize", () => {
  it("clamps Gemini embedding models to the provider's 100-item cap", () => {
    expect(resolveEmbedBatchSize("google/gemini-embedding-001", 128)).toBe(100)
    expect(resolveEmbedBatchSize("gemini-embedding-001", 128)).toBe(100)
    expect(resolveEmbedBatchSize("google/text-embedding-004", 128)).toBe(100)
  })

  it("keeps a smaller operator-configured batch below the cap", () => {
    expect(resolveEmbedBatchSize("google/gemini-embedding-001", 64)).toBe(64)
  })

  it("leaves models without a known cap untouched", () => {
    expect(resolveEmbedBatchSize("qwen/qwen3-embedding-8b", 128)).toBe(128)
    expect(resolveEmbedBatchSize("baai/bge-m3", 256)).toBe(256)
  })
})
