import { prisma } from "@/lib/prisma"
import { getCatalogItemById } from "./catalog"
import type { MarketplaceCatalogItem } from "./types"

export interface InstallResult {
  success: boolean
  installedId?: string
  error?: string
}

/**
 * Install a marketplace item for an organization.
 * Creates the Tool or Skill record, then records the install.
 */
export async function installMarketplaceItem(
  catalogItemId: string,
  organizationId: string,
  userId: string,
  authConfig?: { type: string; token: string; headerName?: string }
): Promise<InstallResult> {
  const item = await getCatalogItemById(catalogItemId)
  if (!item) {
    return { success: false, error: "Catalog item not found" }
  }

  // Check if already installed
  const existing = await prisma.marketplaceInstall.findUnique({
    where: {
      catalogItemId_organizationId: {
        catalogItemId,
        organizationId,
      },
    },
  })

  if (existing) {
    return { success: false, error: "Already installed" }
  }

  let installedId: string

  if (item.type === "tool" && item.toolTemplate) {
    const template = item.toolTemplate

    // Apply auth config to execution config headers if provided
    const executionConfig = { ...template.executionConfig }
    if (authConfig) {
      const headers: Record<string, string> = { ...executionConfig.headers }
      if (authConfig.type === "bearer" && authConfig.token) {
        headers["Authorization"] = `Bearer ${authConfig.token}`
      } else if (authConfig.type === "api_key" && authConfig.token) {
        headers[authConfig.headerName || "X-API-Key"] = authConfig.token
      }
      executionConfig.headers = headers
    }

    const tool = await prisma.tool.create({
      data: {
        name: template.name,
        displayName: template.displayName,
        description: template.description,
        category: "custom",
        parameters: template.parameters,
        executionConfig,
        isBuiltIn: false,
        enabled: true,
        organizationId,
        createdBy: userId,
      },
    })
    installedId = tool.id
  } else if (item.type === "skill" && item.skillTemplate) {
    const template = item.skillTemplate

    const skill = await prisma.skill.create({
      data: {
        name: template.name,
        displayName: template.displayName,
        description: template.description,
        content: template.content,
        source: "marketplace",
        category: template.category,
        tags: template.tags,
        enabled: true,
        organizationId,
        createdBy: userId,
      },
    })
    installedId = skill.id
  } else {
    return { success: false, error: "Invalid catalog item: missing template" }
  }

  // Record the install
  await prisma.marketplaceInstall.create({
    data: {
      catalogItemId,
      itemType: item.type,
      installedId,
      organizationId,
      installedBy: userId,
    },
  })

  return { success: true, installedId }
}

/**
 * Uninstall a marketplace item.
 * Deletes the Tool or Skill record and the install record.
 */
export async function uninstallMarketplaceItem(
  catalogItemId: string,
  organizationId: string
): Promise<{ success: boolean; error?: string }> {
  const install = await prisma.marketplaceInstall.findUnique({
    where: {
      catalogItemId_organizationId: {
        catalogItemId,
        organizationId,
      },
    },
  })

  if (!install) {
    return { success: false, error: "Not installed" }
  }

  // Delete the installed resource
  if (install.itemType === "tool") {
    await prisma.tool.delete({ where: { id: install.installedId } }).catch(() => {})
  } else if (install.itemType === "skill") {
    await prisma.skill.delete({ where: { id: install.installedId } }).catch(() => {})
  }

  // Delete the install record
  await prisma.marketplaceInstall.delete({ where: { id: install.id } })

  return { success: true }
}
