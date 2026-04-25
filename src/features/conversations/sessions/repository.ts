import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"

export async function findDashboardSessionsByUser(userId: string) {
  return prisma.dashboardSession.findMany({
    where: { userId },
    include: {
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { content: true, createdAt: true },
      },
      _count: { select: { messages: true } },
    },
    orderBy: { updatedAt: "desc" },
  })
}

export async function createDashboardSession(data: {
  userId: string
  assistantId: string
  title: string
}) {
  return prisma.dashboardSession.create({
    data,
    include: { messages: true },
  })
}

export async function findDashboardSessionByIdAndUser(id: string, userId: string) {
  return prisma.dashboardSession.findFirst({
    where: { id, userId },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
      },
      artifacts: {
        where: { artifactType: { not: null } },
        select: {
          id: true,
          title: true,
          content: true,
          artifactType: true,
          metadata: true,
          mimeType: true,
        },
      },
    },
  })
}

export async function findDashboardSessionBasicByIdAndUser(id: string, userId: string) {
  return prisma.dashboardSession.findFirst({
    where: { id, userId },
  })
}

export async function updateDashboardSessionTitle(id: string, title: string) {
  return prisma.dashboardSession.update({
    where: { id },
    data: { title },
  })
}

export async function deleteDashboardSessionById(id: string) {
  return prisma.dashboardSession.delete({
    where: { id },
  })
}

export async function createDashboardMessages(
  messages: Array<{
    id?: string
    sessionId: string
    role: "user" | "assistant"
    content: string
    replyTo?: string
    editHistory?: Array<{ content: string; assistantResponse?: string; editedAt: string }>
    sources?: Array<{ title: string; content: string; similarity?: number }>
    metadata?: Record<string, unknown>
  }>
) {
  return prisma.$transaction(
    messages.map((message) => {
      const data = {
        sessionId: message.sessionId,
        role: message.role,
        content: message.content,
        replyTo: message.replyTo,
        editHistory: message.editHistory as Prisma.InputJsonValue | undefined,
        sources: message.sources as Prisma.InputJsonValue | undefined,
        metadata: message.metadata as Prisma.InputJsonValue | undefined,
      }
      // Use upsert if ID provided (handles retries/duplicates), create if not
      if (message.id) {
        return prisma.dashboardMessage.upsert({
          where: { id: message.id },
          create: { id: message.id, ...data },
          update: data,
        })
      }
      return prisma.dashboardMessage.create({ data })
    })
  )
}

export async function findDashboardMessageByIdAndSession(messageId: string, sessionId: string) {
  return prisma.dashboardMessage.findFirst({
    where: { id: messageId, sessionId },
  })
}

export async function updateDashboardMessageById(
  messageId: string,
  data: {
    content?: string
    editHistory?: Array<{ content: string; assistantResponse?: string; editedAt: string }>
    sources?: Array<{ title: string; content: string; similarity?: number }>
    metadata?: Record<string, unknown>
  }
) {
  const { metadata, ...rest } = data
  return prisma.dashboardMessage.update({
    where: { id: messageId },
    data: {
      ...rest,
      ...(metadata !== undefined && {
        metadata: metadata as Prisma.InputJsonObject,
      }),
    },
  })
}

export async function deleteDashboardMessagesBySession(sessionId: string, messageIds: string[]) {
  return prisma.dashboardMessage.deleteMany({
    where: {
      id: { in: messageIds },
      sessionId,
    },
  })
}

export async function findDashboardArtifactByIdAndSession(
  artifactId: string,
  sessionId: string
) {
  return prisma.document.findFirst({
    where: { id: artifactId, sessionId, artifactType: { not: null } },
  })
}

export async function updateDashboardArtifactById(
  artifactId: string,
  data: {
    content: string
    title: string
    fileSize: number
    metadata: Record<string, unknown>
  }
) {
  return prisma.document.update({
    where: { id: artifactId },
    data: {
      ...data,
      metadata: data.metadata as Prisma.InputJsonValue,
    },
  })
}

/**
 * Optimistic-lock variant of {@link updateDashboardArtifactById}.
 *
 * Returns `null` when the row's `updatedAt` no longer matches the supplied
 * token — meaning a concurrent writer changed the row between read and write.
 * Caller must surface the conflict (don't silently retry or overwrite).
 */
export async function updateDashboardArtifactByIdLocked(
  artifactId: string,
  expectedUpdatedAt: Date,
  data: {
    content: string
    title: string
    fileSize: number
    metadata: Record<string, unknown>
  }
) {
  const result = await prisma.document.updateMany({
    where: { id: artifactId, updatedAt: expectedUpdatedAt },
    data: {
      ...data,
      metadata: data.metadata as Prisma.InputJsonValue,
    },
  })
  if (result.count === 0) return null
  return prisma.document.findUnique({ where: { id: artifactId } })
}

/**
 * Optimistic-lock variant of {@link updateDashboardArtifactById}.
 *
 * Returns `null` when the row's `updatedAt` no longer matches the supplied
 * token — meaning a concurrent writer changed the row between read and write.
 * Caller must surface the conflict (don't silently retry or overwrite).
 */
export async function updateDashboardArtifactByIdLocked(
  artifactId: string,
  expectedUpdatedAt: Date,
  data: {
    content: string
    title: string
    fileSize: number
    metadata: Record<string, unknown>
  }
) {
  const result = await prisma.document.updateMany({
    where: { id: artifactId, updatedAt: expectedUpdatedAt },
    data: {
      ...data,
      metadata: data.metadata as Prisma.InputJsonValue,
    },
  })
  if (result.count === 0) return null
  return prisma.document.findUnique({ where: { id: artifactId } })
}

export async function deleteDashboardArtifactById(artifactId: string) {
  return prisma.document.delete({
    where: { id: artifactId },
  })
}

export async function findArtifactsBySessionId(sessionId: string) {
  return prisma.document.findMany({
    where: { sessionId, artifactType: { not: null } },
    select: { id: true, s3Key: true },
  })
}

export async function deleteArtifactsBySessionId(sessionId: string) {
  return prisma.document.deleteMany({
    where: { sessionId, artifactType: { not: null } },
  })
}
