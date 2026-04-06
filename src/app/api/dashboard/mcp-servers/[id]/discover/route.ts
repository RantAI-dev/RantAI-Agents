import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { discoverDashboardMcpServerTools } from "@/features/mcp/servers/service"
import { DashboardMcpServerIdParamsSchema } from "@/features/mcp/servers/schema"

// POST /api/dashboard/mcp-servers/[id]/discover - Trigger tool discovery
export async function POST(
  _req: Request,
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
        { error: "Failed to discover tools" },
        { status: 500 }
      )
    }

    const result = await discoverDashboardMcpServerTools(parsedParams.data.id)
    return NextResponse.json(result)
  } catch (error) {
    console.error("[MCP Servers API] Discover error:", error)
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to discover tools",
      },
      { status: 500 }
    )
  }
}
