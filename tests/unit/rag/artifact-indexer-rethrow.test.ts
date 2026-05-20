// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest"

const { findUniqueMock, executeRawMock } = vi.hoisted(() => ({
  findUniqueMock: vi.fn(),
  executeRawMock: vi.fn(),
}))

// D-2: markRagStatus uses prisma.$executeRaw (jsonb_set) instead of
// findUnique + update. Test mirrors the live shape.
vi.mock("@/lib/prisma", () => ({
  prisma: {
    document: {
      findUnique: findUniqueMock,
    },
    $executeRaw: executeRawMock,
  },
}))

const { storeChunksMock, deleteChunksMock, embeddingsMock } = vi.hoisted(() => ({
  storeChunksMock: vi.fn(),
  deleteChunksMock: vi.fn(),
  embeddingsMock: vi.fn(),
}))

vi.mock("@/lib/rag/vector-store", () => ({
  storeChunks: storeChunksMock,
  deleteChunksByDocumentId: deleteChunksMock,
}))

vi.mock("@/lib/rag/embeddings", () => ({
  generateEmbeddings: embeddingsMock,
}))

import { indexArtifactContent } from "@/lib/rag/artifact-indexer"

beforeEach(() => {
  findUniqueMock.mockReset()
  executeRawMock.mockReset()
  storeChunksMock.mockReset()
  deleteChunksMock.mockReset()
  embeddingsMock.mockReset()
})

describe("indexArtifactContent — non-fatal failure", () => {
  it("does not rethrow when storeChunks fails (caller should not need to .catch)", async () => {
    findUniqueMock.mockResolvedValue({ metadata: null })
    executeRawMock.mockResolvedValue(1)
    embeddingsMock.mockResolvedValue([[0.1], [0.2]])
    storeChunksMock.mockRejectedValue(new Error("vector store down"))

    // The test passes if this resolves cleanly. Without the fix the
    // function rethrows and a fire-and-forget caller without `.catch`
    // would surface an unhandled rejection.
    await expect(
      indexArtifactContent("doc-1", "Doc", "x".repeat(2000)),
    ).resolves.toBeUndefined()

    // Failure path writes ragIndexed=false via jsonb_set.
    expect(executeRawMock).toHaveBeenCalled()
  })
})
