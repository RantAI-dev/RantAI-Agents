import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrganizationContext } from "@/lib/organization"
import { getCatalogItems, getCatalogCategories } from "@/lib/marketplace/catalog"

// GET /api/dashboard/marketplace — Get catalog with install status
export async function GET(req: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const orgContext = await getOrganizationContext(req, session.user.id)
    const { searchParams } = new URL(req.url)

    const category = searchParams.get("category") || undefined
    const type = (searchParams.get("type") as "tool" | "skill") || undefined
    const search = searchParams.get("q") || undefined

    const items = await getCatalogItems({ category, type, search })
    const categories = await getCatalogCategories()

    // Get installed items for this org
    let installedIds: Set<string> = new Set()
    if (orgContext?.organizationId) {
      const installs = await prisma.marketplaceInstall.findMany({
        where: { organizationId: orgContext.organizationId },
        select: { catalogItemId: true },
      })
      installedIds = new Set(installs.map((i) => i.catalogItemId))
    }

    return NextResponse.json({
      items: items.map((item) => ({
        id: item.id,
        name: item.name,
        displayName: item.displayName,
        description: item.description,
        category: item.category,
        type: item.type,
        icon: item.icon,
        tags: item.tags,
        installed: installedIds.has(item.id),
      })),
      categories,
      total: items.length,
    })
  } catch (error) {
    console.error("[Marketplace API] GET error:", error)
    return NextResponse.json({ error: "Failed to fetch marketplace" }, { status: 500 })
  }
}
