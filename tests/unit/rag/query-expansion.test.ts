import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

describe("expandQuery", () => {
  const originalFetch = global.fetch
  const originalEnv = { ...process.env }

  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = "test"
    process.env.KB_QUERY_EXPANSION_ENABLED = "true"
    process.env.KB_QUERY_EXPANSION_MODEL = "openai/gpt-4.1-nano"
    process.env.KB_QUERY_EXPANSION_PARAPHRASES = "3"
    vi.resetModules()
    global.fetch = vi.fn() as any
  })

  afterEach(() => {
    global.fetch = originalFetch
    process.env = { ...originalEnv }
  })

  it("returns [original, ...N paraphrases] when model returns a JSON array", async () => {
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '["what is claude", "describe claude AI", "explain anthropic claude"]' } }],
      }),
    })
    const { expandQuery } = await import("@/lib/rag/query-expansion")
    const result = await expandQuery("who is claude")
    expect(result).toEqual(["who is claude", "what is claude", "describe claude AI", "explain anthropic claude"])
  })

  it("returns [original] only when disabled", async () => {
    process.env.KB_QUERY_EXPANSION_ENABLED = "false"
    const { expandQuery } = await import("@/lib/rag/query-expansion")
    const result = await expandQuery("q")
    expect(result).toEqual(["q"])
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it("returns [original] when LLM returns garbage (no array)", async () => {
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "I cannot do that" } }] }),
    })
    const { expandQuery } = await import("@/lib/rag/query-expansion")
    const result = await expandQuery("q")
    expect(result).toEqual(["q"])
  })

  it("returns [original] and swallows error on network failure", async () => {
    ;(global.fetch as any).mockRejectedValueOnce(new Error("ECONNRESET"))
    const { expandQuery } = await import("@/lib/rag/query-expansion")
    const result = await expandQuery("q")
    expect(result).toEqual(["q"])
  })

  it("memoizes identical queries (only one fetch call)", async () => {
    ;(global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '["a","b","c"]' } }],
      }),
    })
    const { expandQuery } = await import("@/lib/rag/query-expansion")
    const a = await expandQuery("same")
    const b = await expandQuery("same")
    expect(a).toEqual(b)
    expect((global.fetch as any).mock.calls.length).toBe(1)
  })

  it("dedupes identical paraphrases from original", async () => {
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '["same-query","new one","same-query"]' } }],
      }),
    })
    const { expandQuery } = await import("@/lib/rag/query-expansion")
    const result = await expandQuery("same-query")
    expect(result).toEqual(["same-query", "new one"])
  })

  it("does not cache on failure (retries next call)", async () => {
    ;(global.fetch as any)
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: '["x","y","z"]' } }] }),
      })
    const { expandQuery } = await import("@/lib/rag/query-expansion")
    const first = await expandQuery("q")
    expect(first).toEqual(["q"])
    const second = await expandQuery("q")  // should retry, not hit cache
    expect(second).toEqual(["q", "x", "y", "z"])
    expect((global.fetch as any).mock.calls.length).toBe(2)
  })

  it("dedupes case- and whitespace-insensitively against original", async () => {
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '["WHO is Claude","who  is  claude","Claude the AI"]' } }],
      }),
    })
    const { expandQuery } = await import("@/lib/rag/query-expansion")
    const result = await expandQuery("who is claude")
    // First two paraphrases are case/whitespace variants of original → deduped.
    // Third is genuinely new.
    expect(result).toEqual(["who is claude", "Claude the AI"])
  })
})
