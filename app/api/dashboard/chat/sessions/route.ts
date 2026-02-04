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

    const sessions = await prisma.dashboardSession.findMany({
      where: { userId: session.user.id },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
    })

    // Transform to match the frontend ChatSession interface
    const response = sessions.map((s) => ({
      id: s.id,
      title: s.title,
      assistantId: s.assistantId,
      createdAt: s.createdAt.toISOString(),
      messages: s.messages.map((m) => ({
        id: m.id,
        role: m.role as "user" | "assistant",
        content: m.content,
        createdAt: m.createdAt.toISOString(),
        replyTo: m.replyTo,
        editHistory: m.editHistory as Array<{
          content: string
          assistantResponse?: string
          editedAt: string
        }> | undefined,
        sources: m.sources as Array<{
          title: string
          content: string
          similarity?: number
        }> | undefined,
      })),
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
