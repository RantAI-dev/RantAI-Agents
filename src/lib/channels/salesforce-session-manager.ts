import { Server as IOServer } from "socket.io"
import { prisma } from "@/lib/prisma"
import {
  type MessagingSession,
  pollMessages,
  parseMessagingMessages,
  sendMessage,
  endConversation,
  removeActiveSession,
} from "./salesforce"

interface ManagedSession {
  conversationId: string
  session: MessagingSession
  config: Record<string, string>
  pollInterval: NodeJS.Timeout | null
  isPolling: boolean
  lastMessageTimestamp?: string
}

const managedSessions = new Map<string, ManagedSession>()

let ioServer: IOServer | null = null

/**
 * Initialize the session manager with Socket.IO server
 */
export function initSalesforceSessionManager(io: IOServer): void {
  ioServer = io
  console.log("[Salesforce Session Manager] Initialized")
}

/**
 * Start managing a Messaging session for a conversation
 */
export function startSessionPolling(
  conversationId: string,
  sfConversationId: string,
  session: MessagingSession,
  config: Record<string, string>
): void {
  // Don't start if already managing this session
  if (managedSessions.has(conversationId)) {
    console.log(`[Salesforce] Session already managed: ${conversationId}`)
    return
  }

  const managed: ManagedSession = {
    conversationId,
    session,
    config,
    pollInterval: null,
    isPolling: false,
  }

  managedSessions.set(conversationId, managed)

  // Start polling loop
  startPolling(managed)

  console.log(`[Salesforce] Started session polling for: ${conversationId}`)
}

/**
 * Stop managing a session
 */
export function stopSessionPolling(conversationId: string): void {
  const managed = managedSessions.get(conversationId)
  if (!managed) return

  if (managed.pollInterval) {
    clearTimeout(managed.pollInterval)
  }

  managedSessions.delete(conversationId)
  removeActiveSession(conversationId)

  console.log(`[Salesforce] Stopped session polling for: ${conversationId}`)
}

/**
 * Send a customer message to Salesforce Messaging
 */
export async function sendCustomerMessage(
  conversationId: string,
  message: string
): Promise<boolean> {
  const managed = managedSessions.get(conversationId)
  if (!managed || !managed.session.isConnected) {
    console.log(`[Salesforce] No active session for: ${conversationId}`)
    return false
  }

  return sendMessage(managed.config, managed.session, message)
}

/**
 * End a Messaging session
 */
export async function endSession(conversationId: string): Promise<boolean> {
  const managed = managedSessions.get(conversationId)
  if (!managed) return false

  // Stop polling
  stopSessionPolling(conversationId)

  // End the conversation in Salesforce
  return endConversation(managed.config, managed.session)
}

/**
 * Check if a conversation has an active Salesforce session
 */
export function hasActiveSession(conversationId: string): boolean {
  const managed = managedSessions.get(conversationId)
  return managed?.session.isConnected ?? false
}

/**
 * Internal polling loop
 */
async function startPolling(managed: ManagedSession): Promise<void> {
  if (managed.isPolling) return

  managed.isPolling = true

  async function poll(): Promise<void> {
    if (!managedSessions.has(managed.conversationId)) {
      return // Session was stopped
    }

    try {
      const messages = await pollMessages(
        managed.config,
        managed.session,
        managed.lastMessageTimestamp
      )

      if (messages.length > 0) {
        // Update last message timestamp
        const lastMsg = messages[messages.length - 1] as { timestamp?: string }
        if (lastMsg?.timestamp) {
          managed.lastMessageTimestamp = lastMsg.timestamp
        }

        await handleMessages(managed, messages)
      }

      // Check if session is still connected
      if (!managed.session.isConnected) {
        console.log(`[Salesforce] Session disconnected: ${managed.conversationId}`)
        await handleSessionEnded(managed)
        return
      }

      // Schedule next poll (poll every 3 seconds)
      managed.pollInterval = setTimeout(poll, 3000)
    } catch (error) {
      console.error(`[Salesforce] Poll error for ${managed.conversationId}:`, error)
      // Retry after a delay on error
      managed.pollInterval = setTimeout(poll, 5000)
    }
  }

  // Start first poll
  poll()
}

/**
 * Handle incoming messages from Salesforce
 */
async function handleMessages(
  managed: ManagedSession,
  rawMessages: unknown[]
): Promise<void> {
  const parsed = parseMessagingMessages(rawMessages as Parameters<typeof parseMessagingMessages>[0])

  // Get the conversation's session ID for socket room
  const conversation = await prisma.conversation.findUnique({
    where: { id: managed.conversationId },
    select: { sessionId: true },
  })

  if (!conversation) return

  const roomId = `conversation:${conversation.sessionId}`

  // Handle agent joined
  if (parsed.agentJoined) {
    console.log(`[Salesforce] Agent joined: ${parsed.agentJoined.name}`)

    // Update conversation status
    await prisma.conversation.update({
      where: { id: managed.conversationId },
      data: { status: "AGENT_CONNECTED" },
    })

    // Notify customer
    ioServer?.to(roomId).emit("chat:agent-joined", {
      agentName: parsed.agentJoined.name,
    })

    ioServer?.to(roomId).emit("chat:status-update", {
      status: "AGENT_CONNECTED",
    })
  }

  // Handle agent messages
  for (const agentMsg of parsed.agentMessages) {
    console.log(`[Salesforce] Agent message: ${agentMsg.text}`)

    // Save message to database
    const savedMessage = await prisma.message.create({
      data: {
        conversationId: managed.conversationId,
        role: "AGENT",
        content: agentMsg.text,
      },
    })

    // Send to customer
    ioServer?.to(roomId).emit("chat:message", {
      id: savedMessage.id,
      role: "AGENT",
      content: agentMsg.text,
      createdAt: savedMessage.createdAt.toISOString(),
    })
  }

  // Handle agent left
  if (parsed.agentLeft) {
    console.log(`[Salesforce] Agent left conversation`)
    ioServer?.to(roomId).emit("chat:agent-left")
  }

  // Handle chat ended
  if (parsed.chatEnded) {
    await handleSessionEnded(managed)
  }
}

/**
 * Handle session ended
 */
async function handleSessionEnded(managed: ManagedSession): Promise<void> {
  console.log(`[Salesforce] Session ended: ${managed.conversationId}`)

  // Get conversation for socket room
  const conversation = await prisma.conversation.findUnique({
    where: { id: managed.conversationId },
    select: { sessionId: true },
  })

  if (conversation) {
    // Update conversation status
    await prisma.conversation.update({
      where: { id: managed.conversationId },
      data: { status: "RESOLVED" },
    })

    // Notify customer
    const roomId = `conversation:${conversation.sessionId}`
    ioServer?.to(roomId).emit("chat:status-update", {
      status: "RESOLVED",
    })

    // Add system message
    const systemMessage = await prisma.message.create({
      data: {
        conversationId: managed.conversationId,
        role: "SYSTEM",
        content: "The chat session has ended. Thank you for contacting us!",
      },
    })

    ioServer?.to(roomId).emit("chat:message", {
      id: systemMessage.id,
      role: "SYSTEM",
      content: systemMessage.content,
      createdAt: systemMessage.createdAt.toISOString(),
    })
  }

  // Clean up
  stopSessionPolling(managed.conversationId)
}

/**
 * Get session stats
 */
export function getSessionStats(): {
  activeSessions: number
  sessions: Array<{ conversationId: string; isConnected: boolean }>
} {
  const sessions = Array.from(managedSessions.values()).map((m) => ({
    conversationId: m.conversationId,
    isConnected: m.session.isConnected,
  }))

  return {
    activeSessions: sessions.filter((s) => s.isConnected).length,
    sessions,
  }
}
