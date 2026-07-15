import path from "path"
import crypto from "crypto"
import { prisma } from "@/lib/prisma"
import { MIME_TO_EXT } from "@/lib/files/mime-types"
import { uploadFile, downloadFile, fileExists, getFileMetadata } from "@/lib/s3"

// Chat attachments live under this S3 key prefix (RustFS/MinIO-backed). Bytes
// still flow through the app route — we never presign to the browser.
const CHAT_ATTACHMENTS_S3_PREFIX = "chat-attachments"

const CHAT_ATTACHMENT_MIME_MAP: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
  ".txt": "text/plain",
  ".md": "text/markdown",
}

export async function findAssistantById(assistantId: string) {
  return prisma.assistant.findUnique({
    where: { id: assistantId },
    select: {
      systemPrompt: true,
      model: true,
      useKnowledgeBase: true,
      knowledgeBaseGroupIds: true,
      memoryConfig: true,
      modelConfig: true,
      guardRails: true,
      name: true,
      liveChatEnabled: true,
      organizationId: true,
    },
  })
}

export async function findActiveChatflowByAssistantId(assistantId: string) {
  return prisma.workflow.findFirst({
    where: {
      assistantId,
      mode: "CHATFLOW",
      status: "ACTIVE",
    },
  })
}

export async function findDocumentsByIds(documentIds: string[]) {
  return prisma.document.findMany({
    where: { id: { in: documentIds } },
    select: { id: true, title: true, content: true },
  })
}

export async function saveChatAttachment(params: {
  buffer: Buffer
  mimeType: string
}) {
  const fileId = crypto.randomUUID()
  const ext = MIME_TO_EXT[params.mimeType] || ""
  const storedFileName = `${fileId}${ext}`
  await uploadFile(
    `${CHAT_ATTACHMENTS_S3_PREFIX}/${storedFileName}`,
    params.buffer,
    params.mimeType
  )
  return storedFileName
}

export async function readChatAttachment(fileId: string) {
  const key = `${CHAT_ATTACHMENTS_S3_PREFIX}/${fileId}`

  // Preserve the local-disk 404 contract: the service maps a native ENOENT
  // into a 404, so a missing S3 object must surface the same signal. HEAD
  // first (cheap) and throw an ENOENT-coded Error when the object is absent.
  if (!(await fileExists(key))) {
    const err = new Error(`Chat attachment not found: ${fileId}`) as Error & {
      code?: string
    }
    err.code = "ENOENT"
    throw err
  }

  const buffer = await downloadFile(key)

  // Prefer the stored object's ContentType; fall back to the extension map.
  const metadata = await getFileMetadata(key)
  const ext = path.extname(fileId).toLowerCase()
  const contentType =
    metadata?.contentType ||
    CHAT_ATTACHMENT_MIME_MAP[ext] ||
    "application/octet-stream"

  return {
    buffer,
    contentType,
  }
}

export async function findActiveConversations() {
  return prisma.conversation.findMany({
    where: {
      status: {
        in: ["WAITING_FOR_AGENT", "AGENT_CONNECTED"],
      },
    },
    include: {
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      agent: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: { handoffAt: "asc" },
  })
}

export async function createConversation(sessionId: string) {
  return prisma.conversation.create({
    data: {
      sessionId,
      status: "AI_ACTIVE",
    },
  })
}

// Confirms a `body.sessionId` from the chat request boundary actually points at
// a DashboardSession row owned by the caller. Returns the id when valid, null
// otherwise — including the empty / undefined cases. Stale or never-persisted
// ids (e.g. a tempId UUID from `useChatSessions.createSession` before its
// background POST resolves, or a cuid whose row was later deleted) flow
// through here as null so downstream tools that FK against
// `Document.sessionId` don't blow up with P2003.
export async function validateOwnedSessionId(
  sessionId: string | undefined | null,
  userId: string,
): Promise<string | null> {
  if (!sessionId) return null
  const row = await prisma.dashboardSession.findFirst({
    where: { id: sessionId, userId },
    select: { id: true },
  })
  return row ? sessionId : null
}

export async function findConversationMessages(conversationId: string) {
  return prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      role: true,
      content: true,
      createdAt: true,
    },
  })
}

export async function findConversationStatus(conversationId: string) {
  return prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { status: true },
  })
}
