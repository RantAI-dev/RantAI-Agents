import {
  findAssistantById,
  findHiddenAssistantToolIds,
  findAssistantMcpServerBindings,
  findAssistantSkillBindings,
  findAssistantToolBindings,
  findAssistantWorkflowBindings,
  replaceAssistantMcpServerBindings,
  replaceAssistantSkillBindings,
  replaceAssistantToolBindings,
  replaceAssistantWorkflowBindings,
} from "./repository"

export interface ServiceError {
  status: number
  error: string
}

export interface AssistantAccessContext {
  organizationId: string | null
}

/**
 * Resolves and authorizes assistant access for binding sub-routes.
 *
 *   - 404 if the assistant doesn't exist.
 *   - Built-in assistants (organizationId = null, isBuiltIn = true) are global
 *     and always readable/writable from any org context.
 *   - Org-scoped assistants only allow access when assistant.organizationId
 *     matches the caller's active org. Cross-org access returns 404 (not 403)
 *     to avoid leaking existence.
 */
async function requireAssistantAccess(
  assistantId: string,
  context: AssistantAccessContext
): Promise<{ ok: true } | ServiceError> {
  const assistant = await findAssistantById(assistantId)
  if (!assistant) return { status: 404, error: "Assistant not found" }
  if (assistant.isBuiltIn) return { ok: true }
  if (assistant.organizationId && assistant.organizationId !== context.organizationId) {
    return { status: 404, error: "Assistant not found" }
  }
  return { ok: true }
}

/**
 * Lists assistant tools with binding flags.
 */
export async function listAssistantTools(
  assistantId: string,
  context: AssistantAccessContext
): Promise<Array<Record<string, unknown>> | ServiceError> {
  const guard = await requireAssistantAccess(assistantId, context)
  if ("status" in guard) return guard

  const rows = await findAssistantToolBindings(assistantId)
  return rows.map((row) => ({
    ...row.tool,
    enabledForAssistant: row.enabled,
  }))
}

/**
 * Replaces assistant tool bindings.
 */
export async function setAssistantTools(
  assistantId: string,
  toolIds: string[],
  context: AssistantAccessContext
): Promise<Array<Record<string, unknown>> | ServiceError> {
  const guard = await requireAssistantAccess(assistantId, context)
  if ("status" in guard) return guard

  const hiddenBoundToolIds = await findHiddenAssistantToolIds(assistantId)
  const mergedToolIds = Array.from(
    new Set([
      ...toolIds.filter((id) => typeof id === "string" && id.length > 0),
      ...hiddenBoundToolIds,
    ])
  )
  await replaceAssistantToolBindings(assistantId, mergedToolIds)

  const rows = await findAssistantToolBindings(assistantId)
  return rows.map((row) => ({
    id: row.tool.id,
    name: row.tool.name,
    displayName: row.tool.displayName,
    description: row.tool.description,
    category: row.tool.category,
  }))
}

/**
 * Lists assistant skills with binding flags.
 */
export async function listAssistantSkills(
  assistantId: string,
  context: AssistantAccessContext
): Promise<Array<Record<string, unknown>> | ServiceError> {
  const guard = await requireAssistantAccess(assistantId, context)
  if ("status" in guard) return guard

  const rows = await findAssistantSkillBindings(assistantId)
  return rows.map((row) => ({
    id: row.skillId,
    displayName: row.skill.displayName,
    description: row.skill.description,
    icon: row.skill.icon,
    enabled: row.enabled,
  }))
}

/**
 * Replaces assistant skill bindings.
 */
export async function setAssistantSkills(
  assistantId: string,
  skillIds: string[],
  context: AssistantAccessContext
): Promise<Array<Record<string, unknown>> | ServiceError> {
  const guard = await requireAssistantAccess(assistantId, context)
  if ("status" in guard) return guard

  const validSkillIds = skillIds.filter((id) => typeof id === "string" && id.length > 0)
  await replaceAssistantSkillBindings(assistantId, validSkillIds)

  const rows = await findAssistantSkillBindings(assistantId)
  return rows.map((row) => ({
    id: row.id,
    skillId: row.skillId,
    enabled: row.enabled,
    priority: row.priority,
  }))
}

/**
 * Lists assistant MCP server bindings.
 */
export async function listAssistantMcpServers(
  assistantId: string,
  context: AssistantAccessContext
): Promise<Array<Record<string, unknown>> | ServiceError> {
  const guard = await requireAssistantAccess(assistantId, context)
  if ("status" in guard) return guard

  const rows = await findAssistantMcpServerBindings(assistantId)
  return rows.map((row) => ({
    id: row.mcpServer.id,
    name: row.mcpServer.name,
    description: row.mcpServer.description,
    transport: row.mcpServer.transport,
    enabled: row.mcpServer.enabled,
    lastConnectedAt: row.mcpServer.lastConnectedAt,
    lastError: row.mcpServer.lastError,
    toolCount: row.mcpServer._count.tools,
    boundEnabled: row.enabled,
  }))
}

/**
 * Replaces assistant MCP server bindings.
 */
export async function setAssistantMcpServers(
  assistantId: string,
  mcpServerIds: string[],
  context: AssistantAccessContext
): Promise<Array<Record<string, unknown>> | ServiceError> {
  const guard = await requireAssistantAccess(assistantId, context)
  if ("status" in guard) return guard

  await replaceAssistantMcpServerBindings(assistantId, mcpServerIds)

  const rows = await findAssistantMcpServerBindings(assistantId)
  return rows.map((row) => ({
    id: row.mcpServer.id,
    name: row.mcpServer.name,
    description: row.mcpServer.description,
    transport: row.mcpServer.transport,
    enabled: row.mcpServer.enabled,
    toolCount: row.mcpServer._count.tools,
  }))
}

/**
 * Lists assistant workflow bindings.
 */
export async function listAssistantWorkflows(
  assistantId: string,
  context: AssistantAccessContext
): Promise<Array<Record<string, unknown>> | ServiceError> {
  const guard = await requireAssistantAccess(assistantId, context)
  if ("status" in guard) return guard

  const rows = await findAssistantWorkflowBindings(assistantId)
  return rows.map((row) => ({
    ...row.workflow,
    enabledForAssistant: row.enabled,
  }))
}

/**
 * Replaces assistant workflow bindings.
 */
export async function setAssistantWorkflows(
  assistantId: string,
  workflowIds: string[],
  context: AssistantAccessContext
): Promise<Array<Record<string, unknown>> | ServiceError> {
  const guard = await requireAssistantAccess(assistantId, context)
  if ("status" in guard) return guard

  await replaceAssistantWorkflowBindings(assistantId, workflowIds)

  const rows = await findAssistantWorkflowBindings(assistantId)
  return rows.map((row) => ({
    id: row.workflow.id,
    name: row.workflow.name,
    description: row.workflow.description,
    status: row.workflow.status,
    mode: row.workflow.mode,
    category: row.workflow.category,
  }))
}

export function isServiceError(value: unknown): value is ServiceError {
  if (typeof value !== "object" || value === null) return false
  const candidate = value as { status?: unknown; error?: unknown }
  return typeof candidate.status === "number" && typeof candidate.error === "string"
}
