import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { VisionLlmExtractor } from "@/lib/rag/extractors/vision-llm-extractor"

describe("VisionLlmExtractor", () => {
  const originalFetch = global.fetch
  const originalKey = process.env.OPENROUTER_API_KEY

  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = "test-key"
    global.fetch = vi.fn() as any
  })

  afterEach(() => {
    global.fetch = originalFetch
    process.env.OPENROUTER_API_KEY = originalKey
  })

  it("sends PDF as file content-type to OpenRouter and returns markdown", async () => {
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "# Extracted\n\nbody" } }],
        usage: { prompt_tokens: 100, completion_tokens: 20, cost: 0.0001 },
      }),
    })

    const extractor = new VisionLlmExtractor("google/gemini-3-flash-preview")
    const result = await extractor.extract(Buffer.from("%PDF-1.5\nfake"))

    expect(result.text).toBe("# Extracted\n\nbody")
    expect(result.model).toBe("google/gemini-3-flash-preview")
    expect(result.ms).toBeGreaterThanOrEqual(0)
    expect(result.usage?.prompt_tokens).toBe(100)

    const call = (global.fetch as any).mock.calls[0]
    expect(call[0]).toBe("https://openrouter.ai/api/v1/chat/completions")
    const body = JSON.parse(call[1].body)
    expect(body.model).toBe("google/gemini-3-flash-preview")
    expect(body.messages[0].content[0].type).toBe("file")
    expect(body.messages[0].content[0].file.filename).toBe("document.pdf")
    expect(body.messages[0].content[0].file.file_data).toMatch(/^data:application\/pdf;base64,/)
    expect(body.messages[0].content[1].type).toBe("text")
    expect(body.messages[0].content[1].text).toMatch(/COMPACT Markdown/)
    expect(body.temperature).toBe(0)
  })

  it("throws with informative message on API error", async () => {
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 429,
      text: async () => "rate limited",
    })

    const extractor = new VisionLlmExtractor("google/gemini-3-flash-preview")
    await expect(extractor.extract(Buffer.from("x"))).rejects.toThrow(/429/)
  })

  it("throws if OPENROUTER_API_KEY is not set", async () => {
    delete process.env.OPENROUTER_API_KEY
    const extractor = new VisionLlmExtractor("google/gemini-3-flash-preview")
    await expect(extractor.extract(Buffer.from("x"))).rejects.toThrow(/OPENROUTER_API_KEY/)
  })
})

describe("extractor dispatch", () => {
  const originalEnv = { ...process.env }
  afterEach(() => { process.env = { ...originalEnv } })

  it("getDefaultExtractor picks VisionLlmExtractor when KB_EXTRACT_PRIMARY is a model id", async () => {
    process.env.KB_EXTRACT_PRIMARY = "anthropic/claude-haiku-4.5"
    const { getDefaultExtractor } = await import("@/lib/rag/extractors")
    const ex = getDefaultExtractor()
    expect(ex.name).toBe("anthropic/claude-haiku-4.5")
  })

  it("getDefaultExtractor picks UnpdfExtractor when KB_EXTRACT_PRIMARY=unpdf", async () => {
    process.env.KB_EXTRACT_PRIMARY = "unpdf"
    const { getDefaultExtractor } = await import("@/lib/rag/extractors")
    const ex = getDefaultExtractor()
    expect(ex.name).toBe("unpdf")
  })

  it("extractWithFallback uses primary when it succeeds", async () => {
    const primary = { name: "primary", extract: vi.fn().mockResolvedValue({ text: "ok", ms: 10, model: "primary" }) }
    const fallback = { name: "fallback", extract: vi.fn() }
    const { extractWithFallback } = await import("@/lib/rag/extractors")
    const result = await extractWithFallback(Buffer.from("x"), primary as any, fallback as any)
    expect(result.model).toBe("primary")
    expect(fallback.extract).not.toHaveBeenCalled()
  })

  it("extractWithFallback falls back when primary throws", async () => {
    const primary = { name: "primary", extract: vi.fn().mockRejectedValue(new Error("boom")) }
    const fallback = { name: "fallback", extract: vi.fn().mockResolvedValue({ text: "ok", ms: 10, model: "fallback" }) }
    const { extractWithFallback } = await import("@/lib/rag/extractors")
    const result = await extractWithFallback(Buffer.from("x"), primary as any, fallback as any)
    expect(result.model).toBe("fallback")
  })

  it("extractWithFallback throws if both fail", async () => {
    const primary = { name: "primary", extract: vi.fn().mockRejectedValue(new Error("one")) }
    const fallback = { name: "fallback", extract: vi.fn().mockRejectedValue(new Error("two")) }
    const { extractWithFallback } = await import("@/lib/rag/extractors")
    await expect(extractWithFallback(Buffer.from("x"), primary as any, fallback as any)).rejects.toThrow(/two/)
  })
})
