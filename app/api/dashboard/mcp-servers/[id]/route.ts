import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// GET /api/dashboard/mcp-servers/[id]
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
    const server = await prisma.mcpServerConfig.findUnique({
      where: { id },
      include: {
        tools: {
          select: {
            id: true,
            name: true,
            displayName: true,
            description: true,
            enabled: true,
          },
        },
        _count: { select: { tools: true } },
      },
    })

    if (!server) {
      return NextResponse.json(
        { error: "MCP server not found" },
        { status: 404 }
      )
    }

    return NextResponse.json({
      id: server.id,
      name: server.name,
      description: server.description,
      transport: server.transport,
      url: server.url,
      command: server.command,
      args: server.args,
      env: server.env,
      headers: server.headers,
      enabled: server.enabled,
      lastConnectedAt: server.lastConnectedAt?.toISOString() ?? null,
      lastError: server.lastError,
      tools: server.tools,
      toolCount: server._count.tools,
      createdAt: server.createdAt.toISOString(),
    })
  } catch (error) {
    console.error("[MCP Servers API] GET [id] error:", error)
    return NextResponse.json(
      { error: "Failed to fetch MCP server" },
      { status: 500 }
    )
  }
}

// PUT /api/dashboard/mcp-servers/[id]
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
    const existing = await prisma.mcpServerConfig.findUnique({ where: { id } })

    if (!existing) {
      return NextResponse.json(
        { error: "MCP server not found" },
        { status: 404 }
      )
    }

    const body = await req.json()
    const {
      name,
      description,
      transport,
      url,
      command,
      args,
      env,
      headers,
      enabled,
    } = body

    const server = await prisma.mcpServerConfig.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(transport !== undefined && { transport }),
        ...(url !== undefined && { url }),
        ...(command !== undefined && { command }),
        ...(args !== undefined && { args }),
        ...(env !== undefined && { env }),
        ...(headers !== undefined && { headers }),
        ...(enabled !== undefined && { enabled }),
      },
    })

    return NextResponse.json(server)
  } catch (error) {
    console.error("[MCP Servers API] PUT error:", error)
    return NextResponse.json(
      { error: "Failed to update MCP server" },
      { status: 500 }
    )
  }
}

// DELETE /api/dashboard/mcp-servers/[id]
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
    const server = await prisma.mcpServerConfig.findUnique({ where: { id } })

    if (!server) {
      return NextResponse.json(
        { error: "MCP server not found" },
        { status: 404 }
      )
    }

    // Delete associated tools first (cascade), then server
    await prisma.mcpServerConfig.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[MCP Servers API] DELETE error:", error)
    return NextResponse.json(
      { error: "Failed to delete MCP server" },
      { status: 500 }
    )
  }
}
