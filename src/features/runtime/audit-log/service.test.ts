import { beforeEach, describe, expect, it, vi } from "vitest"
import { logRuntimeAudit } from "./service"
import * as repository from "./repository"

vi.mock("./repository", () => ({
  createRuntimeAuditLogEntry: vi.fn(),
  findRuntimeAuditEmployeeOrganization: vi.fn(),
}))

vi.mock("@/lib/digital-employee/audit", () => ({
  classifyActionRisk: vi.fn(() => "medium"),
}))

describe("runtime-audit-log service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns 404 when the employee is missing", async () => {
    vi.mocked(repository.findRuntimeAuditEmployeeOrganization).mockResolvedValue(null)

    const result = await logRuntimeAudit({
      employeeId: "employee_1",
      input: { action: "message.send", resource: "message:1" },
      ipAddress: "127.0.0.1",
    })

    expect(result).toEqual({ status: 404, error: "Employee not found" })
  })

  it("creates an audit entry with derived risk level", async () => {
    vi.mocked(repository.findRuntimeAuditEmployeeOrganization).mockResolvedValue({
      organizationId: "org_1",
    } as never)

    const result = await logRuntimeAudit({
      employeeId: "employee_1",
      input: { action: "message.send", resource: "message:1" },
      ipAddress: "127.0.0.1",
    })

    expect(result).toEqual({ success: true })
    expect(repository.createRuntimeAuditLogEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org_1",
        employeeId: "employee_1",
        action: "message.send",
        resource: "message:1",
        ipAddress: "127.0.0.1",
        riskLevel: "medium",
      })
    )
  })
})
