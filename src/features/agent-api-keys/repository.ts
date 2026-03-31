import { prisma } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"

export async function findAgentApiKeysByAssistantId(
  assistantId: string,
  organizationId: string | null
) {
  return prisma.agentApiKey.findMany({
    where: {
      assistantId,
      ...(organizationId ? { organizationId } : { organizationId: null }),
    },
    orderBy: { createdAt: "desc" },
  })
}

export async function findAgentApiKeysByOrganization(
  organizationId: string | null
) {
  return prisma.agentApiKey.findMany({
    where: organizationId ? { organizationId } : { organizationId: null },
    orderBy: { createdAt: "desc" },
  })
}

export async function findAgentApiKeyById(id: string) {
  return prisma.agentApiKey.findUnique({ where: { id } })
}

export async function findAgentApiKeyByKey(key: string) {
  return prisma.agentApiKey.findUnique({ where: { key } })
}

export async function createAgentApiKey(
  data: Prisma.AgentApiKeyUncheckedCreateInput
) {
  return prisma.agentApiKey.create({ data })
}

export async function updateAgentApiKey(
  id: string,
  data: Prisma.AgentApiKeyUpdateInput
) {
  return prisma.agentApiKey.update({ where: { id }, data })
}

export async function deleteAgentApiKey(id: string) {
  return prisma.agentApiKey.delete({ where: { id } })
}

export async function incrementAgentApiKeyUsage(id: string) {
  return prisma.agentApiKey.update({
    where: { id },
    data: {
      requestCount: { increment: 1 },
      lastUsedAt: new Date(),
    },
  })
}

export async function findAssistantById(assistantId: string) {
  return prisma.assistant.findUnique({
    where: { id: assistantId },
    select: {
      id: true,
      name: true,
      emoji: true,
      organizationId: true,
      isBuiltIn: true,
    },
  })
}

export async function findOrganizationById(id: string) {
  return prisma.organization.findUnique({
    where: { id },
    include: { _count: { select: { agentApiKeys: true } } },
  })
}
