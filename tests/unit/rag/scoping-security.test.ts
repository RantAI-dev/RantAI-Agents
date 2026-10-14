import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { configureKb, resetKbRuntime } from "@/lib/kb-runtime/runtime"
import { makeFakeKbRuntime } from "../../helpers/kb-fakes"

describe("RAG Scoping & Multi-Tenant Security (TC-QA-LEAK)", () => {
  beforeEach(() => {
    vi.resetModules()
    resetKbRuntime()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("knowledge_search tool scoping (Finding C)", () => {
    it("fails closed (found: false, no retrieval) when organizationId is missing from ToolContext", async () => {
      const retrieveKnowledgeMock = vi.fn()
      vi.doMock("@/lib/kb-client/facade", () => ({
        retrieveKnowledge: retrieveKnowledgeMock,
      }))
      const { knowledgeSearchTool } = await import("@/lib/tools/builtin/knowledge-search")

      const res = await knowledgeSearchTool.execute(
        { query: "secret info" },
        { assistantId: "asst-1" } // Missing organizationId
      )

      expect(res).toEqual({
        found: false,
        resultCount: 0,
        context: "",
        sources: [],
      })
      expect(retrieveKnowledgeMock).not.toHaveBeenCalled()
    })

    it("restricts search to assistant knowledgeBaseGroupIds and organizationId", async () => {
      const retrieveKnowledgeMock = vi.fn().mockResolvedValue({
        found: true,
        context: "some text",
        sources: [],
        chunks: [{ id: "c1", content: "some text", similarity: 0.9 }],
      })
      vi.doMock("@/lib/kb-client/facade", () => ({
        retrieveKnowledge: retrieveKnowledgeMock,
      }))
      vi.doMock("@/features/assistants/core/repository", () => ({
        findAssistantById: vi.fn(async (id: string) => ({
          id,
          name: "Test Assistant",
          organizationId: "org-123",
          knowledgeBaseGroupIds: ["grp-1", "grp-2"],
        })),
      }))

      const { knowledgeSearchTool } = await import("@/lib/tools/builtin/knowledge-search")

      const res = await knowledgeSearchTool.execute(
        { query: "product catalog" },
        { organizationId: "org-123", assistantId: "asst-1" }
      )

      expect(res.found).toBe(true)
      expect(retrieveKnowledgeMock).toHaveBeenCalledTimes(1)
      expect(retrieveKnowledgeMock).toHaveBeenCalledWith(
        "product catalog",
        expect.objectContaining({
          organizationId: "org-123",
          groupIds: ["grp-1", "grp-2"],
        })
      )
    })

    it("passes organizationId and undefined groupIds when assistant has no knowledgeBaseGroupIds", async () => {
      const retrieveKnowledgeMock = vi.fn().mockResolvedValue({
        found: true,
        context: "org text",
        sources: [],
        chunks: [],
      })
      vi.doMock("@/lib/kb-client/facade", () => ({
        retrieveKnowledge: retrieveKnowledgeMock,
      }))
      vi.doMock("@/features/assistants/core/repository", () => ({
        findAssistantById: vi.fn(async (id: string) => ({
          id,
          name: "Test Assistant",
          organizationId: "org-123",
          knowledgeBaseGroupIds: [],
        })),
      }))

      const { knowledgeSearchTool } = await import("@/lib/tools/builtin/knowledge-search")

      await knowledgeSearchTool.execute(
        { query: "general info" },
        { organizationId: "org-123", assistantId: "asst-2" }
      )

      expect(retrieveKnowledgeMock).toHaveBeenCalledWith(
        "general info",
        expect.objectContaining({
          organizationId: "org-123",
          groupIds: undefined,
        })
      )
    })

    it("context {organizationId: \"org_a\"} -> retrieval called with org_a and positive control returns results", async () => {
      const retrieveKnowledgeMock = vi.fn().mockResolvedValue({
        found: true,
        context: "positive context from org_a",
        sources: [{ documentTitle: "Doc A" }],
        chunks: [{ id: "c1", content: "positive context from org_a", similarity: 0.88 }],
      })
      vi.doMock("@/lib/kb-client/facade", () => ({
        retrieveKnowledge: retrieveKnowledgeMock,
      }))
      const { knowledgeSearchTool } = await import("@/lib/tools/builtin/knowledge-search")

      const res = await knowledgeSearchTool.execute(
        { query: "policy question" },
        { organizationId: "org_a" }
      )

      expect(res.found).toBe(true)
      expect(res.resultCount).toBe(1)
      expect(res.context).toBe("positive context from org_a")
      expect(retrieveKnowledgeMock).toHaveBeenCalledTimes(1)
      expect(retrieveKnowledgeMock).toHaveBeenCalledWith(
        "policy question",
        expect.objectContaining({
          organizationId: "org_a",
        })
      )
    })
  })

  describe("vector-store scoping & fail closed (Finding B)", () => {
    it("fails closed when neither organizationId nor groupIds is provided", async () => {
      const surrealQuery = vi.fn()
      configureKb({
        ...makeFakeKbRuntime(),
        vectors: { ...makeFakeKbRuntime().vectors, query: surrealQuery },
      })

      const { searchSimilar, searchByVector, searchSimilarBatch } = await import("@/lib/rag/vector-store")

      const res1 = await searchSimilar("query", 5)
      expect(res1).toEqual([])

      const res2 = await searchByVector([0.1, 0.2], 5)
      expect(res2).toEqual([])

      const res3 = await searchSimilarBatch(["query1", "query2"], 5)
      expect(res3).toEqual([[], []])

      expect(surrealQuery).not.toHaveBeenCalled()
    })

    it("scopes SurrealDB query with document_id IN $document_ids when organizationId is provided", async () => {
      const surrealQuery = vi.fn().mockResolvedValue([
        { status: "OK", result: [
          { id: "chunk_1", document_id: "doc-org-1", content: "Scoped chunk", similarity: 0.9 },
        ]},
      ])
      const findAliveIdsMock = vi.fn(async () => ["doc-org-1"])

      configureKb({
        ...makeFakeKbRuntime(),
        documents: {
          ...makeFakeKbRuntime().documents,
          findAliveIdsByFilter: findAliveIdsMock,
          findAliveMetaByIds: vi.fn(async (ids) => ids.map((id: string) => ({ id, title: "Title", categories: [], subcategory: null }))),
        },
        vectors: { ...makeFakeKbRuntime().vectors, query: surrealQuery },
      })

      vi.doMock("@/lib/rag/embeddings", () => ({
        generateEmbedding: vi.fn(async () => [0.1, 0.2, 0.3]),
        generateEmbeddings: vi.fn(async () => [[0.1, 0.2, 0.3]]),
      }))

      const { searchSimilar } = await import("@/lib/rag/vector-store")
      const res = await searchSimilar("query", 5, undefined, undefined, "org-456")

      expect(findAliveIdsMock).toHaveBeenCalledWith({
        organizationId: "org-456",
        category: undefined,
        groupIds: undefined,
      })
      expect(surrealQuery).toHaveBeenCalledTimes(1)
      const call = surrealQuery.mock.calls[0]
      expect(call[0]).toMatch(/document_id IN \$document_ids/)
      expect(call[1].document_ids).toEqual(["doc-org-1"])
      expect(res.length).toBe(1)
      expect(res[0].id).toBe("chunk_1")
    })

    it("retrieveContext fails closed (empty, no query) when neither organizationId nor groupIds is provided", async () => {
      const surrealQuery = vi.fn()
      const findAliveIdsMock = vi.fn()
      configureKb({
        ...makeFakeKbRuntime(),
        documents: { ...makeFakeKbRuntime().documents, findAliveIdsByFilter: findAliveIdsMock },
        vectors: { ...makeFakeKbRuntime().vectors, query: surrealQuery },
      })

      const { retrieveContext } = await import("@/lib/rag/retriever")
      const res = await retrieveContext("query", { maxChunks: 5 })

      expect(res).toEqual({ context: "", sources: [], chunks: [] })
      expect(findAliveIdsMock).not.toHaveBeenCalled()
      expect(surrealQuery).not.toHaveBeenCalled()
    })

    it("retrieveContext with organizationId and no groupIds calls port with organizationId and scopes SQL", async () => {
      const surrealQuery = vi.fn().mockResolvedValue([
        { status: "OK", result: [
          { id: "chunk_ret_1", document_id: "doc-org-1", content: "Scoped chunk text", similarity: 0.85, metadata: { section: "Sec 1" } },
        ]},
      ])
      const findAliveIdsMock = vi.fn(async () => ["doc-org-1"])

      configureKb({
        ...makeFakeKbRuntime(),
        documents: {
          ...makeFakeKbRuntime().documents,
          findAliveIdsByFilter: findAliveIdsMock,
          findAliveMetaByIds: vi.fn(async (ids) => ids.map((id: string) => ({ id, title: "Title", categories: [], subcategory: null }))),
        },
        vectors: { ...makeFakeKbRuntime().vectors, query: surrealQuery },
      })

      vi.doMock("@/lib/rag/embeddings", () => ({
        generateEmbedding: vi.fn(async () => [0.1, 0.2, 0.3]),
        generateEmbeddings: vi.fn(async () => [[0.1, 0.2, 0.3]]),
      }))

      const { retrieveContext } = await import("@/lib/rag/retriever")
      const res = await retrieveContext("query", { organizationId: "org-tenant-1", maxChunks: 5 })

      expect(findAliveIdsMock).toHaveBeenCalledWith({
        organizationId: "org-tenant-1",
        category: undefined,
        groupIds: undefined,
      })
      expect(surrealQuery).toHaveBeenCalled()
      for (const call of surrealQuery.mock.calls) {
        expect(call[0]).toMatch(/document_id IN \$document_ids/)
        expect(call[1].document_ids).toEqual(["doc-org-1"])
      }
      expect(res.chunks.length).toBe(1)
      expect(res.chunks[0].id).toBe("chunk_ret_1")
    })
  })

  describe("HybridSearch fail closed & scoping (Finding B & E)", () => {
    it("fails closed when neither organizationId nor groupIds is configured", async () => {
      const surrealQuery = vi.fn()
      configureKb({
        ...makeFakeKbRuntime(),
        vectors: { ...makeFakeKbRuntime().vectors, query: surrealQuery },
      })

      const { HybridSearch } = await import("@/lib/rag/hybrid-search")
      const hs = new HybridSearch({ enableEntitySearch: false })
      const res = await hs.search("test query")

      expect(res.results).toEqual([])
      expect(surrealQuery).not.toHaveBeenCalled()
    })

    it("scopes both vector and BM25 arms using scoped document IDs from organizationId", async () => {
      const surrealQuery = vi.fn().mockImplementation(async (sql: string) => {
        if (sql.includes("@@")) {
          return [{ status: "OK", result: [{ id: "bm25_1", document_id: "doc-tenant-1", content: "bm25 text", score: 3.0 }] }]
        }
        return [{ status: "OK", result: [{ id: "vec_1", document_id: "doc-tenant-1", content: "vec text", similarity: 0.95 }] }]
      })

      const findAliveIdsMock = vi.fn(async () => ["doc-tenant-1"])
      configureKb({
        ...makeFakeKbRuntime(),
        documents: { ...makeFakeKbRuntime().documents, findAliveIdsByFilter: findAliveIdsMock },
        vectors: { ...makeFakeKbRuntime().vectors, query: surrealQuery },
      })

      vi.doMock("@/lib/rag/embeddings", () => ({
        generateEmbedding: vi.fn(async () => [0.1, 0.2, 0.3]),
      }))

      process.env.KB_HYBRID_BM25_ENABLED = "true"
      const { HybridSearch } = await import("@/lib/rag/hybrid-search")
      const hs = new HybridSearch({ organizationId: "tenant-abc", enableEntitySearch: false })
      const { results } = await hs.search("scoped test")

      expect(findAliveIdsMock).toHaveBeenCalledWith(expect.objectContaining({
        organizationId: "tenant-abc",
      }))
      expect(results.length).toBeGreaterThan(0)
      for (const call of surrealQuery.mock.calls) {
        expect(call[0]).toMatch(/document_id IN \$(document_ids|documentIds)/)
        const scopedIds = call[1].document_ids ?? call[1].documentIds
        expect(scopedIds).toEqual(["doc-tenant-1"])
      }
    })
  })

  describe("retriever BM25-only chunk similarity (Finding F)", () => {
    it("sets similarity: 0 for BM25-only chunks (does not copy BM25 score)", async () => {
      process.env.KB_HYBRID_BM25_ENABLED = "true"
      process.env.KB_RERANK_ENABLED = "false"
      process.env.KB_QUERY_EXPANSION_ENABLED = "false"

      // Vector arm returns empty, BM25 arm returns a hit with score 4.5
      vi.doMock("@/lib/rag/vector-store", () => ({
        searchWithThreshold: vi.fn(async () => []),
        searchSimilar: vi.fn(async () => []),
      }))
      vi.doMock("@/lib/rag/bm25-search", () => ({
        bm25Search: vi.fn(async () => [
          { id: "chunk_bm25", documentId: "doc-1", content: "BM25 content", score: 4.5 },
        ]),
      }))

      configureKb({
        ...makeFakeKbRuntime(),
        documents: {
          ...makeFakeKbRuntime().documents,
          findAliveIdsByFilter: vi.fn(async () => ["doc-1"]),
        },
      })

      const { retrieveContext } = await import("@/lib/rag/retriever")
      const res = await retrieveContext("search query", {
        organizationId: "org-xyz",
        maxChunks: 5,
      })

      expect(res.chunks.length).toBe(1)
      expect(res.chunks[0].id).toBe("chunk_bm25")
      // Finding F: similarity must remain 0 for BM25-only chunks, never the raw BM25 score
      expect(res.chunks[0].similarity).toBe(0)
    })
  })

  describe("DocumentStore adapter findAliveIdsByFilter (Finding B)", () => {
    it("includes organizationId in prisma where clause when organizationId is supplied", async () => {
      const findManyMock = vi.fn(async () => [{ id: "doc-1" }])
      vi.doMock("@/lib/prisma", () => ({
        prisma: {
          document: {
            findMany: findManyMock,
          },
          knowledgeBaseGroup: {
            findMany: vi.fn(async () => []),
          },
        },
      }))
      const { appKbRuntime } = await import("@/lib/kb-runtime/adapters")
      const runtime = appKbRuntime()
      const ids = await runtime.documents.findAliveIdsByFilter({
        organizationId: "org-tenant-1",
      })
      expect(ids).toEqual(["doc-1"])
      expect(findManyMock).toHaveBeenCalledWith({
        where: {
          deletedAt: null,
          organizationId: "org-tenant-1",
        },
        select: { id: true },
      })
    })

    it("includes both organizationId and groupIds in prisma where clause when both are supplied", async () => {
      const findManyMock = vi.fn(async () => [{ id: "doc-1" }])
      vi.doMock("@/lib/prisma", () => ({
        prisma: {
          document: {
            findMany: findManyMock,
          },
        },
      }))
      vi.doMock("@/features/knowledge/groups/tree", () => ({
        expandGroupIds: vi.fn(async (ids) => ids),
      }))
      const { appKbRuntime } = await import("@/lib/kb-runtime/adapters")
      const runtime = appKbRuntime()
      const ids = await runtime.documents.findAliveIdsByFilter({
        organizationId: "org-tenant-1",
        groupIds: ["grp-1"],
      })
      expect(ids).toEqual(["doc-1"])
      expect(findManyMock).toHaveBeenCalledWith({
        where: {
          deletedAt: null,
          organizationId: "org-tenant-1",
          groups: { some: { groupId: { in: ["grp-1"] } } },
        },
        select: { id: true },
      })
    })
  })
})
