import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// GET /api/dashboard/chat/sessions/[id] - Get a specific session with messages
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params

    const chatSession = await prisma.dashboardSession.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
        },
        artifacts: {
          where: { artifactType: { not: null } },
          select: {
            id: true,
            title: true,
            content: true,
            artifactType: true,
            metadata: true,
            mimeType: true,
          },
        },
      },
    })

    if (!chatSession) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 })
    }

    return NextResponse.json({
      id: chatSession.id,
      title: chatSession.title,
      assistantId: chatSession.assistantId,
      createdAt: chatSession.createdAt.toISOString(),
      messages: chatSession.messages.map((m) => ({
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
        metadata: m.metadata as Record<string, unknown> | null,
      })),
      artifacts: chatSession.artifacts.map((a) => ({
        id: a.id,
        title: a.title,
        content: a.content,
        artifactType: a.artifactType,
        metadata: a.metadata as Record<string, unknown> | null,
      })),
    })
  } catch (error) {
    console.error("[Chat Session API] GET error:", error)
    return NextResponse.json(
      { error: "Failed to fetch chat session" },
      { status: 500 }
    )
  }
}

// PATCH /api/dashboard/chat/sessions/[id] - Update session (title, etc.)
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const body = await req.json()
    const { title } = body

    // Verify ownership
    const existing = await prisma.dashboardSession.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
    })

    if (!existing) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 })
    }

    const updated = await prisma.dashboardSession.update({
      where: { id },
      data: {
        title: title || existing.title,
      },
    })

    return NextResponse.json({
      id: updated.id,
      title: updated.title,
      assistantId: updated.assistantId,
      createdAt: updated.createdAt.toISOString(),
    })
  } catch (error) {
    console.error("[Chat Session API] PATCH error:", error)
    return NextResponse.json(
      { error: "Failed to update chat session" },
      { status: 500 }
    )
  }
}

// DELETE /api/dashboard/chat/sessions/[id] - Delete a session
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params

    // Verify ownership
    const existing = await prisma.dashboardSession.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
    })

    if (!existing) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 })
    }

    await prisma.dashboardSession.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[Chat Session API] DELETE error:", error)
    return NextResponse.json(
      { error: "Failed to delete chat session" },
      { status: 500 }
    )
  }
}
