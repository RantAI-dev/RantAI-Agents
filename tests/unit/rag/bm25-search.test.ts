import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { configureKb } from "@/lib/kb-runtime/runtime"

describe("bm25Search", () => {
  beforeEach(() => { vi.resetModules() })
  afterEach(() => { vi.restoreAllMocks() })

  it("returns empty array without querying SurrealDB when documentIds is empty", async () => {
    const surrealQuery = vi.fn()
    configureKb({ vectors: { query: surrealQuery, relate: vi.fn(async () => {}), cleanupDocumentIntelligence: vi.fn(async () => ({ deletedRelationTables: 0, entitiesDeleted: false, chunksDeleted: false })), healthCheck: vi.fn(async () => true) } })
    const { bm25Search } = await import("@/lib/rag/bm25-search")
    const out = await bm25Search("BGE-M3", 5, [])
    expect(out).toEqual([])
    expect(surrealQuery).not.toHaveBeenCalled()
  })

  it("queries SurrealDB with @@ operator and scoped documentIds and returns normalized results", async () => {
    const surrealQuery = vi.fn().mockResolvedValue([
      { status: "OK", result: [
        { id: "doc1_0", document_id: "doc1", content: "BGE-M3 is an embedding model", score: 4.2 },
        { id: "doc2_3", document_id: "doc2", content: "Another result", score: 1.5 },
      ]},
    ])
    configureKb({ vectors: { query: surrealQuery, relate: vi.fn(async () => {}), cleanupDocumentIntelligence: vi.fn(async () => ({ deletedRelationTables: 0, entitiesDeleted: false, chunksDeleted: false })), healthCheck: vi.fn(async () => true) } })
    const { bm25Search } = await import("@/lib/rag/bm25-search")
    const out = await bm25Search("BGE-M3", 5, ["doc1", "doc2"])
    expect(out.length).toBe(2)
    expect(out[0]).toEqual({ id: "doc1_0", documentId: "doc1", content: "BGE-M3 is an embedding model", score: 4.2 })
    const call = surrealQuery.mock.calls[0]
    expect(call[0]).toMatch(/@@/)
    expect(call[0]).toMatch(/LIMIT 5/)
    expect(call[0]).toMatch(/document_id IN \$document_ids/)
    expect(call[1]).toEqual({ q: "BGE-M3", document_ids: ["doc1", "doc2"] })
  })

  it("returns empty array when SurrealDB returns empty set", async () => {
    configureKb({ vectors: { query: async () => [{ status: "OK", result: [] }] as never, relate: vi.fn(async () => {}), cleanupDocumentIntelligence: vi.fn(async () => ({ deletedRelationTables: 0, entitiesDeleted: false, chunksDeleted: false })), healthCheck: vi.fn(async () => true) } })
    const { bm25Search } = await import("@/lib/rag/bm25-search")
    const out = await bm25Search("asdfghjkl", 5, ["doc1"])
    expect(out).toEqual([])
  })

  it("caps at limit", async () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({
      id: `c${i}`, document_id: "d", content: "x", score: 10 - i,
    }))
    configureKb({ vectors: { query: async () => [{ status: "OK", result: rows }] as never, relate: vi.fn(async () => {}), cleanupDocumentIntelligence: vi.fn(async () => ({ deletedRelationTables: 0, entitiesDeleted: false, chunksDeleted: false })), healthCheck: vi.fn(async () => true) } })
    const { bm25Search } = await import("@/lib/rag/bm25-search")
    const out = await bm25Search("x", 3, ["d"])
    expect(out.length).toBe(3)
  })

  it("throws with [bm25Search] prefix when SurrealDB rejects the query", async () => {
    configureKb({ vectors: { query: async () => { throw new Error("schema not applied") }, relate: vi.fn(async () => {}), cleanupDocumentIntelligence: vi.fn(async () => ({ deletedRelationTables: 0, entitiesDeleted: false, chunksDeleted: false })), healthCheck: vi.fn(async () => true) } })
    const { bm25Search } = await import("@/lib/rag/bm25-search")
    await expect(bm25Search("x", 5, ["d"])).rejects.toThrow(/\[bm25Search\].*schema not applied/)
  })

  it("extracts and searches exact identifier phrases for multi-code queries with scoped documentIds (TC-994)", async () => {
    const surrealQuery = vi.fn().mockImplementation(async (sql: string, vars: Record<string, unknown>) => {
      if (sql.includes("@@")) {
        // BM25 primary search returns only doc_p20
        return [{ status: "OK", result: [
          { id: "chunk_p20", document_id: "doc1", content: "ING-P20-6120 spesifikasi", score: 3.0 },
        ]}]
      }
      if (sql.includes("string::contains") && vars.exact === "ing-p40-6140") {
        // Exact search surfaces chunk_p40 which primary BM25 missed
        return [{ status: "OK", result: [
          { id: "chunk_p40", document_id: "doc1", content: "ING-P40-6140 deskripsi lengkap", score: 0 },
        ]}]
      }
      return [{ status: "OK", result: [] }]
    })

    configureKb({ vectors: { query: surrealQuery, relate: vi.fn(async () => {}), cleanupDocumentIntelligence: vi.fn(async () => ({ deletedRelationTables: 0, entitiesDeleted: false, chunksDeleted: false })), healthCheck: vi.fn(async () => true) } })
    const { bm25Search } = await import("@/lib/rag/bm25-search")

    const query = "Apa perbedaan antara kode ING-P20-6120 dan ING-P40-6140?"
    const out = await bm25Search(query, 5, ["doc1"])

    expect(out.length).toBe(2)
    const p20 = out.find((r) => r.id === "chunk_p20")
    const p40 = out.find((r) => r.id === "chunk_p40")
    expect(p20).toBeDefined()
    expect(p40).toBeDefined()
    expect(p40?.matchedIdentifiers).toContain("ING-P40-6140")

    // Verify exact phrase queries were executed with string::contains and scoped document_id
    const exactCalls = surrealQuery.mock.calls.filter((c) => c[0].includes("string::contains"))
    expect(exactCalls.length).toBe(2)
    for (const call of exactCalls) {
      expect(call[0]).toMatch(/document_id IN \$document_ids/)
      expect(call[1].document_ids).toEqual(["doc1"])
    }
    const exactVars = exactCalls.map((c) => c[1].exact)
    expect(exactVars).toContain("ing-p20-6120")
    expect(exactVars).toContain("ing-p40-6140")
  })
})
