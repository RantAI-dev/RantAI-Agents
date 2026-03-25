import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getOrganizationContext } from "@/lib/organization"
import {
  getDashboardMarketplaceItemDetail,
  type ServiceError,
} from "@/src/features/marketplace/service"
import { DashboardMarketplaceIdParamsSchema } from "@/src/features/marketplace/schema"

function isServiceError(value: unknown): value is ServiceError {
  if (typeof value !== "object" || value === null) return false
  const candidate = value as { status?: unknown; error?: unknown }
  return typeof candidate.status === "number" && typeof candidate.error === "string"
}

// GET /api/dashboard/marketplace/[id] — Get full detail for a catalog item
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const parsedParams = DashboardMarketplaceIdParamsSchema.safeParse(await params)
    if (!parsedParams.success) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    const orgContext = await getOrganizationContext(req, session.user.id)
    const detail = await getDashboardMarketplaceItemDetail({
      organizationId: orgContext?.organizationId ?? null,
      itemId: parsedParams.data.id,
    })
    if (isServiceError(detail)) {
      return NextResponse.json({ error: detail.error }, { status: detail.status })
    }

    return NextResponse.json(detail)
  } catch (error) {
    console.error("[Marketplace Detail API] GET error:", error)
    return NextResponse.json(
      { error: "Failed to fetch item detail" },
      { status: 500 }
    )
  }
}
