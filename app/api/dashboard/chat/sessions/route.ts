import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// GET /api/dashboard/chat/sessions - List all sessions for the current user
export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Return session metadata only (messages loaded on demand via /sessions/[id])
    const sessions = await prisma.dashboardSession.findMany({
      where: { userId: session.user.id },
      include: {
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { content: true, createdAt: true },
        },
        _count: { select: { messages: true } },
      },
      orderBy: { updatedAt: "desc" },
    })

    const response = sessions.map((s) => ({
      id: s.id,
      title: s.title,
      assistantId: s.assistantId,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
      messageCount: s._count.messages,
      lastMessage: s.messages[0]?.content?.slice(0, 100) || null,
    }))

    return NextResponse.json(response)
  } catch (error) {
    console.error("[Chat Sessions API] GET error:", error)
    return NextResponse.json(
      { error: "Failed to fetch chat sessions" },
      { status: 500 }
    )
  }
}

// POST /api/dashboard/chat/sessions - Create a new session
export async function POST(req: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const { assistantId, title } = body

    if (!assistantId) {
      return NextResponse.json(
        { error: "assistantId is required" },
        { status: 400 }
      )
    }

    const chatSession = await prisma.dashboardSession.create({
      data: {
        userId: session.user.id,
        assistantId,
        title: title || "New Chat",
      },
      include: {
        messages: true,
      },
    })

    return NextResponse.json({
      id: chatSession.id,
      title: chatSession.title,
      assistantId: chatSession.assistantId,
      createdAt: chatSession.createdAt.toISOString(),
      messages: [],
    })
  } catch (error) {
    console.error("[Chat Sessions API] POST error:", error)
    return NextResponse.json(
      { error: "Failed to create chat session" },
      { status: 500 }
    )
  }
}
