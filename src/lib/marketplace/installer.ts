import { prisma } from "@/lib/prisma"
import { getCatalogItemById } from "./catalog"
import { importWorkflow } from "@/lib/workflow/import-export"
import {
  getCommunitySkill,
  getCommunityTool,
  getToolSchemasForSkill,
} from "@/lib/skills/gateway"
import { communityToolToJsonSchema, configSchemaToJsonSchema } from "@/lib/skill-sdk"
import type { MarketplaceCatalogItem } from "./types"

export interface InstallResult {
  success: boolean
  installedId?: string
  skillId?: string    // Skill.id for AssistantSkill binding (community skills)
  toolIds?: string[]  // Tool IDs created (community skills create tools)
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
  authConfig?: { type: string; token: string; headerName?: string },
  config?: Record<string, unknown>
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
    if (existing.itemType === "skill") {
      const installedSkill = await prisma.installedSkill.findUnique({
        where: { id: existing.installedId },
        select: { skillId: true },
      })
      return {
        success: true,
        installedId: existing.installedId,
        ...(installedSkill?.skillId ? { skillId: installedSkill.skillId } : {}),
      }
    }
    return { success: true, installedId: existing.installedId }
  }

  // Route to community install if applicable
  if (item.communitySkillName) {
    return installCommunitySkill(catalogItemId, item, organizationId, userId, config)
  }
  if (item.communityToolName) {
    return installCommunityTool(catalogItemId, item, organizationId, userId)
  }

  let installedId: string
  let skillId: string | undefined

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

    const existingTool = await prisma.tool.findUnique({
      where: {
        name_organizationId: {
          name: template.name,
          organizationId,
        },
      },
    })

    if (existingTool) {
      installedId = existingTool.id
    } else {
      const tool = await prisma.tool.create({
        data: {
          name: template.name,
          displayName: template.displayName,
          description: template.description,
          category: "custom",
          parameters: template.parameters,
          icon: item.icon,
          tags: item.tags ?? [],
          executionConfig,
          isBuiltIn: false,
          enabled: true,
          organizationId,
          createdBy: userId,
        },
      })
      installedId = tool.id
    }
  } else if (item.type === "skill" && item.skillTemplate) {
    const template = item.skillTemplate

    const existingSkill = await prisma.skill.findFirst({
      where: {
        name: template.name,
        organizationId,
      },
      select: { id: true },
    })

    if (existingSkill) {
      installedId = existingSkill.id
      skillId = existingSkill.id
    } else {
      const skill = await prisma.skill.create({
        data: {
          name: template.name,
          displayName: template.displayName,
          description: template.description,
          content: template.content,
          source: "marketplace",
          category: template.category,
          tags: template.tags,
          icon: item.icon,
          enabled: true,
          organizationId,
          createdBy: userId,
        },
      })
      installedId = skill.id
      skillId = skill.id
    }
  } else if (item.type === "workflow" && item.workflowTemplate) {
    const imported = importWorkflow(item.workflowTemplate)
    const workflow = await prisma.workflow.create({
      data: {
        name: imported.name,
        description: imported.description,
        nodes: imported.nodes as object[],
        edges: imported.edges as object[],
        trigger: imported.trigger as object,
        variables: imported.variables as object,
        mode: imported.mode,
        tags: item.tags ?? [],
        status: "DRAFT",
        organizationId,
        createdBy: userId,
      },
    })
    installedId = workflow.id
  } else if (item.type === "mcp" && item.mcpTemplate) {
    const tpl = item.mcpTemplate
    const needsConfig = Array.isArray(tpl.envKeys) && tpl.envKeys.length > 0

    const mcpServer = await prisma.mcpServerConfig.create({
      data: {
        name: tpl.name,
        description: tpl.description,
        icon: item.icon,
        transport: tpl.transport,
        url: tpl.url,
        envKeys: tpl.envKeys ?? undefined,
        docsUrl: tpl.docsUrl ?? undefined,
        enabled: true,
        configured: !needsConfig,
        organizationId,
        createdBy: userId,
      },
    })
    installedId = mcpServer.id
  } else if (item.type === "assistant" && item.assistantTemplate) {
    const tpl = item.assistantTemplate
    const assistant = await prisma.assistant.create({
      data: {
        name: tpl.name,
        description: tpl.description,
        emoji: tpl.emoji,
        systemPrompt: tpl.systemPrompt,
        model: tpl.model,
        useKnowledgeBase: tpl.useKnowledgeBase,
        memoryConfig: tpl.memoryConfig as object,
        tags: tpl.tags ?? item.tags ?? [],
        isBuiltIn: false,
        organizationId,
        createdBy: userId,
      },
    })

    // Auto-bind tools by name (built-in or org-scoped)
    for (const toolName of tpl.suggestedToolNames) {
      const tool = await prisma.tool.findFirst({
        where: {
          name: toolName,
          OR: [{ organizationId }, { isBuiltIn: true }],
        },
      })
      if (tool) {
        await prisma.assistantTool.create({
          data: { assistantId: assistant.id, toolId: tool.id },
        })
      }
    }

    // Auto-bind community skills if installed in this org
    if (tpl.suggestedSkillNames) {
      for (const skillName of tpl.suggestedSkillNames) {
        const skill = await prisma.skill.findFirst({
          where: {
            name: { startsWith: `community-${skillName}` },
            organizationId,
          },
        })
        if (skill) {
          await prisma.assistantSkill.create({
            data: { assistantId: assistant.id, skillId: skill.id },
          })
        }
      }
    }

    installedId = assistant.id
  } else {
    return { success: false, error: "Invalid catalog item: missing template" }
  }

  // Record the install
  await prisma.marketplaceInstall.upsert({
    where: {
      catalogItemId_organizationId: {
        catalogItemId,
        organizationId,
      },
    },
    update: {
      itemType: item.type,
      installedId,
      installedBy: userId,
    },
    create: {
      catalogItemId,
      itemType: item.type,
      installedId,
      organizationId,
      installedBy: userId,
    },
  })

  return { success: true, installedId, ...(skillId && { skillId }) }
}

/**
 * Install a community skill from the marketplace.
 * Creates InstalledSkill + Skill (for prompt) + Tool records (for each tool in skill).
 */
async function installCommunitySkill(
  catalogItemId: string,
  item: MarketplaceCatalogItem,
  organizationId: string,
  userId: string,
  userConfig?: Record<string, unknown>
): Promise<InstallResult> {
  const skillDef = await getCommunitySkill(item.communitySkillName!)
  if (!skillDef) {
    return {
      success: false,
      error: `Community skill "${item.communitySkillName}" not found in registry`,
    }
  }

  // 1. Upsert Skill record for prompt injection.
  const skillRecord = await prisma.skill.upsert({
    where: {
      name_organizationId: {
        name: `community-${skillDef.name}`,
        organizationId,
      },
    },
    update: {
      displayName: skillDef.displayName,
      description: skillDef.description,
      content: skillDef.skillPrompt,
      source: "community",
      category: skillDef.category.toLowerCase(),
      tags: skillDef.tags,
      icon: item.icon || skillDef.icon,
      enabled: true,
    },
    create: {
      name: `community-${skillDef.name}`,
      displayName: skillDef.displayName,
      description: skillDef.description,
      content: skillDef.skillPrompt,
      source: "community",
      category: skillDef.category.toLowerCase(),
      tags: skillDef.tags,
      icon: item.icon || skillDef.icon,
      enabled: true,
      organizationId,
      createdBy: userId,
    },
  })

  // 2. Upsert InstalledSkill record.
  const installedSkill = await prisma.installedSkill.upsert({
    where: {
      name_organizationId: {
        name: skillDef.name,
        organizationId,
      },
    },
    update: {
      displayName: skillDef.displayName,
      description: skillDef.description,
      version: skillDef.version,
      category: skillDef.category,
      tags: skillDef.tags,
      icon: item.icon || skillDef.icon || "✨",
      skillPrompt: skillDef.skillPrompt,
      configSchema: skillDef.configSchema
        ? configSchemaToJsonSchema(skillDef.configSchema)
        : undefined,
      ...(userConfig ? { config: userConfig as object } : {}),
      enabled: true,
      installedBy: userId,
      skillId: skillRecord.id,
    },
    create: {
      name: skillDef.name,
      displayName: skillDef.displayName,
      description: skillDef.description,
      version: skillDef.version,
      category: skillDef.category,
      tags: skillDef.tags,
      icon: item.icon || skillDef.icon || "✨",
      skillPrompt: skillDef.skillPrompt,
      configSchema: skillDef.configSchema
        ? configSchemaToJsonSchema(skillDef.configSchema)
        : undefined,
      config: (userConfig as object) ?? undefined,
      enabled: true,
      organizationId,
      installedBy: userId,
      skillId: skillRecord.id,
    },
  })

  // 3. Create Tool records for each tool in skill
  //    Shared tools may already exist (installed standalone or by another skill),
  //    so check first and only create if missing.
  const createdToolIds: string[] = []
  const toolSchemas = await getToolSchemasForSkill(skillDef.name)
  for (const schema of toolSchemas) {
    const existing = await prisma.tool.findUnique({
      where: {
        name_organizationId: {
          name: schema.name,
          organizationId,
        },
      },
    })
    if (existing) {
      createdToolIds.push(existing.id)
    } else {
      const tool = await prisma.tool.create({
        data: {
          name: schema.name,
          displayName: schema.displayName,
          description: schema.description,
          category: "community",
          parameters: schema.parameters,
          icon: item.icon || skillDef.icon,
          tags: schema.tags ?? skillDef.tags ?? [],
          isBuiltIn: false,
          enabled: true,
          organizationId,
          createdBy: userId,
        },
      })
      createdToolIds.push(tool.id)
    }
  }

  // 3b. Store created tool IDs on the Skill metadata so frontend can resolve them
  const existingMeta = (skillRecord.metadata as Record<string, unknown>) ?? {}
  const existingToolIds = Array.isArray(existingMeta.toolIds)
    ? (existingMeta.toolIds as string[])
    : []
  const mergedToolIds = Array.from(new Set([...existingToolIds, ...createdToolIds]))
  await prisma.skill.update({
    where: { id: skillRecord.id },
    data: {
      metadata: { ...existingMeta, toolIds: mergedToolIds },
    },
  })

  // 3c. Mark attached community tools as installed in Marketplace > Tools
  // by linking each tool catalog entry to the resolved Tool row.
  if (toolSchemas.length > 0) {
    const schemaNames = toolSchemas.map((schema) => schema.name)
    const toolCatalogItems = await prisma.catalogItem.findMany({
      where: {
        type: "tool",
        communityToolName: { in: schemaNames },
      },
      select: { id: true, communityToolName: true },
    })

    const toolIdByName = new Map<string, string>()
    for (let i = 0; i < toolSchemas.length; i += 1) {
      const schema = toolSchemas[i]
      const toolId = createdToolIds[i]
      if (schema?.name && toolId) {
        toolIdByName.set(schema.name, toolId)
      }
    }

    for (const catalogTool of toolCatalogItems) {
      if (!catalogTool.communityToolName) continue
      const toolId = toolIdByName.get(catalogTool.communityToolName)
      if (!toolId) continue

      await prisma.marketplaceInstall.upsert({
        where: {
          catalogItemId_organizationId: {
            catalogItemId: catalogTool.id,
            organizationId,
          },
        },
        update: {
          itemType: "tool",
          installedId: toolId,
          installedBy: userId,
        },
        create: {
          catalogItemId: catalogTool.id,
          itemType: "tool",
          installedId: toolId,
          organizationId,
          installedBy: userId,
        },
      })
    }
  }

  // 4. Record marketplace install
  await prisma.marketplaceInstall.upsert({
    where: {
      catalogItemId_organizationId: {
        catalogItemId,
        organizationId,
      },
    },
    update: {
      itemType: "skill",
      installedId: installedSkill.id,
      installedBy: userId,
    },
    create: {
      catalogItemId,
      itemType: "skill",
      installedId: installedSkill.id,
      organizationId,
      installedBy: userId,
    },
  })

  return {
    success: true,
    installedId: installedSkill.id,
    skillId: skillRecord.id,
    toolIds: mergedToolIds,
  }
}

/**
 * Install a standalone community tool from the marketplace.
 * Creates a Tool record with category="community".
 */
async function installCommunityTool(
  catalogItemId: string,
  item: MarketplaceCatalogItem,
  organizationId: string,
  userId: string
): Promise<InstallResult> {
  const toolDef = await getCommunityTool(item.communityToolName!)
  if (!toolDef) {
    return {
      success: false,
      error: `Community tool "${item.communityToolName}" not found in registry`,
    }
  }

  const existingTool = await prisma.tool.findUnique({
    where: {
      name_organizationId: {
        name: toolDef.name,
        organizationId,
      },
    },
  })

  const tool = existingTool
    ? existingTool
    : await prisma.tool.create({
        data: {
          name: toolDef.name,
          displayName: toolDef.displayName,
          description: toolDef.description,
          category: "community",
          parameters: communityToolToJsonSchema(toolDef),
          icon: item.icon,
          tags: toolDef.tags ?? item.tags ?? [],
          isBuiltIn: false,
          enabled: true,
          organizationId,
          createdBy: userId,
        },
      })

  await prisma.marketplaceInstall.create({
    data: {
      catalogItemId,
      itemType: "tool",
      installedId: tool.id,
      organizationId,
      installedBy: userId,
    },
  })

  return { success: true, installedId: tool.id }
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
    await prisma.tool
      .delete({ where: { id: install.installedId } })
      .catch(() => {})
  } else if (install.itemType === "skill") {
    // Check if this is a community skill (InstalledSkill)
    const installedSkill = await prisma.installedSkill
      .findUnique({ where: { id: install.installedId } })
      .catch(() => null)

    if (installedSkill) {
      // Keep attached tools installed and reusable as standalone tools.
      // Skill uninstall only removes skill records/linkage.
      if (installedSkill.skillId) {
        await prisma.skill
          .delete({ where: { id: installedSkill.skillId } })
          .catch(() => {})
      }
      // Delete InstalledSkill record
      await prisma.installedSkill
        .delete({ where: { id: install.installedId } })
        .catch(() => {})
    } else {
      // Regular marketplace skill (behavior-only)
      await prisma.skill
        .delete({ where: { id: install.installedId } })
        .catch(() => {})
    }
  } else if (install.itemType === "workflow") {
    await prisma.workflow
      .delete({ where: { id: install.installedId } })
      .catch(() => {})
  } else if (install.itemType === "mcp") {
    // Guard: cannot uninstall built-in MCP servers
    const mcpServer = await prisma.mcpServerConfig
      .findUnique({ where: { id: install.installedId }, select: { isBuiltIn: true } })
      .catch(() => null)
    if (mcpServer?.isBuiltIn) {
      return { success: false, error: "Cannot uninstall a built-in MCP server" }
    }
    // Delete discovered tools first (they cascade via mcpServerId FK, but be explicit)
    await prisma.tool
      .deleteMany({ where: { mcpServerId: install.installedId } })
      .catch(() => {})
    await prisma.mcpServerConfig
      .delete({ where: { id: install.installedId } })
      .catch(() => {})
  } else if (install.itemType === "assistant") {
    await prisma.assistant
      .delete({ where: { id: install.installedId } })
      .catch(() => {})
  }

  // Delete the install record
  await prisma.marketplaceInstall.delete({ where: { id: install.id } })

  return { success: true }
}
