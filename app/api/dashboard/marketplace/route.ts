import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getOrganizationContextWithFallback } from "@/lib/organization"
import {
  listDashboardMarketplaceItems,
} from "@/src/features/marketplace/service"

// GET /api/dashboard/marketplace — Get catalog with install status
export async function GET(req: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const orgContext = await getOrganizationContextWithFallback(req, session.user.id)
    const { searchParams } = new URL(req.url)

    const category = searchParams.get("category") || undefined
    const type = (searchParams.get("type") as "tool" | "skill" | "workflow" | "assistant" | "mcp") || undefined
    const search = searchParams.get("q") || undefined
    const result = await listDashboardMarketplaceItems({
      organizationId: orgContext?.organizationId ?? null,
      category,
      type,
      search,
    })

    return NextResponse.json(result)
  } catch (error) {
    console.error("[Marketplace API] GET error:", error)
    return NextResponse.json({ error: "Failed to fetch marketplace" }, { status: 500 })
  }
}
