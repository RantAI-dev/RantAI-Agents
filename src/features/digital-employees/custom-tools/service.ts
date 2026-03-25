import type { CustomToolCreateInput, CustomToolUpdateInput } from "./schema"
import {
  createCustomTool,
  deleteCustomToolById,
  findCustomToolByEmployeeAndToolId,
  findEmployeeForCustomTools,
  listCustomToolsByEmployeeId,
  updateCustomToolById,
} from "./repository"

export interface ServiceError {
  status: number
  error: string
}

export interface CustomToolAccessContext {
  organizationId: string | null
}

/**
 * Lists custom tools visible to one employee.
 */
export async function listCustomToolsForEmployee(params: {
  employeeId: string
  context: CustomToolAccessContext
}) {
  const employee = await findEmployeeForCustomTools(
    params.employeeId,
    params.context.organizationId
  )
  if (!employee) {
    return { status: 404, error: "Not found" } satisfies ServiceError
  }

  return listCustomToolsByEmployeeId(params.employeeId)
}

/**
 * Creates a custom tool for the employee's workspace.
 */
export async function createCustomToolForEmployee(params: {
  employeeId: string
  createdBy: string
  input: CustomToolCreateInput
  context: CustomToolAccessContext
}): Promise<Record<string, unknown> | ServiceError> {
  const employee = await findEmployeeForCustomTools(
    params.employeeId,
    params.context.organizationId
  )
  if (!employee) {
    return { status: 404, error: "Not found" }
  }

  if (!params.input.name || !params.input.code) {
    return { status: 400, error: "Name and code are required" }
  }

  const approved = employee.autonomyLevel === "autonomous"

  const tool = await createCustomTool({
    digitalEmployeeId: params.employeeId,
    name: params.input.name,
    description: params.input.description || null,
    parameters: params.input.parameters || {},
    code: params.input.code,
    language: params.input.language || "javascript",
    approved,
    createdBy: params.createdBy,
  })

  return tool as Record<string, unknown>
}

/**
 * Loads a single custom tool for the employee.
 */
export async function getCustomToolForEmployee(params: {
  employeeId: string
  toolId: string
  context: CustomToolAccessContext
}): Promise<Record<string, unknown> | ServiceError> {
  const employee = await findEmployeeForCustomTools(
    params.employeeId,
    params.context.organizationId
  )
  if (!employee) {
    return { status: 404, error: "Not found" }
  }

  const tool = await findCustomToolByEmployeeAndToolId(
    params.employeeId,
    params.toolId
  )
  if (!tool) {
    return { status: 404, error: "Tool not found" }
  }

  return tool as Record<string, unknown>
}

/**
 * Updates a custom tool without changing the current permissive mutation flow.
 */
export async function updateCustomToolForEmployee(params: {
  employeeId: string
  toolId: string
  input: CustomToolUpdateInput
  context: CustomToolAccessContext
}): Promise<Record<string, unknown> | ServiceError> {
  const employee = await findEmployeeForCustomTools(
    params.employeeId,
    params.context.organizationId
  )
  if (!employee) {
    return { status: 404, error: "Not found" }
  }

  const tool = await updateCustomToolById(params.toolId, {
    ...(params.input.name !== undefined && { name: params.input.name }),
    ...(params.input.description !== undefined && {
      description: params.input.description,
    }),
    ...(params.input.parameters !== undefined && {
      parameters: params.input.parameters,
    }),
    ...(params.input.code !== undefined && { code: params.input.code }),
    ...(params.input.language !== undefined && { language: params.input.language }),
    ...(params.input.enabled !== undefined && { enabled: params.input.enabled }),
    ...(params.input.approved !== undefined && { approved: params.input.approved }),
  })

  return tool as Record<string, unknown>
}

/**
 * Deletes a custom tool while keeping the current response contract.
 */
export async function deleteCustomToolForEmployee(params: {
  employeeId: string
  toolId: string
  context: CustomToolAccessContext
}): Promise<{ success: true } | ServiceError> {
  const employee = await findEmployeeForCustomTools(
    params.employeeId,
    params.context.organizationId
  )
  if (!employee) {
    return { status: 404, error: "Not found" }
  }

  await deleteCustomToolById(params.toolId)
  return { success: true }
}
