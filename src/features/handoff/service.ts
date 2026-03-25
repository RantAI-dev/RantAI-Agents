import { getIOInstance, broadcastQueueUpdate } from "@/lib/socket"
import { ConversationStatus, MessageRole, type QueueConversation } from "@/types/socket"
import type { HandoffMessageInput, HandoffRequestInput } from "./schema"
import {
  countWaitingConversations,
  createConversation,
  createMessagesMany,
  createMessage,
  findConversationById,
  findMessagesAfterConversation,
} from "./repository"

export interface ServiceError {
  status: number
  error: string
}

export interface HandoffActor {
  userId: string
  userName: string | null
  userEmail: string | null
}

export interface HandoffMessageItem {
  id: string
  role: string
  content: string
  timestamp: string
}

export interface HandoffStatusResponse {
  status: string
  agentName: string | null
  messages: HandoffMessageItem[]
}

function buildQueueConversation(params: {
  id: string
  sessionId: string
  customerName: string | null
  customerEmail: string | null
  customerPhone: string | null
  productInterest: string | null
  channel: string
  createdAt: Date
  handoffAt: Date | null
  messagePreview: string | null
}): QueueConversation {
  return {
    id: params.id,
    sessionId: params.sessionId,
    customerName: params.customerName,
    customerEmail: params.customerEmail,
    customerPhone: params.customerPhone,
    productInterest: params.productInterest,
    channel: params.channel,
    createdAt: params.createdAt.toISOString(),
    handoffAt: params.handoffAt?.toISOString() || null,
    messagePreview: params.messagePreview,
  }
}

/**
 * Creates a dashboard handoff conversation and emits it to the agent queue.
 */
export async function createDashboardHandoffRequest(params: {
  actor: HandoffActor
  input: HandoffRequestInput
}): Promise<{ conversationId: string; status: string; queuePosition: number } | ServiceError> {
  const sessionId = `dashboard_${params.actor.userId}_${Date.now()}`
  const customerName = params.actor.userName || "Dashboard User"
  const customerEmail = params.actor.userEmail || undefined

  const conversation = await createConversation({
    sessionId,
    status: ConversationStatus.WAITING_FOR_AGENT,
    channel: "PORTAL",
    customerName,
    customerEmail,
    productInterest: params.input.assistantId || undefined,
    handoffAt: new Date(),
  })

  if (Array.isArray(params.input.chatHistory)) {
    const messageData = params.input.chatHistory.map(
      (message: { role: string; content: string }) => ({
        conversationId: conversation.id,
        role: message.role === "user" ? MessageRole.USER : MessageRole.ASSISTANT,
        content: message.content,
      })
    )

    if (messageData.length > 0) {
      await createMessagesMany(messageData)
    }
  }

  await createMessage({
    conversationId: conversation.id,
    role: MessageRole.SYSTEM,
    content: "Customer requested to speak with an agent from the dashboard chat.",
  })

  const io = getIOInstance()
  if (io) {
    const queueConversation = buildQueueConversation({
      id: conversation.id,
      sessionId: conversation.sessionId,
      customerName: conversation.customerName,
      customerEmail: conversation.customerEmail,
      customerPhone: conversation.customerPhone,
      productInterest: conversation.productInterest,
      channel: conversation.channel,
      createdAt: conversation.createdAt,
      handoffAt: conversation.handoffAt,
      messagePreview:
        Array.isArray(params.input.chatHistory) && params.input.chatHistory.length > 0
          ? params.input.chatHistory[params.input.chatHistory.length - 1]?.content || null
          : null,
    })

    io.to("agents").emit("conversation:new", queueConversation)
    await broadcastQueueUpdate(io)
  }

  const waitingCount = await countWaitingConversations()

  return {
    conversationId: conversation.id,
    status: ConversationStatus.WAITING_FOR_AGENT,
    queuePosition: waitingCount,
  }
}

/**
 * Returns the current dashboard handoff status and agent/system messages.
 */
export async function getDashboardHandoffStatus(params: {
  conversationId: string
  after?: string | null
}): Promise<HandoffStatusResponse | ServiceError> {
  const conversation = await findConversationById(params.conversationId)
  if (!conversation) {
    return { status: 404, error: "Conversation not found" }
  }

  const afterDate = params.after ? new Date(params.after) : undefined
  const messages = await findMessagesAfterConversation(params.conversationId, afterDate)

  return {
    status: conversation.status,
    agentName: conversation.agent?.name || null,
    messages: messages.map((message: {
      id: string
      role: string
      content: string
      createdAt: Date
    }) => ({
      id: message.id,
      role: message.role.toLowerCase(),
      content: message.content,
      timestamp: message.createdAt.toISOString(),
    })),
  }
}

/**
 * Saves a dashboard-to-agent handoff message and emits it to the conversation room.
 */
export async function sendDashboardHandoffMessage(params: {
  input: HandoffMessageInput
}): Promise<{ messageId: string } | ServiceError> {
  if (!params.input.conversationId || !params.input.content) {
    return { status: 400, error: "conversationId and content are required" }
  }

  const conversation = await findConversationById(params.input.conversationId)
  if (!conversation) {
    return { status: 404, error: "Conversation not found" }
  }

  const message = await createMessage({
    conversationId: params.input.conversationId,
    role: MessageRole.USER,
    content: params.input.content,
  })

  const io = getIOInstance()
  if (io) {
    io.to(`conversation:${conversation.sessionId}`).emit("conversation:message", {
      conversationId: conversation.id,
      id: message.id,
      role: message.role,
      content: message.content,
      createdAt: message.createdAt.toISOString(),
    })
  }

  return { messageId: message.id }
}
