import { describe, it, expect, vi, beforeEach } from "vitest"
import { configureKb } from "@/lib/kb-runtime/runtime"
import { makeFakeKbRuntime } from "../../helpers/kb-fakes"

vi.mock("@/lib/rag/embeddings", () => ({
  generateEmbedding: vi.fn(async () => [0.1, 0.2, 0.3]),
  generateEmbeddings: vi.fn(async () => [[0.1, 0.2, 0.3]]),
}))

/**
 * The entity arm runs on every chat turn, but the entity-name list it consults
 * only changes at ingest. It used to fetch up to 2000 rows per turn and then
 * discard them in the common case where the question names no entity at all.
 *
 * These tests pin the two properties that keep that cost proportional:
 * the list is fetched once per document set, and the query no longer carries
 * the `file_id` half — a field the SCHEMAFULL entity table does not define, so
 * it could never match while still preventing the document_id index from being
 * used.
 */

const CHUNK = {
  id: "document_chunk:1",
  document_id: "doc-1",
  content: "sultan mulawarman ruled here",
  chunk_index: 0,
  similarity: 0.9,
}

function runtimeWithSpy() {
  const entityQueries: string[] = []
  const query = vi.fn(async (sql: string) => {
    if (sql.includes("FROM entity")) {
      entityQueries.push(sql)
      return [{ result: [{ name: "Mulawarman" }], status: "OK" }] as never
    }
    if (sql.includes("vector::similarity::cosine")) {
      return [{ result: [CHUNK], status: "OK" }] as never
    }
    return [{ result: [CHUNK], status: "OK" }] as never
  })
  return { entityQueries, query }
}

describe("entity arm cost", () => {
  beforeEach(async () => {
    vi.resetModules()
    const { HybridSearch } = await import("@/lib/rag/hybrid-search")
    HybridSearch.resetEntityNameCache()
  })

  it("fetches the entity-name list once per document set, not once per query", async () => {
    const { entityQueries, query } = runtimeWithSpy()
    configureKb({ ...makeFakeKbRuntime(), vectors: { ...makeFakeKbRuntime().vectors, query } })

    const { HybridSearch } = await import("@/lib/rag/hybrid-search")
    HybridSearch.resetEntityNameCache()

    const search = new HybridSearch({ enableEntitySearch: true })
    await search.search("who was mulawarman")
    await search.search("tell me about mulawarman again")
    await search.search("mulawarman once more")

    const nameFetches = entityQueries.filter((s) => s.includes("SELECT name FROM entity"))
    expect(nameFetches.length, "three turns over the same documents = one fetch").toBe(1)
  })

  it("scopes the entity lookup by document_id alone", async () => {
    const { entityQueries, query } = runtimeWithSpy()
    configureKb({ ...makeFakeKbRuntime(), vectors: { ...makeFakeKbRuntime().vectors, query } })

    const { HybridSearch } = await import("@/lib/rag/hybrid-search")
    HybridSearch.resetEntityNameCache()

    await new HybridSearch({ enableEntitySearch: true }).search("who was mulawarman")

    const nameFetch = entityQueries.find((s) => s.includes("SELECT name FROM entity"))
    expect(nameFetch).toBeDefined()
    expect(nameFetch, "the dead file_id half defeated the document_id index").not.toContain("file_id")
  })
})
