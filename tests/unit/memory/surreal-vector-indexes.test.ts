// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"

const query = vi.fn()
vi.mock("@/lib/surrealdb", () => ({
  SurrealDBClient: { getInstance: vi.fn(async () => ({ query })) },
  getSurrealDBConfigFromEnv: () => ({}),
}))
vi.mock("@/lib/rag/embeddings", () => ({ generateEmbedding: vi.fn(async () => [0.1, 0.2]) }))

// QA CHAT-058: nothing applied schema.surql, so the recall query scanned the
// whole conversation_memory table on every chat request.
describe("conversation_memory indexes", () => {
  beforeEach(() => {
    vi.resetModules()
    query.mockReset()
    query.mockResolvedValue([[]])
  })

  it("defines the userId/threadId index before the first recall, once per process", async () => {
    const mod = await import("@/lib/memory/surreal-vector")
    await mod.searchConversationMemory("q", "u1", 5, "t1")
    await mod.searchConversationMemory("q", "u1", 5, "t1")
    const statements = query.mock.calls.map((c) => String(c[0]))
    const defines = statements.filter((s) => s.startsWith("DEFINE INDEX"))
    expect(defines).toEqual(mod.CONVERSATION_MEMORY_INDEXES)
    expect(defines[0]).toMatch(/FIELDS userId, threadId/)
    expect(statements.findIndex((s) => s.startsWith("DEFINE"))).toBeLessThan(statements.findIndex((s) => s.includes("SELECT")))
  })

  it("retries the index definition after a failure instead of giving up", async () => {
    query.mockRejectedValueOnce(new Error("surreal down"))
    const mod = await import("@/lib/memory/surreal-vector")
    await mod.searchConversationMemory("q", "u1", 5, "t1").catch(() => {})
    await mod.searchConversationMemory("q", "u1", 5, "t1").catch(() => {})
    const defines = query.mock.calls.map((c) => String(c[0])).filter((s) => s.startsWith("DEFINE INDEX"))
    expect(defines.length).toBeGreaterThan(mod.CONVERSATION_MEMORY_INDEXES.length)
  })
})
