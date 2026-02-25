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
    const type = (searchParams.get("type") as "tool" | "skill" | "workflow" | "assistant" | "mcp") || undefined
    const search = searchParams.get("q") || undefined

    const items = await getCatalogItems({ category, type, search })
    const categories = await getCatalogCategories(type)

    // Get installed items for this org (include installedId for binding to assistants)
    const installMap = new Map<string, { installedId: string; itemType: string; skillId?: string }>()
    if (orgContext?.organizationId) {
      const installs = await prisma.marketplaceInstall.findMany({
        where: { organizationId: orgContext.organizationId },
        select: { catalogItemId: true, installedId: true, itemType: true },
      })

      // For community skills, resolve InstalledSkill → Skill.id mapping
      const communitySkillInstallIds = installs
        .filter((i) => i.itemType === "skill")
        .map((i) => i.installedId)
      const skillIdMap = new Map<string, string>()
      if (communitySkillInstallIds.length > 0) {
        const installedSkills = await prisma.installedSkill.findMany({
          where: { id: { in: communitySkillInstallIds } },
          select: { id: true, skillId: true },
        })
        for (const is of installedSkills) {
          if (is.skillId) skillIdMap.set(is.id, is.skillId)
        }
      }

      for (const i of installs) {
        installMap.set(i.catalogItemId, {
          installedId: i.installedId,
          itemType: i.itemType,
          skillId: skillIdMap.get(i.installedId),
        })
      }
    }

    const mappedItems = items
      .map((item) => {
        const isBuiltIn = item.name.startsWith("builtin-tool-")
        const install = installMap.get(item.id)
        return {
          id: item.id,
          name: item.name,
          displayName: item.displayName,
          description: item.description,
          category: item.category,
          type: item.type,
          icon: item.icon,
          tags: item.tags,
          // Built-in tools are always installed globally — no MarketplaceInstall record needed
          installed: isBuiltIn || !!install,
          installedId: install?.installedId,
          // For community skills: skillId is the Skill.id needed for AssistantSkill binding
          // (installedId is InstalledSkill.id which is different)
          skillId: install?.skillId,
          isBuiltIn,
          communitySkillName: item.communitySkillName,
          communityToolName: item.communityToolName,
          configSchema: item.configSchema,
        }
      })
      // Built-in items always float to the top
      .sort((a, b) => {
        if (a.isBuiltIn && !b.isBuiltIn) return -1
        if (!a.isBuiltIn && b.isBuiltIn) return 1
        return 0
      })

    return NextResponse.json({
      items: mappedItems,
      categories,
      total: mappedItems.length,
    })
  } catch (error) {
    console.error("[Marketplace API] GET error:", error)
    return NextResponse.json({ error: "Failed to fetch marketplace" }, { status: 500 })
  }
}
