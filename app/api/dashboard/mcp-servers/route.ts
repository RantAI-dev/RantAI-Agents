import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrganizationContext } from "@/lib/organization"

// GET /api/dashboard/mcp-servers - List all MCP server configs
export async function GET(req: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const orgContext = await getOrganizationContext(req, session.user.id)

    const servers = await prisma.mcpServerConfig.findMany({
      where: orgContext
        ? { organizationId: orgContext.organizationId }
        : { organizationId: null },
      include: {
        _count: { select: { tools: true } },
      },
      orderBy: { createdAt: "desc" },
    })

    return NextResponse.json(
      servers.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        transport: s.transport,
        url: s.url,
        command: s.command,
        args: s.args,
        enabled: s.enabled,
        lastConnectedAt: s.lastConnectedAt?.toISOString() ?? null,
        lastError: s.lastError,
        toolCount: s._count.tools,
        createdAt: s.createdAt.toISOString(),
      }))
    )
  } catch (error) {
    console.error("[MCP Servers API] GET error:", error)
    return NextResponse.json(
      { error: "Failed to fetch MCP servers" },
      { status: 500 }
    )
  }
}

// POST /api/dashboard/mcp-servers - Create MCP server config
export async function POST(req: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const orgContext = await getOrganizationContext(req, session.user.id)
    const body = await req.json()

    const { name, description, transport, url, command, args, env, headers } =
      body

    if (!name || !transport) {
      return NextResponse.json(
        { error: "name and transport are required" },
        { status: 400 }
      )
    }

    if (
      (transport === "sse" || transport === "streamable-http") &&
      !url
    ) {
      return NextResponse.json(
        { error: "url is required for SSE/HTTP transport" },
        { status: 400 }
      )
    }

    if (transport === "stdio" && !command) {
      return NextResponse.json(
        { error: "command is required for stdio transport" },
        { status: 400 }
      )
    }

    const server = await prisma.mcpServerConfig.create({
      data: {
        name,
        description: description || null,
        transport,
        url: url || null,
        command: command || null,
        args: args || [],
        env: env || null,
        headers: headers || null,
        enabled: true,
        organizationId: orgContext?.organizationId || null,
        createdBy: session.user.id,
      },
    })

    return NextResponse.json(server, { status: 201 })
  } catch (error) {
    console.error("[MCP Servers API] POST error:", error)
    return NextResponse.json(
      { error: "Failed to create MCP server" },
      { status: 500 }
    )
  }
}
