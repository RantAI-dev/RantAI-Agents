import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getOrganizationContextWithFallback } from "@/lib/organization"
import {
  installDashboardMarketplaceItem,
  uninstallDashboardMarketplaceItem,
  type ServiceError,
} from "@/src/features/marketplace/service"
import {
  DashboardMarketplaceInstallBodySchema,
  DashboardMarketplaceUninstallQuerySchema,
} from "@/src/features/marketplace/schema"

function isServiceError(value: unknown): value is ServiceError {
  if (typeof value !== "object" || value === null) return false
  const candidate = value as { status?: unknown; error?: unknown }
  return typeof candidate.status === "number" && typeof candidate.error === "string"
}

// POST /api/dashboard/marketplace/install — Install item
export async function POST(req: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const orgContext = await getOrganizationContextWithFallback(req, session.user.id)
    if (!orgContext?.organizationId) {
      return NextResponse.json(
        { error: "Organization context required for marketplace installs" },
        { status: 400 }
      )
    }

    const parsed = DashboardMarketplaceInstallBodySchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: "catalogItemId is required" }, { status: 400 })
    }

    const result = await installDashboardMarketplaceItem({
      organizationId: orgContext.organizationId,
      userId: session.user.id,
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
    console.error("[Marketplace Install] POST error:", error)
    return NextResponse.json({ error: "Failed to install" }, { status: 500 })
  }
}

// DELETE /api/dashboard/marketplace/install — Uninstall item
export async function DELETE(req: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const orgContext = await getOrganizationContextWithFallback(req, session.user.id)
    if (!orgContext?.organizationId) {
      return NextResponse.json(
        { error: "Organization context required" },
        { status: 400 }
      )
    }

    const { searchParams } = new URL(req.url)
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
      organizationId: orgContext.organizationId,
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
    console.error("[Marketplace Install] DELETE error:", error)
    return NextResponse.json({ error: "Failed to uninstall" }, { status: 500 })
  }
}
