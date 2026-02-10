import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { discoverAndSyncTools } from "@/lib/mcp"

// POST /api/dashboard/mcp-servers/[id]/discover - Trigger tool discovery
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const tools = await discoverAndSyncTools(id)

    return NextResponse.json({
      success: true,
      toolCount: tools.length,
      tools: tools.map((t) => ({
        id: t.id,
        name: t.name,
        displayName: t.displayName,
        description: t.description,
      })),
    })
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
