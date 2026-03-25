import { beforeEach, describe, expect, it, vi } from "vitest"
import { respondToDashboardApproval } from "./service"
import * as repository from "./repository"

vi.mock("./repository", () => ({
  findDashboardApprovalById: vi.fn(),
  findDashboardEmployeeGroupById: vi.fn(),
  findDashboardEmployeeRunById: vi.fn(),
  updateDashboardApprovalById: vi.fn(),
  updateDashboardEmployeeMessageStatus: vi.fn(),
}))

vi.mock("@/lib/digital-employee", () => ({
  orchestrator: {
    getGroupContainerUrl: vi.fn(),
  },
}))

describe("dashboard-approval-responses service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("rejects invalid status values", async () => {
    await expect(
      respondToDashboardApproval({
        id: "approval_1",
        userId: "user_1",
        input: { status: "approved" },
      })
    ).resolves.toEqual({ status: 404, error: "Approval not found" })
  })

  it("returns 404 for missing approval", async () => {
    vi.mocked(repository.findDashboardApprovalById).mockResolvedValue(null)

    const result = await respondToDashboardApproval({
      id: "approval_1",
      userId: "user_1",
      input: { status: "approved" },
    })

    expect(result).toEqual({ status: 404, error: "Approval not found" })
  })
})
