import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrganizationContext } from "@/lib/organization"
import { ensureBuiltinTools } from "@/lib/tools"

// GET /api/dashboard/tools - List all tools
export async function GET(req: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const orgContext = await getOrganizationContext(req, session.user.id)

    // Ensure built-in tools exist
    await ensureBuiltinTools()

    // Fetch built-in (global) + org-scoped tools
    const tools = await prisma.tool.findMany({
      where: {
        OR: [
          { organizationId: null, isBuiltIn: true },
          ...(orgContext
            ? [{ organizationId: orgContext.organizationId }]
            : []),
        ],
      },
      include: {
        mcpServer: { select: { id: true, name: true } },
        _count: { select: { assistantTools: true } },
      },
      orderBy: [{ isBuiltIn: "desc" }, { category: "asc" }, { name: "asc" }],
    })

    return NextResponse.json(
      tools.map((t) => ({
        id: t.id,
        name: t.name,
        displayName: t.displayName,
        description: t.description,
        category: t.category,
        parameters: t.parameters,
        executionConfig: t.executionConfig,
        isBuiltIn: t.isBuiltIn,
        enabled: t.enabled,
        mcpServer: t.mcpServer,
        assistantCount: t._count.assistantTools,
        createdAt: t.createdAt.toISOString(),
      }))
    )
  } catch (error) {
    console.error("[Tools API] GET error:", error)
    return NextResponse.json(
      { error: "Failed to fetch tools" },
      { status: 500 }
    )
  }
}

// POST /api/dashboard/tools - Create custom tool
export async function POST(req: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const orgContext = await getOrganizationContext(req, session.user.id)
    const body = await req.json()

    const { name, displayName, description, parameters, executionConfig } = body

    if (!name || !displayName || !description) {
      return NextResponse.json(
        { error: "name, displayName, and description are required" },
        { status: 400 }
      )
    }

    const tool = await prisma.tool.create({
      data: {
        name,
        displayName,
        description,
        category: "custom",
        parameters: parameters || { type: "object", properties: {} },
        executionConfig: executionConfig || null,
        isBuiltIn: false,
        enabled: true,
        organizationId: orgContext?.organizationId || null,
        createdBy: session.user.id,
      },
    })

    return NextResponse.json(tool, { status: 201 })
  } catch (error) {
    console.error("[Tools API] POST error:", error)
    return NextResponse.json(
      { error: "Failed to create tool" },
      { status: 500 }
    )
  }
}
