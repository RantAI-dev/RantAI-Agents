import { NextResponse } from "next/server"

import { DashboardMcpServerUpdateBodySchema } from "@/features/mcp/servers/schema"
import {
  deleteDashboardMcpServerForDashboard,
  getDashboardMcpServerForDashboard,
  updateDashboardMcpServerForDashboard,
} from "@/features/mcp/servers/service"
import { getMobileContext } from "@/lib/mobile-org"

interface RouteParams {
  params: Promise<{ id: string }>
}

function isServiceError(
  value: unknown
): value is { status: number; error: string } {
  if (typeof value !== "object" || value === null) return false
  const candidate = value as { status?: unknown; error?: unknown }
  return typeof candidate.status === "number" && typeof candidate.error === "string"
}

/** GET /api/mobile/mcp-servers/[id] — one server (masked; hasEnv/hasHeaders). */
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const ctx = await getMobileContext(request)
    if (!ctx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const { id } = await params
    const result = await getDashboardMcpServerForDashboard({
      id,
      organizationId: ctx.organizationId,
    })
    if (isServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json(result)
  } catch (error) {
    console.error("[Mobile MCP API] GET [id] error:", error)
    return NextResponse.json({ error: "Failed to fetch MCP server" }, { status: 500 })
  }
}

/** PUT /api/mobile/mcp-servers/[id] — update. Omit env/headers to keep them. */
export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const ctx = await getMobileContext(request)
    if (!ctx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const { id } = await params
    const parsed = DashboardMcpServerUpdateBodySchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request payload" }, { status: 400 })
    }
    const result = await updateDashboardMcpServerForDashboard({
      id,
      organizationId: ctx.organizationId,
      input: parsed.data,
    })
    if (isServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json(result)
  } catch (error) {
    console.error("[Mobile MCP API] PUT error:", error)
    return NextResponse.json({ error: "Failed to update MCP server" }, { status: 500 })
  }
}

/** DELETE /api/mobile/mcp-servers/[id] — delete a server. */
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const ctx = await getMobileContext(request)
    if (!ctx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const { id } = await params
    const result = await deleteDashboardMcpServerForDashboard({
      id,
      organizationId: ctx.organizationId,
    })
    if (isServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[Mobile MCP API] DELETE error:", error)
    return NextResponse.json({ error: "Failed to delete MCP server" }, { status: 500 })
  }
}
