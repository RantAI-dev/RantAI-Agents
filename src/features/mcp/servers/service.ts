import { discoverAndSyncTools } from "@/lib/mcp"
import { encryptJsonField } from "@/lib/workflow/credentials"
import {
  createDashboardMcpServer,
  deleteDashboardMcpServer,
  findDashboardMcpServerById,
  findDashboardMcpServers,
  updateDashboardMcpServer,
} from "./repository"
import type {
  DashboardMcpServerCreateInput,
  DashboardMcpServerUpdateInput,
} from "./schema"

export interface ServiceError {
  status: number
  error: string
}

export interface DashboardMcpServerContext {
  organizationId: string | null
  userId: string
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0
}

function hasObjectEntries(value: unknown): boolean {
  return !!value && typeof value === "object" && Object.keys(value as Record<string, unknown>).length > 0
}

type DashboardMcpServerListRow = Awaited<
  ReturnType<typeof findDashboardMcpServers>
>[number]

function mapMcpServerListItem(server: DashboardMcpServerListRow) {
  return {
    id: server.id,
    name: server.name,
    description: server.description,
    icon: server.icon,
    transport: server.transport,
    url: server.url,
    isBuiltIn: server.isBuiltIn,
    envKeys: server.envKeys,
    docsUrl: server.docsUrl,
    enabled: server.enabled,
    configured: server.configured,
    lastConnectedAt: server.lastConnectedAt?.toISOString() ?? null,
    lastError: server.lastError,
    toolCount: server._count.tools,
    createdAt: server.createdAt.toISOString(),
  }
}

function mapMcpServerDetail(server: {
  id: string
  name: string
  description: string | null
  icon: string | null
  transport: string
  url: string
  isBuiltIn: boolean
  envKeys: unknown
  docsUrl: string | null
  env: unknown
  headers: unknown
  enabled: boolean
  configured: boolean
  lastConnectedAt: Date | null
  lastError: string | null
  tools: Array<{
    id: string
    name: string
    displayName: string
    description: string | null
    enabled: boolean
  }>
  createdAt: Date
  _count: { tools: number }
}) {
  return {
    id: server.id,
    name: server.name,
    description: server.description,
    icon: server.icon,
    transport: server.transport,
    url: server.url,
    isBuiltIn: server.isBuiltIn,
    envKeys: server.envKeys,
    docsUrl: server.docsUrl,
    hasEnv: hasObjectEntries(server.env),
    hasHeaders: hasObjectEntries(server.headers),
    enabled: server.enabled,
    configured: server.configured,
    lastConnectedAt: server.lastConnectedAt?.toISOString() ?? null,
    lastError: server.lastError,
    tools: server.tools,
    toolCount: server._count.tools,
    createdAt: server.createdAt.toISOString(),
  }
}

/**
 * Lists MCP server configs for the current organization or the built-in set.
 */
export async function listDashboardMcpServers(organizationId: string | null) {
  const servers = await findDashboardMcpServers(organizationId)
  return servers.map(mapMcpServerListItem)
}

/**
 * Creates an MCP server config for the current organization.
 */
export async function createDashboardMcpServerForDashboard(params: {
  context: DashboardMcpServerContext
  input: DashboardMcpServerCreateInput
}): Promise<unknown | ServiceError> {
  if (!isNonEmptyString(params.input.name) || !isNonEmptyString(params.input.transport)) {
    return { status: 400, error: "name and transport are required" }
  }

  if (!isNonEmptyString(params.input.url)) {
    return { status: 400, error: "url is required for remote MCP servers" }
  }

  return createDashboardMcpServer({
    name: params.input.name,
    description: params.input.description ? (params.input.description as string) : null,
    transport: params.input.transport,
    url: params.input.url,
    env: encryptJsonField(params.input.env as Record<string, string> | null | undefined),
    headers: encryptJsonField(params.input.headers as Record<string, string> | null | undefined),
    isBuiltIn: (params.input.isBuiltIn as boolean | undefined) ?? false,
    envKeys: params.input.envKeys ?? undefined,
    docsUrl: params.input.docsUrl !== undefined ? (params.input.docsUrl as string | null) : undefined,
    enabled: true,
    organizationId: params.context.organizationId,
    createdBy: params.context.userId,
  })
}

/**
 * Loads one MCP server config and applies the same ownership guard as the route.
 */
export async function getDashboardMcpServerForDashboard(params: {
  id: string
  organizationId: string | null
}): Promise<Record<string, unknown> | ServiceError> {
  const server = await findDashboardMcpServerById(params.id)
  if (!server) {
    return { status: 404, error: "MCP server not found" }
  }

  if (server.organizationId && server.organizationId !== params.organizationId) {
    return { status: 403, error: "Forbidden" }
  }

  return mapMcpServerDetail(server as never)
}

/**
 * Updates an MCP server config while stripping secrets from the returned payload.
 */
export async function updateDashboardMcpServerForDashboard(params: {
  id: string
  organizationId: string | null
  input: DashboardMcpServerUpdateInput
}): Promise<Record<string, unknown> | ServiceError> {
  const existing = await findDashboardMcpServerById(params.id)
  if (!existing) {
    return { status: 404, error: "MCP server not found" }
  }

  if (existing.organizationId && existing.organizationId !== params.organizationId) {
    return { status: 403, error: "Forbidden" }
  }

  const server = await updateDashboardMcpServer(params.id, {
    ...(params.input.name !== undefined && { name: params.input.name as string }),
    ...(params.input.description !== undefined && {
      description: params.input.description as string | null,
    }),
    ...(params.input.transport !== undefined && {
      transport: params.input.transport as string,
    }),
    ...(params.input.url !== undefined && { url: params.input.url as string }),
    ...(params.input.env !== undefined && {
      env: encryptJsonField(params.input.env as Record<string, string> | null | undefined),
    }),
    ...(params.input.headers !== undefined && {
      headers: encryptJsonField(params.input.headers as Record<string, string> | null | undefined),
    }),
    ...(params.input.enabled !== undefined && {
      enabled: params.input.enabled as boolean,
    }),
    ...(params.input.configured !== undefined && {
      configured: params.input.configured as boolean,
    }),
  })

  const { env, headers, ...safeServer } = server as {
    env: unknown
    headers: unknown
  } & Record<string, unknown>

  return {
    ...safeServer,
    hasEnv: hasObjectEntries(env),
    hasHeaders: hasObjectEntries(headers),
  }
}

/**
 * Deletes an MCP server config unless it is built in or owned by another org.
 */
export async function deleteDashboardMcpServerForDashboard(params: {
  id: string
  organizationId: string | null
}): Promise<{ success: true } | ServiceError> {
  const existing = await findDashboardMcpServerById(params.id)
  if (!existing) {
    return { status: 404, error: "MCP server not found" }
  }

  if (existing.isBuiltIn) {
    return { status: 403, error: "Cannot delete a built-in MCP server" }
  }

  if (existing.organizationId && existing.organizationId !== params.organizationId) {
    return { status: 403, error: "Forbidden" }
  }

  await deleteDashboardMcpServer(params.id)
  return { success: true }
}

/**
 * Discovers tools for a server and syncs them through the shared MCP helper.
 */
export async function discoverDashboardMcpServerTools(serverId: string) {
  const tools = await discoverAndSyncTools(serverId)
  return {
    success: true as const,
    toolCount: tools.length,
    tools: tools.map((tool) => ({
      id: tool.id,
      name: tool.name,
      displayName: tool.displayName,
      description: tool.description,
    })),
  }
}
