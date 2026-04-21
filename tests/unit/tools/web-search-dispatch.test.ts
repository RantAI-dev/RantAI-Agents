import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { resolveMode, searchWithFallback } from "@/lib/tools/builtin/web-search/dispatch"

describe("resolveMode", () => {
  const originalEnv = { ...process.env }
  afterEach(() => { process.env = { ...originalEnv } })

  it("defaults to perplexity", () => {
    delete process.env.WEB_SEARCH_MODE
    expect(resolveMode()).toBe("perplexity")
  })

  it("honors WEB_SEARCH_MODE=local", () => {
    process.env.WEB_SEARCH_MODE = "local"
    expect(resolveMode()).toBe("local")
  })

  it("treats unknown values as perplexity", () => {
    process.env.WEB_SEARCH_MODE = "tavily"
    expect(resolveMode()).toBe("perplexity")
  })

  it("is case-insensitive", () => {
    process.env.WEB_SEARCH_MODE = "LOCAL"
    expect(resolveMode()).toBe("local")
  })
})

describe("searchWithFallback (perplexity mode)", () => {
  const originalFetch = global.fetch
  const originalEnv = { ...process.env }

  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = "test-key"
    delete process.env.WEB_SEARCH_MODE
    delete process.env.SERPER_API_KEY
    delete process.env.SEARCH_API_URL
  })

  afterEach(() => {
    global.fetch = originalFetch
    process.env = { ...originalEnv }
  })

  it("returns perplexity answer + citations when perplexity succeeds", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "The capital is Paris." } }],
        citations: ["https://en.wikipedia.org/wiki/Paris"],
      }),
    }) as any

    const result = await searchWithFallback("capital of france", 5)
    expect(result.success).toBe(true)
    expect(result.provider).toBe("perplexity")
    expect(result.answer).toBe("The capital is Paris.")
    expect(result.citations).toEqual(["https://en.wikipedia.org/wiki/Paris"])
    expect(result.results).toHaveLength(1)
    expect(result.results[0].url).toBe("https://en.wikipedia.org/wiki/Paris")

    const call = (global.fetch as any).mock.calls[0]
    expect(call[0]).toBe("https://openrouter.ai/api/v1/chat/completions")
    const body = JSON.parse(call[1].body)
    expect(body.model).toBe("perplexity/sonar-pro")
  })

  it("falls back to serper when perplexity throws and SERPER_API_KEY is set", async () => {
    process.env.SERPER_API_KEY = "serper-key"
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 500, text: async () => "boom" }) // perplexity
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          organic: [{ title: "Apple", link: "https://apple.com", snippet: "computers" }],
        }),
      }) as any

    const result = await searchWithFallback("apple", 5)
    expect(result.success).toBe(true)
    expect(result.provider).toBe("serper")
    expect(result.results[0]).toEqual({ title: "Apple", url: "https://apple.com", snippet: "computers" })
  })

  it("skips perplexity when OPENROUTER_API_KEY is unset", async () => {
    delete process.env.OPENROUTER_API_KEY
    process.env.SERPER_API_KEY = "serper-key"
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        organic: [{ title: "x", link: "https://x.com", snippet: "" }],
      }),
    }) as any

    const result = await searchWithFallback("q", 5)
    expect(result.provider).toBe("serper")
    // Only one fetch call — perplexity was not attempted.
    expect((global.fetch as any).mock.calls).toHaveLength(1)
  })
})

describe("searchWithFallback (local mode)", () => {
  const originalFetch = global.fetch
  const originalEnv = { ...process.env }

  beforeEach(() => {
    process.env.WEB_SEARCH_MODE = "local"
    process.env.OPENROUTER_API_KEY = "should-be-ignored"
    process.env.SERPER_API_KEY = "serper-key"
    delete process.env.SEARCH_API_URL
  })

  afterEach(() => {
    global.fetch = originalFetch
    process.env = { ...originalEnv }
  })

  it("skips perplexity entirely even when OPENROUTER_API_KEY is set", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        organic: [{ title: "x", link: "https://x.com", snippet: "" }],
      }),
    }) as any

    const result = await searchWithFallback("q", 5)
    expect(result.provider).toBe("serper")
    // Verify the URL was serper, not perplexity.
    const call = (global.fetch as any).mock.calls[0]
    expect(call[0]).toBe("https://google.serper.dev/search")
  })
})
