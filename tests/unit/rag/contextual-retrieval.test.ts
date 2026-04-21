import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

describe("generateContextualPrefixes", () => {
  const originalFetch = global.fetch
  const originalEnv = { ...process.env }

  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = "test"
    process.env.KB_CONTEXTUAL_RETRIEVAL_ENABLED = "true"
    process.env.KB_CONTEXTUAL_RETRIEVAL_MODEL = "openai/gpt-4.1-nano"
    vi.resetModules()
    global.fetch = vi.fn() as any
  })

  afterEach(() => { global.fetch = originalFetch; process.env = { ...originalEnv } })

  it("returns one prefix per chunk, in order", async () => {
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '["Context for chunk 1.","Context for chunk 2.","Context for chunk 3."]' } }],
      }),
    })
    const { generateContextualPrefixes } = await import("@/lib/rag/contextual-retrieval")
    const prefixes = await generateContextualPrefixes("FULL DOC TEXT HERE", ["chunk one", "chunk two", "chunk three"])
    expect(prefixes).toEqual(["Context for chunk 1.","Context for chunk 2.","Context for chunk 3."])
  })

  it("returns array of empty strings when disabled", async () => {
    process.env.KB_CONTEXTUAL_RETRIEVAL_ENABLED = "false"
    const { generateContextualPrefixes } = await import("@/lib/rag/contextual-retrieval")
    const prefixes = await generateContextualPrefixes("doc", ["c1","c2"])
    expect(prefixes).toEqual(["",""])
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it("returns empty-string array when LLM output does not match chunk count", async () => {
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '["only one"]' } }] }),
    })
    const { generateContextualPrefixes } = await import("@/lib/rag/contextual-retrieval")
    const prefixes = await generateContextualPrefixes("doc", ["a","b","c"])
    expect(prefixes).toEqual(["","",""])
  })

  it("swallows fetch errors and returns empty-string array", async () => {
    ;(global.fetch as any).mockRejectedValueOnce(new Error("ETIMEDOUT"))
    const { generateContextualPrefixes } = await import("@/lib/rag/contextual-retrieval")
    const prefixes = await generateContextualPrefixes("doc", ["x","y"])
    expect(prefixes).toEqual(["",""])
  })

  it("sets cache_control on the full-doc content block for prompt caching", async () => {
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '["a","b"]' } }] }),
    })
    const { generateContextualPrefixes } = await import("@/lib/rag/contextual-retrieval")
    await generateContextualPrefixes("long doc text...", ["c1","c2"])
    const body = JSON.parse((global.fetch as any).mock.calls[0][1].body)
    // The first user-message content block must be the doc, marked cacheable
    const first = body.messages[0].content[0]
    expect(first.type).toBe("text")
    expect(first.text).toContain("long doc text...")
    expect(first.cache_control).toEqual({ type: "ephemeral" })
  })
})
