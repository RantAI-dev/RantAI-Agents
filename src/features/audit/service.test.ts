import { beforeEach, describe, expect, it, vi } from "vitest"
import { listDashboardAuditLogs } from "./service"
import * as repository from "./repository"
import { hasPermission } from "@/lib/digital-employee/rbac"

vi.mock("@/lib/digital-employee/rbac", () => ({
  hasPermission: vi.fn(),
}))

vi.mock("./repository", () => ({
  findDashboardAuditLogs: vi.fn(),
}))

describe("dashboard audit service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(hasPermission).mockReturnValue(true)
  })

  it("returns audit logs with pagination metadata", async () => {
    vi.mocked(repository.findDashboardAuditLogs).mockResolvedValue([
      { id: "log_1" },
      { id: "log_0" },
    ] as never)

    const result = await listDashboardAuditLogs({
      context: {
        organizationId: "org_1",
        role: "admin",
      },
      input: {
        limit: "1",
      } as never,
    })

    expect(result).toEqual({
      items: [{ id: "log_1" }],
      nextCursor: "log_1",
      hasMore: true,
    })
  })

  it("blocks callers without audit permission", async () => {
    vi.mocked(hasPermission).mockReturnValue(false)

    const result = await listDashboardAuditLogs({
      context: {
        organizationId: "org_1",
        role: "member",
      },
      input: {} as never,
    })

    expect(result).toEqual({ status: 403, error: "Insufficient permissions" })
  })
})
