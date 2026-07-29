import { NextResponse } from "next/server"

import {
  discoverDashboardMcpServerTools,
  getDashboardMcpServerForDashboard,
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

/**
 * POST /api/mobile/mcp-servers/[id]/discover — connect to the server and sync
 * its tool list. Ownership is verified first (the discover service is not
 * org-scoped on its own).
 */
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const ctx = await getMobileContext(request)
    if (!ctx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const server = await getDashboardMcpServerForDashboard({
      id,
      organizationId: ctx.organizationId,
    })
    if (isServiceError(server)) {
      return NextResponse.json({ error: server.error }, { status: server.status })
    }

    const result = await discoverDashboardMcpServerTools(id)
    return NextResponse.json(result)
  } catch (error) {
    console.error("[Mobile MCP API] discover error:", error)
    return NextResponse.json(
      { error: "Failed to discover tools" },
      { status: 500 }
    )
  }
}
