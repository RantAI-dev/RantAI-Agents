import Dockerode from "dockerode"
import { hasPermission } from "@/lib/digital-employee/rbac"
import { DockerOrchestrator } from "@/lib/digital-employee/docker-orchestrator"
import {
  createGroup,
  createSoloGroup,
  findEmployeesByIdsInGroup,
  findEmployeesByIdsInOrganization,
  findGroupBasicById,
  findGroupById,
  findGroupWithMemberIds,
  findGroupsByOrganization,
  updateEmployeeGroupId,
  updateEmployeesGroupIds,
  updateGroupById,
  updateGroupRuntimeState,
} from "./repository"
import type {
  DashboardGroupCreateInput,
  DashboardGroupMembersInput,
  DashboardGroupUpdateInput,
} from "./schema"

export interface ServiceError {
  status: number
  error: string
}

export interface DashboardGroupsAccessContext {
  organizationId: string | null
  role: string | null
  userId: string
}

export interface DashboardGroupMember {
  id: string
  name: string
  avatar: string | null
  status: string
}

export interface DashboardGroupListItem {
  id: string
  name: string
  description: string | null
  isImplicit: boolean
  status: string
  containerId: string | null
  containerPort: number | null
  noVncPort: number | null
  gatewayToken: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
  members: DashboardGroupMember[]
  memberCount: number
}

type GroupRecord = {
  id: string
  name: string
  description: string | null
  isImplicit: boolean
  status: string
  containerId: string | null
  containerPort: number | null
  noVncPort: number | null
  gatewayToken: string | null
  createdBy: string
  createdAt: Date
  updatedAt: Date
  members: DashboardGroupMember[]
}

const docker = new Dockerode({ socketPath: "/var/run/docker.sock" })
const startingGroups = new Set<string>()

function toGroupListItem(group: GroupRecord): DashboardGroupListItem {
  return {
    id: group.id,
    name: group.name,
    description: group.description,
    isImplicit: group.isImplicit,
    status: group.status,
    containerId: group.containerId,
    containerPort: group.containerPort,
    noVncPort: group.noVncPort,
    gatewayToken: group.gatewayToken,
    createdBy: group.createdBy,
    createdAt: group.createdAt.toISOString(),
    updatedAt: group.updatedAt.toISOString(),
    members: group.members,
    memberCount: group.members.length,
  }
}

async function reconcileGroups(groups: GroupRecord[]): Promise<GroupRecord[]> {
  const runningContainers = await docker.listContainers({ all: false })
  const runningIds = new Set(runningContainers.map((container) => container.Id))

  const reconciled = await Promise.all(
    groups.map(async (group) => {
      if (group.containerId) {
        if (runningIds.has(group.containerId)) {
          if (group.status !== "RUNNING") {
            await updateGroupRuntimeState(group.id, { status: "RUNNING" })
            return { ...group, status: "RUNNING" }
          }
          return group
        }

        await updateGroupRuntimeState(group.id, {
          status: "IDLE",
          containerId: null,
          containerPort: null,
          noVncPort: null,
          gatewayToken: null,
        })
        return {
          ...group,
          status: "IDLE",
          containerId: null,
          containerPort: null,
          noVncPort: null,
          gatewayToken: null,
        }
      }

      if (group.status !== "IDLE") {
        await updateGroupRuntimeState(group.id, { status: "IDLE" })
        return { ...group, status: "IDLE" }
      }

      return group
    })
  )

  return reconciled
}

/**
 * Lists dashboard groups after reconciling their runtime status against Docker.
 */
export async function listGroupsForDashboard(organizationId: string): Promise<DashboardGroupListItem[]> {
  const groups = (await findGroupsByOrganization(organizationId)) as GroupRecord[]
  const reconciled = await reconcileGroups(groups)
  return reconciled.map(toGroupListItem)
}

/**
 * Loads one dashboard group with members.
 */
export async function getGroupForDashboard(params: {
  groupId: string
  organizationId: string
}): Promise<DashboardGroupListItem | Record<string, unknown> | ServiceError> {
  const group = (await findGroupById(params.groupId, params.organizationId)) as GroupRecord | null
  if (!group) {
    return { status: 404, error: "Group not found" }
  }

  return group as unknown as Record<string, unknown>
}

/**
 * Creates a dashboard group for the current organization.
 */
export async function createGroupForDashboard(params: {
  context: DashboardGroupsAccessContext
  input: DashboardGroupCreateInput
}): Promise<DashboardGroupListItem | ServiceError> {
  if (params.context.role && !hasPermission(params.context.role, "employee.create")) {
    return { status: 403, error: "Insufficient permissions" }
  }

  if (!params.input.name) {
    return { status: 400, error: "name is required" }
  }

  const group = (await createGroup({
    organizationId: params.context.organizationId || "",
    name: params.input.name,
    description: params.input.description || null,
    createdBy: params.context.userId,
  })) as GroupRecord

  return toGroupListItem(group)
}

/**
 * Updates a dashboard group without changing runtime-owned fields.
 */
export async function updateGroupForDashboard(params: {
  groupId: string
  organizationId: string
  input: DashboardGroupUpdateInput
}): Promise<Record<string, unknown> | ServiceError> {
  const existing = (await findGroupBasicById(params.groupId, params.organizationId)) as
    | { id: string; status: string }
    | null
  if (!existing) {
    return { status: 404, error: "Group not found" }
  }

  if (existing.status !== "IDLE" && existing.status !== "RUNNING") {
    return {
      status: 409,
      error: "Cannot update group while it is in a transitional state",
    }
  }

  const updated = await updateGroupById(params.groupId, {
    ...(params.input.name && { name: params.input.name }),
    ...(params.input.description !== undefined && { description: params.input.description }),
    ...(params.input.isImplicit !== undefined && { isImplicit: params.input.isImplicit }),
  })

  return updated as Record<string, unknown>
}

/**
 * Deletes a dashboard group after stopping its runtime container.
 */
export async function deleteGroupForDashboard(params: {
  groupId: string
  context: DashboardGroupsAccessContext
}): Promise<{ success: true } | ServiceError> {
  if (params.context.role && !hasPermission(params.context.role, "employee.delete")) {
    return { status: 403, error: "Insufficient permissions" }
  }

  const existing = (await findGroupWithMemberIds(
    params.groupId,
    params.context.organizationId || ""
  )) as { members: Array<{ id: string }> } | null
  if (!existing) {
    return { status: 404, error: "Group not found" }
  }

  if (existing.members.length > 0) {
    return {
      status: 409,
      error: "Cannot delete team with members. Move or remove members first.",
    }
  }

  await new DockerOrchestrator().deleteGroup(params.groupId)
  return { success: true }
}

/**
 * Starts a dashboard group container.
 */
export async function startGroupForDashboard(params: {
  groupId: string
  context: DashboardGroupsAccessContext
}): Promise<{ success: true; containerId: string; port: number } | ServiceError> {
  if (params.context.role && !hasPermission(params.context.role, "employee.create")) {
    return { status: 403, error: "Insufficient permissions" }
  }

  const existing = await findGroupBasicById(params.groupId, params.context.organizationId || "")
  if (!existing) {
    return { status: 404, error: "Group not found" }
  }

  if (startingGroups.has(params.groupId)) {
    return { status: 409, error: "Already starting" }
  }

  startingGroups.add(params.groupId)
  try {
    const { containerId, port } = await new DockerOrchestrator().startGroup(params.groupId)
    return { success: true, containerId, port }
  } finally {
    startingGroups.delete(params.groupId)
  }
}

/**
 * Stops a dashboard group container.
 */
export async function stopGroupForDashboard(params: {
  groupId: string
  context: DashboardGroupsAccessContext
}): Promise<{ success: true } | ServiceError> {
  if (params.context.role && !hasPermission(params.context.role, "employee.delete")) {
    return { status: 403, error: "Insufficient permissions" }
  }

  const existing = await findGroupBasicById(params.groupId, params.context.organizationId || "")
  if (!existing) {
    return { status: 404, error: "Not found" }
  }

  await new DockerOrchestrator().stopGroup(params.groupId)
  return { success: true }
}

/**
 * Adds employees to a dashboard group.
 */
export async function addGroupMembersForDashboard(params: {
  groupId: string
  organizationId: string
  input: DashboardGroupMembersInput
}): Promise<Record<string, unknown> | ServiceError> {
  const group = await findGroupBasicById(params.groupId, params.organizationId)
  if (!group) {
    return { status: 404, error: "Group not found" }
  }

  if (!Array.isArray(params.input.employeeIds) || params.input.employeeIds.length === 0) {
    return { status: 400, error: "employeeIds must be a non-empty array" }
  }

  const employeeIds = params.input.employeeIds as string[]
  const employees = (await findEmployeesByIdsInOrganization(
    params.organizationId,
    employeeIds
  )) as Array<{ id: string; name: string; groupId: string | null; status: string }>

  if (employees.length !== employeeIds.length) {
    const foundIds = new Set(employees.map((employee) => employee.id))
    const missing = employeeIds.filter((employeeId) => !foundIds.has(employeeId))
    return {
      status: 404,
      error: `Employees not found in this organization: ${missing.join(", ")}`,
    }
  }

  for (const employee of employees) {
    if (employee.groupId && employee.groupId !== params.groupId) {
      return {
        status: 409,
        error: `Employee "${employee.name}" (${employee.id}) is already in another group. Remove them first.`,
      }
    }
  }

  await updateEmployeesGroupIds(employeeIds, params.groupId)

  const updatedGroup = await findGroupById(params.groupId, params.organizationId)
  return updatedGroup as Record<string, unknown>
}

/**
 * Removes employees from a dashboard group by reassigning them to solo groups.
 */
export async function removeGroupMembersForDashboard(params: {
  groupId: string
  organizationId: string
  userId: string
  input: DashboardGroupMembersInput
}): Promise<Record<string, unknown> | ServiceError> {
  const group = await findGroupBasicById(params.groupId, params.organizationId)
  if (!group) {
    return { status: 404, error: "Group not found" }
  }

  if (!Array.isArray(params.input.employeeIds) || params.input.employeeIds.length === 0) {
    return { status: 400, error: "employeeIds must be a non-empty array" }
  }

  const employeeIds = params.input.employeeIds as string[]
  const employeesInGroup = (await findEmployeesByIdsInGroup(
    params.groupId,
    employeeIds
  )) as Array<{ id: string; name: string; organizationId: string }>

  for (const employee of employeesInGroup) {
    const soloGroup = await createSoloGroup({
      organizationId: employee.organizationId,
      name: `${employee.name} (solo)`,
      createdBy: params.userId,
    })
    await updateEmployeeGroupId(employee.id, soloGroup.id)
  }

  const updatedGroup = await findGroupById(params.groupId, params.organizationId)
  return updatedGroup as Record<string, unknown>
}
