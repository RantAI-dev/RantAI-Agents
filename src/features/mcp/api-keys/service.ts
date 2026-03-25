import { canManage } from "@/lib/organization"
import { generateMcpApiKey } from "@/lib/mcp/api-key"
import {
  createDashboardMcpApiKey,
  deleteDashboardMcpApiKey,
  findDashboardMcpApiKeyById,
  findDashboardMcpApiKeys,
  updateDashboardMcpApiKey,
} from "./repository"
import type {
  CreateDashboardMcpApiKeyInput,
  UpdateDashboardMcpApiKeyInput,
} from "./schema"

export interface ServiceError {
  status: number
  error: string
}

export interface DashboardMcpApiKeysContext {
  organizationId: string | null
  role: string | null
  userId: string
}

export interface DashboardMcpApiKeyResponse {
  id: string
  name: string
  key: string
  exposedTools: string[]
  requestCount: number
  lastUsedAt: string | null
  enabled: boolean
  createdAt: string
}

function toResponse(key: {
  id: string
  name: string
  key: string
  exposedTools: string[]
  requestCount: number
  lastUsedAt: Date | null
  enabled: boolean
  createdAt: Date
}) {
  return {
    ...key,
    lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
    createdAt: key.createdAt.toISOString(),
  }
}

/**
 * Lists MCP API keys visible to the caller.
 */
export async function listDashboardMcpApiKeys(
  context: DashboardMcpApiKeysContext
): Promise<DashboardMcpApiKeyResponse[] | ServiceError> {
  if (context.role && !canManage(context.role)) {
    return { status: 403, error: "Insufficient permissions" }
  }

  const keys = await findDashboardMcpApiKeys(context.organizationId)
  return keys.map(toResponse)
}

/**
 * Creates an MCP API key for the current organization.
 */
export async function createDashboardMcpApiKeyRecord(params: {
  context: DashboardMcpApiKeysContext
  input: CreateDashboardMcpApiKeyInput
}): Promise<DashboardMcpApiKeyResponse | ServiceError> {
  if (params.context.role && !canManage(params.context.role)) {
    return { status: 403, error: "Insufficient permissions" }
  }

  if (!params.context.organizationId) {
    return { status: 400, error: "Organization context required" }
  }

  const name = params.input.name.trim()
  if (!name) {
    return { status: 400, error: "Name is required" }
  }

  const key = await createDashboardMcpApiKey({
    name,
    key: generateMcpApiKey(),
    exposedTools: params.input.exposedTools ?? [],
    enabled: true,
    organizationId: params.context.organizationId,
    createdBy: params.context.userId,
  })

  return toResponse(key)
}

/**
 * Loads one MCP API key and enforces organization access.
 */
export async function getDashboardMcpApiKey(
  context: DashboardMcpApiKeysContext,
  id: string
): Promise<DashboardMcpApiKeyResponse | ServiceError> {
  if (context.role && !canManage(context.role)) {
    return { status: 403, error: "Insufficient permissions" }
  }

  const key = await findDashboardMcpApiKeyById(id)
  if (!key) {
    return { status: 404, error: "MCP API key not found" }
  }

  if (context.organizationId && key.organizationId !== context.organizationId) {
    return { status: 404, error: "MCP API key not found" }
  }

  return toResponse(key)
}

/**
 * Updates an MCP API key after enforcing organization access.
 */
export async function updateDashboardMcpApiKeyRecord(params: {
  context: DashboardMcpApiKeysContext
  id: string
  input: UpdateDashboardMcpApiKeyInput
}): Promise<DashboardMcpApiKeyResponse | ServiceError> {
  if (params.context.role && !canManage(params.context.role)) {
    return { status: 403, error: "Insufficient permissions" }
  }

  const existing = await findDashboardMcpApiKeyById(params.id)
  if (!existing) {
    return { status: 404, error: "MCP API key not found" }
  }

  if (params.context.organizationId && existing.organizationId !== params.context.organizationId) {
    return { status: 404, error: "MCP API key not found" }
  }

  const updated = await updateDashboardMcpApiKey(params.id, {
    ...(params.input.name !== undefined && { name: params.input.name }),
    ...(params.input.exposedTools !== undefined && {
      exposedTools: params.input.exposedTools,
    }),
    ...(params.input.enabled !== undefined && { enabled: params.input.enabled }),
  })

  return toResponse(updated)
}

/**
 * Deletes an MCP API key after enforcing organization access.
 */
export async function deleteDashboardMcpApiKeyRecord(
  context: DashboardMcpApiKeysContext,
  id: string
): Promise<{ success: true } | ServiceError> {
  if (context.role && !canManage(context.role)) {
    return { status: 403, error: "Insufficient permissions" }
  }

  const existing = await findDashboardMcpApiKeyById(id)
  if (!existing) {
    return { status: 404, error: "MCP API key not found" }
  }

  if (context.organizationId && existing.organizationId !== context.organizationId) {
    return { status: 404, error: "MCP API key not found" }
  }

  await deleteDashboardMcpApiKey(id)
  return { success: true }
}
