import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  createDashboardDigitalEmployee,
  deleteDashboardDigitalEmployee,
  exportDashboardDigitalEmployeeData,
  generateDashboardDigitalEmployeePackage,
  getDashboardDigitalEmployee,
  getDashboardDigitalEmployeeVncUrl,
  listDashboardDigitalEmployeeActivity,
  listDashboardDigitalEmployeeApprovals,
  listDashboardDigitalEmployeeMemoryEntries,
  listDashboardDigitalEmployees,
  listPendingDigitalEmployeeApprovals,
  purgeDashboardDigitalEmployeeData,
  updateDashboardDigitalEmployee,
} from "./service"
import * as repository from "./repository"
import * as retention from "@/lib/digital-employee/retention"
import * as packageGenerator from "@/lib/digital-employee/package-generator"

vi.mock("./repository", () => ({
  findDashboardDigitalEmployeesByOrganization: vi.fn(),
  findDashboardDigitalEmployeeById: vi.fn(),
  findDashboardDigitalEmployeeForPermissions: vi.fn(),
  findDashboardDigitalEmployeeAssistantForCreate: vi.fn(),
  findDashboardDigitalEmployeeGroupForCreate: vi.fn(),
  createDashboardDigitalEmployeeGroup: vi.fn(),
  createDashboardDigitalEmployee: vi.fn(),
  createDashboardDigitalEmployeeWorkspaceFile: vi.fn(),
  findDashboardPendingApprovals: vi.fn(),
  findDashboardDigitalEmployeeRuns: vi.fn(),
  findDashboardDigitalEmployeeApprovals: vi.fn(),
  findDashboardDigitalEmployeeMemory: vi.fn(),
  findDashboardDigitalEmployeeVncContext: vi.fn(),
  updateDashboardDigitalEmployeeById: vi.fn(),
  deleteDashboardDigitalEmployeeById: vi.fn(),
}))

vi.mock("@/lib/digital-employee/audit", () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
  classifyActionRisk: vi.fn(() => "low"),
  AUDIT_ACTIONS: {
    EMPLOYEE_CREATE: "EMPLOYEE_CREATE",
    EMPLOYEE_UPDATE: "EMPLOYEE_UPDATE",
    EMPLOYEE_DELETE: "EMPLOYEE_DELETE",
  },
}))

vi.mock("@/lib/digital-employee/retention", () => ({
  exportEmployeeData: vi.fn(),
  purgeEmployeeData: vi.fn(),
}))

vi.mock("@/lib/digital-employee/package-generator", () => ({
  generateEmployeePackage: vi.fn(),
}))

describe("dashboard digital employees service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("lists employees with derived fields", async () => {
    vi.mocked(repository.findDashboardDigitalEmployeesByOrganization).mockResolvedValue([
      {
        id: "emp_1",
        name: "Alice",
        description: null,
        totalTokensUsed: BigInt(100),
        runs: [{ status: "COMPLETED", output: "Hello world" }],
        _count: { approvals: 2 },
      },
    ] as never)

    const result = await listDashboardDigitalEmployees({ organizationId: "org_1" })

    expect(result[0]).toEqual(
      expect.objectContaining({
        id: "emp_1",
        totalTokensUsed: "100",
        latestRunStatus: "COMPLETED",
        pendingApprovalCount: 2,
      })
    )
  })

  it("creates a digital employee and workspace files", async () => {
    vi.mocked(repository.findDashboardDigitalEmployeeAssistantForCreate).mockResolvedValue({
      id: "assistant_1",
      systemPrompt: "Be helpful",
      tools: [{ tool: { displayName: "Tool", name: "tool" } }],
      skills: [{ skill: { displayName: "Skill", name: "skill" } }],
      assistantWorkflows: [{ workflow: { name: "Workflow" } }],
    } as never)
    vi.mocked(repository.createDashboardDigitalEmployeeGroup).mockResolvedValue({
      id: "group_1",
    } as never)
    vi.mocked(repository.createDashboardDigitalEmployee).mockResolvedValue({
      id: "emp_1",
      name: "Alice",
      totalTokensUsed: BigInt(0),
    } as never)
    vi.mocked(repository.createDashboardDigitalEmployeeWorkspaceFile).mockResolvedValue({} as never)

    const result = await createDashboardDigitalEmployee({
      context: {
        organizationId: "org_1",
        role: "owner",
        userId: "user_1",
        userEmail: "u1@example.com",
        userName: "User 1",
      },
      input: {
        name: "Alice",
        assistantId: "assistant_1",
      },
    })

    expect(result).toEqual(expect.objectContaining({ id: "emp_1" }))
    expect(repository.createDashboardDigitalEmployeeWorkspaceFile).toHaveBeenCalled()
  })

  it("updates autonomy and preserves empty group removal", async () => {
    vi.mocked(repository.findDashboardDigitalEmployeeForPermissions).mockResolvedValue({
      id: "emp_1",
      name: "Alice",
      createdBy: "user_1",
      supervisorId: "user_1",
      organizationId: "org_1",
    } as never)
    vi.mocked(repository.updateDashboardDigitalEmployeeById).mockResolvedValue({
      id: "emp_1",
      name: "Alice",
      totalTokensUsed: BigInt(0),
    } as never)

    const result = await updateDashboardDigitalEmployee({
      id: "emp_1",
      context: {
        organizationId: "org_1",
        role: "admin",
        userId: "user_1",
      },
      input: {
        autonomyLevel: "supervised",
        groupId: "",
      },
    })

    expect(result).toEqual(expect.objectContaining({ id: "emp_1" }))
    expect(repository.updateDashboardDigitalEmployeeById).toHaveBeenCalledWith(
      "emp_1",
      expect.objectContaining({
        groupId: null,
      })
    )
  })

  it("deletes when allowed", async () => {
    vi.mocked(repository.findDashboardDigitalEmployeeForPermissions).mockResolvedValue({
      id: "emp_1",
      name: "Alice",
      createdBy: "user_1",
      supervisorId: "user_1",
      organizationId: "org_1",
    } as never)
    vi.mocked(repository.deleteDashboardDigitalEmployeeById).mockResolvedValue({} as never)

    const result = await deleteDashboardDigitalEmployee({
      id: "emp_1",
      context: {
        organizationId: "org_1",
        role: "owner",
        userId: "user_1",
      },
    })

    expect(result).toEqual({ success: true })
  })

  it("groups pending approvals by employee", async () => {
    vi.mocked(repository.findDashboardPendingApprovals).mockResolvedValue([
      {
        id: "a1",
        digitalEmployeeId: "emp_1",
        digitalEmployee: { name: "Alice" },
      },
      {
        id: "a2",
        digitalEmployeeId: "emp_1",
        digitalEmployee: { name: "Alice" },
      },
    ] as never)

    const result = await listPendingDigitalEmployeeApprovals({ organizationId: null })

    expect(result.total).toBe(2)
    expect(result.byEmployee).toEqual([
      { employeeId: "emp_1", name: "Alice", count: 2 },
    ])
  })

  it("builds activity feed and summary", async () => {
    vi.mocked(repository.findDashboardDigitalEmployeeForPermissions).mockResolvedValue({
      id: "emp_1",
      name: "Alice",
      createdBy: "user_1",
      supervisorId: "user_1",
      organizationId: "org_1",
    } as never)
    vi.mocked(repository.findDashboardDigitalEmployeeRuns).mockResolvedValue([
      {
        id: "run_1",
        status: "COMPLETED",
        startedAt: new Date(),
        completedAt: new Date(),
        trigger: "manual",
        promptTokens: 3,
        completionTokens: 4,
        executionTimeMs: 1000,
        error: null,
        output: "ok",
      },
    ] as never)
    vi.mocked(repository.findDashboardDigitalEmployeeApprovals).mockResolvedValue([
      {
        id: "appr_1",
        status: "PENDING",
        createdAt: new Date("2026-01-01T09:00:00.000Z"),
        respondedAt: null,
        title: "Need approval",
        description: "desc",
        requestType: "message_send",
        respondedBy: null,
        response: null,
      },
    ] as never)

    const result = await listDashboardDigitalEmployeeActivity({
      id: "emp_1",
      organizationId: "org_1",
      input: { limit: 10 },
    })

    if ("status" in result) throw new Error("unexpected error")
    expect(result.events).toHaveLength(2)
    expect(result.dailySummary.totalRuns).toBe(1)
  })

  it("returns export data and package data", async () => {
    vi.mocked(repository.findDashboardDigitalEmployeeForPermissions).mockResolvedValue({
      id: "emp_1",
      name: "Alice",
      createdBy: "user_1",
      supervisorId: "user_1",
      organizationId: "org_1",
    } as never)
    vi.mocked(retention.exportEmployeeData).mockResolvedValue({ id: "emp_1" } as never)
    vi.mocked(packageGenerator.generateEmployeePackage).mockResolvedValue({ id: "pkg" } as never)

    const exported = await exportDashboardDigitalEmployeeData({
      id: "emp_1",
      context: {
        organizationId: "org_1",
        role: "admin",
        userId: "user_1",
      },
    })
    const pkg = await generateDashboardDigitalEmployeePackage({
      id: "emp_1",
      organizationId: "org_1",
    })

    expect(exported).toEqual(
      expect.objectContaining({ filename: "employee-Alice-export.json" })
    )
    expect(pkg).toEqual({ id: "pkg" })
  })

  it("returns VNC url and can purge", async () => {
    vi.mocked(repository.findDashboardDigitalEmployeeVncContext).mockResolvedValue({
      group: { noVncPort: 6080 },
    } as never)
    vi.mocked(repository.findDashboardDigitalEmployeeForPermissions).mockResolvedValue({
      id: "emp_1",
      name: "Alice",
      createdBy: "user_1",
      supervisorId: "user_1",
      organizationId: "org_1",
    } as never)
    vi.mocked(repository.deleteDashboardDigitalEmployeeById).mockResolvedValue({} as never)
    vi.mocked(retention.purgeEmployeeData).mockResolvedValue(undefined)

    const vnc = await getDashboardDigitalEmployeeVncUrl({
      id: "emp_1",
      organizationId: "org_1",
    })
    const purged = await purgeDashboardDigitalEmployeeData({
      id: "emp_1",
      context: {
        organizationId: "org_1",
        role: "owner",
        userId: "user_1",
      },
      input: { confirmName: "Alice" },
    })

    expect(vnc).toEqual(
      expect.objectContaining({ url: "http://localhost:6080/vnc.html?autoconnect=true&resize=scale" })
    )
    expect(purged).toEqual({ success: true })
  })
})
