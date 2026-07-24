import { NextResponse } from "next/server"

import { listDashboardMarketplaceItems } from "@/features/marketplace/service"
import { getMobileContext } from "@/lib/mobile-org"

type CatalogType = "tool" | "skill" | "workflow" | "assistant" | "mcp"

/**
 * GET /api/mobile/marketplace?type=&category=&q= — curated catalog with the
 * caller's org install state (mobile Bearer auth; mirrors the dashboard route).
 */
export async function GET(request: Request) {
  try {
    const ctx = await getMobileContext(request)
    if (!ctx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const category = searchParams.get("category") || undefined
    const type = (searchParams.get("type") as CatalogType) || undefined
    const search = searchParams.get("q") || undefined

    const result = await listDashboardMarketplaceItems({
      organizationId: ctx.organizationId,
      category,
      type,
      search,
    })

    return NextResponse.json(result)
  } catch (error) {
    console.error("[Mobile Marketplace API] GET error:", error)
    return NextResponse.json(
      { error: "Failed to fetch marketplace" },
      { status: 500 }
    )
  }
}
