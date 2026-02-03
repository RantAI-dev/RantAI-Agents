import { Server as IOServer } from "socket.io"
import type { Server as HTTPServer } from "http"
import { prisma } from "./prisma"
import {
  ConversationStatus,
  MessageRole,
  AgentStatus,
  type QueueConversation,
} from "@/types/socket"
import { getPrimaryChannel, dispatchToChannel, getChannelCustomerMessage } from "./channels"
import type { ConversationData } from "./channels/types"

// Store for online agents
const onlineAgents = new Map<string, string>() // agentId -> socketId

export function initSocketServer(httpServer: HTTPServer): IOServer {
  const io = new IOServer(httpServer, {
    path: "/api/socket",
    addTrailingSlash: false,
    cors: {
      origin: process.env.NEXTAUTH_URL || "http://localhost:3000",
      methods: ["GET", "POST"],
    },
  })

  io.on("connection", (socket) => {
    console.log("Client connected:", socket.id)

    // Customer joins a conversation room
    socket.on("chat:join", async ({ sessionId }) => {
      socket.join(`conversation:${sessionId}`)
      console.log(`Socket ${socket.id} joined conversation:${sessionId}`)
    })

    // Customer sends a message
    socket.on("chat:message", async ({ content, sessionId }) => {
      try {
        // Find or create conversation
        let conversation = await prisma.conversation.findUnique({
          where: { sessionId },
        })

        if (!conversation) {
          conversation = await prisma.conversation.create({
            data: {
              sessionId,
              status: ConversationStatus.AI_ACTIVE,
            },
          })
        }

        // Save message
        const message = await prisma.message.create({
          data: {
            conversationId: conversation.id,
            role: MessageRole.USER,
            content,
          },
        })

        // Broadcast to the conversation room (customer will receive this)
        io.to(`conversation:${sessionId}`).emit("chat:message", {
          id: message.id,
          role: message.role,
          content: message.content,
          createdAt: message.createdAt.toISOString(),
        })

        // If agent is connected (Portal), notify them via conversation:message
        if (
          conversation.agentId &&
          conversation.status === ConversationStatus.AGENT_CONNECTED
        ) {
          io.to(`conversation:${sessionId}`).emit("conversation:message", {
            conversationId: conversation.id,
            id: message.id,
            role: message.role,
            content: message.content,
            createdAt: message.createdAt.toISOString(),
          })
        }
      } catch (error) {
        console.error("Error handling chat message:", error)
        socket.emit("chat:error", { message: "Failed to send message" })
      }
    })

    // Customer typing indicator
    socket.on("chat:typing", async ({ sessionId }) => {
      const conversation = await prisma.conversation.findUnique({
        where: { sessionId },
      })

      if (conversation?.agentId) {
        io.to(`agent:${conversation.agentId}`).emit("conversation:typing", {
          conversationId: conversation.id,
        })
      }
    })

    // Customer requests agent handoff
    socket.on(
      "chat:request-agent",
      async ({ sessionId, customerName, customerEmail, productInterest }) => {
        try {
          // Check if there's an existing conversation for this session
          let existingConversation = await prisma.conversation.findUnique({
            where: { sessionId },
            include: {
              _count: { select: { messages: true } },
            },
          })

          let conversation
          let effectiveSessionId = sessionId

          // Create a new conversation if:
          // 1. The existing conversation was resolved, OR
          // 2. The existing conversation has an agent assigned (previous session not cleaned up)
          const shouldCreateNew =
            existingConversation?.status === ConversationStatus.RESOLVED ||
            (existingConversation?.agentId && existingConversation?._count?.messages > 0)

          if (shouldCreateNew) {
            // Generate a new unique session by appending timestamp
            const newSessionId = `${sessionId.split("-")[0]}-${Date.now()}`
            effectiveSessionId = newSessionId

            console.log(`[Socket] Creating new conversation. Old sessionId: ${sessionId}, New: ${newSessionId}`)

            // Update the socket room
            socket.leave(`conversation:${sessionId}`)
            socket.join(`conversation:${newSessionId}`)

            conversation = await prisma.conversation.create({
              data: {
                sessionId: newSessionId,
                status: ConversationStatus.WAITING_FOR_AGENT,
                customerName,
                customerEmail,
                productInterest,
                handoffAt: new Date(),
              },
              include: {
                messages: {
                  orderBy: { createdAt: "desc" },
                  take: 1,
                },
              },
            })

            // Notify customer about the new session
            socket.emit("chat:new-session", { sessionId: newSessionId })
          } else if (existingConversation) {
            // Update existing conversation that's still in progress
            conversation = await prisma.conversation.update({
              where: { sessionId },
              data: {
                status: ConversationStatus.WAITING_FOR_AGENT,
                customerName,
                customerEmail,
                productInterest,
                handoffAt: new Date(),
                agentId: null, // Clear any previous agent
              },
              include: {
                messages: {
                  orderBy: { createdAt: "desc" },
                  take: 1,
                },
              },
            })
          } else {
            // Create new conversation
            conversation = await prisma.conversation.create({
              data: {
                sessionId,
                status: ConversationStatus.WAITING_FOR_AGENT,
                customerName,
                customerEmail,
                productInterest,
                handoffAt: new Date(),
              },
              include: {
                messages: {
                  orderBy: { createdAt: "desc" },
                  take: 1,
                },
              },
            })
          }

          // Add system message
          await prisma.message.create({
            data: {
              conversationId: conversation.id,
              role: MessageRole.SYSTEM,
              content: `Customer requested to speak with an agent. Product interest: ${productInterest || "Not specified"}`,
            },
          })

          // Check the configured primary channel
          const channelConfig = await getPrimaryChannel()
          const channel = channelConfig?.channel || "PORTAL"

          console.log(`[Socket] Primary channel: ${channel}`)

          if (channel === "PORTAL") {
            // PORTAL: Use existing queue behavior
            socket.emit("chat:status-update", {
              status: ConversationStatus.WAITING_FOR_AGENT,
            })

            // Get queue position
            const queuePosition = await getQueuePosition(conversation.id)
            socket.emit("chat:queue-position", { position: queuePosition })

            // Notify all online agents about new conversation in queue
            const queueConversation: QueueConversation = {
              id: conversation.id,
              sessionId: conversation.sessionId,
              customerName: conversation.customerName,
              customerEmail: conversation.customerEmail,
              customerPhone: conversation.customerPhone,
              productInterest: conversation.productInterest,
              channel: conversation.channel,
              createdAt: conversation.createdAt.toISOString(),
              handoffAt: conversation.handoffAt?.toISOString() || null,
              messagePreview: conversation.messages[0]?.content || null,
            }

            io.to("agents").emit("conversation:new", queueConversation)

            // Update queue for all agents
            await broadcastQueueUpdate(io)
          } else {
            // OTHER CHANNELS: Dispatch to configured channel
            // Fetch full conversation data with messages
            const fullConversation = await prisma.conversation.findUnique({
              where: { id: conversation.id },
              include: {
                messages: {
                  orderBy: { createdAt: "asc" },
                },
              },
            })

            if (fullConversation && channelConfig) {
              const conversationData: ConversationData = {
                id: fullConversation.id,
                sessionId: fullConversation.sessionId,
                customerName: fullConversation.customerName,
                customerEmail: fullConversation.customerEmail,
                customerPhone: fullConversation.customerPhone,
                productInterest: fullConversation.productInterest,
                messages: fullConversation.messages.map((m) => ({
                  role: m.role,
                  content: m.content,
                  createdAt: m.createdAt,
                })),
              }

              // Dispatch to the channel
              const result = await dispatchToChannel(conversationData, channelConfig)

              if (result.success) {
                // Update conversation with channel info
                await prisma.conversation.update({
                  where: { id: conversation.id },
                  data: {
                    channel,
                    externalId: result.externalId,
                    status: ConversationStatus.WAITING_FOR_AGENT,
                  },
                })

                // Add system message about the channel
                await prisma.message.create({
                  data: {
                    conversationId: conversation.id,
                    role: MessageRole.SYSTEM,
                    content: result.customerMessage || getChannelCustomerMessage(channel),
                  },
                })

                // Notify customer about the channel response
                socket.emit("chat:status-update", {
                  status: ConversationStatus.WAITING_FOR_AGENT,
                })

                socket.emit("chat:channel-response", {
                  channel,
                  message: result.customerMessage || getChannelCustomerMessage(channel),
                  externalId: result.externalId,
                  metadata: result.metadata,
                })
              } else {
                // Channel dispatch failed, fall back to Portal queue
                console.error(`[Socket] Channel dispatch failed: ${result.message}`)

                socket.emit("chat:status-update", {
                  status: ConversationStatus.WAITING_FOR_AGENT,
                })

                const queuePosition = await getQueuePosition(conversation.id)
                socket.emit("chat:queue-position", { position: queuePosition })

                const queueConversation: QueueConversation = {
                  id: conversation.id,
                  sessionId: conversation.sessionId,
                  customerName: conversation.customerName,
                  customerEmail: conversation.customerEmail,
                  customerPhone: conversation.customerPhone,
                  productInterest: conversation.productInterest,
                  channel: conversation.channel,
                  createdAt: conversation.createdAt.toISOString(),
                  handoffAt: conversation.handoffAt?.toISOString() || null,
                  messagePreview: conversation.messages[0]?.content || null,
                }

                io.to("agents").emit("conversation:new", queueConversation)
                await broadcastQueueUpdate(io)
              }
            }
          }
        } catch (error) {
          console.error("Error requesting agent:", error)
          socket.emit("chat:error", { message: "Failed to request agent" })
        }
      }
    )

    // Customer leaves
    socket.on("chat:leave", async ({ sessionId }) => {
      socket.leave(`conversation:${sessionId}`)

      const conversation = await prisma.conversation.findUnique({
        where: { sessionId },
      })

      if (conversation) {
        // Notify portal agent if connected
        if (conversation.agentId) {
          io.to(`agent:${conversation.agentId}`).emit("conversation:ended", {
            conversationId: conversation.id,
          })
        }
      }
    })

    // Agent goes online
    socket.on("agent:online", async ({ agentId }) => {
      onlineAgents.set(agentId, socket.id)
      socket.join("agents")
      socket.join(`agent:${agentId}`)

      await prisma.agent.update({
        where: { id: agentId },
        data: { status: AgentStatus.ONLINE },
      })

      // Send current queue to the agent
      await broadcastQueueUpdate(io)

      console.log(`Agent ${agentId} is now online`)
    })

    // Agent goes offline
    socket.on("agent:offline", async ({ agentId }) => {
      onlineAgents.delete(agentId)
      socket.leave("agents")
      socket.leave(`agent:${agentId}`)

      await prisma.agent.update({
        where: { id: agentId },
        data: { status: AgentStatus.OFFLINE },
      })

      console.log(`Agent ${agentId} is now offline`)
    })

    // Agent changes status
    socket.on("agent:status-change", async ({ agentId, status }) => {
      await prisma.agent.update({
        where: { id: agentId },
        data: { status },
      })
    })

    // Agent accepts a conversation
    socket.on("agent:accept", async ({ agentId, conversationId }) => {
      try {
        const conversation = await prisma.conversation.update({
          where: { id: conversationId },
          data: {
            status: ConversationStatus.AGENT_CONNECTED,
            agentId,
          },
        })

        const agent = await prisma.agent.findUnique({
          where: { id: agentId },
        })

        // Leave any previous conversation rooms first (except agent-specific rooms)
        const rooms = Array.from(socket.rooms)
        for (const room of rooms) {
          if (room.startsWith("conversation:") && room !== `conversation:${conversation.sessionId}`) {
            socket.leave(room)
          }
        }

        // Join the conversation room
        socket.join(`conversation:${conversation.sessionId}`)

        // Add system message
        await prisma.message.create({
          data: {
            conversationId: conversation.id,
            role: MessageRole.SYSTEM,
            content: `${agent?.name || "An agent"} has joined the conversation.`,
          },
        })

        // Notify customer
        io.to(`conversation:${conversation.sessionId}`).emit(
          "chat:agent-joined",
          {
            agentName: agent?.name || "Agent",
          }
        )

        io.to(`conversation:${conversation.sessionId}`).emit(
          "chat:status-update",
          {
            status: ConversationStatus.AGENT_CONNECTED,
          }
        )

        // Update queue for all agents
        await broadcastQueueUpdate(io)

        console.log(`Agent ${agentId} accepted conversation ${conversationId}`)
      } catch (error) {
        console.error("Error accepting conversation:", error)
      }
    })

    // Agent sends a message
    socket.on("agent:message", async ({ conversationId, content }) => {
      try {
        const conversation = await prisma.conversation.findUnique({
          where: { id: conversationId },
        })

        if (!conversation) return

        // Save message
        const message = await prisma.message.create({
          data: {
            conversationId,
            role: MessageRole.AGENT,
            content,
          },
        })

        // Send to customer based on channel
        if (conversation.channel === "WHATSAPP" && conversation.customerPhone) {
          // Send via Twilio WhatsApp API
          try {
            const { twilioWhatsApp } = await import("./twilio-whatsapp")
            await twilioWhatsApp.sendMessage({
              to: conversation.customerPhone,
              message: content,
            })
            console.log(`[Socket] Sent WhatsApp message to ${conversation.customerPhone}`)
          } catch (waError) {
            console.error("[Socket] Failed to send WhatsApp message:", waError)
          }
        } else {
          // Send via socket for Portal/web chat
          io.to(`conversation:${conversation.sessionId}`).emit("chat:message", {
            id: message.id,
            role: message.role,
            content: message.content,
            createdAt: message.createdAt.toISOString(),
          })
        }
      } catch (error) {
        console.error("Error sending agent message:", error)
      }
    })

    // Agent typing indicator
    socket.on("agent:typing", async ({ conversationId }) => {
      const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
      })

      if (conversation) {
        io.to(`conversation:${conversation.sessionId}`).emit("chat:agent-typing")
      }
    })

    // Agent leaves conversation view (goes back without resolving)
    socket.on("agent:leave-conversation", async ({ conversationId }) => {
      try {
        const conversation = await prisma.conversation.findUnique({
          where: { id: conversationId },
        })

        if (conversation) {
          socket.leave(`conversation:${conversation.sessionId}`)
          console.log(`Agent left conversation view: ${conversationId}`)
        }
      } catch (error) {
        console.error("Error leaving conversation:", error)
      }
    })

    // Agent resolves conversation
    socket.on("agent:resolve", async ({ agentId, conversationId }) => {
      try {
        const conversation = await prisma.conversation.update({
          where: { id: conversationId },
          data: {
            status: ConversationStatus.RESOLVED,
            resolvedAt: new Date(),
          },
        })

        // Add system message
        await prisma.message.create({
          data: {
            conversationId,
            role: MessageRole.SYSTEM,
            content: "Conversation has been resolved. Thank you for choosing HorizonLife!",
          },
        })

        // Notify customer
        io.to(`conversation:${conversation.sessionId}`).emit("chat:status-update", {
          status: ConversationStatus.RESOLVED,
        })

        // Leave the conversation room
        socket.leave(`conversation:${conversation.sessionId}`)

        console.log(`Conversation ${conversationId} resolved by agent ${agentId}`)
      } catch (error) {
        console.error("Error resolving conversation:", error)
      }
    })

    // Handle disconnect
    socket.on("disconnect", () => {
      // Find and remove agent if this was an agent socket
      for (const [agentId, socketId] of onlineAgents.entries()) {
        if (socketId === socket.id) {
          onlineAgents.delete(agentId)
          prisma.agent
            .update({
              where: { id: agentId },
              data: { status: AgentStatus.OFFLINE },
            })
            .catch(console.error)
          break
        }
      }

      console.log("Client disconnected:", socket.id)
    })
  })

  return io
}

async function getQueuePosition(conversationId: string): Promise<number> {
  const waitingConversations = await prisma.conversation.findMany({
    where: { status: ConversationStatus.WAITING_FOR_AGENT },
    orderBy: { handoffAt: "asc" },
    select: { id: true },
  })

  const position = waitingConversations.findIndex((c) => c.id === conversationId)
  return position + 1
}

async function broadcastQueueUpdate(io: IOServer) {
  const conversations = await prisma.conversation.findMany({
    where: { status: ConversationStatus.WAITING_FOR_AGENT },
    orderBy: { handoffAt: "asc" },
    include: {
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  })

  const queueConversations: QueueConversation[] = conversations.map((c) => ({
    id: c.id,
    sessionId: c.sessionId,
    customerName: c.customerName,
    customerEmail: c.customerEmail,
    customerPhone: c.customerPhone,
    productInterest: c.productInterest,
    channel: c.channel,
    createdAt: c.createdAt.toISOString(),
    handoffAt: c.handoffAt?.toISOString() || null,
    messagePreview: c.messages[0]?.content || null,
  }))

  io.to("agents").emit("queue:update", { conversations: queueConversations })
}

export function getOnlineAgentsCount(): number {
  return onlineAgents.size
}
