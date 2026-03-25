import { prisma } from "@/lib/prisma"

export async function findGroupsByOrganization(organizationId: string) {
  return prisma.employeeGroup.findMany({
    where: { organizationId },
    include: {
      members: {
        select: {
          id: true,
          name: true,
          avatar: true,
          status: true,
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  })
}

export async function findGroupById(groupId: string, organizationId: string) {
  return prisma.employeeGroup.findFirst({
    where: { id: groupId, organizationId },
    include: {
      members: {
        select: {
          id: true,
          name: true,
          status: true,
          avatar: true,
        },
      },
    },
  })
}

export async function findGroupBasicById(groupId: string, organizationId: string) {
  return prisma.employeeGroup.findFirst({
    where: { id: groupId, organizationId },
  })
}

export async function findGroupWithMemberIds(groupId: string, organizationId: string) {
  return prisma.employeeGroup.findFirst({
    where: { id: groupId, organizationId },
    include: {
      members: { select: { id: true } },
    },
  })
}

export async function createGroup(params: {
  organizationId: string
  name: string
  description: string | null
  createdBy: string
}) {
  return prisma.employeeGroup.create({
    data: {
      organizationId: params.organizationId,
      name: params.name,
      description: params.description,
      createdBy: params.createdBy,
    },
    include: {
      members: {
        select: {
          id: true,
          name: true,
          avatar: true,
          status: true,
        },
      },
    },
  })
}

export async function updateGroupById(
  groupId: string,
  data: {
    name?: string
    description?: string | null
    isImplicit?: boolean
  }
) {
  return prisma.employeeGroup.update({
    where: { id: groupId },
    data,
    include: {
      members: {
        select: {
          id: true,
          name: true,
          status: true,
          avatar: true,
        },
      },
    },
  })
}

export async function updateGroupRuntimeState(
  groupId: string,
  data: {
    status?: string
    containerId?: string | null
    containerPort?: number | null
    noVncPort?: number | null
    gatewayToken?: string | null
  }
) {
  return prisma.employeeGroup.update({
    where: { id: groupId },
    data,
  })
}

export async function updateEmployeesGroupIds(
  employeeIds: string[],
  groupId: string
) {
  return prisma.digitalEmployee.updateMany({
    where: { id: { in: employeeIds } },
    data: { groupId },
  })
}

export async function findEmployeesByIdsInOrganization(
  organizationId: string,
  employeeIds: string[]
) {
  return prisma.digitalEmployee.findMany({
    where: {
      id: { in: employeeIds },
      organizationId,
    },
    select: { id: true, name: true, groupId: true, status: true },
  })
}

export async function findEmployeesByIdsInGroup(
  groupId: string,
  employeeIds: string[]
) {
  return prisma.digitalEmployee.findMany({
    where: { id: { in: employeeIds }, groupId },
    select: { id: true, name: true, organizationId: true },
  })
}

export async function createSoloGroup(params: {
  organizationId: string
  name: string
  createdBy: string
}) {
  return prisma.employeeGroup.create({
    data: {
      name: params.name,
      organizationId: params.organizationId,
      isImplicit: true,
      createdBy: params.createdBy,
    },
  })
}

export async function updateEmployeeGroupId(employeeId: string, groupId: string) {
  return prisma.digitalEmployee.update({
    where: { id: employeeId },
    data: { groupId },
  })
}
