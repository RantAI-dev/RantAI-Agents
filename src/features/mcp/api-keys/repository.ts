import { prisma } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"

export async function findDashboardMcpApiKeys(organizationId: string | null) {
  return prisma.mcpApiKey.findMany({
    where: organizationId ? { organizationId } : undefined,
    orderBy: { createdAt: "desc" },
  })
}

export async function findDashboardMcpApiKeyById(id: string) {
  return prisma.mcpApiKey.findUnique({ where: { id } })
}

export async function createDashboardMcpApiKey(
  data: Prisma.McpApiKeyUncheckedCreateInput
) {
  return prisma.mcpApiKey.create({ data })
}

export async function updateDashboardMcpApiKey(
  id: string,
  data: Prisma.McpApiKeyUpdateInput
) {
  return prisma.mcpApiKey.update({ where: { id }, data })
}

export async function deleteDashboardMcpApiKey(id: string) {
  return prisma.mcpApiKey.delete({ where: { id } })
}
