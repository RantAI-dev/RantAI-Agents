import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  addGroupMembersForDashboard,
  createGroupForDashboard,
  deleteGroupForDashboard,
  getGroupForDashboard,
  listGroupsForDashboard,
  removeGroupMembersForDashboard,
  startGroupForDashboard,
  stopGroupForDashboard,
  updateGroupForDashboard,
} from "./service"
import * as repository from "./repository"
import { hasPermission } from "@/lib/digital-employee/rbac"

const { dockerInstance, orchestratorInstance } = vi.hoisted(() => ({
  dockerInstance: {
    listContainers: vi.fn(),
  },
  orchestratorInstance: {
    deleteGroup: vi.fn(),
    startGroup: vi.fn(),
    stopGroup: vi.fn(),
  },
}))

vi.mock("dockerode", () => ({
  default: vi.fn(function DockerodeMock() {
    return dockerInstance
  }),
}))

vi.mock("@/lib/digital-employee/rbac", () => ({
  hasPermission: vi.fn(),
}))

vi.mock("@/lib/digital-employee/docker-orchestrator", () => ({
  DockerOrchestrator: vi.fn(function DockerOrchestratorMock() {
    return orchestratorInstance
  }),
}))

vi.mock("./repository", () => ({
  createGroup: vi.fn(),
  createSoloGroup: vi.fn(),
  findEmployeesByIdsInGroup: vi.fn(),
  findEmployeesByIdsInOrganization: vi.fn(),
  findGroupBasicById: vi.fn(),
  findGroupById: vi.fn(),
  findGroupWithMemberIds: vi.fn(),
  findGroupsByOrganization: vi.fn(),
  updateEmployeeGroupId: vi.fn(),
  updateEmployeesGroupIds: vi.fn(),
  updateGroupById: vi.fn(),
  updateGroupRuntimeState: vi.fn(),
}))

describe("dashboard groups service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(hasPermission).mockReturnValue(true)
    dockerInstance.listContainers.mockResolvedValue([])
    orchestratorInstance.deleteGroup.mockResolvedValue(undefined)
    orchestratorInstance.startGroup.mockResolvedValue({ containerId: "container_1", port: 4242 })
    orchestratorInstance.stopGroup.mockResolvedValue(undefined)
  })

  it("reconciles running containers when listing groups", async () => {
    vi.mocked(repository.findGroupsByOrganization).mockResolvedValue([
      {
        id: "group_1",
        name: "Alpha",
        description: null,
        isImplicit: false,
        status: "IDLE",
        containerId: "container_1",
        containerPort: 4242,
        noVncPort: 6080,
        gatewayToken: "token",
        createdBy: "user_1",
        createdAt: new Date("2025-01-01T00:00:00.000Z"),
        updatedAt: new Date("2025-01-01T00:00:00.000Z"),
        members: [],
      },
    ] as never)
    dockerInstance.listContainers.mockResolvedValue([{ Id: "container_1" }])

    const result = await listGroupsForDashboard("org_1")

    expect(result).toEqual([
      expect.objectContaining({
        id: "group_1",
        status: "RUNNING",
        memberCount: 0,
      }),
    ])
    expect(repository.updateGroupRuntimeState).toHaveBeenCalledWith("group_1", {
      status: "RUNNING",
    })
  })

  it("returns 404 when the requested group is missing", async () => {
    vi.mocked(repository.findGroupById).mockResolvedValue(null)

    const result = await getGroupForDashboard({
      groupId: "group_1",
      organizationId: "org_1",
    })

    expect(result).toEqual({ status: 404, error: "Group not found" })
  })

  it("creates a group when the caller has permission", async () => {
    vi.mocked(repository.createGroup).mockResolvedValue({
      id: "group_1",
      name: "Alpha",
      description: null,
      isImplicit: false,
      status: "IDLE",
      containerId: null,
      containerPort: null,
      noVncPort: null,
      gatewayToken: null,
      createdBy: "user_1",
      createdAt: new Date("2025-01-01T00:00:00.000Z"),
      updatedAt: new Date("2025-01-01T00:00:00.000Z"),
      members: [],
    } as never)

    const result = await createGroupForDashboard({
      context: {
        organizationId: "org_1",
        role: "admin",
        userId: "user_1",
      },
      input: { name: "Alpha", description: "Team" },
    })

    expect(result).toEqual(
      expect.objectContaining({
        id: "group_1",
        name: "Alpha",
      })
    )
  })

  it("blocks updates while the group is transitioning", async () => {
    vi.mocked(repository.findGroupBasicById).mockResolvedValue({
      id: "group_1",
      status: "STARTING",
    } as never)

    const result = await updateGroupForDashboard({
      groupId: "group_1",
      organizationId: "org_1",
      input: { name: "Updated" },
    })

    expect(result).toEqual({
      status: 409,
      error: "Cannot update group while it is in a transitional state",
    })
  })

  it("returns 409 when deleting a group that still has members", async () => {
    vi.mocked(repository.findGroupWithMemberIds).mockResolvedValue({
      members: [{ id: "employee_1" }],
    } as never)

    const result = await deleteGroupForDashboard({
      groupId: "group_1",
      context: {
        organizationId: "org_1",
        role: "admin",
        userId: "user_1",
      },
    })

    expect(result).toEqual({
      status: 409,
      error: "Cannot delete team with members. Move or remove members first.",
    })
  })

  it("starts a group through the orchestrator", async () => {
    vi.mocked(repository.findGroupBasicById).mockResolvedValue({
      id: "group_1",
    } as never)

    const result = await startGroupForDashboard({
      groupId: "group_1",
      context: {
        organizationId: "org_1",
        role: "admin",
        userId: "user_1",
      },
    })

    expect(result).toEqual({
      success: true,
      containerId: "container_1",
      port: 4242,
    })
    expect(orchestratorInstance.startGroup).toHaveBeenCalledWith("group_1")
  })

  it("returns 404 when stopping a missing group", async () => {
    vi.mocked(repository.findGroupBasicById).mockResolvedValue(null)

    const result = await stopGroupForDashboard({
      groupId: "group_1",
      context: {
        organizationId: "org_1",
        role: "admin",
        userId: "user_1",
      },
    })

    expect(result).toEqual({ status: 404, error: "Not found" })
  })

  it("adds members to the requested group", async () => {
    vi.mocked(repository.findGroupBasicById).mockResolvedValue({
      id: "group_1",
    } as never)
    vi.mocked(repository.findEmployeesByIdsInOrganization).mockResolvedValue([
      { id: "employee_1", name: "Ada", groupId: null, status: "ACTIVE" },
      { id: "employee_2", name: "Linus", groupId: null, status: "ACTIVE" },
    ] as never)
    vi.mocked(repository.findGroupById).mockResolvedValue({
      id: "group_1",
      members: [
        { id: "employee_1", name: "Ada", status: "ACTIVE", avatar: null },
        { id: "employee_2", name: "Linus", status: "ACTIVE", avatar: null },
      ],
    } as never)

    const result = await addGroupMembersForDashboard({
      groupId: "group_1",
      organizationId: "org_1",
      input: { employeeIds: ["employee_1", "employee_2"] },
    })

    expect(result).toEqual(expect.objectContaining({ id: "group_1" }))
    expect(repository.updateEmployeesGroupIds).toHaveBeenCalledWith(
      ["employee_1", "employee_2"],
      "group_1"
    )
  })

  it("moves removed members into solo groups", async () => {
    vi.mocked(repository.findGroupBasicById).mockResolvedValue({
      id: "group_1",
    } as never)
    vi.mocked(repository.findEmployeesByIdsInGroup).mockResolvedValue([
      { id: "employee_1", name: "Ada", organizationId: "org_1" },
    ] as never)
    vi.mocked(repository.createSoloGroup).mockResolvedValue({
      id: "solo_1",
    } as never)
    vi.mocked(repository.findGroupById).mockResolvedValue({
      id: "group_1",
      members: [],
    } as never)

    const result = await removeGroupMembersForDashboard({
      groupId: "group_1",
      organizationId: "org_1",
      userId: "user_1",
      input: { employeeIds: ["employee_1"] },
    })

    expect(result).toEqual(expect.objectContaining({ id: "group_1" }))
    expect(repository.updateEmployeeGroupId).toHaveBeenCalledWith("employee_1", "solo_1")
  })
})
