import {
  getCatalogCategories,
  getCatalogItemById,
  getCatalogItems,
} from "@/lib/marketplace/catalog"
import {
  installMarketplaceItem,
  uninstallMarketplaceItem,
  type InstallResult,
} from "@/lib/marketplace/installer"
import {
  communityToolToJsonSchema,
} from "@/lib/skill-sdk"
import {
  getCommunitySkill,
  getCommunityTool,
  getToolSchemasForSkill,
} from "@/lib/skills/gateway"
import {
  findDashboardMarketplaceInstallByCatalogItemAndOrganization,
  findDashboardMarketplaceInstalledSkillsByIds,
  findDashboardMarketplaceInstallsByOrganization,
} from "./repository"
import type {
  DashboardMarketplaceInstallInput,
  DashboardMarketplaceUninstallInput,
} from "./schema"

export interface ServiceError {
  status: number
  error: string
}

export interface DashboardMarketplaceContext {
  organizationId: string | null
  userId: string
}

type CatalogType = "tool" | "skill" | "workflow" | "assistant" | "mcp"

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0
}

/**
 * Returns the marketplace catalog with install state for the current organization.
 */
export async function listDashboardMarketplaceItems(params: {
  organizationId: string | null
  category?: string
  type?: CatalogType
  search?: string
}) {
  const items = await getCatalogItems({
    category: params.category,
    type: params.type,
    search: params.search,
  })
  const categories = await getCatalogCategories(params.type)

  const installMap = new Map<
    string,
    { installedId: string; itemType: string; skillId?: string }
  >()

  if (params.organizationId) {
    const installs = await findDashboardMarketplaceInstallsByOrganization(
      params.organizationId
    )

    const communitySkillInstallIds = installs
      .filter((install) => install.itemType === "skill")
      .map((install) => install.installedId)

    const skillIdMap = new Map<string, string>()
    if (communitySkillInstallIds.length > 0) {
      const installedSkills = await findDashboardMarketplaceInstalledSkillsByIds(
        communitySkillInstallIds
      )
      for (const installedSkill of installedSkills) {
        if (installedSkill.skillId) {
          skillIdMap.set(installedSkill.id, installedSkill.skillId)
        }
      }
    }

    for (const install of installs) {
      installMap.set(install.catalogItemId, {
        installedId: install.installedId,
        itemType: install.itemType,
        skillId: skillIdMap.get(install.installedId),
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
        installed: isBuiltIn || !!install,
        installedId: install?.installedId,
        skillId: install?.skillId,
        isBuiltIn,
        communitySkillName: item.communitySkillName,
        communityToolName: item.communityToolName,
        configSchema: item.configSchema,
      }
    })
    .sort((a, b) => {
      if (a.isBuiltIn && !b.isBuiltIn) return -1
      if (!a.isBuiltIn && b.isBuiltIn) return 1
      return 0
    })

  return {
    items: mappedItems,
    categories,
    total: mappedItems.length,
  }
}

/**
 * Returns the full marketplace detail payload for one catalog item.
 */
export async function getDashboardMarketplaceItemDetail(params: {
  organizationId: string | null
  itemId: string
}): Promise<Record<string, unknown> | ServiceError> {
  const item = await getCatalogItemById(params.itemId)
  if (!item) {
    return { status: 404, error: "Not found" }
  }

  let installed = false
  if (params.organizationId) {
    const install = await findDashboardMarketplaceInstallByCatalogItemAndOrganization(
      params.itemId,
      params.organizationId
    )
    installed = !!install
  }

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

  if (item.communitySkillName) {
    const skill = await getCommunitySkill(item.communitySkillName)
    if (skill) {
      detail.version = skill.version
      detail.author = skill.author
      detail.skillPrompt = skill.skillPrompt
      detail.sharedToolNames = skill.sharedTools ?? []

      detail.tools = await getToolSchemasForSkill(item.communitySkillName)
    }
  } else if (item.communityToolName) {
    const tool = await getCommunityTool(item.communityToolName)
    if (tool) {
      detail.toolParameters = communityToolToJsonSchema(tool)
      detail.toolTags = tool.tags
    }
  }

  if (!item.communitySkillName && item.skillTemplate) {
    detail.skillPrompt = item.skillTemplate.content
  }

  if (!item.communityToolName && item.toolTemplate) {
    detail.toolParameters = item.toolTemplate.parameters
  }

  return detail
}

/**
 * Installs a marketplace item for an organization.
 */
export async function installDashboardMarketplaceItem(params: {
  organizationId: string | null
  userId: string
  input: DashboardMarketplaceInstallInput
}): Promise<InstallResult | ServiceError> {
  if (!params.organizationId) {
    return {
      status: 400,
      error: "Organization context required for marketplace installs",
    }
  }

  if (!isNonEmptyString(params.input.catalogItemId)) {
    return { status: 400, error: "catalogItemId is required" }
  }

  return installMarketplaceItem(
    params.input.catalogItemId,
    params.organizationId,
    params.userId,
    params.input.authConfig as
      | { type: string; token: string; headerName?: string }
      | undefined,
    params.input.config as Record<string, unknown> | undefined
  )
}

/**
 * Uninstalls a marketplace item for an organization.
 */
export async function uninstallDashboardMarketplaceItem(params: {
  organizationId: string | null
  input: DashboardMarketplaceUninstallInput
}): Promise<{ success: boolean; error?: string } | ServiceError> {
  if (!params.organizationId) {
    return {
      status: 400,
      error: "Organization context required",
    }
  }

  return uninstallMarketplaceItem(
    params.input.catalogItemId,
    params.organizationId
  )
}
