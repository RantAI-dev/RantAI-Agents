import { Prisma } from "@prisma/client"
import { ensureBuiltinTools } from "@/lib/tools"
import {
  createTool,
  deleteToolById,
  findToolById,
  findToolByIdBasic,
  findToolsForOrganization,
  updateToolById,
} from "./repository"
import type { CreateToolInput, UpdateToolInput } from "./schema"

export interface ServiceError {
  status: number
  error: string
}

type ToolListItem = {
  id: string
  name: string
  displayName: string
  description: string
  category: string
  parameters: unknown
  icon: string | null
  tags: string[]
  executionConfig: unknown | null
  isBuiltIn: boolean
  enabled: boolean
  mcpServer: { id: string; name: string } | null
  assistantCount: number
  createdAt: string
}

/**
 * Lists built-in tools plus organization-scoped tools visible to the caller.
 */
export async function listToolsForDashboard(
  organizationId: string | null
): Promise<ToolListItem[]> {
  await ensureBuiltinTools()
  const tools = await findToolsForOrganization(organizationId)

  return tools.map((tool) => ({
    id: tool.id,
    name: tool.name,
    displayName: tool.displayName,
    description: tool.description,
    category: tool.category,
    parameters: tool.parameters,
    icon: tool.icon ?? null,
    tags: tool.tags,
    executionConfig: tool.executionConfig ?? null,
    isBuiltIn: tool.isBuiltIn,
    enabled: tool.enabled,
    mcpServer: tool.mcpServer,
    assistantCount: tool._count.assistantTools,
    createdAt: tool.createdAt.toISOString(),
  }))
}

/**
 * Creates an organization-scoped custom tool.
 */
export async function createDashboardTool(params: {
  input: CreateToolInput
  organizationId: string | null
  createdBy: string
}) {
  const tool = await createTool({
    name: params.input.name,
    displayName: params.input.displayName,
    description: params.input.description,
    category: "custom",
    parameters:
      (params.input.parameters as Prisma.InputJsonValue | undefined) ?? {
        type: "object",
        properties: {},
      },
    executionConfig:
      params.input.executionConfig === undefined || params.input.executionConfig === null
        ? Prisma.DbNull
        : (params.input.executionConfig as Prisma.InputJsonValue),
    isBuiltIn: false,
    enabled: true,
    organizationId: params.organizationId,
    createdBy: params.createdBy,
  })

  return tool
}

/**
 * Loads a tool and redacts secret auth values from execution config.
 */
export async function getDashboardToolById(params: {
  id: string
  organizationId: string | null
}): Promise<Record<string, unknown> | ServiceError> {
  const tool = await findToolById(params.id)
  if (!tool) {
    return { status: 404, error: "Tool not found" }
  }

  if (!tool.isBuiltIn && tool.organizationId && tool.organizationId !== params.organizationId) {
    return { status: 403, error: "Forbidden" }
  }

  let safeExecutionConfig = tool.executionConfig
  if (
    safeExecutionConfig &&
    typeof safeExecutionConfig === "object" &&
    !Array.isArray(safeExecutionConfig)
  ) {
    const config = safeExecutionConfig as Record<string, unknown>
    if ("authValue" in config) {
      safeExecutionConfig = { ...config, authValue: "••••••••" }
    }
  }

  return { ...tool, executionConfig: safeExecutionConfig }
}

/**
 * Updates mutable tool fields after ownership checks.
 */
export async function updateDashboardTool(params: {
  id: string
  organizationId: string | null
  input: UpdateToolInput
}): Promise<Record<string, unknown> | ServiceError> {
  const existing = await findToolByIdBasic(params.id)
  if (!existing) {
    return { status: 404, error: "Tool not found" }
  }

  if (
    !existing.isBuiltIn &&
    existing.organizationId &&
    existing.organizationId !== params.organizationId
  ) {
    return { status: 403, error: "Forbidden" }
  }

  const updateData: Prisma.ToolUpdateInput = {}
  if ("displayName" in params.input) updateData.displayName = params.input.displayName
  if ("description" in params.input) updateData.description = params.input.description
  if ("parameters" in params.input) {
    updateData.parameters = params.input.parameters as Prisma.InputJsonValue
  }
  if ("executionConfig" in params.input) {
    updateData.executionConfig =
      params.input.executionConfig === null
        ? Prisma.DbNull
        : (params.input.executionConfig as Prisma.InputJsonValue)
  }
  if ("enabled" in params.input) updateData.enabled = params.input.enabled

  const tool = await updateToolById(params.id, updateData)
  return tool as Record<string, unknown>
}

/**
 * Deletes custom tools and blocks deletion of built-ins.
 */
export async function deleteDashboardTool(params: {
  id: string
  organizationId: string | null
}): Promise<{ success: true } | ServiceError> {
  const tool = await findToolByIdBasic(params.id)
  if (!tool) {
    return { status: 404, error: "Tool not found" }
  }

  if (!tool.isBuiltIn && tool.organizationId && tool.organizationId !== params.organizationId) {
    return { status: 403, error: "Forbidden" }
  }

  if (tool.isBuiltIn) {
    return { status: 403, error: "Cannot delete built-in tools" }
  }

  await deleteToolById(params.id)
  return { success: true }
}
