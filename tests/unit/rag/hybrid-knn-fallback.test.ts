import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { configureKb } from "@/lib/kb-runtime/runtime"
import { makeFakeKbRuntime } from "../../helpers/kb-fakes"

// search() embeds the query itself; the vector is irrelevant to what this file
// is about, so keep it off the network.
vi.mock("@/lib/rag/embeddings", () => ({
  generateEmbedding: vi.fn(async () => [0.1, 0.2, 0.3]),
  generateEmbeddings: vi.fn(async () => [[0.1, 0.2, 0.3]]),
}))

/**
 * KB_VECTOR_KNN must never be able to silently disable retrieval.
 *
 * `<|k,ef|>` is the HNSW form of the KNN operator. Against an MTREE index —
 * which is what rag/store/schema.surql still defines — or against no vector
 * index, SurrealDB does not error: it answers `status: "OK"` with zero rows.
 * A try/catch around the query therefore catches nothing, and a deployment
 * that turned the flag on for speed would serve sourceless answers with a
 * clean log. Verified against SurrealDB v2 before this test was written.
 */

const CHUNK = {
  id: "document_chunk:1",
  document_id: "doc-1",
  content: "the answer lives here",
  chunk_index: 0,
  similarity: 0.9,
}

function vectorsThat(responses: Array<{ sql: RegExp; rows: unknown[] }>) {
  const query = vi.fn(async (sql: string) => {
    const match = responses.find((r) => r.sql.test(sql))
    return [{ result: match ? match.rows : [], status: "OK" }] as never
  })
  return { query }
}

describe("hybrid vector search — KNN fallback", () => {
  beforeEach(() => {
    process.env.KB_VECTOR_KNN = "true"
    vi.resetModules()
  })
  afterEach(() => {
    delete process.env.KB_VECTOR_KNN
  })

  it("falls back to the full scan when the KNN operator returns nothing", async () => {
    // KNN answers OK-but-empty (MTREE / missing index); the scan has the rows.
    const vectors = vectorsThat([{ sql: /ORDER BY similarity DESC/, rows: [] }])
    let sawKnn = false
    vectors.query = vi.fn(async (sql: string) => {
      if (sql.includes("<|")) {
        sawKnn = true
        return [{ result: [], status: "OK" }] as never
      }
      return [{ result: [CHUNK], status: "OK" }] as never
    })

    configureKb({
      ...makeFakeKbRuntime(),
      vectors: { ...makeFakeKbRuntime().vectors, ...vectors },
    })

    const { HybridSearch } = await import("@/lib/rag/hybrid-search")
    const search = new HybridSearch({ enableEntitySearch: false })
    const { results } = await search.search("where is the answer")

    expect(sawKnn, "the KNN path should have been attempted").toBe(true)
    expect(results.length, "an OK-but-empty KNN result must not end the search").toBeGreaterThan(0)
    expect(results[0].content).toBe(CHUNK.content)
  })

  it("does not run the scan when KNN actually returns rows", async () => {
    let scans = 0
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("<|")) return [{ result: [CHUNK], status: "OK" }] as never
      // Only the full-scan shape counts; the search issues other queries too.
      if (sql.includes("vector::similarity::cosine") && sql.includes("ORDER BY similarity DESC")) scans++
      return [{ result: [], status: "OK" }] as never
    })

    configureKb({
      ...makeFakeKbRuntime(),
      vectors: { ...makeFakeKbRuntime().vectors, query },
    })

    const { HybridSearch } = await import("@/lib/rag/hybrid-search")
    const search = new HybridSearch({ enableEntitySearch: false })
    const { results } = await search.search("where is the answer")

    expect(results.length).toBeGreaterThan(0)
    expect(scans, "a successful KNN must not be followed by a redundant scan").toBe(0)
  })
})
