import { beforeEach, describe, expect, it, vi } from "vitest"

// enqueueFileIngest is the async (background) upload path. The resolved MIME
// type is recorded on the placeholder Document and the IngestJob, so it must
// be in scope after the S3 upload — a try-scoped const threw ReferenceError on
// every upload.

vi.mock("@/features/knowledge/documents/repository", () => ({
  createKnowledgeDocument: vi.fn(async (data: Record<string, unknown>) => ({
    ...data,
    groups: [],
  })),
  countKnowledgeDocumentsForScope: vi.fn(),
  deleteKnowledgeDocument: vi.fn(),
  findKnowledgeDocumentAccessById: vi.fn(),
  findKnowledgeDocumentById: vi.fn(),
  listKnowledgeDocumentsByScope: vi.fn(),
  replaceKnowledgeDocumentContent: vi.fn(),
  restoreKnowledgeDocument: vi.fn(),
  softDeleteKnowledgeDocument: vi.fn(),
  updateKnowledgeDocumentWithGroups: vi.fn(),
}))

vi.mock("@/lib/rag", () => ({
  detectFileType: vi.fn(() => "markdown"),
  getDocumentChunkCount: vi.fn(),
  getDocumentChunkCounts: vi.fn(),
}))

vi.mock("@/lib/surrealdb", () => ({ getSurrealClient: vi.fn() }))

vi.mock("@/lib/s3", () => ({
  S3Paths: { document: vi.fn(() => "documents/org_a/doc/deck.pptx") },
  deleteFile: vi.fn(),
  uploadFile: vi.fn(async (_key: string, buf: Buffer) => ({ size: buf.length })),
  validateUpload: vi.fn(() => ({ valid: true })),
}))

vi.mock("@/lib/ocr", () => ({ isPDFScanned: vi.fn(), processDocumentOCR: vi.fn() }))

vi.mock("@/lib/quota/knowledge", () => ({
  checkKnowledgeQuota: vi.fn(async () => ({ allowed: true })),
}))

vi.mock("@/lib/ingest/job", () => ({
  createIngestJob: vi.fn(async () => "job_1"),
}))

const { enqueueFileIngest } = await import("@/features/knowledge/documents/service")
const repository = await import("@/features/knowledge/documents/repository")
const job = await import("@/lib/ingest/job")
const s3 = await import("@/lib/s3")

const PPTX = "application/vnd.openxmlformats-officedocument.presentationml.presentation"

describe("enqueueFileIngest", () => {
  beforeEach(() => vi.clearAllMocks())

  it("records the extension-resolved MIME on upload, document and job", async () => {
    // Browsers often send octet-stream for Office files; the extension decides.
    const file = new File(["slides"], "deck.pptx", { type: "application/octet-stream" })
    const res = await enqueueFileIngest({
      context: { organizationId: "org_a", userId: "u1", role: "owner" } as never,
      input: { kind: "file", file, groupIds: [] } as never,
    })

    expect(res).toMatchObject({ jobId: "job_1", status: "processing" })
    expect(vi.mocked(s3.uploadFile).mock.calls[0][2]).toBe(PPTX)
    expect(vi.mocked(repository.createKnowledgeDocument).mock.calls[0][0]).toMatchObject({ mimeType: PPTX })
    expect(vi.mocked(job.createIngestJob).mock.calls[0][0]).toMatchObject({ mimeType: PPTX })
  })

  it("keeps a specific browser MIME as-is", async () => {
    const file = new File(["# hi"], "notes.md", { type: "text/markdown" })
    await enqueueFileIngest({
      context: { organizationId: "org_a", userId: "u1", role: "owner" } as never,
      input: { kind: "file", file, groupIds: [] } as never,
    })
    expect(vi.mocked(job.createIngestJob).mock.calls[0][0]).toMatchObject({ mimeType: "text/markdown" })
  })
})
