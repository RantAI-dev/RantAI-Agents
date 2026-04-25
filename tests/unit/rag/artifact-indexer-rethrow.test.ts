// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest"

const { findUniqueMock, updateMock } = vi.hoisted(() => ({
  findUniqueMock: vi.fn(),
  updateMock: vi.fn(),
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    document: {
      findUnique: findUniqueMock,
      update: updateMock,
    },
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
  updateMock.mockReset()
  storeChunksMock.mockReset()
  deleteChunksMock.mockReset()
  embeddingsMock.mockReset()
})

describe("indexArtifactContent — non-fatal failure", () => {
  it("does not rethrow when storeChunks fails (caller should not need to .catch)", async () => {
    findUniqueMock.mockResolvedValue({ metadata: null })
    updateMock.mockResolvedValue({})
    embeddingsMock.mockResolvedValue([[0.1], [0.2]])
    storeChunksMock.mockRejectedValue(new Error("vector store down"))

    // The test passes if this resolves cleanly. Without the fix the
    // function rethrows and a fire-and-forget caller without `.catch`
    // would surface an unhandled rejection.
    await expect(
      indexArtifactContent("doc-1", "Doc", "x".repeat(2000)),
    ).resolves.toBeUndefined()

    expect(updateMock).toHaveBeenCalled()
    const updateArgs = updateMock.mock.calls[0][0]
    expect(updateArgs.data.metadata.ragIndexed).toBe(false)
  })
})
