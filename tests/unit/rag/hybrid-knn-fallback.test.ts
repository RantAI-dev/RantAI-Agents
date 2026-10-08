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

/**
 * The KNN query must name the vector index.
 *
 * Measured on a live SurrealDB v2 with 272,623 chunks: once `document_id_idx`
 * exists (the schema defines it), the planner serves a scoped KNN query from
 * that index instead of the HNSW one, and the KNN operator then answers
 * OK-with-zero-rows in ~3.5 s. Every search fell through to the full scan
 * (another ~4 s). With `WITH INDEX embedding_idx` the same query returned 20
 * rows in ~150 ms. Without the document index the planner had no choice, which
 * is why this stayed hidden until the index was added.
 */
describe("hybrid vector search — KNN names its index", () => {
  beforeEach(() => {
    process.env.KB_VECTOR_KNN = "true"
    vi.resetModules()
  })
  afterEach(() => {
    delete process.env.KB_VECTOR_KNN
  })

  it("pins the KNN query to the vector index, before the WHERE clause", async () => {
    const seen: string[] = []
    const query = vi.fn(async (sql: string) => {
      seen.push(sql)
      return [{ result: sql.includes("<|") ? [CHUNK] : [], status: "OK" }] as never
    })
    configureKb({ ...makeFakeKbRuntime(), vectors: { ...makeFakeKbRuntime().vectors, query } })

    const { HybridSearch } = await import("@/lib/rag/hybrid-search")
    await new HybridSearch({ enableEntitySearch: false }).search("where is the answer")

    const knn = seen.find((s) => s.includes("<|"))!
    expect(knn).toMatch(/FROM document_chunk\s+WITH INDEX embedding_idx\s+WHERE embedding <\|/)
  })

  it("leaves the full-scan fallback to the planner", async () => {
    const seen: string[] = []
    const query = vi.fn(async (sql: string) => {
      seen.push(sql)
      if (sql.includes("<|")) return [{ result: [], status: "OK" }] as never
      return [{ result: [CHUNK], status: "OK" }] as never
    })
    configureKb({ ...makeFakeKbRuntime(), vectors: { ...makeFakeKbRuntime().vectors, query } })

    const { HybridSearch } = await import("@/lib/rag/hybrid-search")
    await new HybridSearch({ enableEntitySearch: false }).search("where is the answer")

    const scan = seen.find((s) => s.includes("vector::similarity::cosine") && !s.includes("<|"))!
    // The scan filters by document id; forcing the vector index there would
    // throw away the index that makes it fast.
    expect(scan).not.toContain("WITH INDEX")
  })
})

/**
 * Entity enrichment ran one query per result, in sequence, with a clause on a
 * field the entity table does not have — so none could use an index. On a
 * deployment with entity search switched off it still ran: about 270 ms each,
 * six or more per chat turn, to attach nothing.
 */
describe("hybrid search — entity enrichment", () => {
  beforeEach(() => vi.resetModules())

  const rows = [
    { ...CHUNK, id: "document_chunk:1", document_id: "doc-1", chunk_index: 0 },
    { ...CHUNK, id: "document_chunk:2", document_id: "doc-1", chunk_index: 1 },
    { ...CHUNK, id: "document_chunk:3", document_id: "doc-2", chunk_index: 0 },
  ]

  function runtime() {
    const entityQueries: Array<{ sql: string; vars: Record<string, unknown> }> = []
    const query = vi.fn(async (sql: string, vars?: Record<string, unknown>) => {
      if (/FROM entity\b/.test(sql)) {
        entityQueries.push({ sql, vars: vars ?? {} })
        return [{ result: [{ name: `e-${vars?.docId}`, confidence: 0.9 }], status: "OK" }] as never
      }
      if (sql.includes("vector::similarity::cosine")) return [{ result: rows, status: "OK" }] as never
      return [{ result: [], status: "OK" }] as never
    })
    configureKb({ ...makeFakeKbRuntime(), vectors: { ...makeFakeKbRuntime().vectors, query } })
    return entityQueries
  }

  it("does not query the entity table at all when entity search is off", async () => {
    const entityQueries = runtime()
    const { HybridSearch } = await import("@/lib/rag/hybrid-search")
    const { results } = await new HybridSearch({ enableEntitySearch: false }).search("q")
    expect(results.length).toBeGreaterThan(0)
    expect(entityQueries).toEqual([])
  })

  it("asks once per document, not once per result, and never by file_id", async () => {
    const entityQueries = runtime()
    const { HybridSearch } = await import("@/lib/rag/hybrid-search")
    const { results } = await new HybridSearch({ enableEntitySearch: true, enableGraphTraversal: false }).search("q")

    const enrichment = entityQueries.filter((q) => "docId" in q.vars)
    expect(enrichment.map((q) => q.vars.docId).sort()).toEqual(["doc-1", "doc-2"])
    for (const q of enrichment) expect(q.sql).not.toContain("file_id")
    // Every result still gets the entities of its own document.
    for (const r of results) expect(r.relatedEntities).toEqual([{ name: `e-${r.documentId}`, confidence: 0.9 }])
  })
})
