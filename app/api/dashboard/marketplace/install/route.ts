import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getOrganizationContext } from "@/lib/organization"
import { installMarketplaceItem, uninstallMarketplaceItem } from "@/lib/marketplace/installer"

// POST /api/dashboard/marketplace/install — Install item
export async function POST(req: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const orgContext = await getOrganizationContext(req, session.user.id)
    if (!orgContext?.organizationId) {
      return NextResponse.json(
        { error: "Organization context required for marketplace installs" },
        { status: 400 }
      )
    }

    const body = await req.json()
    const { catalogItemId, authConfig } = body

    if (!catalogItemId) {
      return NextResponse.json(
        { error: "catalogItemId is required" },
        { status: 400 }
      )
    }

    const result = await installMarketplaceItem(
      catalogItemId,
      orgContext.organizationId,
      session.user.id,
      authConfig
    )

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 400 }
      )
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

    const orgContext = await getOrganizationContext(req, session.user.id)
    if (!orgContext?.organizationId) {
      return NextResponse.json(
        { error: "Organization context required" },
        { status: 400 }
      )
    }

    const { searchParams } = new URL(req.url)
    const catalogItemId = searchParams.get("catalogItemId")

    if (!catalogItemId) {
      return NextResponse.json(
        { error: "catalogItemId query param required" },
        { status: 400 }
      )
    }

    const result = await uninstallMarketplaceItem(
      catalogItemId,
      orgContext.organizationId
    )

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[Marketplace Install] DELETE error:", error)
    return NextResponse.json({ error: "Failed to uninstall" }, { status: 500 })
  }
}
