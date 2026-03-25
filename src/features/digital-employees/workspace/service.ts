import { findWorkspaceEmployee, findWorkspaceGroupById } from "./repository"
import type { WorkspaceExecInput, WorkspaceFileWriteInput } from "./schema"

export interface ServiceError {
  status: number
  error: string
}

export interface WorkspaceAccessContext {
  organizationId: string | null
}

export interface WorkspaceProxyResult {
  status: number
  data: unknown
}

async function proxyWorkspaceRequest(params: {
  employeeId: string
  context: WorkspaceAccessContext
  path: string
  method?: string
  body?: unknown
  timeout?: number
}): Promise<WorkspaceProxyResult | ServiceError> {
  const employee = await findWorkspaceEmployee(
    params.employeeId,
    params.context.organizationId
  )
  if (!employee) {
    return { status: 404, error: "Not found" }
  }

  if (!employee.groupId) {
    return { status: 503, error: "Employee has no team" }
  }

  const group = await findWorkspaceGroupById(employee.groupId)
  if (!group?.containerPort) {
    return { status: 503, error: "Team container not running" }
  }

  const url = `http://localhost:${group.containerPort}${params.path}`
  const fetchOptions: RequestInit = {
    method: params.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(group.gatewayToken ? { Authorization: `Bearer ${group.gatewayToken}` } : {}),
    },
    signal: AbortSignal.timeout(params.timeout ?? 30000),
  }

  if (params.body !== undefined) {
    fetchOptions.body = JSON.stringify(params.body)
  }

  try {
    const response = await fetch(url, fetchOptions)
    const data = await response.json()
    return { status: response.status, data }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gateway request failed"
    return { status: 502, data: { error: message } }
  }
}

/**
 * Executes a shell command in the employee workspace.
 */
export async function executeWorkspaceCommand(params: {
  employeeId: string
  context: WorkspaceAccessContext
  input: WorkspaceExecInput
}): Promise<WorkspaceProxyResult | ServiceError> {
  if (typeof params.input.command !== "string" || !params.input.command) {
    return { status: 400, error: "command is required" }
  }

  return proxyWorkspaceRequest({
    employeeId: params.employeeId,
    context: params.context,
    path: "/workspace/exec",
    method: "POST",
    body: {
      command: params.input.command,
      cwd: params.input.cwd,
    },
    timeout: 35000,
  })
}

/**
 * Lists workspace files through the runtime gateway.
 */
export async function listWorkspaceFiles(params: {
  employeeId: string
  context: WorkspaceAccessContext
  path?: string
  recursive?: boolean
}): Promise<WorkspaceProxyResult | ServiceError> {
  const qs = new URLSearchParams()
  if (params.path) qs.set("path", params.path)
  if (params.recursive) qs.set("recursive", "true")

  return proxyWorkspaceRequest({
    employeeId: params.employeeId,
    context: params.context,
    path: `/workspace/files${qs.toString() ? `?${qs}` : ""}`,
  })
}

/**
 * Deletes a workspace file through the runtime gateway.
 */
export async function deleteWorkspaceFile(params: {
  employeeId: string
  context: WorkspaceAccessContext
  path: string | null
}): Promise<WorkspaceProxyResult | ServiceError> {
  if (!params.path) {
    return { status: 400, error: "path is required" }
  }

  return proxyWorkspaceRequest({
    employeeId: params.employeeId,
    context: params.context,
    path: `/workspace/files?path=${encodeURIComponent(params.path)}`,
    method: "DELETE",
  })
}

/**
 * Reads a workspace file through the runtime gateway.
 */
export async function readWorkspaceFile(params: {
  employeeId: string
  context: WorkspaceAccessContext
  path: string | null
}): Promise<WorkspaceProxyResult | ServiceError> {
  if (!params.path) {
    return { status: 400, error: "path is required" }
  }

  return proxyWorkspaceRequest({
    employeeId: params.employeeId,
    context: params.context,
    path: `/workspace/files/read?path=${encodeURIComponent(params.path)}`,
  })
}

/**
 * Writes a workspace file through the runtime gateway.
 */
export async function writeWorkspaceFile(params: {
  employeeId: string
  context: WorkspaceAccessContext
  input: WorkspaceFileWriteInput
}): Promise<WorkspaceProxyResult | ServiceError> {
  if (!params.input.path || typeof params.input.content !== "string") {
    return { status: 400, error: "path and content are required" }
  }

  return proxyWorkspaceRequest({
    employeeId: params.employeeId,
    context: params.context,
    path: "/workspace/files/write",
    method: "POST",
    body: {
      path: params.input.path,
      content: params.input.content,
    },
  })
}
