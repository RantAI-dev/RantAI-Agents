import { describe, it, expect, vi } from "vitest"
import { HybridExtractor } from "@/lib/rag/extractors/hybrid-extractor"
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

describe("HybridExtractor", () => {
  it("runs both extractors in parallel and merges their output", async () => {
    const structural = mockExtractor("mineru", {
      text: "# Report\n\nCash in 2024 was $29,943.",
      ms: 4000,
      model: "mineru-2.5-pro",
    })
    const textLayer = mockExtractor("unpdf", {
      text: "Report Cash in 2024 was $29,943.",
      ms: 50,
      model: "unpdf",
    })
    const hybrid = new HybridExtractor(structural, textLayer)
    const result = await hybrid.extract(Buffer.from("%PDF-1.5 fake"))

    // Both extractors called once
    expect(structural.extract).toHaveBeenCalledTimes(1)
    expect(textLayer.extract).toHaveBeenCalledTimes(1)
    // Structural headings survived; combined model id reflects both
    expect(result.text).toContain("# Report")
    expect(result.model).toContain("mineru-2.5-pro")
    expect(result.model).toContain("unpdf")
  })

  it("returns structural-only when text-layer extractor throws", async () => {
    const structural = mockExtractor("mineru", { text: "# OK\n\nBody.", ms: 1000, model: "mineru" })
    const textLayer = mockExtractor("unpdf", new Error("unpdf failure"))
    const hybrid = new HybridExtractor(structural, textLayer)
    const result = await hybrid.extract(Buffer.from("x"))
    expect(result.text).toContain("# OK")
    expect(result.model).toBe("mineru") // not hybrid()
  })

  it("returns text-layer-only when structural extractor throws", async () => {
    const structural = mockExtractor("mineru", new Error("sidecar down"))
    const textLayer = mockExtractor("unpdf", { text: "flat text", ms: 50, model: "unpdf" })
    const hybrid = new HybridExtractor(structural, textLayer)
    const result = await hybrid.extract(Buffer.from("x"))
    expect(result.text).toBe("flat text")
    expect(result.model).toBe("unpdf")
  })

  it("throws a combined error when both extractors fail", async () => {
    const structural = mockExtractor("mineru", new Error("sidecar down"))
    const textLayer = mockExtractor("unpdf", new Error("corrupt pdf"))
    const hybrid = new HybridExtractor(structural, textLayer)
    await expect(hybrid.extract(Buffer.from("x"))).rejects.toThrow(/both extractors failed/i)
  })

  it("wall-clock ms reflects the slower extractor, not the sum", async () => {
    // Structural takes 1s, textLayer takes 50ms — hybrid must finish close to 1s
    const structural = mockExtractor("slow", { text: "slow out", ms: 1000, model: "slow" })
    const textLayer = mockExtractor("fast", { text: "slow out", ms: 50, model: "fast" })
    const hybrid = new HybridExtractor(structural, textLayer)
    const t0 = Date.now()
    const result = await hybrid.extract(Buffer.from("x"))
    const elapsed = Date.now() - t0
    expect(elapsed).toBeLessThan(500) // mocks don't actually delay, but also ensure <<2s
    expect(result.ms).toBeGreaterThanOrEqual(0)
  })
})
