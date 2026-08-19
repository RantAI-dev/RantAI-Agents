import { NextResponse } from "next/server"

import { DashboardMcpServerCreateBodySchema } from "@/features/mcp/servers/schema"
import {
  createDashboardMcpServerForDashboard,
  listDashboardMcpServers,
} from "@/features/mcp/servers/service"
import { getMobileContext } from "@/lib/mobile-org"

function isServiceError(
  value: unknown
): value is { status: number; error: string } {
  if (typeof value !== "object" || value === null) return false
  const candidate = value as { status?: unknown; error?: unknown }
  return typeof candidate.status === "number" && typeof candidate.error === "string"
}

/**
 * GET /api/mobile/mcp-servers — MCP servers for the caller's org (masked;
 * env/header values are not returned).
 */
export async function GET(request: Request) {
  try {
    const ctx = await getMobileContext(request)
    if (!ctx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    return NextResponse.json(await listDashboardMcpServers(ctx.organizationId))
  } catch (error) {
    console.error("[Mobile MCP API] GET error:", error)
    return NextResponse.json({ error: "Failed to fetch MCP servers" }, { status: 500 })
  }
}

/**
 * POST /api/mobile/mcp-servers — create an MCP server. env/headers are
 * encrypted server-side. Body: { name, transport, url, description?, env?,
 * headers?, docsUrl? }.
 */
export async function POST(request: Request) {
  try {
    const ctx = await getMobileContext(request)
    if (!ctx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const parsed = DashboardMcpServerCreateBodySchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request payload" }, { status: 400 })
    }

    const result = await createDashboardMcpServerForDashboard({
      context: { organizationId: ctx.organizationId, userId: ctx.userId },
      input: parsed.data,
    })
    if (isServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    console.error("[Mobile MCP API] POST error:", error)
    return NextResponse.json({ error: "Failed to create MCP server" }, { status: 500 })
  }
}
