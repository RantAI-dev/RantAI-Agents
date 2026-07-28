import { NextResponse } from "next/server"

import {
  getDashboardMarketplaceItemDetail,
  type ServiceError,
} from "@/features/marketplace/service"
import { DashboardMarketplaceIdParamsSchema } from "@/features/marketplace/schema"
import { getMobileContext } from "@/lib/mobile-org"

function isServiceError(value: unknown): value is ServiceError {
  if (typeof value !== "object" || value === null) return false
  const candidate = value as { status?: unknown; error?: unknown }
  return typeof candidate.status === "number" && typeof candidate.error === "string"
}

/**
 * GET /api/mobile/marketplace/[id] — full detail for one catalog item
 * (mobile Bearer auth).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getMobileContext(request)
    if (!ctx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const parsedParams = DashboardMarketplaceIdParamsSchema.safeParse(await params)
    if (!parsedParams.success) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    const detail = await getDashboardMarketplaceItemDetail({
      organizationId: ctx.organizationId,
      itemId: parsedParams.data.id,
    })
    if (isServiceError(detail)) {
      return NextResponse.json({ error: detail.error }, { status: detail.status })
    }

    return NextResponse.json(detail)
  } catch (error) {
    console.error("[Mobile Marketplace API] GET [id] error:", error)
    return NextResponse.json(
      { error: "Failed to fetch item detail" },
      { status: 500 }
    )
  }
}
