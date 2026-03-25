import { beforeEach, describe, expect, it, vi } from "vitest"
import * as repository from "./repository"
import { createPresignedUpload, uploadMultipartFile, type UploadFileLike } from "./service"

vi.mock("./repository", () => ({
  createFileAttachment: vi.fn(),
  findDashboardSessionOwner: vi.fn(),
  updateOrganizationLogo: vi.fn(),
  updateUserAvatar: vi.fn(),
}))

vi.mock("@/lib/s3", () => ({
  S3Paths: {
    document: vi.fn(() => "documents/global/doc/file.txt"),
    organizationLogo: vi.fn(() => "organizations/org_1/logo/logo.png"),
    userAvatar: vi.fn(() => "users/user_1/avatar/avatar.png"),
    chatAttachment: vi.fn(() => "chat/session_1/message_1/file.txt"),
  },
  validateUpload: vi.fn(() => ({ valid: true })),
  uploadFile: vi.fn(async () => ({
    key: "documents/global/doc/file.txt",
    url: "https://example.test/download",
    size: 32,
  })),
  getPresignedUploadUrl: vi.fn(async () => "https://example.test/upload"),
}))

function makeFile(overrides?: Partial<UploadFileLike>): UploadFileLike {
  return {
    name: overrides?.name || "file.txt",
    type: overrides?.type || "text/plain",
    size: overrides?.size || 32,
    arrayBuffer: overrides?.arrayBuffer || (async () => new TextEncoder().encode("hello").buffer),
  }
}

describe("upload service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("rejects invalid upload types", async () => {
    const result = await uploadMultipartFile({
      userId: "user_1",
      file: makeFile(),
      type: "bad-type",
      organizationContext: null,
    })

    expect(result).toEqual({
      status: 400,
      error: "Invalid upload type. Must be: document, logo, avatar, or attachment",
    })
  })

  it("requires session ownership for attachments", async () => {
    vi.mocked(repository.findDashboardSessionOwner).mockResolvedValue({ userId: "other" } as never)

    const result = await uploadMultipartFile({
      userId: "user_1",
      file: makeFile(),
      type: "attachment",
      targetId: "session_1",
      organizationContext: null,
    })

    expect(result).toEqual({ status: 404, error: "Session not found or access denied" })
  })

  it("uploads attachment and persists file metadata", async () => {
    vi.mocked(repository.findDashboardSessionOwner).mockResolvedValue({ userId: "user_1" } as never)

    const result = await uploadMultipartFile({
      userId: "user_1",
      file: makeFile(),
      type: "attachment",
      targetId: "session_1",
      organizationContext: null,
    })

    expect(result).toMatchObject({
      key: "documents/global/doc/file.txt",
      url: "https://example.test/download",
      filename: "file.txt",
      contentType: "text/plain",
      size: 32,
    })
    expect(repository.createFileAttachment).toHaveBeenCalled()
  })

  it("creates presigned upload URL", async () => {
    const result = await createPresignedUpload({
      userId: "user_1",
      input: {
        filename: "file.txt",
        contentType: "text/plain",
        size: 12,
        type: "document",
      },
      organizationContext: null,
    })

    expect(result).toMatchObject({
      uploadUrl: "https://example.test/upload",
      key: "documents/global/doc/file.txt",
    })
  })
})
