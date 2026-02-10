import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrganizationContext, canManage } from "@/lib/organization"
import { generateMcpApiKey } from "@/lib/mcp/api-key"

// GET /api/dashboard/mcp-api-keys - List all MCP API keys
export async function GET(req: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const orgContext = await getOrganizationContext(req, session.user.id)

    if (orgContext && !canManage(orgContext.membership.role)) {
      return NextResponse.json(
        { error: "Insufficient permissions" },
        { status: 403 }
      )
    }

    const keys = await prisma.mcpApiKey.findMany({
      where: orgContext
        ? { organizationId: orgContext.organizationId }
        : undefined,
      orderBy: { createdAt: "desc" },
    })

    return NextResponse.json(
      keys.map((k) => ({
        id: k.id,
        name: k.name,
        key: k.key,
        exposedTools: k.exposedTools,
        requestCount: k.requestCount,
        lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
        enabled: k.enabled,
        createdAt: k.createdAt.toISOString(),
      }))
    )
  } catch (error) {
    console.error("[MCP API Keys] GET error:", error)
    return NextResponse.json(
      { error: "Failed to fetch MCP API keys" },
      { status: 500 }
    )
  }
}

// POST /api/dashboard/mcp-api-keys - Create new MCP API key
export async function POST(req: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const orgContext = await getOrganizationContext(req, session.user.id)

    if (orgContext && !canManage(orgContext.membership.role)) {
      return NextResponse.json(
        { error: "Insufficient permissions" },
        { status: 403 }
      )
    }

    if (!orgContext) {
      return NextResponse.json(
        { error: "Organization context required" },
        { status: 400 }
      )
    }

    const body = await req.json()
    const { name, exposedTools } = body

    if (!name?.trim()) {
      return NextResponse.json(
        { error: "Name is required" },
        { status: 400 }
      )
    }

    const apiKey = generateMcpApiKey()

    const mcpApiKey = await prisma.mcpApiKey.create({
      data: {
        name: name.trim(),
        key: apiKey,
        exposedTools: Array.isArray(exposedTools) ? exposedTools : [],
        enabled: true,
        organizationId: orgContext.organizationId,
        createdBy: session.user.id,
      },
    })

    return NextResponse.json(
      {
        id: mcpApiKey.id,
        name: mcpApiKey.name,
        key: mcpApiKey.key,
        exposedTools: mcpApiKey.exposedTools,
        requestCount: mcpApiKey.requestCount,
        lastUsedAt: null,
        enabled: mcpApiKey.enabled,
        createdAt: mcpApiKey.createdAt.toISOString(),
      },
      { status: 201 }
    )
  } catch (error) {
    console.error("[MCP API Keys] POST error:", error)
    return NextResponse.json(
      { error: "Failed to create MCP API key" },
      { status: 500 }
    )
  }
}
