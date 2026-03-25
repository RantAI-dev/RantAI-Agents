import { orchestrator } from "@/lib/digital-employee"
import type { EmployeeOrchestrator } from "@/lib/digital-employee/orchestrator"
import { findDigitalEmployeeLifecycleContextById, updateDigitalEmployeeLifecycleById } from "./repository"

export interface ServiceError {
  status: number
  error: string
}

export interface DigitalEmployeeLifecycleDependencies {
  orchestrator?: EmployeeOrchestrator
  getGroupContainerUrl?: (groupId: string) => Promise<string | null>
}

function getLifecycleDependencies(
  deps?: DigitalEmployeeLifecycleDependencies
): Required<DigitalEmployeeLifecycleDependencies> {
  return {
    orchestrator: deps?.orchestrator ?? orchestrator,
    getGroupContainerUrl: deps?.getGroupContainerUrl ?? orchestrator.getGroupContainerUrl.bind(orchestrator),
  }
}

/**
 * Returns the current employee status plus whether the group container is running.
 */
export async function getDigitalEmployeeLifecycleStatus(params: {
  digitalEmployeeId: string
  organizationId: string | null
  deps?: DigitalEmployeeLifecycleDependencies
}): Promise<
  | {
      employeeId: string
      status: string
      containerRunning: boolean
      groupId: string
    }
  | ServiceError
> {
  const employee = await findDigitalEmployeeLifecycleContextById({
    digitalEmployeeId: params.digitalEmployeeId,
    organizationId: params.organizationId,
  })

  if (!employee) {
    return { status: 404, error: "Not found" }
  }

  const dependencies = getLifecycleDependencies(params.deps)
  const containerUrl = await dependencies.getGroupContainerUrl(employee.groupId)

  return {
    employeeId: params.digitalEmployeeId,
    status: employee.status,
    containerRunning: !!containerUrl,
    groupId: employee.groupId,
  }
}

/**
 * Marks the employee as go-live ready and optionally lifts autonomy from L1 to L2.
 */
export async function goLiveDigitalEmployee(params: {
  digitalEmployeeId: string
  organizationId: string | null
}): Promise<
  | {
      success: true
      sandboxMode: boolean
      autonomyLevel: string
    }
  | ServiceError
> {
  const employee = await findDigitalEmployeeLifecycleContextById({
    digitalEmployeeId: params.digitalEmployeeId,
    organizationId: params.organizationId,
  })

  if (!employee) {
    return { status: 404, error: "Not found" }
  }

  const updates: {
    sandboxMode: boolean
    autonomyLevel?: string
    trustScore?: number
  } = { sandboxMode: false }

  if (employee.autonomyLevel === "L1") {
    updates.autonomyLevel = "L2"
    updates.trustScore = Math.max(employee.trustScore, 50)
  }

  const updated = await updateDigitalEmployeeLifecycleById(params.digitalEmployeeId, updates)

  return {
    success: true,
    sandboxMode: updated.sandboxMode,
    autonomyLevel: updated.autonomyLevel,
  }
}

/**
 * Stops the employee group container without changing employee record state.
 */
export async function pauseDigitalEmployee(params: {
  digitalEmployeeId: string
  organizationId: string | null
  deps?: DigitalEmployeeLifecycleDependencies
}): Promise<{ success: true } | ServiceError> {
  const employee = await findDigitalEmployeeLifecycleContextById({
    digitalEmployeeId: params.digitalEmployeeId,
    organizationId: params.organizationId,
  })

  if (!employee) {
    return { status: 404, error: "Not found" }
  }

  const dependencies = getLifecycleDependencies(params.deps)
  await dependencies.orchestrator.stopGroup(employee.groupId)

  return { success: true }
}

/**
 * Starts the employee group container and returns the runtime connection details.
 */
export async function resumeDigitalEmployee(params: {
  digitalEmployeeId: string
  organizationId: string | null
  deps?: DigitalEmployeeLifecycleDependencies
}): Promise<
  | {
      success: true
      containerId: string
      port: number
    }
  | ServiceError
> {
  const employee = await findDigitalEmployeeLifecycleContextById({
    digitalEmployeeId: params.digitalEmployeeId,
    organizationId: params.organizationId,
  })

  if (!employee) {
    return { status: 404, error: "Not found" }
  }

  const dependencies = getLifecycleDependencies(params.deps)
  const { containerId, port } = await dependencies.orchestrator.startGroup(employee.groupId)

  return {
    success: true,
    containerId,
    port,
  }
}

/**
 * Stops the container and marks the employee suspended.
 */
export async function terminateDigitalEmployee(params: {
  digitalEmployeeId: string
  organizationId: string | null
  deps?: DigitalEmployeeLifecycleDependencies
}): Promise<{ success: true } | ServiceError> {
  const employee = await findDigitalEmployeeLifecycleContextById({
    digitalEmployeeId: params.digitalEmployeeId,
    organizationId: params.organizationId,
  })

  if (!employee) {
    return { status: 404, error: "Not found" }
  }

  const dependencies = getLifecycleDependencies(params.deps)
  await dependencies.orchestrator.stopGroup(employee.groupId)

  await updateDigitalEmployeeLifecycleById(params.digitalEmployeeId, {
    status: "SUSPENDED",
  })

  return { success: true }
}
