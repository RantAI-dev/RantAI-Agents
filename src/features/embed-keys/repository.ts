import { prisma } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"

export async function findDashboardEmbedApiKeysByOrganization(
  organizationId: string | null
) {
  return prisma.embedApiKey.findMany({
    where: organizationId ? { organizationId } : { organizationId: null },
    orderBy: { createdAt: "desc" },
  })
}

export async function findDashboardEmbedApiKeyById(id: string) {
  return prisma.embedApiKey.findUnique({
    where: { id },
  })
}

export async function findDashboardAssistantsByIds(ids: string[]) {
  return prisma.assistant.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, emoji: true },
  })
}

export async function findDashboardAssistantById(id: string) {
  return prisma.assistant.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      emoji: true,
      organizationId: true,
      isBuiltIn: true,
    },
  })
}

export async function findDashboardOrganizationById(id: string) {
  return prisma.organization.findUnique({
    where: { id },
    include: { _count: { select: { embedKeys: true } } },
  })
}

export async function createDashboardEmbedApiKey(
  data: Prisma.EmbedApiKeyUncheckedCreateInput
) {
  return prisma.embedApiKey.create({ data })
}

export async function updateDashboardEmbedApiKey(
  id: string,
  data: Prisma.EmbedApiKeyUpdateInput
) {
  return prisma.embedApiKey.update({ where: { id }, data })
}

export async function deleteDashboardEmbedApiKey(id: string) {
  return prisma.embedApiKey.delete({ where: { id } })
}
