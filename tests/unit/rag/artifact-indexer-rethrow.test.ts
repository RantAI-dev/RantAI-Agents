// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest"
import { configureKb } from "@/lib/kb-runtime/runtime"

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

// markRagStatus writes the flag through the DocumentStore port (the adapter
// keeps the atomic jsonb_set), so the test asserts on the port.
const setMetadataFlag = vi.fn(async () => {})

beforeEach(() => {
  storeChunksMock.mockReset()
  deleteChunksMock.mockReset()
  embeddingsMock.mockReset()
  setMetadataFlag.mockReset()
  configureKb({
    documents: {
      findAliveIdsByFilter: vi.fn(async () => []),
      findAliveMetaByIds: vi.fn(async () => []),
      findById: vi.fn(async () => null),
      filterVisibleIds: vi.fn(async (ids: string[]) => ids),
      listAll: vi.fn(async () => []),
      deleteById: vi.fn(async () => {}),
      deleteAll: vi.fn(async () => {}),
      setStatus: vi.fn(async () => {}),
      updateMetadata: vi.fn(async () => {}),
      setMetadataFlag,
      recordRetrievalHits: vi.fn(async () => {}),
    },
  })
})

describe("indexArtifactContent — non-fatal failure", () => {
  it("does not rethrow when storeChunks fails (caller should not need to .catch)", async () => {
    embeddingsMock.mockResolvedValue([[0.1], [0.2]])
    storeChunksMock.mockRejectedValue(new Error("vector store down"))

    // The test passes if this resolves cleanly. Without the fix the
    // function rethrows and a fire-and-forget caller without `.catch`
    // would surface an unhandled rejection.
    await expect(
      indexArtifactContent("doc-1", "Doc", "x".repeat(2000)),
    ).resolves.toBeUndefined()

    // Failure path still records ragIndexed=false.
    expect(setMetadataFlag).toHaveBeenCalledWith("doc-1", "ragIndexed", false)
  })
})
