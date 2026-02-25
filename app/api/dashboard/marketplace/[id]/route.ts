import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrganizationContext } from "@/lib/organization"
import { getCatalogItemById } from "@/lib/marketplace/catalog"
import {
  getCommunitySkill,
  getToolSchemasForSkill,
  getCommunityTool,
} from "@/lib/skills/gateway"
import { communityToolToJsonSchema } from "@/lib/skill-sdk"

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

    const { id } = await params
    const item = await getCatalogItemById(id)
    if (!item) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    const orgContext = await getOrganizationContext(req, session.user.id)

    // Check install status
    let installed = false
    if (orgContext?.organizationId) {
      const install = await prisma.marketplaceInstall.findFirst({
        where: {
          catalogItemId: id,
          organizationId: orgContext.organizationId,
        },
      })
      installed = !!install
    }

    // Base response
    const detail: Record<string, unknown> = {
      id: item.id,
      name: item.name,
      displayName: item.displayName,
      description: item.description,
      category: item.category,
      type: item.type,
      icon: item.icon,
      tags: item.tags,
      installed,
      communitySkillName: item.communitySkillName,
      communityToolName: item.communityToolName,
      configSchema: item.configSchema,
    }

    // Enrich with community data
    if (item.communitySkillName) {
      const skill = await getCommunitySkill(item.communitySkillName)
      if (skill) {
        detail.version = skill.version
        detail.author = skill.author
        detail.skillPrompt = skill.skillPrompt
        detail.sharedToolNames = skill.sharedTools ?? []

        const toolSchemas = await getToolSchemasForSkill(
          item.communitySkillName
        )
        detail.tools = toolSchemas
      }
    } else if (item.communityToolName) {
      const tool = await getCommunityTool(item.communityToolName)
      if (tool) {
        detail.toolParameters = communityToolToJsonSchema(tool)
        detail.toolTags = tool.tags
      }
    }

    // For non-community skills, include skillTemplate content
    if (!item.communitySkillName && item.skillTemplate) {
      detail.skillPrompt = item.skillTemplate.content
    }

    // For non-community tools, include toolTemplate parameters
    if (!item.communityToolName && item.toolTemplate) {
      detail.toolParameters = item.toolTemplate.parameters
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
