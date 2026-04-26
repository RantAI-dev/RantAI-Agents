// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest"

const { findSessionMock, findArtifactMock, deleteArtifactMock } = vi.hoisted(() => ({
  findSessionMock: vi.fn(),
  findArtifactMock: vi.fn(),
  deleteArtifactMock: vi.fn(),
}))

vi.mock("@/features/conversations/sessions/repository", () => ({
  findDashboardSessionBasicByIdAndUser: findSessionMock,
  findDashboardArtifactByIdAndSession: findArtifactMock,
  deleteDashboardArtifactById: deleteArtifactMock,
  // unused by the function under test but required to satisfy the module shape
  createDashboardMessages: vi.fn(),
  createDashboardSession: vi.fn(),
  deleteArtifactsBySessionId: vi.fn(),
  deleteDashboardMessagesBySession: vi.fn(),
  deleteDashboardSessionById: vi.fn(),
  findArtifactsBySessionId: vi.fn(),
  findDashboardMessageByIdAndSession: vi.fn(),
  findDashboardSessionByIdAndUser: vi.fn(),
  findDashboardSessionsByUser: vi.fn(),
  updateDashboardArtifactByIdLocked: vi.fn(),
  updateDashboardMessageById: vi.fn(),
  updateDashboardSessionTitle: vi.fn(),
}))

const { deleteFileMock, deleteFilesMock, uploadFileMock } = vi.hoisted(() => ({
  deleteFileMock: vi.fn(),
  deleteFilesMock: vi.fn(),
  uploadFileMock: vi.fn(),
}))

vi.mock("@/lib/s3", () => ({
  deleteFile: deleteFileMock,
  deleteFiles: deleteFilesMock,
  uploadFile: uploadFileMock,
}))

const { deleteChunksMock } = vi.hoisted(() => ({
  deleteChunksMock: vi.fn(),
}))

vi.mock("@/lib/rag", () => ({
  deleteChunksByDocumentId: deleteChunksMock,
}))

vi.mock("@/lib/tools/builtin/_validate-artifact", () => ({
  validateArtifactContent: vi.fn(),
  formatValidationError: vi.fn(),
}))

import { deleteDashboardChatSessionArtifact } from "@/features/conversations/sessions/service"

beforeEach(() => {
  findSessionMock.mockReset()
  findArtifactMock.mockReset()
  deleteArtifactMock.mockReset()
  deleteFileMock.mockReset()
  deleteFilesMock.mockReset()
  deleteChunksMock.mockReset()
})

describe("deleteDashboardChatSessionArtifact — RAG cleanup", () => {
  it("calls deleteChunksByDocumentId for the deleted artifact", async () => {
    findSessionMock.mockResolvedValue({ id: "s-1", userId: "u-1" })
    findArtifactMock.mockResolvedValue({
      id: "art-1",
      s3Key: "artifacts/o-1/s-1/art-1.html",
      metadata: null,
    })
    deleteFileMock.mockResolvedValue(undefined)
    deleteChunksMock.mockResolvedValue(undefined)
    deleteArtifactMock.mockResolvedValue(undefined)

    const result = await deleteDashboardChatSessionArtifact({
      userId: "u-1",
      sessionId: "s-1",
      artifactId: "art-1",
    })

    expect(result).toEqual({ success: true })
    expect(deleteChunksMock).toHaveBeenCalledWith("art-1")
    expect(deleteChunksMock).toHaveBeenCalledTimes(1)
  })

  it("deletes archived versioned S3 keys from metadata.versions[*].s3Key", async () => {
    findSessionMock.mockResolvedValue({ id: "s-1", userId: "u-1" })
    findArtifactMock.mockResolvedValue({
      id: "art-9",
      s3Key: "artifacts/o-1/s-1/art-9.html",
      metadata: {
        versions: [
          { title: "v1", timestamp: 1, contentLength: 100, s3Key: "artifacts/o-1/s-1/art-9.html.v1" },
          { title: "v2", timestamp: 2, contentLength: 100, s3Key: "artifacts/o-1/s-1/art-9.html.v2" },
          { title: "v3", timestamp: 3, contentLength: 50, archiveFailed: true }, // no s3Key
        ],
      },
    })
    deleteFileMock.mockResolvedValue(undefined)
    deleteFilesMock.mockResolvedValue(undefined)
    deleteChunksMock.mockResolvedValue(undefined)
    deleteArtifactMock.mockResolvedValue(undefined)

    await deleteDashboardChatSessionArtifact({
      userId: "u-1",
      sessionId: "s-1",
      artifactId: "art-9",
    })

    // Versioned keys should be cleaned via deleteFiles (skipping the entry without s3Key)
    expect(deleteFilesMock).toHaveBeenCalledWith([
      "artifacts/o-1/s-1/art-9.html.v1",
      "artifacts/o-1/s-1/art-9.html.v2",
    ])
  })

  it("handles legacy artifacts with malformed/missing metadata.versions", async () => {
    findSessionMock.mockResolvedValue({ id: "s-1", userId: "u-1" })
    findArtifactMock.mockResolvedValue({
      id: "art-legacy",
      s3Key: "artifacts/o-1/s-1/art-legacy.md",
      metadata: null, // legacy artifact predates versioning
    })
    deleteFileMock.mockResolvedValue(undefined)
    deleteChunksMock.mockResolvedValue(undefined)
    deleteArtifactMock.mockResolvedValue(undefined)

    const result = await deleteDashboardChatSessionArtifact({
      userId: "u-1",
      sessionId: "s-1",
      artifactId: "art-legacy",
    })

    expect(result).toEqual({ success: true })
    // No versioned keys to delete, so deleteFiles is not called
    expect(deleteFilesMock).not.toHaveBeenCalled()
  })

  it("still deletes the artifact when RAG chunk cleanup fails (non-fatal)", async () => {
    findSessionMock.mockResolvedValue({ id: "s-1", userId: "u-1" })
    findArtifactMock.mockResolvedValue({
      id: "art-2",
      s3Key: "artifacts/o-1/s-1/art-2.tsx",
      metadata: null,
    })
    deleteFileMock.mockResolvedValue(undefined)
    deleteChunksMock.mockRejectedValue(new Error("vector store unreachable"))
    deleteArtifactMock.mockResolvedValue(undefined)

    const result = await deleteDashboardChatSessionArtifact({
      userId: "u-1",
      sessionId: "s-1",
      artifactId: "art-2",
    })

    expect(result).toEqual({ success: true })
    expect(deleteArtifactMock).toHaveBeenCalledWith("art-2")
  })
})
