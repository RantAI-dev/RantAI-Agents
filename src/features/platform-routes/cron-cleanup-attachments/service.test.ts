import { beforeEach, describe, expect, it, vi } from "vitest"
import * as repository from "./repository"
import { runCleanupAttachments } from "./service"

vi.mock("./repository", () => ({
  cleanupAttachments: vi.fn(),
}))

describe("cron cleanup attachments service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns unauthorized when cron secret does not match", async () => {
    const result = await runCleanupAttachments({
      authorizationHeader: "Bearer wrong",
      cronSecret: "correct",
    })

    expect(result).toEqual({ status: 401, error: "Unauthorized" })
    expect(repository.cleanupAttachments).not.toHaveBeenCalled()
  })

  it("runs cleanup when authorized", async () => {
    vi.mocked(repository.cleanupAttachments).mockResolvedValue({
      deletedCount: 3,
      documentIds: ["doc_1", "doc_2", "doc_3"],
    })

    const result = await runCleanupAttachments({
      authorizationHeader: "Bearer secret",
      cronSecret: "secret",
    })

    expect(result).toEqual({
      success: true,
      deletedCount: 3,
      documentIds: ["doc_1", "doc_2", "doc_3"],
    })
    expect(repository.cleanupAttachments).toHaveBeenCalledWith(24)
  })
})
