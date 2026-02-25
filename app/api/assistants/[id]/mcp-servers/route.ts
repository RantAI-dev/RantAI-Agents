import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// GET /api/assistants/[id]/mcp-servers - Get assistant's bound MCP servers
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
    const bindings = await prisma.assistantMcpServer.findMany({
      where: { assistantId: id },
      include: {
        mcpServer: {
          select: {
            id: true,
            name: true,
            description: true,
            transport: true,
            enabled: true,
            lastConnectedAt: true,
            lastError: true,
            _count: { select: { tools: true } },
          },
        },
      },
    })

    return NextResponse.json(
      bindings.map((b) => ({
        id: b.mcpServer.id,
        name: b.mcpServer.name,
        description: b.mcpServer.description,
        transport: b.mcpServer.transport,
        enabled: b.mcpServer.enabled,
        lastConnectedAt: b.mcpServer.lastConnectedAt,
        lastError: b.mcpServer.lastError,
        toolCount: b.mcpServer._count.tools,
        boundEnabled: b.enabled,
      }))
    )
  } catch (error) {
    console.error("[Assistant MCP Servers API] GET error:", error)
    return NextResponse.json(
      { error: "Failed to fetch assistant MCP servers" },
      { status: 500 }
    )
  }
}

// PUT /api/assistants/[id]/mcp-servers - Set assistant's bound MCP servers
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
    const { mcpServerIds } = body as { mcpServerIds: string[] }

    if (!Array.isArray(mcpServerIds)) {
      return NextResponse.json(
        { error: "mcpServerIds must be an array" },
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

    // Replace all MCP server bindings in a transaction
    await prisma.$transaction([
      prisma.assistantMcpServer.deleteMany({ where: { assistantId: id } }),
      ...(mcpServerIds.length > 0
        ? [
            prisma.assistantMcpServer.createMany({
              data: mcpServerIds.map((mcpServerId) => ({
                assistantId: id,
                mcpServerId,
              })),
            }),
          ]
        : []),
    ])

    // Return updated list
    const updated = await prisma.assistantMcpServer.findMany({
      where: { assistantId: id },
      include: {
        mcpServer: {
          select: {
            id: true,
            name: true,
            description: true,
            transport: true,
            enabled: true,
            _count: { select: { tools: true } },
          },
        },
      },
    })

    return NextResponse.json(
      updated.map((b) => ({
        id: b.mcpServer.id,
        name: b.mcpServer.name,
        description: b.mcpServer.description,
        transport: b.mcpServer.transport,
        enabled: b.mcpServer.enabled,
        toolCount: b.mcpServer._count.tools,
      }))
    )
  } catch (error) {
    console.error("[Assistant MCP Servers API] PUT error:", error)
    return NextResponse.json(
      { error: "Failed to update assistant MCP servers" },
      { status: 500 }
    )
  }
}
