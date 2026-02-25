import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrganizationContext } from "@/lib/organization"
import { encryptJsonField } from "@/lib/workflow/credentials"

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
        icon: s.icon,
        transport: s.transport,
        url: s.url,
        isBuiltIn: s.isBuiltIn,
        envKeys: s.envKeys,
        docsUrl: s.docsUrl,
        enabled: s.enabled,
        configured: s.configured,
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

    const { name, description, transport, url, env, headers, envKeys, docsUrl, isBuiltIn } = body

    if (!name || !transport) {
      return NextResponse.json(
        { error: "name and transport are required" },
        { status: 400 }
      )
    }

    if (!url) {
      return NextResponse.json(
        { error: "url is required for remote MCP servers" },
        { status: 400 }
      )
    }

    const server = await prisma.mcpServerConfig.create({
      data: {
        name,
        description: description || null,
        transport,
        url,
        env: encryptJsonField(env) ?? undefined,
        headers: encryptJsonField(headers) ?? undefined,
        isBuiltIn: isBuiltIn ?? false,
        envKeys: envKeys ?? undefined,
        docsUrl: docsUrl ?? undefined,
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
