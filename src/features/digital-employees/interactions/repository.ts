import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"

export async function findDigitalEmployeeContext(params: {
  id: string
  organizationId: string | null
}) {
  return prisma.digitalEmployee.findFirst({
    where: {
      id: params.id,
      ...(params.organizationId ? { organizationId: params.organizationId } : {}),
    },
    select: { id: true, organizationId: true, groupId: true, assistantId: true },
  })
}

export async function findDigitalEmployeeMessages(params: {
  id: string
  before?: Date | null
  limit: number
}) {
  return prisma.employeeMessage.findMany({
    where: {
      OR: [{ fromEmployeeId: params.id }, { toEmployeeId: params.id }],
      ...(params.before ? { createdAt: { lt: params.before } } : {}),
    },
    include: {
      fromEmployee: { select: { id: true, name: true, avatar: true } },
      toEmployee: { select: { id: true, name: true, avatar: true } },
    },
    orderBy: { createdAt: "desc" },
    take: params.limit,
  })
}

export async function findDigitalEmployeeIntegrations(id: string) {
  return prisma.employeeIntegration.findMany({
    where: { digitalEmployeeId: id },
    orderBy: { createdAt: "desc" },
  })
}

export async function upsertDigitalEmployeeIntegration(params: {
  id: string
  integrationId: string
  status: string
  encryptedData: string | null
  metadata: Prisma.InputJsonValue
  connectedAt: Date | null
}) {
  return prisma.employeeIntegration.upsert({
    where: {
      digitalEmployeeId_integrationId: {
        digitalEmployeeId: params.id,
        integrationId: params.integrationId,
      },
    },
    create: {
      digitalEmployeeId: params.id,
      integrationId: params.integrationId,
      status: params.status,
      encryptedData: params.encryptedData,
      metadata: params.metadata,
      connectedAt: params.connectedAt,
    },
    update: {
      status: params.status,
      encryptedData: params.encryptedData,
      metadata: params.metadata,
      connectedAt: params.connectedAt,
      lastError: null,
    },
  })
}

export async function updateDigitalEmployeeIntegration(params: {
  id: string
  integrationId: string
  data: Record<string, unknown>
}) {
  return prisma.employeeIntegration.update({
    where: {
      digitalEmployeeId_integrationId: {
        digitalEmployeeId: params.id,
        integrationId: params.integrationId,
      },
    },
    data: params.data,
  })
}

export async function deleteDigitalEmployeeIntegration(params: {
  id: string
  integrationId: string
}) {
  return prisma.employeeIntegration.delete({
    where: {
      digitalEmployeeId_integrationId: {
        digitalEmployeeId: params.id,
        integrationId: params.integrationId,
      },
    },
  })
}

export async function findDigitalEmployeeIntegrationById(params: {
  id: string
  integrationId: string
}) {
  return prisma.employeeIntegration.findUnique({
    where: {
      digitalEmployeeId_integrationId: {
        digitalEmployeeId: params.id,
        integrationId: params.integrationId,
      },
    },
  })
}

export async function findDigitalEmployeeSkillsContext(params: {
  id: string
  organizationId: string | null
}) {
  return prisma.digitalEmployee.findFirst({
    where: {
      id: params.id,
      ...(params.organizationId ? { organizationId: params.organizationId } : {}),
    },
    include: {
      assistant: {
        include: {
          skills: { include: { skill: true } },
          tools: { include: { tool: true }, where: { enabled: true } },
        },
      },
      installedSkills: { orderBy: { createdAt: "desc" } },
      customTools: { orderBy: { createdAt: "desc" } },
    },
  })
}

export async function updateDigitalEmployeeInstalledSkill(params: {
  id: string
  enabled?: boolean
}) {
  return prisma.employeeInstalledSkill.update({
    where: { id: params.id },
    data: {
      ...(params.enabled !== undefined && { enabled: params.enabled }),
    },
  })
}

export async function deleteDigitalEmployeeInstalledSkill(id: string) {
  return prisma.employeeInstalledSkill.delete({ where: { id } })
}

export async function findDigitalEmployeeTriggersContext(params: {
  id: string
  organizationId: string | null
}) {
  return prisma.digitalEmployee.findFirst({
    where: {
      id: params.id,
      ...(params.organizationId ? { organizationId: params.organizationId } : {}),
    },
    select: { id: true, deploymentConfig: true },
  })
}

export async function updateDigitalEmployeeDeploymentConfig(params: {
  id: string
  deploymentConfig: object
}) {
  return prisma.digitalEmployee.update({
    where: { id: params.id },
    data: { deploymentConfig: params.deploymentConfig },
  })
}

export async function findDigitalEmployeeWebhooks(id: string) {
  return prisma.employeeWebhook.findMany({
    where: { digitalEmployeeId: id },
    orderBy: { createdAt: "desc" },
  })
}

export async function createDigitalEmployeeWebhook(params: {
  id: string
  type: string
  name: string
  config: Prisma.InputJsonValue
  filterRules: Prisma.InputJsonValue
}) {
  return prisma.employeeWebhook.create({
    data: {
      digitalEmployeeId: params.id,
      type: params.type,
      name: params.name,
      config: params.config,
      filterRules: params.filterRules,
    },
  })
}

export async function updateDigitalEmployeeWebhook(params: {
  triggerId: string
  data: Record<string, unknown>
}) {
  return prisma.employeeWebhook.update({
    where: { id: params.triggerId },
    data: params.data,
  })
}

export async function deleteDigitalEmployeeWebhook(triggerId: string) {
  return prisma.employeeWebhook.delete({ where: { id: triggerId } })
}

export async function findDigitalEmployeeOAuthContext(id: string) {
  return prisma.digitalEmployee.findUnique({
    where: { id },
    select: { groupId: true },
  })
}
