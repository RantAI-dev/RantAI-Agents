import { describe, it, expect, vi, afterEach } from "vitest"
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

describe("SmartRouterExtractor / fallback path", () => {
  it("falls through to the fallback when text layer is empty", async () => {
    const textLayer = mockExtractor("unpdf", { text: "", ms: 5, model: "unpdf", pages: 1 })
    const fallback = mockExtractor("mineru", {
      text: "# From OCR\n\nBody.",
      ms: 4000,
      model: "mineru-2.5-pro",
    })
    const router = new SmartRouterExtractor(textLayer, fallback)
    const result = await router.extract(Buffer.from("x"))
    expect(textLayer.extract).toHaveBeenCalledTimes(1)
    expect(fallback.extract).toHaveBeenCalledTimes(1)
    expect(result.text).toContain("From OCR")
    expect(result.model).toBe("smart(fallback:mineru-2.5-pro)")
  })

  it("falls through when text-layer volume is below threshold", async () => {
    const textLayer = mockExtractor("unpdf", { text: "tiny", ms: 3, model: "unpdf", pages: 1 })
    const fallback = mockExtractor("mineru", { text: "full ocr output", ms: 4000, model: "mineru" })
    const router = new SmartRouterExtractor(textLayer, fallback)
    const result = await router.extract(Buffer.from("x"))
    expect(result.text).toBe("full ocr output")
  })

  it("falls through when text-layer extraction throws", async () => {
    const textLayer = mockExtractor("unpdf", new Error("pdf corrupt"))
    const fallback = mockExtractor("mineru", { text: "recovered by OCR", ms: 4000, model: "mineru" })
    const router = new SmartRouterExtractor(textLayer, fallback)
    const result = await router.extract(Buffer.from("x"))
    expect(result.text).toBe("recovered by OCR")
  })

  it("throws combined error when both extractors fail", async () => {
    const textLayer = mockExtractor("unpdf", new Error("pdf corrupt"))
    const fallback = mockExtractor("mineru", new Error("sidecar down"))
    const router = new SmartRouterExtractor(textLayer, fallback)
    await expect(router.extract(Buffer.from("x"))).rejects.toThrow(/both extractors failed/i)
  })

  it("accepts custom opts and uses them", async () => {
    // Very strict threshold — prose that was sufficient under defaults now triggers fallback
    const textLayer = mockExtractor("unpdf", {
      text: "The quick brown fox ".repeat(10), // 200 chars
      ms: 5,
      model: "unpdf",
      pages: 1,
    })
    const fallback = mockExtractor("mineru", { text: "ocr result", ms: 4000, model: "mineru" })
    const router = new SmartRouterExtractor(textLayer, fallback, { minCharsPerPage: 1000 })
    const result = await router.extract(Buffer.from("x"))
    expect(result.text).toBe("ocr result") // fallback used because 200 < 1000
  })
})

describe("SmartRouterExtractor / integration with buildExtractor", () => {
  const originalEnv = { ...process.env }
  afterEach(() => { process.env = { ...originalEnv }; vi.resetModules() })

  it("KB_EXTRACT_PRIMARY=smart builds a SmartRouterExtractor", async () => {
    process.env.KB_EXTRACT_PRIMARY = "smart"
    process.env.KB_EXTRACT_SMART_FALLBACK = "openai/gpt-4.1-nano"
    const { getDefaultExtractor } = await import("@/lib/rag/extractors")
    const ex = getDefaultExtractor()
    expect(ex.name).toMatch(/^SmartRouter\(/)
    expect(ex.name).toContain("unpdf")
    expect(ex.name).toContain("openai/gpt-4.1-nano")
  })

  it("KB_EXTRACT_PRIMARY=smart with KB_EXTRACT_SMART_FALLBACK=mineru uses MineruExtractor", async () => {
    process.env.KB_EXTRACT_PRIMARY = "smart"
    process.env.KB_EXTRACT_SMART_FALLBACK = "mineru"
    process.env.KB_EXTRACT_MINERU_BASE_URL = "http://localhost:8100"
    const { getDefaultExtractor } = await import("@/lib/rag/extractors")
    const ex = getDefaultExtractor()
    expect(ex.name).toMatch(/^SmartRouter\(/)
    expect(ex.name).toContain("MineruExtractor")
  })
})
