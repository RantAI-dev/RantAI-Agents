import { prisma } from "@/lib/prisma"

export async function findDashboardMcpServers(
  organizationId: string | null
) {
  return prisma.mcpServerConfig.findMany({
    where: organizationId
      ? { organizationId }
      : { organizationId: null },
    include: {
      _count: { select: { tools: true } },
    },
    orderBy: { createdAt: "desc" },
  })
}

export async function findDashboardMcpServerById(id: string) {
  return prisma.mcpServerConfig.findUnique({
    where: { id },
    include: {
      tools: {
        select: {
          id: true,
          name: true,
          displayName: true,
          description: true,
          enabled: true,
        },
      },
      _count: { select: { tools: true } },
    },
  })
}

export async function createDashboardMcpServer(data: {
  name: string
  description: string | null
  transport: string
  url: string
  env?: { _encrypted: string } | null
  headers?: { _encrypted: string } | null
  isBuiltIn: boolean
  envKeys?: unknown
  docsUrl?: string | null
  enabled: boolean
  organizationId: string | null
  createdBy: string
}) {
  return prisma.mcpServerConfig.create({
    data: data as never,
  })
}

export async function updateDashboardMcpServer(
  id: string,
  data: {
    name?: string
    description?: string | null
    transport?: string
    url?: string
    env?: { _encrypted: string } | null
    headers?: { _encrypted: string } | null
    enabled?: boolean
    configured?: boolean
  }
) {
  return prisma.mcpServerConfig.update({
    where: { id },
    data: data as never,
  })
}

export async function deleteDashboardMcpServer(id: string) {
  return prisma.mcpServerConfig.delete({
    where: { id },
  })
}
