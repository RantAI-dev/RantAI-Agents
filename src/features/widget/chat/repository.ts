import { prisma } from "@/lib/prisma"

export async function findEnabledWidgetEmbedKey(key: string) {
  return prisma.embedApiKey.findFirst({
    where: { key, enabled: true },
  })
}

export async function findWidgetAssistantById(assistantId: string) {
  return prisma.assistant.findUnique({
    where: { id: assistantId },
  })
}

export async function findActiveChatflowWorkflow(assistantId: string) {
  return prisma.workflow.findFirst({
    where: {
      assistantId,
      mode: "CHATFLOW",
      status: "ACTIVE",
    },
  })
}

export async function incrementWidgetEmbedKeyUsage(embedKeyId: string) {
  await prisma.embedApiKey.update({
    where: { id: embedKeyId },
    data: {
      requestCount: { increment: 1 },
      lastUsedAt: new Date(),
    },
  })
}

export async function setWidgetUserMemoryExpiry(userId: string, expiresAt: Date) {
  return prisma.userMemory.updateMany({
    where: { userId },
    data: { expiresAt },
  })
}
