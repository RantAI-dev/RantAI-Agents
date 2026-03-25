import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getOrganizationContext } from "@/lib/organization"
import {
  createDashboardMcpServerForDashboard,
  listDashboardMcpServers,
  type ServiceError,
} from "@/src/features/mcp/servers/service"
import { DashboardMcpServerCreateBodySchema } from "@/src/features/mcp/servers/schema"

function isServiceError(value: unknown): value is ServiceError {
  if (typeof value !== "object" || value === null) return false
  const candidate = value as { status?: unknown; error?: unknown }
  return typeof candidate.status === "number" && typeof candidate.error === "string"
}

// GET /api/dashboard/mcp-servers - List all MCP server configs
export async function GET(req: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const orgContext = await getOrganizationContext(req, session.user.id)
    const servers = await listDashboardMcpServers(
      orgContext?.organizationId ?? null
    )

    return NextResponse.json(servers)
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
    const parsed = DashboardMcpServerCreateBodySchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: "name and transport are required" },
        { status: 400 }
      )
    }

    const server = await createDashboardMcpServerForDashboard({
      context: {
        organizationId: orgContext?.organizationId ?? null,
        userId: session.user.id,
      },
      input: parsed.data,
    })
    if (isServiceError(server)) {
      return NextResponse.json({ error: server.error }, { status: server.status })
    }

    return NextResponse.json(server, { status: 201 })
  } catch (error) {
    console.error("[MCP Servers API] POST error:", error)
    return NextResponse.json(
      { error: "Failed to create MCP server" },
      { status: 500 }
    )
  }
}
