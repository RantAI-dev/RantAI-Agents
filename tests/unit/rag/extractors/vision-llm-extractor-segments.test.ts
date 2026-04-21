import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { PDFDocument } from "pdf-lib"
import { VisionLlmExtractor } from "@/lib/rag/extractors/vision-llm-extractor"

async function makeTestPdf(pages: number): Promise<Buffer> {
  const doc = await PDFDocument.create()
  for (let i = 0; i < pages; i++) {
    const page = doc.addPage([400, 600])
    page.drawText(`p${i + 1}`, { x: 20, y: 500 })
  }
  return Buffer.from(await doc.save())
}

describe("VisionLlmExtractor with segment dispatch", () => {
  const originalFetch = global.fetch
  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = "test"
  })
  afterEach(() => {
    global.fetch = originalFetch
  })

  it("single-call path when pages <= segmentPages", async () => {
    const pdf = await makeTestPdf(10)
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "# small doc\n\nbody" } }],
        usage: { prompt_tokens: 50, completion_tokens: 10, cost: 0.0001 },
      }),
    }) as any

    const extractor = new VisionLlmExtractor("google/gemini-3-flash-preview", { segmentPages: 25 })
    const result = await extractor.extract(pdf)
    expect(result.text).toBe("# small doc\n\nbody")
    expect(result.model).toBe("google/gemini-3-flash-preview")
    expect((global.fetch as any).mock.calls).toHaveLength(1)
  })

  it("splits into 4 segments and concatenates result text for a 100-page PDF", async () => {
    const pdf = await makeTestPdf(100)
    let callCount = 0
    global.fetch = vi.fn().mockImplementation(async () => {
      const idx = callCount++
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: `segment-${idx}-text` } }],
          usage: { prompt_tokens: 100, completion_tokens: 20, cost: 0.0002 },
        }),
      }
    }) as any

    const extractor = new VisionLlmExtractor("openai/gpt-4.1-nano", { segmentPages: 25 })
    const result = await extractor.extract(pdf)

    expect((global.fetch as any).mock.calls).toHaveLength(4)
    // Concatenated in segment order regardless of completion order.
    expect(result.text).toBe("segment-0-text\n\nsegment-1-text\n\nsegment-2-text\n\nsegment-3-text")
    expect(result.usage?.prompt_tokens).toBe(400)   // 4 × 100
    expect(result.usage?.completion_tokens).toBe(80) // 4 × 20
    expect(result.usage?.cost).toBeCloseTo(0.0008, 6)
    expect(result.model).toMatch(/4 segments × 25pg/)
    expect(result.pages).toBe(100)
  })

  it("preserves order when segments return out-of-order (concurrency)", async () => {
    const pdf = await makeTestPdf(60) // 3 × 25-page segments (25/25/10)
    let callCount = 0
    global.fetch = vi.fn().mockImplementation(async () => {
      const idx = callCount++
      // First call resolves slowest — tests index-based placement, not settle order.
      const delay = idx === 0 ? 50 : 5
      await new Promise((r) => setTimeout(r, delay))
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: `S${idx}` } }],
          usage: { prompt_tokens: 10, completion_tokens: 2 },
        }),
      }
    }) as any

    const extractor = new VisionLlmExtractor("openai/gpt-4.1-nano", { segmentPages: 25 })
    const result = await extractor.extract(pdf)
    // Should be "S0\n\nS1\n\nS2" even though call 0 was slowest.
    expect(result.text).toBe("S0\n\nS1\n\nS2")
  })

  it("fails with [segment i/N] context when a segment's API call errors", async () => {
    const pdf = await makeTestPdf(60)
    let callCount = 0
    global.fetch = vi.fn().mockImplementation(async () => {
      const idx = callCount++
      if (idx === 1) {
        return { ok: false, status: 500, text: async () => "server error" }
      }
      return {
        ok: true,
        json: async () => ({ choices: [{ message: { content: "ok" } }], usage: {} }),
      }
    }) as any

    const extractor = new VisionLlmExtractor("openai/gpt-4.1-nano", { segmentPages: 25 })
    await expect(extractor.extract(pdf)).rejects.toThrow(/\[VisionLlmExtractor segment .*\/3\]/)
  })
})
