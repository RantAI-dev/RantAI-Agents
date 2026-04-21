import { describe, it, expect } from "vitest"
import { prepareChunkForEmbedding, type Chunk } from "@/lib/rag/chunker"

describe("prepareChunkForEmbedding with contextual prefix", () => {
  const base: Chunk = {
    content: "Revenue was $94.9B for Q4.",
    metadata: { documentTitle: "Apple 10-K", category: "financial", chunkIndex: 3, section: "Income Statement" },
  }

  it("includes contextual_prefix above content when present in metadata", () => {
    const c = { ...base, metadata: { ...base.metadata, contextualPrefix: "This chunk continues the Q4 2024 earnings summary." } }
    const out = prepareChunkForEmbedding(c)
    expect(out).toContain("This chunk continues the Q4 2024 earnings summary.")
    expect(out.indexOf("This chunk continues"))
      .toBeLessThan(out.indexOf("Revenue was $94.9B"))
  })

  it("omits context line when prefix is missing or empty", () => {
    const out = prepareChunkForEmbedding(base)
    expect(out).not.toMatch(/^Context:/m)
  })
})
