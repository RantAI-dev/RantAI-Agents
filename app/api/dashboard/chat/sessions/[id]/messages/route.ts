import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

interface MessageInput {
  id?: string
  role: "user" | "assistant"
  content: string
  replyTo?: string
  editHistory?: Array<{
    content: string
    assistantResponse?: string
    editedAt: string
  }>
  sources?: Array<{
    title: string
    content: string
    similarity?: number
  }>
}

// POST /api/dashboard/chat/sessions/[id]/messages - Add message(s) to session
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id: sessionId } = await params
    const body = await req.json()
    const { messages }: { messages: MessageInput[] } = body

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json(
        { error: "messages array is required" },
        { status: 400 }
      )
    }

    // Verify ownership
    const chatSession = await prisma.dashboardSession.findFirst({
      where: {
        id: sessionId,
        userId: session.user.id,
      },
    })

    if (!chatSession) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 })
    }

    // Create messages
    const createdMessages = await prisma.$transaction(
      messages.map((msg) =>
        prisma.dashboardMessage.create({
          data: {
            id: msg.id || undefined,
            sessionId,
            role: msg.role,
            content: msg.content,
            replyTo: msg.replyTo,
            editHistory: msg.editHistory || undefined,
            sources: msg.sources || undefined,
          },
        })
      )
    )

    // Update session timestamp
    await prisma.dashboardSession.update({
      where: { id: sessionId },
      data: { updatedAt: new Date() },
    })

    return NextResponse.json({
      messages: createdMessages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        createdAt: m.createdAt.toISOString(),
        replyTo: m.replyTo,
        editHistory: m.editHistory,
        sources: m.sources,
      })),
    })
  } catch (error) {
    console.error("[Chat Messages API] POST error:", error)
    return NextResponse.json(
      { error: "Failed to add messages" },
      { status: 500 }
    )
  }
}

// PATCH /api/dashboard/chat/sessions/[id]/messages - Update a message
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id: sessionId } = await params
    const body = await req.json()
    const { messageId, content, editHistory, sources } = body

    if (!messageId) {
      return NextResponse.json(
        { error: "messageId is required" },
        { status: 400 }
      )
    }

    // Verify ownership
    const chatSession = await prisma.dashboardSession.findFirst({
      where: {
        id: sessionId,
        userId: session.user.id,
      },
    })

    if (!chatSession) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 })
    }

    // Update message
    const updated = await prisma.dashboardMessage.update({
      where: { id: messageId },
      data: {
        content: content !== undefined ? content : undefined,
        editHistory: editHistory !== undefined ? editHistory : undefined,
        sources: sources !== undefined ? sources : undefined,
      },
    })

    return NextResponse.json({
      id: updated.id,
      role: updated.role,
      content: updated.content,
      createdAt: updated.createdAt.toISOString(),
      replyTo: updated.replyTo,
      editHistory: updated.editHistory,
      sources: updated.sources,
    })
  } catch (error) {
    console.error("[Chat Messages API] PATCH error:", error)
    return NextResponse.json(
      { error: "Failed to update message" },
      { status: 500 }
    )
  }
}

// DELETE /api/dashboard/chat/sessions/[id]/messages - Delete messages after a certain point
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id: sessionId } = await params
    const body = await req.json()
    const { messageIds } = body

    if (!messageIds || !Array.isArray(messageIds)) {
      return NextResponse.json(
        { error: "messageIds array is required" },
        { status: 400 }
      )
    }

    // Verify ownership
    const chatSession = await prisma.dashboardSession.findFirst({
      where: {
        id: sessionId,
        userId: session.user.id,
      },
    })

    if (!chatSession) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 })
    }

    // Delete messages
    await prisma.dashboardMessage.deleteMany({
      where: {
        id: { in: messageIds },
        sessionId,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[Chat Messages API] DELETE error:", error)
    return NextResponse.json(
      { error: "Failed to delete messages" },
      { status: 500 }
    )
  }
}
