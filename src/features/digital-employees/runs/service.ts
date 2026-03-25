import { orchestrator } from "@/lib/digital-employee"
import {
  findDigitalEmployeeGroupGatewayTokenById,
  findDigitalEmployeeRunById,
  findDigitalEmployeeRunContextById,
  findDigitalEmployeeRunsById,
} from "./repository"

export interface ServiceError {
  status: number
  error: string
}

export interface TriggerDigitalEmployeeRunInput {
  trigger?: string
  workflowId?: string
  input?: unknown
}

export interface DigitalEmployeeRunServiceDependencies {
  getGroupContainerUrl?: (groupId: string) => Promise<string | null>
  fetch?: typeof fetch
}

function getRunServiceDependencies(
  deps?: DigitalEmployeeRunServiceDependencies
): Required<DigitalEmployeeRunServiceDependencies> {
  return {
    getGroupContainerUrl: deps?.getGroupContainerUrl ?? orchestrator.getGroupContainerUrl.bind(orchestrator),
    fetch: deps?.fetch ?? globalThis.fetch,
  }
}

/**
 * Lists recent runs for a digital employee after verifying organization scope.
 */
export async function listDigitalEmployeeRuns(params: {
  digitalEmployeeId: string
  organizationId: string | null
  limit: number
}): Promise<unknown[] | ServiceError> {
  const employee = await findDigitalEmployeeRunContextById({
    digitalEmployeeId: params.digitalEmployeeId,
    organizationId: params.organizationId,
  })

  if (!employee) {
    return { status: 404, error: "Not found" }
  }

  return findDigitalEmployeeRunsById({
    digitalEmployeeId: params.digitalEmployeeId,
    limit: params.limit,
  })
}

/**
 * Fetches a single run for a digital employee after verifying organization scope.
 */
export async function getDigitalEmployeeRun(params: {
  digitalEmployeeId: string
  organizationId: string | null
  runId: string
}): Promise<unknown | ServiceError> {
  const employee = await findDigitalEmployeeRunContextById({
    digitalEmployeeId: params.digitalEmployeeId,
    organizationId: params.organizationId,
  })

  if (!employee) {
    return { status: 404, error: "Not found" }
  }

  const run = await findDigitalEmployeeRunById({
    digitalEmployeeId: params.digitalEmployeeId,
    runId: params.runId,
  })

  if (!run) {
    return { status: 404, error: "Run not found" }
  }

  return run
}

/**
 * Triggers a new employee run through the group container trigger endpoint.
 */
export async function triggerDigitalEmployeeRun(params: {
  digitalEmployeeId: string
  organizationId: string | null
  input: TriggerDigitalEmployeeRunInput
  deps?: DigitalEmployeeRunServiceDependencies
}): Promise<{ runId: string } | ServiceError> {
  const employee = await findDigitalEmployeeRunContextById({
    digitalEmployeeId: params.digitalEmployeeId,
    organizationId: params.organizationId,
  })

  if (!employee) {
    return { status: 404, error: "Not found" }
  }

  if (employee.status !== "ACTIVE") {
    return { status: 400, error: "Employee must be ACTIVE to run" }
  }

  const dependencies = getRunServiceDependencies(params.deps)
  const containerUrl = await dependencies.getGroupContainerUrl(employee.groupId)
  if (!containerUrl) {
    return { status: 503, error: "Group container not running" }
  }

  const group = await findDigitalEmployeeGroupGatewayTokenById(employee.groupId)
  const trigger = {
    type: params.input.trigger || "manual",
    workflowId: params.input.workflowId,
    input: params.input.input,
  }

  const response = await dependencies.fetch(`${containerUrl}/trigger`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(group?.gatewayToken ? { Authorization: `Bearer ${group.gatewayToken}` } : {}),
    },
    body: JSON.stringify({
      employeeId: params.digitalEmployeeId,
      trigger,
    }),
    signal: AbortSignal.timeout(30_000),
  })

  const result = await response.json().catch(() => ({} as { error?: string; runId?: string }))
  if (!response.ok) {
    return {
      status: response.status,
      error: result.error || "Run failed",
    }
  }

  return { runId: result.runId }
}
