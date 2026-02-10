import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrganizationContext, canManage } from "@/lib/organization"

// GET /api/dashboard/mcp-api-keys/[id]
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
    const orgContext = await getOrganizationContext(req, session.user.id)

    if (orgContext && !canManage(orgContext.membership.role)) {
      return NextResponse.json(
        { error: "Insufficient permissions" },
        { status: 403 }
      )
    }

    const key = await prisma.mcpApiKey.findUnique({ where: { id } })

    if (!key) {
      return NextResponse.json(
        { error: "MCP API key not found" },
        { status: 404 }
      )
    }

    if (
      orgContext &&
      key.organizationId !== orgContext.organizationId
    ) {
      return NextResponse.json(
        { error: "MCP API key not found" },
        { status: 404 }
      )
    }

    return NextResponse.json({
      id: key.id,
      name: key.name,
      key: key.key,
      exposedTools: key.exposedTools,
      requestCount: key.requestCount,
      lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
      enabled: key.enabled,
      createdAt: key.createdAt.toISOString(),
    })
  } catch (error) {
    console.error("[MCP API Keys] GET [id] error:", error)
    return NextResponse.json(
      { error: "Failed to fetch MCP API key" },
      { status: 500 }
    )
  }
}

// PUT /api/dashboard/mcp-api-keys/[id]
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
    const orgContext = await getOrganizationContext(req, session.user.id)

    if (orgContext && !canManage(orgContext.membership.role)) {
      return NextResponse.json(
        { error: "Insufficient permissions" },
        { status: 403 }
      )
    }

    const existing = await prisma.mcpApiKey.findUnique({ where: { id } })

    if (!existing) {
      return NextResponse.json(
        { error: "MCP API key not found" },
        { status: 404 }
      )
    }

    if (
      orgContext &&
      existing.organizationId !== orgContext.organizationId
    ) {
      return NextResponse.json(
        { error: "MCP API key not found" },
        { status: 404 }
      )
    }

    const body = await req.json()
    const { name, exposedTools, enabled } = body

    const updated = await prisma.mcpApiKey.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(exposedTools !== undefined && { exposedTools }),
        ...(enabled !== undefined && { enabled }),
      },
    })

    return NextResponse.json({
      id: updated.id,
      name: updated.name,
      key: updated.key,
      exposedTools: updated.exposedTools,
      requestCount: updated.requestCount,
      lastUsedAt: updated.lastUsedAt?.toISOString() ?? null,
      enabled: updated.enabled,
      createdAt: updated.createdAt.toISOString(),
    })
  } catch (error) {
    console.error("[MCP API Keys] PUT error:", error)
    return NextResponse.json(
      { error: "Failed to update MCP API key" },
      { status: 500 }
    )
  }
}

// DELETE /api/dashboard/mcp-api-keys/[id]
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
    const orgContext = await getOrganizationContext(req, session.user.id)

    if (orgContext && !canManage(orgContext.membership.role)) {
      return NextResponse.json(
        { error: "Insufficient permissions" },
        { status: 403 }
      )
    }

    const existing = await prisma.mcpApiKey.findUnique({ where: { id } })

    if (!existing) {
      return NextResponse.json(
        { error: "MCP API key not found" },
        { status: 404 }
      )
    }

    if (
      orgContext &&
      existing.organizationId !== orgContext.organizationId
    ) {
      return NextResponse.json(
        { error: "MCP API key not found" },
        { status: 404 }
      )
    }

    await prisma.mcpApiKey.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[MCP API Keys] DELETE error:", error)
    return NextResponse.json(
      { error: "Failed to delete MCP API key" },
      { status: 500 }
    )
  }
}
