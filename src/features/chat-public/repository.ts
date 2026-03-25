import { access, mkdir, readFile, writeFile } from "fs/promises"
import path from "path"
import crypto from "crypto"
import { prisma } from "@/lib/prisma"
import { MIME_TO_EXT } from "@/lib/files/mime-types"

const CHAT_ATTACHMENTS_STORAGE_DIR = path.join(
  process.cwd(),
  "storage",
  "chat-attachments"
)

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
  await mkdir(CHAT_ATTACHMENTS_STORAGE_DIR, { recursive: true })
  await writeFile(
    path.join(CHAT_ATTACHMENTS_STORAGE_DIR, storedFileName),
    params.buffer
  )
  return storedFileName
}

export async function readChatAttachment(fileId: string) {
  const filePath = path.join(CHAT_ATTACHMENTS_STORAGE_DIR, fileId)
  await access(filePath)

  const buffer = await readFile(filePath)
  const ext = path.extname(fileId).toLowerCase()
  const contentType = CHAT_ATTACHMENT_MIME_MAP[ext] || "application/octet-stream"

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
