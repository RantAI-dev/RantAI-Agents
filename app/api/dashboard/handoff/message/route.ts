import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { MessageRole } from "@/types/socket"
import { getIOInstance } from "@/lib/socket"

// POST /api/dashboard/handoff/message — Send a message from the dashboard chat to an active conversation
export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const { conversationId, content } = body

    if (!conversationId || !content) {
      return NextResponse.json(
        { error: "conversationId and content are required" },
        { status: 400 }
      )
    }

    // Verify conversation exists
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
    })

    if (!conversation) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      )
    }

    // Save message as customer/user message
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

    return NextResponse.json({ messageId: message.id })
  } catch (error) {
    console.error("[Dashboard Handoff Message] POST error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
