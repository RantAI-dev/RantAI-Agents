import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"

export async function findDashboardDigitalEmployeesByOrganization(
  organizationId: string | null
) {
  return prisma.digitalEmployee.findMany({
    where: {
      ...(organizationId ? { organizationId } : {}),
    },
    include: {
      assistant: { select: { id: true, name: true, emoji: true, model: true } },
      group: { select: { id: true, name: true, status: true } },
      runs: {
        take: 1,
        orderBy: { startedAt: "desc" },
        select: { status: true, output: true },
      },
      _count: {
        select: {
          runs: true,
          approvals: { where: { status: "PENDING" } },
          files: true,
          customTools: true,
          installedSkills: true,
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  })
}

export async function findDashboardDigitalEmployeeById(
  id: string,
  organizationId: string | null
) {
  return prisma.digitalEmployee.findFirst({
    where: {
      id,
      ...(organizationId ? { organizationId } : {}),
    },
    include: {
      assistant: {
        select: {
          id: true,
          name: true,
          emoji: true,
          model: true,
          systemPrompt: true,
          useKnowledgeBase: true,
          knowledgeBaseGroupIds: true,
        },
      },
      group: { select: { id: true, name: true, status: true } },
      _count: {
        select: {
          runs: true,
          approvals: true,
          files: true,
          customTools: true,
          installedSkills: true,
          memoryEntries: true,
        },
      },
    },
  })
}

export async function findDashboardDigitalEmployeeForPermissions(
  id: string,
  organizationId: string | null
) {
  return prisma.digitalEmployee.findFirst({
    where: {
      id,
      ...(organizationId ? { organizationId } : {}),
    },
    select: {
      id: true,
      name: true,
      createdBy: true,
      supervisorId: true,
      organizationId: true,
    },
  })
}

export async function findDashboardDigitalEmployeeAssistantForCreate(
  assistantId: string,
  organizationId: string
) {
  return prisma.assistant.findFirst({
    where: {
      id: assistantId,
      OR: [{ organizationId }, { organizationId: null }],
    },
    include: {
      tools: { include: { tool: true }, where: { enabled: true } },
      skills: { include: { skill: true }, where: { enabled: true } },
      assistantWorkflows: { include: { workflow: true }, where: { enabled: true } },
    },
  })
}

export async function findDashboardDigitalEmployeeGroupForCreate(
  groupId: string,
  organizationId: string
) {
  return prisma.employeeGroup.findFirst({
    where: { id: groupId, organizationId },
  })
}

export async function createDashboardDigitalEmployeeGroup(params: {
  name: string
  organizationId: string
  createdBy: string
}) {
  return prisma.employeeGroup.create({
    data: {
      name: params.name,
      organizationId: params.organizationId,
      createdBy: params.createdBy,
      isImplicit: true,
    },
  })
}

export async function createDashboardDigitalEmployee(params: {
  name: string
  description: string | null
  avatar: string | null
  assistantId: string
  groupId: string
  autonomyLevel: string
  sandboxMode: boolean
  deploymentConfig: Prisma.InputJsonValue
  organizationId: string
  createdBy: string
  supervisorId: string
}) {
  return prisma.digitalEmployee.create({
    data: {
      name: params.name,
      description: params.description,
      avatar: params.avatar,
      assistantId: params.assistantId,
      groupId: params.groupId,
      autonomyLevel: params.autonomyLevel,
      sandboxMode: params.sandboxMode,
      deploymentConfig: params.deploymentConfig,
      organizationId: params.organizationId,
      createdBy: params.createdBy,
      supervisorId: params.supervisorId,
    },
    include: {
      assistant: { select: { id: true, name: true, emoji: true, model: true } },
      _count: {
        select: {
          runs: true,
          approvals: true,
          files: true,
          customTools: true,
          installedSkills: true,
        },
      },
    },
  })
}

export async function createDashboardDigitalEmployeeWorkspaceFile(params: {
  digitalEmployeeId: string
  filename: string
  content: string
  updatedBy: string
}) {
  return prisma.employeeFile.create({
    data: {
      digitalEmployeeId: params.digitalEmployeeId,
      filename: params.filename,
      content: params.content,
      updatedBy: params.updatedBy,
    },
  })
}

export async function findDashboardPendingApprovals(organizationId: string | null) {
  return prisma.employeeApproval.findMany({
    where: {
      status: "PENDING",
      digitalEmployee: {
        ...(organizationId ? { organizationId } : {}),
      },
    },
    select: {
      id: true,
      digitalEmployeeId: true,
      digitalEmployee: { select: { name: true } },
    },
  })
}

export async function findDashboardDigitalEmployeeRuns(params: {
  digitalEmployeeId: string
  before?: Date | null
  take: number
}) {
  return prisma.employeeRun.findMany({
    where: {
      digitalEmployeeId: params.digitalEmployeeId,
      ...(params.before ? { startedAt: { lt: params.before } } : {}),
    },
    orderBy: { startedAt: "desc" },
    take: params.take,
  })
}

export async function findDashboardDigitalEmployeeApprovals(params: {
  digitalEmployeeId: string
  status?:
    | "PENDING"
    | "DELIVERED"
    | "APPROVED"
    | "REJECTED"
    | "EDITED"
    | "EXPIRED"
    | "CANCELLED"
    | null
  take?: number
}) {
  return prisma.employeeApproval.findMany({
    where: {
      digitalEmployeeId: params.digitalEmployeeId,
      ...(params.status ? { status: params.status } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: params.take ?? 50,
  })
}

export async function findDashboardDigitalEmployeeMemory(params: {
  digitalEmployeeId: string
  type?: string | null
}) {
  return prisma.employeeMemory.findMany({
    where: {
      digitalEmployeeId: params.digitalEmployeeId,
      ...(params.type ? { type: params.type } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  })
}

export async function findDashboardDigitalEmployeeVncContext(
  digitalEmployeeId: string,
  organizationId: string | null
) {
  return prisma.digitalEmployee.findFirst({
    where: {
      id: digitalEmployeeId,
      ...(organizationId ? { organizationId } : {}),
    },
    select: {
      group: {
        select: {
          noVncPort: true,
        },
      },
    },
  })
}

export async function updateDashboardDigitalEmployeeById(
  id: string,
  data: Record<string, unknown>
) {
  return prisma.digitalEmployee.update({
    where: { id },
    data: data as Prisma.DigitalEmployeeUpdateInput,
    include: {
      assistant: { select: { id: true, name: true, emoji: true, model: true } },
      group: { select: { id: true, name: true, status: true } },
      _count: {
        select: {
          runs: true,
          approvals: true,
          files: true,
          customTools: true,
          installedSkills: true,
        },
      },
    },
  })
}

export async function deleteDashboardDigitalEmployeeById(id: string) {
  return prisma.digitalEmployee.delete({ where: { id } })
}
