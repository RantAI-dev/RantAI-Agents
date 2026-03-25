import type { EmployeeFileUpdateInput, EmployeeFilesSyncInput } from "./schema"
import {
  findEmployeeFileByName,
  findEmployeeForFiles,
  listEmployeeFilesByEmployeeId,
  syncEmployeeFiles,
  upsertEmployeeFile,
} from "./repository"

export interface ServiceError {
  status: number
  error: string
}

export interface EmployeeFilesAccessContext {
  organizationId: string | null
}

/**
 * Lists persisted workspace files for an employee.
 */
export async function listEmployeeFiles(params: {
  employeeId: string
  context: EmployeeFilesAccessContext
}) {
  const employee = await findEmployeeForFiles(
    params.employeeId,
    params.context.organizationId
  )
  if (!employee) {
    return { status: 404, error: "Not found" } satisfies ServiceError
  }

  return listEmployeeFilesByEmployeeId(params.employeeId)
}

/**
 * Syncs a batch of workspace files from the runtime.
 */
export async function syncEmployeeFilesForEmployee(params: {
  employeeId: string
  updatedBy: string
  input: EmployeeFilesSyncInput
  context: EmployeeFilesAccessContext
}): Promise<Record<string, unknown>[] | ServiceError> {
  const employee = await findEmployeeForFiles(
    params.employeeId,
    params.context.organizationId
  )
  if (!employee) {
    return { status: 404, error: "Not found" }
  }

  if (!Array.isArray(params.input.files)) {
    return { status: 400, error: "files array required" }
  }

  return syncEmployeeFiles(params.input.files, params.employeeId, params.updatedBy)
}

/**
 * Loads a single workspace file by filename.
 */
export async function getEmployeeFile(params: {
  employeeId: string
  filename: string
  context: EmployeeFilesAccessContext
}): Promise<Record<string, unknown> | ServiceError> {
  const employee = await findEmployeeForFiles(
    params.employeeId,
    params.context.organizationId
  )
  if (!employee) {
    return { status: 404, error: "Not found" }
  }

  const file = await findEmployeeFileByName(params.employeeId, params.filename)
  if (!file) {
    return { status: 404, error: "File not found" }
  }

  return file as Record<string, unknown>
}

/**
 * Upserts a single workspace file without adding new permissions.
 */
export async function updateEmployeeFile(params: {
  employeeId: string
  filename: string
  updatedBy: string
  input: EmployeeFileUpdateInput
  context: EmployeeFilesAccessContext
}): Promise<Record<string, unknown> | ServiceError> {
  const employee = await findEmployeeForFiles(
    params.employeeId,
    params.context.organizationId
  )
  if (!employee) {
    return { status: 404, error: "Not found" }
  }

  const file = await upsertEmployeeFile(
    params.employeeId,
    params.filename,
    params.input.content as string,
    params.updatedBy
  )

  return file as Record<string, unknown>
}
