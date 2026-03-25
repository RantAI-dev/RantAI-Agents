import { classifyActionRisk } from "@/lib/digital-employee/audit"
import {
  createRuntimeAuditLogEntry,
  findRuntimeAuditEmployeeOrganization,
} from "./repository"
import type { RuntimeAuditLogInput } from "./schema"

export interface ServiceError {
  status: number
  error: string
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0
}

/**
 * Persists a runtime audit entry after resolving the employee's organization.
 */
export async function logRuntimeAudit(params: {
  employeeId: string
  input: RuntimeAuditLogInput
  ipAddress?: string | null
}) {
  if (!isNonEmptyString(params.input.action) || !isNonEmptyString(params.input.resource)) {
    return { status: 400, error: "action and resource are required" } as ServiceError
  }

  const employee = await findRuntimeAuditEmployeeOrganization(params.employeeId)
  if (!employee) {
    return { status: 404, error: "Employee not found" }
  }

  await createRuntimeAuditLogEntry({
    organizationId: employee.organizationId,
    employeeId: params.employeeId,
    action: params.input.action,
    resource: params.input.resource,
    detail: (params.input.detail || {}) as Record<string, unknown>,
    ipAddress: params.ipAddress || undefined,
    riskLevel: params.input.riskLevel || classifyActionRisk(params.input.action),
  })

  return { success: true }
}
