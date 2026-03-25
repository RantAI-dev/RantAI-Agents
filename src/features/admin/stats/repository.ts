import { prisma } from "@/lib/prisma"

export async function countTotalConversations() {
  return prisma.conversation.count()
}

export async function countActiveConversations() {
  return prisma.conversation.count({
    where: {
      status: {
        in: ["WAITING_FOR_AGENT", "AGENT_CONNECTED"],
      },
    },
  })
}

export async function countResolvedConversationsSince(start: Date) {
  return prisma.conversation.count({
    where: {
      status: "RESOLVED",
      resolvedAt: { gte: start },
    },
  })
}

export async function listConversationChannelCounts() {
  return prisma.conversation.groupBy({
    by: ["channel"],
    _count: { channel: true },
  })
}

export async function listChannelConfigs() {
  return prisma.channelConfig.findMany()
}

export async function listResolvedConversationsWithFirstAgentMessage() {
  return prisma.conversation.findMany({
    where: {
      status: "RESOLVED",
      handoffAt: { not: null },
    },
    include: {
      messages: {
        where: { role: "AGENT" },
        orderBy: { createdAt: "asc" },
        take: 1,
      },
    },
    take: 100,
    orderBy: { resolvedAt: "desc" },
  })
}
