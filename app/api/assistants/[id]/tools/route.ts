import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// GET /api/assistants/[id]/tools - Get assistant's enabled tools
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
    const assistantTools = await prisma.assistantTool.findMany({
      where: { assistantId: id },
      include: {
        tool: {
          select: {
            id: true,
            name: true,
            displayName: true,
            description: true,
            category: true,
            isBuiltIn: true,
            enabled: true,
          },
        },
      },
    })

    return NextResponse.json(
      assistantTools.map((at) => ({
        ...at.tool,
        enabledForAssistant: at.enabled,
      }))
    )
  } catch (error) {
    console.error("[Assistant Tools API] GET error:", error)
    return NextResponse.json(
      { error: "Failed to fetch assistant tools" },
      { status: 500 }
    )
  }
}

// PUT /api/assistants/[id]/tools - Set assistant's enabled tools
export async function PUT(
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
    const { toolIds } = body as { toolIds: string[] }

    if (!Array.isArray(toolIds)) {
      return NextResponse.json(
        { error: "toolIds must be an array" },
        { status: 400 }
      )
    }

    // Verify assistant exists
    const assistant = await prisma.assistant.findUnique({ where: { id } })
    if (!assistant) {
      return NextResponse.json(
        { error: "Assistant not found" },
        { status: 404 }
      )
    }

    // Replace all tool bindings in a transaction
    await prisma.$transaction([
      prisma.assistantTool.deleteMany({ where: { assistantId: id } }),
      ...(toolIds.length > 0
        ? [
            prisma.assistantTool.createMany({
              data: toolIds.map((toolId) => ({
                assistantId: id,
                toolId,
              })),
            }),
          ]
        : []),
    ])

    // Return updated list
    const updatedTools = await prisma.assistantTool.findMany({
      where: { assistantId: id },
      include: {
        tool: {
          select: {
            id: true,
            name: true,
            displayName: true,
            description: true,
            category: true,
          },
        },
      },
    })

    return NextResponse.json(updatedTools.map((at) => at.tool))
  } catch (error) {
    console.error("[Assistant Tools API] PUT error:", error)
    return NextResponse.json(
      { error: "Failed to update assistant tools" },
      { status: 500 }
    )
  }
}
