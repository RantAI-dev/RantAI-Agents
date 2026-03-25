import {
  findAssistantById,
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

function notFoundOrVoid(assistant: unknown): ServiceError | null {
  return assistant ? null : { status: 404, error: "Assistant not found" }
}

/**
 * Lists assistant tools with binding flags.
 */
export async function listAssistantTools(
  assistantId: string
): Promise<Array<Record<string, unknown>> | ServiceError> {
  const assistant = await findAssistantById(assistantId)
  const missing = notFoundOrVoid(assistant)
  if (missing) return missing

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
  toolIds: string[]
): Promise<Array<Record<string, unknown>> | ServiceError> {
  const assistant = await findAssistantById(assistantId)
  const missing = notFoundOrVoid(assistant)
  if (missing) return missing

  await replaceAssistantToolBindings(assistantId, toolIds)

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
  assistantId: string
): Promise<Array<Record<string, unknown>> | ServiceError> {
  const assistant = await findAssistantById(assistantId)
  const missing = notFoundOrVoid(assistant)
  if (missing) return missing

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
  skillIds: string[]
): Promise<Array<Record<string, unknown>> | ServiceError> {
  const assistant = await findAssistantById(assistantId)
  const missing = notFoundOrVoid(assistant)
  if (missing) return missing

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
  assistantId: string
): Promise<Array<Record<string, unknown>> | ServiceError> {
  const assistant = await findAssistantById(assistantId)
  const missing = notFoundOrVoid(assistant)
  if (missing) return missing

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
  mcpServerIds: string[]
): Promise<Array<Record<string, unknown>> | ServiceError> {
  const assistant = await findAssistantById(assistantId)
  const missing = notFoundOrVoid(assistant)
  if (missing) return missing

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
  assistantId: string
): Promise<Array<Record<string, unknown>> | ServiceError> {
  const assistant = await findAssistantById(assistantId)
  const missing = notFoundOrVoid(assistant)
  if (missing) return missing

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
  workflowIds: string[]
): Promise<Array<Record<string, unknown>> | ServiceError> {
  const assistant = await findAssistantById(assistantId)
  const missing = notFoundOrVoid(assistant)
  if (missing) return missing

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
