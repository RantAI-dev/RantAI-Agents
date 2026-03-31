import { canManage } from "@/lib/organization"
import { DEFAULT_WIDGET_CONFIG } from "@/lib/embed/types"
import { generateApiKey } from "@/lib/embed/api-key-generator"
import type { Prisma } from "@prisma/client"
import {
  createDashboardEmbedApiKey,
  deleteDashboardEmbedApiKey,
  findDashboardAssistantById,
  findDashboardAssistantsByIds,
  findDashboardEmbedApiKeyById,
  findDashboardEmbedApiKeysByOrganization,
  findDashboardOrganizationById,
  updateDashboardEmbedApiKey,
} from "./repository"
import type {
  CreateDashboardEmbedKeyInput,
  UpdateDashboardEmbedKeyInput,
} from "./schema"

export interface ServiceError {
  status: number
  error: string
}

export interface DashboardEmbedKeysContext {
  organizationId: string | null
  role: string | null
  userId: string
}

type AssistantSummary = { id: string; name: string; emoji: string | null } | null

export interface DashboardEmbedKeyResponse {
  id: string
  name: string
  key: string
  assistantId: string
  allowedDomains: string[]
  config: Record<string, unknown>
  requestCount: number
  lastUsedAt: string | null
  enabled: boolean
  createdAt: string
  updatedAt: string
  assistant: AssistantSummary
}

function mergeConfig(config: unknown): Record<string, unknown> {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return { ...DEFAULT_WIDGET_CONFIG }
  }
  return { ...DEFAULT_WIDGET_CONFIG, ...(config as Record<string, unknown>) }
}

function toResponse(
  embedKey: {
    id: string
    name: string
    key: string
    assistantId: string
    allowedDomains: string[]
    config: unknown
    requestCount: number
    lastUsedAt: Date | null
    enabled: boolean
    createdAt: Date
    updatedAt: Date
  },
  assistant: AssistantSummary
): DashboardEmbedKeyResponse {
  return {
    ...embedKey,
    config: mergeConfig(embedKey.config),
    lastUsedAt: embedKey.lastUsedAt?.toISOString() ?? null,
    createdAt: embedKey.createdAt.toISOString(),
    updatedAt: embedKey.updatedAt.toISOString(),
    assistant,
  }
}

/**
 * Lists embed keys visible to the caller.
 */
export async function listDashboardEmbedKeys(
  context: DashboardEmbedKeysContext,
  assistantId?: string
): Promise<DashboardEmbedKeyResponse[] | ServiceError> {
  if (context.role && !canManage(context.role)) {
    return { status: 403, error: "Insufficient permissions" }
  }

  const keys = await findDashboardEmbedApiKeysByOrganization(context.organizationId, assistantId)
  const assistantIds = [...new Set(keys.map((key) => key.assistantId))]
  const assistants = assistantIds.length > 0 ? await findDashboardAssistantsByIds(assistantIds) : []
  const assistantMap = new Map(assistants.map((assistant) => [assistant.id, assistant]))

  return keys.map((key) =>
    toResponse(
      key,
      assistantMap.get(key.assistantId)
        ? {
            id: assistantMap.get(key.assistantId)!.id,
            name: assistantMap.get(key.assistantId)!.name,
            emoji: assistantMap.get(key.assistantId)!.emoji,
          }
        : null
    )
  )
}

/**
 * Creates an embed key after validating access and assistant visibility.
 */
export async function createDashboardEmbedKey(params: {
  context: DashboardEmbedKeysContext
  input: CreateDashboardEmbedKeyInput
}): Promise<DashboardEmbedKeyResponse | ServiceError> {
  if (params.context.role && !canManage(params.context.role)) {
    return { status: 403, error: "Insufficient permissions" }
  }

  if (params.context.organizationId) {
    const organization = await findDashboardOrganizationById(params.context.organizationId)
    if (organization && organization._count.embedKeys >= organization.maxApiKeys) {
      return {
        status: 400,
        error: `Organization has reached the maximum of ${organization.maxApiKeys} API keys`,
      }
    }
  }

  const assistant = await findDashboardAssistantById(params.input.assistantId)
  if (!assistant) {
    return { status: 404, error: "Assistant not found" }
  }

  if (!assistant.isBuiltIn && assistant.organizationId) {
    if (!params.context.organizationId || assistant.organizationId !== params.context.organizationId) {
      return { status: 404, error: "Assistant not found" }
    }
  }

  const embedKey = await createDashboardEmbedApiKey({
    name: params.input.name,
    key: generateApiKey(),
    assistantId: params.input.assistantId,
    allowedDomains: params.input.allowedDomains ?? [],
    config: mergeConfig(params.input.config) as Prisma.InputJsonValue,
    enabled: true,
    organizationId: params.context.organizationId,
    createdBy: params.context.userId,
  })

  return toResponse(embedKey, {
    id: assistant.id,
    name: assistant.name,
    emoji: assistant.emoji,
  })
}

/**
 * Loads a single embed key and enforces ownership rules.
 */
export async function getDashboardEmbedKey(
  context: DashboardEmbedKeysContext,
  id: string
): Promise<DashboardEmbedKeyResponse | ServiceError> {
  if (context.role && !canManage(context.role)) {
    return { status: 403, error: "Insufficient permissions" }
  }

  const embedKey = await findDashboardEmbedApiKeyById(id)
  if (!embedKey) {
    return { status: 404, error: "Embed key not found" }
  }

  if (embedKey.organizationId) {
    if (!context.organizationId || embedKey.organizationId !== context.organizationId) {
      return { status: 404, error: "Embed key not found" }
    }
  } else if (context.organizationId) {
    return { status: 404, error: "Embed key not found" }
  }

  const assistant = await findDashboardAssistantById(embedKey.assistantId)
  return toResponse(embedKey, assistant)
}

/**
 * Updates an embed key after enforcing ownership rules.
 */
export async function updateDashboardEmbedKey(params: {
  context: DashboardEmbedKeysContext
  id: string
  input: UpdateDashboardEmbedKeyInput
}): Promise<DashboardEmbedKeyResponse | ServiceError> {
  const existingKey = await findDashboardEmbedApiKeyById(params.id)
  if (!existingKey) {
    return { status: 404, error: "Embed key not found" }
  }

  if (existingKey.organizationId) {
    if (!params.context.organizationId || existingKey.organizationId !== params.context.organizationId) {
      return { status: 404, error: "Embed key not found" }
    }

    if (params.context.role && !canManage(params.context.role)) {
      return { status: 403, error: "Insufficient permissions" }
    }
  }

  const mergedConfig = params.input.config
    ? mergeConfig({ ...mergeConfig(existingKey.config), ...params.input.config })
    : mergeConfig(existingKey.config)

  const updated = await updateDashboardEmbedApiKey(params.id, {
    ...(params.input.name !== undefined && { name: params.input.name }),
    ...(params.input.allowedDomains !== undefined && {
      allowedDomains: params.input.allowedDomains,
    }),
    ...(params.input.config !== undefined && { config: mergedConfig as Prisma.InputJsonValue }),
    ...(params.input.enabled !== undefined && { enabled: params.input.enabled }),
  })

  const assistant = await findDashboardAssistantById(updated.assistantId)
  return toResponse(updated, assistant)
}

/**
 * Deletes an embed key after enforcing ownership rules.
 */
export async function deleteDashboardEmbedKey(
  context: DashboardEmbedKeysContext,
  id: string
): Promise<{ success: true } | ServiceError> {
  const existingKey = await findDashboardEmbedApiKeyById(id)
  if (!existingKey) {
    return { status: 404, error: "Embed key not found" }
  }

  if (existingKey.organizationId) {
    if (!context.organizationId || existingKey.organizationId !== context.organizationId) {
      return { status: 404, error: "Embed key not found" }
    }

    if (context.role && !canManage(context.role)) {
      return { status: 403, error: "Insufficient permissions" }
    }
  }

  await deleteDashboardEmbedApiKey(id)
  return { success: true }
}
