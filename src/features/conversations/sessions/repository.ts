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
        // mimeType is intentionally not selected here — `formatArtifact`
        // in service.ts has no `mimeType` field on its return shape, so
        // selecting it would mean fetching and silently dropping the
        // value on every session load. Paths that actually need it (LLM
        // tool / manual edit / delete) fetch via
        // `findDashboardArtifactByIdAndSession`.
        select: {
          id: true,
          title: true,
          content: true,
          artifactType: true,
          metadata: true,
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
  // Pre-flight check for ids that already exist in a DIFFERENT session.
  // The downstream upsert keys only on `id` — if a client supplied a
  // message id that already lived in another session, the update branch
  // would overwrite that message's `sessionId` and effectively move it
  // across sessions (no cross-session ownership check at the DB layer).
  // Refuse with a clear error before touching the DB. Same-session reuse
  // (legitimate retry) still hits the upsert path below.
  const idsToCheck = messages
    .map((m) => m.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0)
  if (idsToCheck.length > 0) {
    const existingByOtherSession = await prisma.dashboardMessage.findMany({
      where: { id: { in: idsToCheck } },
      select: { id: true, sessionId: true },
    })
    for (const existing of existingByOtherSession) {
      const target = messages.find((m) => m.id === existing.id)
      if (target && existing.sessionId !== target.sessionId) {
        throw new Error(
          `Message id "${existing.id}" already exists in a different session — refusing to move it across sessions`,
        )
      }
    }
  }

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

/**
 * Optimistic-lock update for an artifact row.
 *
 * Returns `null` when the row's `updatedAt` no longer matches the supplied
 * token — meaning a concurrent writer changed the row between read and write.
 * Caller must surface the conflict (don't silently retry or overwrite).
 *
 * An earlier unlocked variant existed and was never wired into any code
 * path. Removed because a silent last-write-wins update was always the
 * wrong default for artifact rows.
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
  // metadata is included so the session-delete cleanup path can flatten
  // every archived version's `s3Key` into the bulk delete batch. Without
  // this, `metadata.versions[].s3Key` keys leak into S3 indefinitely on
  // session delete (single-artifact delete already pulls metadata via
  // findDashboardArtifactByIdAndSession).
  return prisma.document.findMany({
    where: { sessionId, artifactType: { not: null } },
    select: { id: true, s3Key: true, metadata: true },
  })
}

export async function deleteArtifactsBySessionId(sessionId: string) {
  return prisma.document.deleteMany({
    where: { sessionId, artifactType: { not: null } },
  })
}
