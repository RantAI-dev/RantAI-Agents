import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { configureKb } from "@/lib/kb-runtime/runtime"

describe("bm25Search", () => {
  beforeEach(() => { vi.resetModules() })
  afterEach(() => { vi.restoreAllMocks() })

  it("queries SurrealDB with @@ operator and returns normalized results", async () => {
    const surrealQuery = vi.fn().mockResolvedValue([
      { status: "OK", result: [
        { id: "doc1_0", document_id: "doc1", content: "BGE-M3 is an embedding model", score: 4.2 },
        { id: "doc2_3", document_id: "doc2", content: "Another result", score: 1.5 },
      ]},
    ])
    configureKb({ vectors: { query: surrealQuery, relate: vi.fn(async () => {}), cleanupDocumentIntelligence: vi.fn(async () => ({ deletedRelationTables: 0, entitiesDeleted: 0, chunksDeleted: 0 })) } })
    const { bm25Search } = await import("@/lib/rag/bm25-search")
    const out = await bm25Search("BGE-M3", 5)
    expect(out.length).toBe(2)
    expect(out[0]).toEqual({ id: "doc1_0", documentId: "doc1", content: "BGE-M3 is an embedding model", score: 4.2 })
    const call = surrealQuery.mock.calls[0]
    expect(call[0]).toMatch(/@@/)
    expect(call[0]).toMatch(/LIMIT 5/)
    expect(call[1]).toEqual({ q: "BGE-M3" })
  })

  it("returns empty array when SurrealDB returns empty set", async () => {
    configureKb({ vectors: { query: async () => [{ status: "OK", result: [] }] as never, relate: vi.fn(async () => {}), cleanupDocumentIntelligence: vi.fn(async () => ({ deletedRelationTables: 0, entitiesDeleted: 0, chunksDeleted: 0 })) } })
    const { bm25Search } = await import("@/lib/rag/bm25-search")
    const out = await bm25Search("asdfghjkl", 5)
    expect(out).toEqual([])
  })

  it("caps at limit", async () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({
      id: `c${i}`, document_id: "d", content: "x", score: 10 - i,
    }))
    configureKb({ vectors: { query: async () => [{ status: "OK", result: rows }] as never, relate: vi.fn(async () => {}), cleanupDocumentIntelligence: vi.fn(async () => ({ deletedRelationTables: 0, entitiesDeleted: 0, chunksDeleted: 0 })) } })
    const { bm25Search } = await import("@/lib/rag/bm25-search")
    const out = await bm25Search("x", 3)
    expect(out.length).toBe(3)
  })

  it("throws with [bm25Search] prefix when SurrealDB rejects the query", async () => {
    configureKb({ vectors: { query: async () => { throw new Error("schema not applied") }, relate: vi.fn(async () => {}), cleanupDocumentIntelligence: vi.fn(async () => ({ deletedRelationTables: 0, entitiesDeleted: 0, chunksDeleted: 0 })) } })
    const { bm25Search } = await import("@/lib/rag/bm25-search")
    await expect(bm25Search("x", 5)).rejects.toThrow(/\[bm25Search\].*schema not applied/)
  })
})
