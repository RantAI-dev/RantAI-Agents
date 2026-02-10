import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { ConversationStatus, MessageRole } from "@/types/socket"
import { getIOInstance, broadcastQueueUpdate } from "@/lib/socket"
import type { QueueConversation } from "@/types/socket"

// POST /api/dashboard/handoff — Create a handoff request from the dashboard chat
export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const { assistantId, chatHistory } = body

    const sessionId = `dashboard_${session.user.id}_${Date.now()}`
    const customerName = session.user.name || "Dashboard User"
    const customerEmail = session.user.email || undefined

    const conversation = await prisma.conversation.create({
      data: {
        sessionId,
        status: ConversationStatus.WAITING_FOR_AGENT,
        channel: "PORTAL",
        customerName,
        customerEmail,
        productInterest: assistantId || undefined,
        handoffAt: new Date(),
      },
    })

    // Save chat history as messages
    if (chatHistory && Array.isArray(chatHistory)) {
      const messageData = chatHistory.map(
        (msg: { role: string; content: string }) => ({
          conversationId: conversation.id,
          role: msg.role === "user" ? MessageRole.USER : MessageRole.ASSISTANT,
          content: msg.content,
        })
      )

      if (messageData.length > 0) {
        await prisma.message.createMany({ data: messageData })
      }
    }

    // System message
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: MessageRole.SYSTEM,
        content: "Customer requested to speak with an agent from the dashboard chat.",
      },
    })

    // Broadcast to agent dashboard via socket.io
    const io = getIOInstance()
    if (io) {
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
        messagePreview:
          chatHistory?.[chatHistory.length - 1]?.content || null,
      }

      io.to("agents").emit("conversation:new", queueConversation)
      await broadcastQueueUpdate(io)
    }

    // Queue position
    const waitingCount = await prisma.conversation.count({
      where: { status: ConversationStatus.WAITING_FOR_AGENT },
    })

    return NextResponse.json({
      conversationId: conversation.id,
      status: ConversationStatus.WAITING_FOR_AGENT,
      queuePosition: waitingCount,
    })
  } catch (error) {
    console.error("[Dashboard Handoff] POST error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

// GET /api/dashboard/handoff?conversationId=...&after=... — Poll for status + new messages
export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const conversationId = req.nextUrl.searchParams.get("conversationId")
    const after = req.nextUrl.searchParams.get("after")

    if (!conversationId) {
      return NextResponse.json(
        { error: "conversationId is required" },
        { status: 400 }
      )
    }

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        agent: { select: { name: true } },
      },
    })

    if (!conversation) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      )
    }

    // Fetch new messages since `after` timestamp (AGENT/SYSTEM messages only)
    const whereClause: {
      conversationId: string
      role: { in: string[] }
      createdAt?: { gt: Date }
    } = {
      conversationId,
      role: { in: [MessageRole.AGENT, MessageRole.SYSTEM] },
    }

    if (after) {
      whereClause.createdAt = { gt: new Date(after) }
    }

    const messages = await prisma.message.findMany({
      where: whereClause,
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        role: true,
        content: true,
        createdAt: true,
      },
    })

    return NextResponse.json({
      status: conversation.status,
      agentName: conversation.agent?.name || null,
      messages: messages.map((m) => ({
        id: m.id,
        role: m.role.toLowerCase(),
        content: m.content,
        timestamp: m.createdAt.toISOString(),
      })),
    })
  } catch (error) {
    console.error("[Dashboard Handoff] GET error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
