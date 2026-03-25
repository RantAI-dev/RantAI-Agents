import { hasPermission } from "@/lib/digital-employee/rbac"
import { findDashboardAuditLogs } from "./repository"
import type { DashboardAuditQueryInput } from "./schema"

export interface ServiceError {
  status: number
  error: string
}

export interface DashboardAuditAccessContext {
  organizationId: string
  role: string | null
}

/**
 * Queries dashboard audit logs for the current organization.
 */
export async function listDashboardAuditLogs(params: {
  context: DashboardAuditAccessContext
  input: DashboardAuditQueryInput
}): Promise<
  | {
      items: unknown[]
      nextCursor: string | null
      hasMore: boolean
    }
  | ServiceError
> {
  if (params.context.role && !hasPermission(params.context.role, "audit.read")) {
    return { status: 403, error: "Insufficient permissions" }
  }

  const where: Record<string, unknown> = {
    organizationId: params.context.organizationId,
  }

  if (params.input.employeeId) where.employeeId = params.input.employeeId
  if (params.input.action) where.action = params.input.action
  if (params.input.riskLevel) where.riskLevel = params.input.riskLevel

  if (params.input.from || params.input.to) {
    const createdAt: Record<string, Date> = {}
    if (params.input.from) createdAt.gte = new Date(params.input.from)
    if (params.input.to) createdAt.lte = new Date(params.input.to)
    where.createdAt = createdAt
  }

  const limit = Math.min(parseInt(params.input.limit || "50", 10), 100)
  const logs = await findDashboardAuditLogs({
    where,
    cursor: params.input.cursor || null,
    take: limit + 1,
  })

  const hasMore = logs.length > limit
  if (hasMore) logs.pop()

  const nextCursor = hasMore && logs.length > 0 ? (logs[logs.length - 1] as { id: string }).id : null

  return {
    items: logs,
    nextCursor,
    hasMore,
  }
}
