import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { validateDomain, extractOrigin, validateApiKeyFormat } from "@/lib/embed"
import { ConversationStatus, MessageRole } from "@/types/socket"
import { getIOInstance, broadcastQueueUpdate } from "@/lib/socket"
import type { QueueConversation } from "@/types/socket"

// Shared helper: validate API key + domain, return embedKey or error response
async function validateWidget(req: NextRequest) {
  const apiKey = req.headers.get("X-Widget-Api-Key")

  if (!apiKey || !validateApiKeyFormat(apiKey)) {
    return {
      error: NextResponse.json(
        { error: "Invalid or missing API key", code: "INVALID_KEY" },
        { status: 401, headers: corsHeaders }
      ),
    }
  }

  const embedKey = await prisma.embedApiKey.findFirst({
    where: { key: apiKey, enabled: true },
  })

  if (!embedKey) {
    return {
      error: NextResponse.json(
        { error: "API key not found or disabled", code: "INVALID_KEY" },
        { status: 401, headers: corsHeaders }
      ),
    }
  }

  const origin = extractOrigin(req.headers)
  const domainValidation = validateDomain(origin, embedKey.allowedDomains)

  if (!domainValidation.valid) {
    return {
      error: NextResponse.json(
        { error: "Domain not allowed", code: "DOMAIN_NOT_ALLOWED" },
        { status: 403, headers: corsHeaders }
      ),
    }
  }

  return { embedKey }
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Widget-Api-Key",
}

// POST /api/widget/handoff — Create a handoff request
export async function POST(req: NextRequest) {
  try {
    const validation = await validateWidget(req)
    if ("error" in validation) return validation.error
    const { embedKey } = validation

    const body = await req.json()
    const { customerName, customerEmail, productInterest, chatHistory } = body

    // Create conversation in WAITING_FOR_AGENT status
    const sessionId = `widget_${embedKey.id}_${Date.now()}`

    const conversation = await prisma.conversation.create({
      data: {
        sessionId,
        status: ConversationStatus.WAITING_FOR_AGENT,
        channel: "PORTAL",
        customerName: customerName || "Widget Visitor",
        customerEmail: customerEmail || undefined,
        productInterest: productInterest || undefined,
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
        content: "Customer requested to speak with an agent via embedded widget.",
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

    return NextResponse.json(
      {
        conversationId: conversation.id,
        status: ConversationStatus.WAITING_FOR_AGENT,
        queuePosition: waitingCount,
      },
      { headers: corsHeaders }
    )
  } catch (error) {
    console.error("[Widget Handoff] POST error:", error)
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500, headers: corsHeaders }
    )
  }
}

// GET /api/widget/handoff?conversationId=...&after=... — Poll for status + new messages
export async function GET(req: NextRequest) {
  try {
    const validation = await validateWidget(req)
    if ("error" in validation) return validation.error

    const { embedKey } = validation
    const conversationId = req.nextUrl.searchParams.get("conversationId")
    const after = req.nextUrl.searchParams.get("after")

    if (!conversationId) {
      return NextResponse.json(
        { error: "conversationId is required", code: "MISSING_PARAM" },
        { status: 400, headers: corsHeaders }
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
        { error: "Conversation not found", code: "NOT_FOUND" },
        { status: 404, headers: corsHeaders }
      )
    }

    // Verify conversation belongs to this widget's embed key
    if (!conversation.sessionId.startsWith(`widget_${embedKey.id}_`)) {
      return NextResponse.json(
        { error: "Conversation not found", code: "NOT_FOUND" },
        { status: 404, headers: corsHeaders }
      )
    }

    // Fetch new messages since `after` timestamp (or all AGENT/SYSTEM messages)
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

    return NextResponse.json(
      {
        status: conversation.status,
        agentName: conversation.agent?.name || null,
        messages: messages.map((m) => ({
          id: m.id,
          role: m.role.toLowerCase(),
          content: m.content,
          timestamp: m.createdAt.toISOString(),
        })),
      },
      { headers: corsHeaders }
    )
  } catch (error) {
    console.error("[Widget Handoff] GET error:", error)
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500, headers: corsHeaders }
    )
  }
}

// Handle CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders })
}
