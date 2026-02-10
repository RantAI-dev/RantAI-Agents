import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { validateDomain, extractOrigin, validateApiKeyFormat } from "@/lib/embed"
import { MessageRole } from "@/types/socket"
import { getIOInstance } from "@/lib/socket"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Widget-Api-Key",
}

// POST /api/widget/handoff/message — Send a message from the widget to an active conversation
export async function POST(req: NextRequest) {
  try {
    // Validate API key + domain
    const apiKey = req.headers.get("X-Widget-Api-Key")

    if (!apiKey || !validateApiKeyFormat(apiKey)) {
      return NextResponse.json(
        { error: "Invalid or missing API key", code: "INVALID_KEY" },
        { status: 401, headers: corsHeaders }
      )
    }

    const embedKey = await prisma.embedApiKey.findFirst({
      where: { key: apiKey, enabled: true },
    })

    if (!embedKey) {
      return NextResponse.json(
        { error: "API key not found or disabled", code: "INVALID_KEY" },
        { status: 401, headers: corsHeaders }
      )
    }

    const origin = extractOrigin(req.headers)
    const domainValidation = validateDomain(origin, embedKey.allowedDomains)

    if (!domainValidation.valid) {
      return NextResponse.json(
        { error: "Domain not allowed", code: "DOMAIN_NOT_ALLOWED" },
        { status: 403, headers: corsHeaders }
      )
    }

    const body = await req.json()
    const { conversationId, content } = body

    if (!conversationId || !content) {
      return NextResponse.json(
        { error: "conversationId and content are required", code: "MISSING_PARAM" },
        { status: 400, headers: corsHeaders }
      )
    }

    // Verify conversation exists
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
    })

    if (!conversation) {
      return NextResponse.json(
        { error: "Conversation not found", code: "NOT_FOUND" },
        { status: 404, headers: corsHeaders }
      )
    }

    // Save message
    const message = await prisma.message.create({
      data: {
        conversationId,
        role: MessageRole.USER,
        content,
      },
    })

    // Emit to agent via socket.io
    const io = getIOInstance()
    if (io) {
      io.to(`conversation:${conversation.sessionId}`).emit(
        "conversation:message",
        {
          conversationId: conversation.id,
          id: message.id,
          role: message.role,
          content: message.content,
          createdAt: message.createdAt.toISOString(),
        }
      )
    }

    return NextResponse.json(
      { messageId: message.id },
      { headers: corsHeaders }
    )
  } catch (error) {
    console.error("[Widget Handoff Message] POST error:", error)
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
