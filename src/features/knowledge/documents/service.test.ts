import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  createKnowledgeDocumentForDashboard,
  deleteKnowledgeDocumentForDashboard,
  getKnowledgeDocumentForDashboard,
  getKnowledgeDocumentIntelligence,
  listKnowledgeDocumentsForDashboard,
  updateKnowledgeDocumentForDashboard,
} from "./service"
import * as repository from "./repository"

vi.mock("./repository", () => ({
  createKnowledgeDocument: vi.fn(),
  deleteKnowledgeDocument: vi.fn(),
  findKnowledgeDocumentAccessById: vi.fn(),
  findKnowledgeDocumentById: vi.fn(),
  findOrganizationDocumentStats: vi.fn(),
  listKnowledgeDocumentsByScope: vi.fn(),
  updateKnowledgeDocumentWithGroups: vi.fn(),
}))

vi.mock("@/lib/rag", () => ({
  chunkDocument: vi.fn(),
  detectFileType: vi.fn(),
  generateEmbeddings: vi.fn(),
  getDocumentChunkCount: vi.fn(),
  smartChunkDocument: vi.fn(),
  storeChunks: vi.fn(),
}))

vi.mock("@/lib/document-intelligence", () => ({
  extractEntities: vi.fn(),
  extractEntitiesAndRelations: vi.fn(),
}))

vi.mock("@/lib/surrealdb", () => ({
  getSurrealClient: vi.fn(),
}))

vi.mock("@/lib/s3", () => ({
  S3Paths: {
    document: vi.fn(() => "s3://bucket/doc"),
  },
  deleteFile: vi.fn(),
  getPresignedDownloadUrl: vi.fn(),
  uploadFile: vi.fn(),
  validateUpload: vi.fn(() => ({ valid: true })),
}))

vi.mock("@/lib/ocr", () => ({
  isPDFScanned: vi.fn(),
  processDocumentOCR: vi.fn(),
}))

describe("dashboard knowledge documents service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("lists documents in scope", async () => {
    vi.mocked(repository.listKnowledgeDocumentsByScope).mockResolvedValue([
      {
        id: "doc_1",
        title: "Doc",
        categories: ["FAQ"],
        subcategory: null,
        fileType: "markdown",
        metadata: null,
        artifactType: null,
        fileSize: 12,
        s3Key: null,
        groups: [{ group: { id: "group_1", name: "Guides", color: "#fff" } }],
        createdAt: new Date("2024-01-01T00:00:00.000Z"),
        updatedAt: new Date("2024-01-02T00:00:00.000Z"),
      },
    ] as never)
    vi.mocked((await import("@/lib/rag")).getDocumentChunkCount).mockResolvedValue(3)

    const result = await listKnowledgeDocumentsForDashboard({
      organizationId: null,
      groupId: null,
    })

    expect(result[0]).toMatchObject({
      id: "doc_1",
      chunkCount: 3,
      groups: [{ id: "group_1", name: "Guides", color: "#fff" }],
    })
  })

  it("returns 404 when a document is missing", async () => {
    vi.mocked(repository.findKnowledgeDocumentById).mockResolvedValue(null)

    const result = await getKnowledgeDocumentForDashboard({
      documentId: "doc_missing",
      organizationId: null,
    })

    expect(result).toEqual({ status: 404, error: "Document not found" })
  })

  it("creates a JSON knowledge document", async () => {
    vi.mocked(repository.findOrganizationDocumentStats).mockResolvedValue(null as never)
    vi.mocked(repository.createKnowledgeDocument).mockResolvedValue({
      id: "doc_1",
      title: "Doc",
      categories: ["FAQ"],
      groups: [{ group: { id: "group_1", name: "Guides", color: "#fff" } }],
    } as never)
    vi.mocked((await import("@/lib/rag")).chunkDocument).mockReturnValue([{ content: "chunk" }] as never)
    vi.mocked((await import("@/lib/rag")).generateEmbeddings).mockResolvedValue([[1, 2, 3]] as never)

    const result = await createKnowledgeDocumentForDashboard({
      context: { userId: "user_1", organizationId: null, role: null },
      input: {
        kind: "json",
        title: "Doc",
        content: "Hello world",
        categories: ["FAQ"],
        groupIds: ["group_1"],
        useEnhanced: false,
        useCombined: true,
      } as never,
    })

    expect(result).toMatchObject({
      id: "doc_1",
      title: "Doc",
      chunkCount: 1,
      enhanced: false,
    })
  })

  it("updates a document and its groups", async () => {
    vi.mocked(repository.findKnowledgeDocumentAccessById).mockResolvedValue({
      id: "doc_1",
      organizationId: null,
      s3Key: null,
    } as never)
    vi.mocked(repository.updateKnowledgeDocumentWithGroups).mockResolvedValue({
      id: "doc_1",
      title: "Doc",
      categories: ["FAQ"],
      subcategory: null,
      groups: [{ group: { id: "group_1", name: "Guides", color: "#fff" } }],
    } as never)

    const result = await updateKnowledgeDocumentForDashboard({
      documentId: "doc_1",
      organizationId: null,
      role: null,
      input: {
        title: "Doc",
        categories: ["FAQ"],
        groupIds: ["group_1"],
      } as never,
    })

    expect(result).toMatchObject({
      id: "doc_1",
      groups: [{ id: "group_1", name: "Guides", color: "#fff" }],
    })
  })

  it("deletes a document after cleanup", async () => {
    vi.mocked(repository.findKnowledgeDocumentAccessById).mockResolvedValue({
      id: "doc_1",
      organizationId: null,
      s3Key: null,
    } as never)
    const client = {
      cleanupDocumentIntelligence: vi.fn().mockResolvedValue({
        deletedRelationTables: 0,
        entitiesDeleted: 0,
        chunksDeleted: 0,
      }),
    }
    vi.mocked((await import("@/lib/surrealdb")).getSurrealClient).mockResolvedValue(client as never)
    vi.mocked(repository.deleteKnowledgeDocument).mockResolvedValue({} as never)

    const result = await deleteKnowledgeDocumentForDashboard({
      documentId: "doc_1",
      organizationId: null,
      role: null,
    })

    expect(result).toEqual({ success: true })
  })

  it("returns document intelligence data", async () => {
    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce([
          [
            {
              id: "entity_1",
              name: "Policy",
              type: "topic",
              confidence: 0.9,
              document_id: "doc_1",
            },
          ],
        ])
        .mockResolvedValueOnce([{ tables: {} }]),
    }
    vi.mocked((await import("@/lib/surrealdb")).getSurrealClient).mockResolvedValue(client as never)

    const result = await getKnowledgeDocumentIntelligence({ documentId: "doc_1" })

    expect(result).toMatchObject({
      status: "completed",
      stats: {
        totalEntities: 1,
      },
    })
  })
})
