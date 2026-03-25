import { beforeEach, describe, expect, it, vi } from "vitest"
import * as repository from "./repository"
import { accessFileByKey } from "./service"

vi.mock("./repository", () => ({
  findDashboardSessionOwner: vi.fn(),
}))

vi.mock("@/lib/s3", () => ({
  fileExists: vi.fn(async () => true),
  getFileMetadata: vi.fn(async () => ({
    contentType: "text/plain",
    contentLength: 123,
  })),
  getPresignedDownloadUrl: vi.fn(async () => "https://example.test/download"),
}))

describe("files service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns access denied for org file outside user org", async () => {
    const result = await accessFileByKey({
      s3Key: "organizations/org_2/logo/file.png",
      userId: "user_1",
      organizationId: "org_1",
      shouldRedirect: false,
      forceDownload: false,
    })

    expect(result).toEqual({ status: 403, error: "Access denied" })
  })

  it("allows chat file for session owner", async () => {
    vi.mocked(repository.findDashboardSessionOwner).mockResolvedValue({ userId: "user_1" } as never)

    const result = await accessFileByKey({
      s3Key: "chat/session_1/msg_1/file.txt",
      userId: "user_1",
      organizationId: null,
      shouldRedirect: false,
      forceDownload: false,
    })

    expect(result).toMatchObject({
      shouldRedirect: false,
      url: "https://example.test/download",
      filename: "file.txt",
      contentType: "text/plain",
      size: 123,
    })
  })
})
