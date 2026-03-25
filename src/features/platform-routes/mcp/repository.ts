import { prisma } from "@/lib/prisma"

export async function findEnabledMcpApiKeyByValue(key: string) {
  return prisma.mcpApiKey.findFirst({
    where: { key, enabled: true },
  })
}

export async function incrementMcpApiKeyUsage(id: string) {
  return prisma.mcpApiKey.update({
    where: { id },
    data: {
      requestCount: { increment: 1 },
      lastUsedAt: new Date(),
    },
  })
}
