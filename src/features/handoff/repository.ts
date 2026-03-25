import { prisma } from "@/lib/prisma"

export async function createConversation(data: {
  sessionId: string
  status: string
  channel: string
  customerName: string
  customerEmail?: string
  productInterest?: string
  handoffAt: Date
}) {
  return prisma.conversation.create({
    data,
  })
}

export async function createMessagesMany(
  data: Array<{ conversationId: string; role: string; content: string }>
) {
  return prisma.message.createMany({
    data,
  })
}

export async function createMessage(data: {
  conversationId: string
  role: string
  content: string
}) {
  return prisma.message.create({
    data,
  })
}

export async function findConversationById(conversationId: string) {
  return prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      agent: { select: { name: true } },
    },
  })
}

export async function findConversationSessionId(conversationId: string) {
  return prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { sessionId: true },
  })
}

export async function findMessagesAfterConversation(
  conversationId: string,
  after?: Date
) {
  return prisma.message.findMany({
    where: {
      conversationId,
      role: { in: ["AGENT", "SYSTEM"] },
      ...(after ? { createdAt: { gt: after } } : {}),
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      role: true,
      content: true,
      createdAt: true,
    },
  })
}

export async function countWaitingConversations() {
  return prisma.conversation.count({
    where: { status: "WAITING_FOR_AGENT" },
  })
}
