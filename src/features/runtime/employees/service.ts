import {
  findRuntimeEmployeeDeploymentConfig,
  findRuntimeEmployeeFile,
  findRuntimeEmployeeMemory,
  findRuntimeEmployeeOrganization,
  listRuntimeEmployeesByOrganization,
  markRuntimeEmployeeActive,
  createRuntimeEmployeeFile,
  createRuntimeEmployeeMemory,
  updateRuntimeEmployeeDeploymentConfig,
  updateRuntimeEmployeeFile,
  updateRuntimeEmployeeMemory,
} from "./repository"
import type { RuntimeEmployeeSyncInput } from "./schema"

export interface ServiceError {
  status: number
  error: string
}

type RuntimeEmployeeChange = {
  path: string
  content: string
  type: "workspace" | "memory" | "schedules"
}

function parseRuntimeEmployeeChanges(input: unknown): RuntimeEmployeeChange[] {
  return Array.isArray(input) ? (input as RuntimeEmployeeChange[]) : (input as RuntimeEmployeeChange[])
}

/**
 * Lists coworkers in the same organization as the calling runtime employee.
 */
export async function listRuntimeEmployees(employeeId: string): Promise<
  | Array<{
      id: string
      name: string
      description: string | null
      avatar: string | null
      status: string
      autonomyLevel: string
    }>
  | ServiceError
> {
  const caller = await findRuntimeEmployeeOrganization(employeeId)
  if (!caller) {
    return { status: 404, error: "Employee not found" }
  }

  return listRuntimeEmployeesByOrganization({
    employeeId,
    organizationId: caller.organizationId,
  })
}

/**
 * Applies runtime workspace, memory, and schedule sync updates for an employee.
 */
export async function syncRuntimeEmployeeFiles(params: {
  employeeId: string
  updatedBy: string
  input: RuntimeEmployeeSyncInput
}): Promise<{ ok: true; synced: number } | ServiceError> {
  const changes = parseRuntimeEmployeeChanges(params.input.changes ?? [])

  for (const change of changes) {
    if (change.type === "workspace") {
      const existing = await findRuntimeEmployeeFile(params.employeeId, change.path)
      if (existing) {
        await updateRuntimeEmployeeFile(existing.id, {
          content: change.content,
          updatedBy: params.updatedBy,
        })
      } else {
        await createRuntimeEmployeeFile({
          digitalEmployeeId: params.employeeId,
          filename: change.path,
          content: change.content,
          updatedBy: params.updatedBy,
        })
      }
      continue
    }

    if (change.type === "memory") {
      const dateMatch = change.path.match(/^(\d{4}-\d{2}-\d{2})\.md$/)
      const date = dateMatch ? dateMatch[1] : change.path
      const existing = await findRuntimeEmployeeMemory(params.employeeId, "daily", date)

      if (existing) {
        await updateRuntimeEmployeeMemory(existing.id, {
          content: change.content,
        })
      } else {
        await createRuntimeEmployeeMemory({
          digitalEmployeeId: params.employeeId,
          type: "daily",
          date,
          content: change.content,
          embedding: [],
        })
      }
      continue
    }

    if (change.type === "schedules") {
      try {
        const cronSchedules = JSON.parse(change.content)
        if (!Array.isArray(cronSchedules)) continue

        const employee = await findRuntimeEmployeeDeploymentConfig(params.employeeId)
        const config = (employee?.deploymentConfig as Record<string, unknown>) ?? {}
        const existingSchedules = Array.isArray(config.schedules)
          ? (config.schedules as Array<{ id: string; [key: string]: unknown }>)
          : []

        const cronIds = new Set(cronSchedules.map((s: { id: string }) => s.id))
        const manualSchedules = existingSchedules.filter((s) => !cronIds.has(s.id))
        const mergedSchedules = [...manualSchedules, ...cronSchedules]

        await updateRuntimeEmployeeDeploymentConfig(params.employeeId, {
          ...config,
          schedules: mergedSchedules,
        })
      } catch (parseErr) {
        console.error("[Sync] Failed to parse cron schedules:", parseErr)
      }
    }
  }

  return { ok: true, synced: changes.length }
}

/**
 * Updates the runtime employee heartbeat timestamp and returns 404 when the record is missing.
 */
export async function heartbeatRuntimeEmployee(employeeId: string): Promise<{ ok: true } | ServiceError> {
  const result = await markRuntimeEmployeeActive(employeeId)
  if (result.count === 0) {
    return { status: 404, error: "Employee not found" }
  }

  return { ok: true }
}
