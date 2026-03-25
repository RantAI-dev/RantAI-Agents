import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getOrganizationContext } from "@/lib/organization"
import {
  deleteDashboardMcpServerForDashboard,
  getDashboardMcpServerForDashboard,
  updateDashboardMcpServerForDashboard,
  type ServiceError,
} from "@/src/features/mcp/servers/service"
import {
  DashboardMcpServerIdParamsSchema,
  DashboardMcpServerUpdateBodySchema,
} from "@/src/features/mcp/servers/schema"

function isServiceError(value: unknown): value is ServiceError {
  if (typeof value !== "object" || value === null) return false
  const candidate = value as { status?: unknown; error?: unknown }
  return typeof candidate.status === "number" && typeof candidate.error === "string"
}

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

    const parsedParams = DashboardMcpServerIdParamsSchema.safeParse(await params)
    if (!parsedParams.success) {
      return NextResponse.json(
        { error: "MCP server not found" },
        { status: 404 }
      )
    }

    const orgContext = await getOrganizationContext(req, session.user.id)
    const server = await getDashboardMcpServerForDashboard({
      id: parsedParams.data.id,
      organizationId: orgContext?.organizationId ?? null,
    })
    if (isServiceError(server)) {
      return NextResponse.json({ error: server.error }, { status: server.status })
    }

    return NextResponse.json(server)
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

    const parsedParams = DashboardMcpServerIdParamsSchema.safeParse(await params)
    if (!parsedParams.success) {
      return NextResponse.json(
        { error: "MCP server not found" },
        { status: 404 }
      )
    }

    const orgContext = await getOrganizationContext(req, session.user.id)
    const parsedBody = DashboardMcpServerUpdateBodySchema.safeParse(await req.json())
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: "Failed to update MCP server" },
        { status: 500 }
      )
    }

    const server = await updateDashboardMcpServerForDashboard({
      id: parsedParams.data.id,
      organizationId: orgContext?.organizationId ?? null,
      input: parsedBody.data,
    })
    if (isServiceError(server)) {
      return NextResponse.json({ error: server.error }, { status: server.status })
    }

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

    const parsedParams = DashboardMcpServerIdParamsSchema.safeParse(await params)
    if (!parsedParams.success) {
      return NextResponse.json(
        { error: "MCP server not found" },
        { status: 404 }
      )
    }

    const orgContext = await getOrganizationContext(req, session.user.id)
    const server = await deleteDashboardMcpServerForDashboard({
      id: parsedParams.data.id,
      organizationId: orgContext?.organizationId ?? null,
    })
    if (isServiceError(server)) {
      return NextResponse.json({ error: server.error }, { status: server.status })
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[MCP Servers API] DELETE error:", error)
    return NextResponse.json(
      { error: "Failed to delete MCP server" },
      { status: 500 }
    )
  }
}
