import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrganizationContext } from "@/lib/organization"
import { encryptJsonField } from "@/lib/workflow/credentials"

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

    // Verify org ownership
    const orgContext = await getOrganizationContext(req, session.user.id)
    if (server.organizationId && server.organizationId !== orgContext?.organizationId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    return NextResponse.json({
      id: server.id,
      name: server.name,
      description: server.description,
      icon: server.icon,
      transport: server.transport,
      url: server.url,
      isBuiltIn: server.isBuiltIn,
      envKeys: server.envKeys,
      docsUrl: server.docsUrl,
      hasEnv: !!server.env && Object.keys(server.env as Record<string, unknown>).length > 0,
      hasHeaders: !!server.headers && Object.keys(server.headers as Record<string, unknown>).length > 0,
      enabled: server.enabled,
      configured: server.configured,
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

    // Verify org ownership
    const orgContext = await getOrganizationContext(req, session.user.id)
    if (existing.organizationId && existing.organizationId !== orgContext?.organizationId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const body = await req.json()
    const {
      name,
      description,
      transport,
      url,
      env,
      headers,
      enabled,
      configured,
    } = body

    const server = await prisma.mcpServerConfig.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(transport !== undefined && { transport }),
        ...(url !== undefined && { url }),
        ...(env !== undefined && { env: encryptJsonField(env) ?? undefined }),
        ...(headers !== undefined && { headers: encryptJsonField(headers) ?? undefined }),
        ...(enabled !== undefined && { enabled }),
        ...(configured !== undefined && { configured }),
      },
    })

    // Strip secrets from response
    const { env: _env, headers: _headers, ...safeServer } = server
    return NextResponse.json({
      ...safeServer,
      hasEnv: !!_env && Object.keys(_env as Record<string, unknown>).length > 0,
      hasHeaders: !!_headers && Object.keys(_headers as Record<string, unknown>).length > 0,
    })
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

    // Reject deletion of built-in servers
    if (server.isBuiltIn) {
      return NextResponse.json(
        { error: "Cannot delete a built-in MCP server" },
        { status: 403 }
      )
    }

    // Verify org ownership
    const orgContext = await getOrganizationContext(req, session.user.id)
    if (server.organizationId && server.organizationId !== orgContext?.organizationId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
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
