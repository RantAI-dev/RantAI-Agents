import { NextResponse } from "next/server"

import {
  installDashboardMarketplaceItem,
  uninstallDashboardMarketplaceItem,
  type ServiceError,
} from "@/features/marketplace/service"
import {
  DashboardMarketplaceInstallBodySchema,
  DashboardMarketplaceUninstallQuerySchema,
} from "@/features/marketplace/schema"
import { getMobileContext } from "@/lib/mobile-org"

function isServiceError(value: unknown): value is ServiceError {
  if (typeof value !== "object" || value === null) return false
  const candidate = value as { status?: unknown; error?: unknown }
  return typeof candidate.status === "number" && typeof candidate.error === "string"
}

/**
 * POST /api/mobile/marketplace/install — install a catalog item into the
 * caller's org (clones it into a real Tool/Skill/Workflow/Mcp/Assistant).
 * Body: { catalogItemId, authConfig?, config? }.
 */
export async function POST(request: Request) {
  try {
    const ctx = await getMobileContext(request)
    if (!ctx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const parsed = DashboardMarketplaceInstallBodySchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: "catalogItemId is required" }, { status: 400 })
    }

    const result = await installDashboardMarketplaceItem({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      input: parsed.data,
    })
    if (isServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    console.error("[Mobile Marketplace Install] POST error:", error)
    return NextResponse.json({ error: "Failed to install" }, { status: 500 })
  }
}

/**
 * DELETE /api/mobile/marketplace/install?catalogItemId= — uninstall a catalog
 * item from the caller's org (removes the cloned resource).
 */
export async function DELETE(request: Request) {
  try {
    const ctx = await getMobileContext(request)
    if (!ctx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const parsed = DashboardMarketplaceUninstallQuerySchema.safeParse({
      catalogItemId: searchParams.get("catalogItemId"),
    })
    if (!parsed.success) {
      return NextResponse.json(
        { error: "catalogItemId query param required" },
        { status: 400 }
      )
    }

    const result = await uninstallDashboardMarketplaceItem({
      organizationId: ctx.organizationId,
      input: parsed.data,
    })
    if (isServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[Mobile Marketplace Install] DELETE error:", error)
    return NextResponse.json({ error: "Failed to uninstall" }, { status: 500 })
  }
}
