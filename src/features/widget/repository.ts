import { prisma } from "@/lib/prisma"
import { ConversationStatus, MessageRole } from "@/types/socket"

export async function findEnabledEmbedKeyByKey(key: string) {
  return prisma.embedApiKey.findFirst({
    where: { key, enabled: true },
  })
}

export async function touchEmbedKeyLastUsed(embedKeyId: string) {
  await prisma.embedApiKey.update({
    where: { id: embedKeyId },
    data: { lastUsedAt: new Date() },
  })
}

export async function incrementEmbedKeyUsage(embedKeyId: string) {
  await prisma.embedApiKey.update({
    where: { id: embedKeyId },
    data: {
      requestCount: { increment: 1 },
      lastUsedAt: new Date(),
    },
  })
}

export async function findWidgetAssistantById(assistantId: string) {
  return prisma.assistant.findUnique({
    where: { id: assistantId },
    select: {
      id: true,
      name: true,
      emoji: true,
      description: true,
      liveChatEnabled: true,
    },
  })
}

export async function createWidgetConversation(params: {
  sessionId: string
  customerName: string
  customerEmail?: string
  productInterest?: string
}) {
  return prisma.conversation.create({
    data: {
      sessionId: params.sessionId,
      status: ConversationStatus.WAITING_FOR_AGENT,
      channel: "PORTAL",
      customerName: params.customerName,
      customerEmail: params.customerEmail,
      productInterest: params.productInterest,
      handoffAt: new Date(),
    },
  })
}

export async function createWidgetMessages(
  conversationId: string,
  chatHistory: Array<{ role: string; content: string }>
) {
  if (chatHistory.length === 0) return

  await prisma.message.createMany({
    data: chatHistory.map((msg) => ({
      conversationId,
      role: msg.role === "user" ? MessageRole.USER : MessageRole.ASSISTANT,
      content: msg.content,
    })),
  })
}

export async function createWidgetSystemMessage(conversationId: string) {
  await prisma.message.create({
    data: {
      conversationId,
      role: MessageRole.SYSTEM,
      content: "Customer requested to speak with an agent via embedded widget.",
    },
  })
}

export async function countWaitingWidgetConversations() {
  return prisma.conversation.count({
    where: { status: ConversationStatus.WAITING_FOR_AGENT },
  })
}

export async function findConversationById(conversationId: string) {
  return prisma.conversation.findUnique({
    where: { id: conversationId },
  })
}

export async function findConversationByIdWithAgent(conversationId: string) {
  return prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      agent: { select: { name: true } },
    },
  })
}

export async function findWidgetMessages(params: {
  conversationId: string
  after?: Date
}) {
  return prisma.message.findMany({
    where: {
      conversationId: params.conversationId,
      role: { in: [MessageRole.AGENT, MessageRole.SYSTEM] },
      ...(params.after && { createdAt: { gt: params.after } }),
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

export async function createWidgetUserMessage(params: {
  conversationId: string
  content: string
}) {
  return prisma.message.create({
    data: {
      conversationId: params.conversationId,
      role: MessageRole.USER,
      content: params.content,
    },
  })
}
