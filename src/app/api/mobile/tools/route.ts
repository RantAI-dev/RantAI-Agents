import { NextResponse } from "next/server"

import { listToolsForDashboard } from "@/features/tools/service"
import { getMobileContext } from "@/lib/mobile-org"

/**
 * GET /api/mobile/tools — catalog of tools the caller can bind to an agent
 * (built-in tools + org-scoped, user-selectable custom tools). Slim shape for
 * the mobile Agent Builder → Tools tab.
 */
export async function GET(request: Request) {
  try {
    const ctx = await getMobileContext(request)
    if (!ctx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const tools = await listToolsForDashboard(ctx.organizationId)

    return NextResponse.json(
      tools.map((tool) => ({
        id: tool.id,
        name: tool.name,
        displayName: tool.displayName,
        description: tool.description,
        category: tool.category,
        icon: tool.icon,
        isBuiltIn: tool.isBuiltIn,
      }))
    )
  } catch (error) {
    console.error("[Mobile Tools API] GET error:", error)
    return NextResponse.json({ error: "Failed to fetch tools" }, { status: 500 })
  }
}
