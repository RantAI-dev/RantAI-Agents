import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { configureKb } from "@/lib/kb-runtime/runtime"
import { makeFakeKbRuntime } from "../helpers/kb-fakes"
import { HybridSearch } from "@/lib/rag/hybrid-search"

/**
 * The narrow-scope vector path must never full-scan `document_chunk`.
 *
 * A chat scoped to one subject (mapel → one KB group → 1–3 documents) used to
 * issue the scoped KNN first (global k nearest, post-filtered → nothing
 * survives), then fall through to the full-table cosine scan — which, when
 * the planner has no document index to drive `document_id IN …`, reads every
 * row's embedding. On the UGM box (SurrealDB 2.6.5, ~500 textbooks) that was
 * measured as ~5 GiB of growth and ~77 s per request, and an OOM kill when
 * an ingest ran concurrently. The fix resolves the scope's chunk ids through
 * `document_id_idx` first and computes cosine over exactly those records.
 *
 * Runs under both `bun test` and vitest (no vi.resetModules: the kb-runtime
 * registry is global and the env knobs are read at call time).
 */

vi.mock("@/lib/rag/embeddings", () => ({
  generateEmbedding: vi.fn(async () => [0.1, 0.2, 0.3]),
  generateEmbeddings: vi.fn(async (texts: string[]) => texts.map(() => [0.1, 0.2, 0.3])),
}))

interface Issued {
  sql: string
  vars: Record<string, unknown>
}

const CHUNK = {
  id: "document_chunk:doc-1_0",
  document_id: "doc-1",
  content: "the answer lives here",
  chunk_index: 0,
  similarity: 0.9,
}

function syntheticIds(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `document_chunk:doc-1_${i}`)
}

/** True for today's full-table cosine scan (the query this fix must avoid). */
function isFullTableScan(sql: string): boolean {
  return (
    /FROM document_chunk/.test(sql) &&
    sql.includes("vector::similarity::cosine") &&
    !sql.includes("<|") &&
    !/FROM \$ids/.test(sql)
  )
}

/**
 * A vectors port that routes by SQL shape and records every issued query.
 */
function makeVectorsRouter(opts: {
  resolveIds?: string[]
  throwOnResolve?: boolean
  scoreRows?: unknown[]
  knnRows?: unknown[]
  scanRows?: unknown[]
}) {
  const issued: Issued[] = []
  const query = vi.fn(async (sql: string, vars: Record<string, unknown> = {}) => {
    issued.push({ sql, vars })
    if (/SELECT VALUE id FROM document_chunk/.test(sql)) {
      if (opts.throwOnResolve) throw new Error("resolution exploded")
      return [{ result: opts.resolveIds ?? [] }] as never
    }
    if (/FROM \$ids/.test(sql)) return [{ result: opts.scoreRows ?? [] }] as never
    if (sql.includes("<|")) return [{ result: opts.knnRows ?? [] }] as never
    if (isFullTableScan(sql)) return [{ result: opts.scanRows ?? [] }] as never
    return [{ result: [] }] as never
  })
  return {
    vectors: { ...makeFakeKbRuntime().vectors, query },
    issued,
  }
}

function install(opts: Parameters<typeof makeVectorsRouter>[0] & { docIds?: string[] }) {
  const { vectors, issued } = makeVectorsRouter(opts)
  const fake = makeFakeKbRuntime()
  configureKb({
    ...fake,
    documents: {
      ...fake.documents,
      findAliveIdsByFilter: vi.fn(async () => opts.docIds ?? ["doc-1", "doc-2"]),
    },
    vectors,
  })
  return issued
}

describe("hybrid vector search — narrow-scope scoped-ids path", () => {
  beforeEach(() => {
    // Keep the BM25 arm out of the picture; it shares the vectors port and
    // this file is about the vector arm's query shapes.
    process.env.KB_HYBRID_BM25_ENABLED = "false"
  })

  afterEach(() => {
    delete process.env.KB_HYBRID_BM25_ENABLED
    delete process.env.KB_VECTOR_KNN
    delete process.env.KB_SCOPED_SCAN_MAX_CHUNKS
    vi.restoreAllMocks()
  })

  it("resolves the scope's chunk ids and never issues the full-table scan (KNN enabled)", async () => {
    process.env.KB_VECTOR_KNN = "true"
    const ids = syntheticIds(600)
    const issued = install({ resolveIds: ids, scoreRows: [CHUNK] })

    const search = new HybridSearch({ enableEntitySearch: false, organizationId: "org-1" })
    const { results } = await search.search("where is the answer")

    expect(results.length).toBeGreaterThan(0)
    expect(results[0].content).toBe(CHUNK.content)

    const scans = issued.filter((q) => isFullTableScan(q.sql))
    expect(scans, "a narrow scope must never full-scan the chunk table").toEqual([])

    const knn = issued.filter((q) => q.sql.includes("<|"))
    expect(
      knn,
      "a narrow scope answers exactly from its own chunks; the global-neighbour KNN (which post-filters to nothing) is skipped entirely"
    ).toEqual([])

    const resolve = issued.filter((q) => /SELECT VALUE id FROM document_chunk/.test(q.sql))
    expect(resolve.length).toBe(1)
    expect(resolve[0].vars.documentIds).toEqual(["doc-1", "doc-2"])
    expect(resolve[0].vars.cap).toBe(5001)

    const score = issued.filter((q) => /FROM \$ids/.test(q.sql))
    expect(score.length).toBe(1)
    expect(score[0].vars.ids).toEqual(ids)
    expect(score[0].vars.limit).toBe(20)
  })

  it("takes the scoped-ids path even when the KNN flag is off", async () => {
    // The incident is the full-table scan; the fix must not depend on
    // KB_VECTOR_KNN being enabled.
    const ids = syntheticIds(900)
    const issued = install({ resolveIds: ids, scoreRows: [CHUNK] })

    const search = new HybridSearch({ enableEntitySearch: false, organizationId: "org-1" })
    const { results } = await search.search("where is the answer")

    expect(results.length).toBeGreaterThan(0)
    expect(issued.filter((q) => isFullTableScan(q.sql))).toEqual([])
    expect(issued.filter((q) => q.sql.includes("<|"))).toEqual([])
    expect(issued.filter((q) => /FROM \$ids/.test(q.sql)).length).toBe(1)
  })

  it("returns empty without another query when the scope resolves to no chunks", async () => {
    const issued = install({ resolveIds: [], scoreRows: [CHUNK] })

    const search = new HybridSearch({ enableEntitySearch: false, organizationId: "org-1" })
    const { results, stats } = await search.search("where is the answer")

    expect(results).toEqual([])
    expect(stats.vectorResults).toBe(0)
    // The scan would also return nothing; the difference is we never ran it.
    expect(issued.filter((q) => isFullTableScan(q.sql))).toEqual([])
    expect(issued.filter((q) => /FROM \$ids/.test(q.sql))).toEqual([])
  })

  it("keeps today's KNN-first behaviour when the scope exceeds the cap", async () => {
    process.env.KB_VECTOR_KNN = "true"
    // 5001 = cap + 1: the resolution query's LIMIT makes this the over-cap signal.
    const issued = install({ resolveIds: syntheticIds(5001), knnRows: [CHUNK] })

    const search = new HybridSearch({ enableEntitySearch: false, organizationId: "org-1" })
    const { results } = await search.search("where is the answer")

    expect(results.length).toBeGreaterThan(0)
    const knn = issued.filter((q) => q.sql.includes("<|"))
    expect(knn.length).toBe(1)
    expect(knn[0].vars.documentIds).toEqual(["doc-1", "doc-2"])
    // A KNN that answers keeps the full scan off — unchanged from today.
    expect(issued.filter((q) => isFullTableScan(q.sql))).toEqual([])
    expect(issued.filter((q) => /FROM \$ids/.test(q.sql))).toEqual([])
  })

  it("falls back to today's full scan when the scope exceeds the cap and KNN returns nothing", async () => {
    process.env.KB_VECTOR_KNN = "true"
    const issued = install({ resolveIds: syntheticIds(5001), knnRows: [], scanRows: [CHUNK] })

    const search = new HybridSearch({ enableEntitySearch: false, organizationId: "org-1" })
    const { results } = await search.search("where is the answer")

    expect(results.length).toBeGreaterThan(0)
    expect(issued.filter((q) => q.sql.includes("<|")).length).toBe(1)
    expect(issued.filter((q) => isFullTableScan(q.sql)).length).toBe(1)
  })

  it("routes every scoped query back to today's behaviour when the cap is 0 (kill switch)", async () => {
    process.env.KB_VECTOR_KNN = "true"
    process.env.KB_SCOPED_SCAN_MAX_CHUNKS = "0"
    const issued = install({ resolveIds: syntheticIds(600), knnRows: [], scanRows: [CHUNK] })

    const search = new HybridSearch({ enableEntitySearch: false, organizationId: "org-1" })
    const { results } = await search.search("where is the answer")

    expect(results.length).toBeGreaterThan(0)
    expect(issued.filter((q) => /SELECT VALUE id FROM document_chunk/.test(q.sql)), "no resolution on cap=0").toEqual([])
    expect(issued.filter((q) => q.sql.includes("<|")).length).toBe(1)
    expect(issued.filter((q) => isFullTableScan(q.sql)).length).toBe(1)
  })

  it("keeps today's behaviour when the id resolution query itself fails", async () => {
    process.env.KB_VECTOR_KNN = "true"
    const issued = install({ throwOnResolve: true, knnRows: [], scanRows: [CHUNK] })

    const search = new HybridSearch({ enableEntitySearch: false, organizationId: "org-1" })
    const { results } = await search.search("where is the answer")

    expect(results.length).toBeGreaterThan(0)
    expect(issued.filter((q) => isFullTableScan(q.sql)).length).toBe(1)
  })

  it("passes the tenancy filter vars unchanged on every path", async () => {
    const ids = syntheticIds(300)
    const issued = install({ resolveIds: ids, scoreRows: [CHUNK] })

    const search = new HybridSearch({
      enableEntitySearch: false,
      organizationId: "org-1",
      groupIds: ["grp-7"],
      userId: "user-9",
      fileIds: ["file-a", "file-b"],
    })
    await search.search("where is the answer")

    const resolve = issued.find((q) => /SELECT VALUE id FROM document_chunk/.test(q.sql))!
    expect(resolve.sql).toContain("document_id IN $documentIds")
    expect(resolve.sql).toContain("user_id = $userId")
    expect(resolve.sql).toContain("file_id IN $fileIds")
    expect(resolve.vars.userId).toBe("user-9")
    expect(resolve.vars.fileIds).toEqual(["file-a", "file-b"])

    const score = issued.find((q) => /FROM \$ids/.test(q.sql))!
    expect(score.vars.ids).toEqual(ids)
    expect(score.vars.embedding).toEqual([0.1, 0.2, 0.3])
  })

  it("fails closed: an empty document scope issues no Surreal query at all", async () => {
    const issued = install({ docIds: [], resolveIds: [CHUNK.id], scoreRows: [CHUNK] })

    const search = new HybridSearch({ enableEntitySearch: false, organizationId: "org-1" })
    const { results, stats } = await search.search("where is the answer")

    expect(results).toEqual([])
    expect(stats.vectorResults).toBe(0)
    expect(issued).toEqual([])
  })

  it("logs one scoped-vector line naming the path actually taken", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {})
    const narrowIssued = install({ resolveIds: syntheticIds(600), scoreRows: [CHUNK] })

    await new HybridSearch({ enableEntitySearch: false, organizationId: "org-1" }).search("where is the answer")

    const narrowLine = logSpy.mock.calls.map((c) => String(c[0])).find((m) => m.startsWith("[Hybrid] scoped vector:"))
    expect(narrowIssued.length).toBeGreaterThan(0)
    expect(narrowLine).toMatch(/^\[Hybrid\] scoped vector: docs=2 chunks=600 ms=\d+ path=scoped-ids$/)

    logSpy.mockClear()
    process.env.KB_VECTOR_KNN = "true"
    install({ resolveIds: syntheticIds(5001), knnRows: [CHUNK] })
    await new HybridSearch({ enableEntitySearch: false, organizationId: "org-1" }).search("where is the answer")

    const wideLine = logSpy.mock.calls.map((c) => String(c[0])).find((m) => m.startsWith("[Hybrid] scoped vector:"))
    expect(wideLine).toMatch(/^\[Hybrid\] scoped vector: docs=2 chunks=5001 ms=\d+ path=knn$/)
  })
})
