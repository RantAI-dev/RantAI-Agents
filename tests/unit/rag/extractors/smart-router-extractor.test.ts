import { describe, it, expect, vi } from "vitest"
import { SmartRouterExtractor } from "@/lib/rag/extractors/smart-router-extractor"
import type { Extractor, ExtractionResult } from "@/lib/rag/extractors/types"

function mockExtractor(name: string, result: Partial<ExtractionResult> | Error): Extractor {
  return {
    name,
    extract: vi.fn(async () => {
      if (result instanceof Error) throw result
      return { text: "", ms: 0, model: name, ...result } as ExtractionResult
    }),
  }
}

describe("SmartRouterExtractor", () => {
  it("returns the text-layer result when unpdf output is sufficient", async () => {
    const textLayer = mockExtractor("unpdf", {
      text: "The quick brown fox jumps over the lazy dog. ".repeat(20),
      ms: 42,
      model: "unpdf",
      pages: 1,
    })
    const fallback = mockExtractor("mineru", { text: "SHOULD NOT BE USED", ms: 4000, model: "mineru" })
    const router = new SmartRouterExtractor(textLayer, fallback)
    const result = await router.extract(Buffer.from("%PDF-1.5"))

    expect(textLayer.extract).toHaveBeenCalledTimes(1)
    expect(fallback.extract).not.toHaveBeenCalled()
    expect(result.text).toContain("quick brown fox")
    expect(result.model).toBe("smart(unpdf)")
    expect(result.ms).toBe(42)
  })
})
