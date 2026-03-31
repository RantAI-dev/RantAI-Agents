import { canManage } from "@/lib/organization"
import { generateAgentApiKey } from "@/lib/embed/api-key-generator"
import {
  createAgentApiKey as createKey,
  deleteAgentApiKey as deleteKey,
  findAgentApiKeyByKey,
  findAgentApiKeyById,
  findAgentApiKeysByAssistantId,
  findAgentApiKeysByOrganization,
  findAssistantById,
  findOrganizationById,
  updateAgentApiKey as updateKey,
} from "./repository"
import type { CreateAgentApiKeyInput, UpdateAgentApiKeyInput } from "./schema"

export interface ServiceError {
  status: number
  error: string
}

export interface AgentApiKeysContext {
  organizationId: string | null
  role: string | null
  userId: string
}

type AssistantSummary = { id: string; name: string; emoji: string | null } | null

export interface AgentApiKeyResponse {
  id: string
  name: string
  key: string
  assistantId: string
  scopes: string[]
  ipWhitelist: string[]
  requestCount: number
  lastUsedAt: string | null
  enabled: boolean
  expiresAt: string | null
  createdAt: string
  updatedAt: string
  assistant: AssistantSummary
}

function toResponse(
  apiKey: {
    id: string
    name: string
    key: string
    assistantId: string
    scopes: string[]
    ipWhitelist: string[]
    requestCount: number
    lastUsedAt: Date | null
    enabled: boolean
    expiresAt: Date | null
    createdAt: Date
    updatedAt: Date
  },
  assistant: AssistantSummary
): AgentApiKeyResponse {
  return {
    ...apiKey,
    lastUsedAt: apiKey.lastUsedAt?.toISOString() ?? null,
    expiresAt: apiKey.expiresAt?.toISOString() ?? null,
    createdAt: apiKey.createdAt.toISOString(),
    updatedAt: apiKey.updatedAt.toISOString(),
    assistant,
  }
}

export async function listAgentApiKeys(
  context: AgentApiKeysContext,
  assistantId?: string
): Promise<AgentApiKeyResponse[] | ServiceError> {
  if (context.role && !canManage(context.role)) {
    return { status: 403, error: "Insufficient permissions" }
  }

  const keys = assistantId
    ? await findAgentApiKeysByAssistantId(assistantId, context.organizationId)
    : await findAgentApiKeysByOrganization(context.organizationId)

  const assistantIds = [...new Set(keys.map((k) => k.assistantId))]
  const assistants = await Promise.all(assistantIds.map((id) => findAssistantById(id)))
  const assistantMap = new Map(
    assistants.filter(Boolean).map((a) => [a!.id, a!])
  )

  return keys.map((key) => {
    const a = assistantMap.get(key.assistantId)
    return toResponse(key, a ? { id: a.id, name: a.name, emoji: a.emoji } : null)
  })
}

export async function createAgentApiKey(params: {
  context: AgentApiKeysContext
  input: CreateAgentApiKeyInput
}): Promise<AgentApiKeyResponse | ServiceError> {
  if (params.context.role && !canManage(params.context.role)) {
    return { status: 403, error: "Insufficient permissions" }
  }

  if (params.context.organizationId) {
    const org = await findOrganizationById(params.context.organizationId)
    if (org && org._count.agentApiKeys >= org.maxApiKeys) {
      return {
        status: 400,
        error: `Organization has reached the maximum of ${org.maxApiKeys} API keys`,
      }
    }
  }

  const assistant = await findAssistantById(params.input.assistantId)
  if (!assistant) {
    return { status: 404, error: "Assistant not found" }
  }

  if (!assistant.isBuiltIn && assistant.organizationId) {
    if (!params.context.organizationId || assistant.organizationId !== params.context.organizationId) {
      return { status: 404, error: "Assistant not found" }
    }
  }

  const apiKey = await createKey({
    name: params.input.name,
    key: generateAgentApiKey(),
    assistantId: params.input.assistantId,
    scopes: params.input.scopes ?? ["chat", "chat:stream"],
    ipWhitelist: params.input.ipWhitelist ?? [],
    enabled: true,
    expiresAt: params.input.expiresAt ? new Date(params.input.expiresAt) : null,
    organizationId: params.context.organizationId,
    createdBy: params.context.userId,
  })

  return toResponse(apiKey, { id: assistant.id, name: assistant.name, emoji: assistant.emoji })
}

export async function getAgentApiKey(
  context: AgentApiKeysContext,
  id: string
): Promise<AgentApiKeyResponse | ServiceError> {
  if (context.role && !canManage(context.role)) {
    return { status: 403, error: "Insufficient permissions" }
  }

  const apiKey = await findAgentApiKeyById(id)
  if (!apiKey) return { status: 404, error: "API key not found" }

  if (apiKey.organizationId) {
    if (!context.organizationId || apiKey.organizationId !== context.organizationId) {
      return { status: 404, error: "API key not found" }
    }
  } else if (context.organizationId) {
    return { status: 404, error: "API key not found" }
  }

  const assistant = await findAssistantById(apiKey.assistantId)
  return toResponse(apiKey, assistant)
}

export async function updateAgentApiKey(params: {
  context: AgentApiKeysContext
  id: string
  input: UpdateAgentApiKeyInput
}): Promise<AgentApiKeyResponse | ServiceError> {
  const existing = await findAgentApiKeyById(params.id)
  if (!existing) return { status: 404, error: "API key not found" }

  if (existing.organizationId) {
    if (!params.context.organizationId || existing.organizationId !== params.context.organizationId) {
      return { status: 404, error: "API key not found" }
    }
    if (params.context.role && !canManage(params.context.role)) {
      return { status: 403, error: "Insufficient permissions" }
    }
  }

  const updated = await updateKey(params.id, {
    ...(params.input.name !== undefined && { name: params.input.name }),
    ...(params.input.scopes !== undefined && { scopes: params.input.scopes }),
    ...(params.input.ipWhitelist !== undefined && { ipWhitelist: params.input.ipWhitelist }),
    ...(params.input.enabled !== undefined && { enabled: params.input.enabled }),
    ...(params.input.expiresAt !== undefined && {
      expiresAt: params.input.expiresAt ? new Date(params.input.expiresAt) : null,
    }),
  })

  const assistant = await findAssistantById(updated.assistantId)
  return toResponse(updated, assistant)
}

export async function deleteAgentApiKey(
  context: AgentApiKeysContext,
  id: string
): Promise<{ success: true } | ServiceError> {
  const existing = await findAgentApiKeyById(id)
  if (!existing) return { status: 404, error: "API key not found" }

  if (existing.organizationId) {
    if (!context.organizationId || existing.organizationId !== context.organizationId) {
      return { status: 404, error: "API key not found" }
    }
    if (context.role && !canManage(context.role)) {
      return { status: 403, error: "Insufficient permissions" }
    }
  }

  await deleteKey(id)
  return { success: true }
}

/**
 * Authenticate an API key for external access (used by /api/v1/ routes).
 * Returns the key record + assistant info, or null if invalid.
 */
export async function authenticateAgentApiKey(key: string) {
  const apiKey = await findAgentApiKeyByKey(key)
  if (!apiKey) return null
  if (!apiKey.enabled) return null
  if (apiKey.expiresAt && apiKey.expiresAt < new Date()) return null

  const assistant = await findAssistantById(apiKey.assistantId)
  if (!assistant) return null

  return { apiKey, assistant }
}
