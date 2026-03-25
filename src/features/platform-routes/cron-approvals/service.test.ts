import { beforeEach, describe, expect, it, vi } from "vitest"
import * as repository from "./repository"
import { processExpiredApprovals } from "./service"

vi.mock("./repository", () => ({
  findExpiredApprovals: vi.fn(),
  findRunById: vi.fn(),
  markApprovalExpired: vi.fn(),
  markRunFailed: vi.fn(),
}))

describe("cron approvals service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("expires approvals and fails paused runs based on timeout action", async () => {
    const now = new Date("2026-03-23T00:00:00.000Z")

    vi.mocked(repository.findExpiredApprovals).mockResolvedValue([
      { id: "approval_1", employeeRunId: "run_1", timeoutAction: "approve" },
      { id: "approval_2", employeeRunId: "run_2", timeoutAction: "reject" },
      { id: "approval_3", employeeRunId: "run_3", timeoutAction: null },
    ] as never)

    vi.mocked(repository.findRunById).mockImplementation(async (runId) => {
      if (runId === "run_1") return { id: "run_1", status: "PAUSED" } as never
      if (runId === "run_2") return { id: "run_2", status: "PAUSED" } as never
      return null as never
    })

    const result = await processExpiredApprovals(now)

    expect(result).toEqual({ processed: 3, total: 3 })
    expect(repository.markApprovalExpired).toHaveBeenCalledTimes(3)
    expect(repository.markRunFailed).toHaveBeenCalledWith("run_1", "Approval expired", now)
    expect(repository.markRunFailed).toHaveBeenCalledWith(
      "run_2",
      "Approval expired (rejected)",
      now
    )
  })

  it("skips run updates when no paused run is found", async () => {
    vi.mocked(repository.findExpiredApprovals).mockResolvedValue([
      { id: "approval_1", employeeRunId: "run_1", timeoutAction: "approve" },
    ] as never)
    vi.mocked(repository.findRunById).mockResolvedValue({ id: "run_1", status: "RUNNING" } as never)

    const result = await processExpiredApprovals()

    expect(result).toEqual({ processed: 1, total: 1 })
    expect(repository.markRunFailed).not.toHaveBeenCalled()
  })
})
