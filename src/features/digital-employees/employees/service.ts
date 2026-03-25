import { Prisma } from "@prisma/client"
import { hasPermission, canManageEmployee } from "@/lib/digital-employee/rbac"
import { mapLegacyAutonomy } from "@/lib/digital-employee/trust"
import { exportEmployeeData, purgeEmployeeData } from "@/lib/digital-employee/retention"
import { generateEmployeePackage } from "@/lib/digital-employee/package-generator"
import { logAudit, classifyActionRisk, AUDIT_ACTIONS } from "@/lib/digital-employee/audit"
import {
  DEFAULT_DEPLOYMENT_CONFIG,
  WORKSPACE_FILES,
  type WorkspaceFileContext,
} from "@/lib/digital-employee/types"
import {
  createDashboardDigitalEmployee as createDashboardDigitalEmployeeRecord,
  createDashboardDigitalEmployeeGroup,
  createDashboardDigitalEmployeeWorkspaceFile,
  deleteDashboardDigitalEmployeeById,
  findDashboardDigitalEmployeeApprovals,
  findDashboardDigitalEmployeeAssistantForCreate,
  findDashboardDigitalEmployeeById,
  findDashboardDigitalEmployeeForPermissions,
  findDashboardDigitalEmployeeGroupForCreate,
  findDashboardDigitalEmployeeMemory,
  findDashboardDigitalEmployeeRuns,
  findDashboardDigitalEmployeeVncContext,
  findDashboardDigitalEmployeesByOrganization,
  findDashboardPendingApprovals,
  updateDashboardDigitalEmployeeById,
} from "./repository"
import type {
  DashboardDigitalEmployeeActivityQueryInput,
  DashboardDigitalEmployeeApprovalsQueryInput,
  DashboardDigitalEmployeeCreateInput,
  DashboardDigitalEmployeeMemoryQueryInput,
  DashboardDigitalEmployeePurgeInput,
  DashboardDigitalEmployeeUpdateInput,
} from "./schema"

export interface ServiceError {
  status: number
  error: string
}

export interface DashboardDigitalEmployeeContext {
  organizationId: string | null
  role: string | null
  userId: string
  userEmail?: string | null
  userName?: string | null
}

export interface DashboardDigitalEmployeeActivityEvent {
  id: string
  type: string
  timestamp: string
  data: Record<string, unknown>
}

export function isServiceError(value: unknown): value is ServiceError {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { status?: unknown }).status === "number" &&
    typeof (value as { error?: unknown }).error === "string"
  )
}

type DashboardEmployeeListRow = Awaited<
  ReturnType<typeof findDashboardDigitalEmployeesByOrganization>
>[number]
type DashboardEmployeeDetailRow = NonNullable<
  Awaited<ReturnType<typeof findDashboardDigitalEmployeeById>>
>

function serializeEmployeeRow(employee: {
  totalTokensUsed: bigint | number | string
  runs?: Array<{ status: string; output: unknown }>
  _count?: { approvals?: number }
} & Record<string, unknown>) {
  const { runs: latestRuns = [], _count, totalTokensUsed, ...rest } = employee
  const latestOutput = latestRuns[0]?.output
  let latestOutputPreview: string | null = null
  if (latestOutput != null) {
    const serialized = typeof latestOutput === "string" ? latestOutput : JSON.stringify(latestOutput)
    latestOutputPreview = serialized.length > 120 ? `${serialized.slice(0, 120)}...` : serialized
  }

  return {
    ...rest,
    totalTokensUsed: totalTokensUsed.toString(),
    latestRunStatus: latestRuns[0]?.status ?? null,
    latestOutputPreview,
    pendingApprovalCount: _count?.approvals ?? 0,
  }
}

function serializeDetailedEmployee(employee: {
  totalTokensUsed: bigint | number | string
} & Record<string, unknown>) {
  return {
    ...employee,
    totalTokensUsed: employee.totalTokensUsed.toString(),
  }
}

/**
 * Lists digital employees for the current dashboard scope.
 */
export async function listDashboardDigitalEmployees(params: {
  organizationId: string | null
}): Promise<Array<Record<string, unknown>>> {
  const employees = await findDashboardDigitalEmployeesByOrganization(params.organizationId)
  return employees.map((employee: DashboardEmployeeListRow) =>
    serializeEmployeeRow(employee)
  )
}

/**
 * Creates a digital employee and the initial workspace files.
 */
export async function createDashboardDigitalEmployee(params: {
  context: DashboardDigitalEmployeeContext
  input: DashboardDigitalEmployeeCreateInput
}): Promise<Record<string, unknown> | ServiceError> {
  if (!params.context.organizationId) {
    return { status: 400, error: "Organization required" }
  }

  if (params.context.role && !hasPermission(params.context.role, "employee.create")) {
    return { status: 403, error: "Insufficient permissions" }
  }

  const assistant = await findDashboardDigitalEmployeeAssistantForCreate(
    params.input.assistantId,
    params.context.organizationId
  )
  if (!assistant) {
    return { status: 404, error: "Assistant not found" }
  }

  let resolvedGroupId: string
  if (params.input.groupId) {
    const group = await findDashboardDigitalEmployeeGroupForCreate(
      params.input.groupId,
      params.context.organizationId
    )
    if (!group) {
      return { status: 404, error: "Team not found" }
    }
    resolvedGroupId = group.id
  } else {
    const implicitTeam = await createDashboardDigitalEmployeeGroup({
      name: params.input.name,
      organizationId: params.context.organizationId,
      createdBy: params.context.userId,
    })
    resolvedGroupId = implicitTeam.id
  }

  const employee = await createDashboardDigitalEmployeeRecord({
    name: params.input.name,
    description: params.input.description || null,
    avatar: params.input.avatar || null,
    assistantId: params.input.assistantId,
    groupId: resolvedGroupId,
    autonomyLevel: params.input.autonomyLevel || "L1",
    sandboxMode: (params.input.autonomyLevel || "L1") === "L1",
    deploymentConfig: DEFAULT_DEPLOYMENT_CONFIG as unknown as Prisma.InputJsonValue,
    organizationId: params.context.organizationId,
    createdBy: params.context.userId,
    supervisorId: params.context.userId,
  })

  const workspaceContext: WorkspaceFileContext = {
    employeeName: params.input.name,
    employeeDescription: params.input.description ?? null,
    avatar: params.input.avatar ?? null,
    systemPrompt: assistant.systemPrompt,
    supervisorName: params.context.userName ?? undefined,
    supervisorEmail: params.context.userEmail ?? undefined,
    toolNames: assistant.tools.map((tool) => tool.tool.displayName || tool.tool.name),
    skillNames: assistant.skills.map((skill) => skill.skill.displayName || skill.skill.name),
    workflowNames: assistant.assistantWorkflows.map((entry) => entry.workflow.name),
    schedules: [],
  }

  await Promise.all(
    WORKSPACE_FILES.map(async (fileDef) => {
      const content =
        typeof fileDef.defaultContent === "function"
          ? fileDef.defaultContent(workspaceContext)
          : fileDef.defaultContent
      await createDashboardDigitalEmployeeWorkspaceFile({
        digitalEmployeeId: employee.id,
        filename: fileDef.filename,
        content,
        updatedBy: params.context.userId,
      })
    })
  )

  void logAudit({
    organizationId: params.context.organizationId,
    userId: params.context.userId,
    action: AUDIT_ACTIONS.EMPLOYEE_CREATE,
    resource: `employee:${employee.id}`,
    detail: { name: employee.name },
    riskLevel: classifyActionRisk(AUDIT_ACTIONS.EMPLOYEE_CREATE),
  }).catch(() => {})

  return serializeDetailedEmployee(employee as DashboardEmployeeDetailRow)
}

/**
 * Loads a single digital employee for the dashboard.
 */
export async function getDashboardDigitalEmployee(params: {
  id: string
  organizationId: string | null
}): Promise<Record<string, unknown> | ServiceError> {
  const employee = await findDashboardDigitalEmployeeById(params.id, params.organizationId)
  if (!employee) {
    return { status: 404, error: "Not found" }
  }

  return serializeDetailedEmployee(employee as DashboardEmployeeDetailRow)
}

/**
 * Updates a digital employee in the dashboard.
 */
export async function updateDashboardDigitalEmployee(params: {
  id: string
  context: DashboardDigitalEmployeeContext
  input: DashboardDigitalEmployeeUpdateInput
}): Promise<Record<string, unknown> | ServiceError> {
  const existing = await findDashboardDigitalEmployeeForPermissions(
    params.id,
    params.context.organizationId
  )
  if (!existing) {
    return { status: 404, error: "Not found" }
  }

  if (
    params.context.role &&
    !canManageEmployee(params.context.role, params.context.userId, existing)
  ) {
    return { status: 403, error: "Insufficient permissions" }
  }

  const mappedAutonomy =
    params.input.autonomyLevel !== undefined
      ? mapLegacyAutonomy(params.input.autonomyLevel)
      : undefined

  const employee = await updateDashboardDigitalEmployeeById(params.id, {
    ...(params.input.name !== undefined && { name: params.input.name }),
    ...(params.input.description !== undefined && { description: params.input.description }),
    ...(params.input.avatar !== undefined && { avatar: params.input.avatar }),
    ...(params.input.assistantId !== undefined && { assistantId: params.input.assistantId }),
    ...(mappedAutonomy !== undefined && { autonomyLevel: mappedAutonomy }),
    ...(params.input.status !== undefined && { status: params.input.status }),
    ...(params.input.deploymentConfig !== undefined && {
      deploymentConfig: params.input.deploymentConfig,
    }),
    ...(params.input.resourceLimits !== undefined && {
      resourceLimits: params.input.resourceLimits,
    }),
    ...(params.input.gatewayConfig !== undefined && {
      gatewayConfig: params.input.gatewayConfig,
    }),
    ...(params.input.supervisorId !== undefined && { supervisorId: params.input.supervisorId }),
    ...(params.input.sandboxMode !== undefined && { sandboxMode: params.input.sandboxMode }),
    ...(params.input.groupId !== undefined && { groupId: params.input.groupId || null }),
  })

  if (params.context.organizationId) {
    void logAudit({
      organizationId: params.context.organizationId,
      employeeId: params.id,
      userId: params.context.userId,
      action: AUDIT_ACTIONS.EMPLOYEE_UPDATE,
      resource: `employee:${params.id}`,
      detail: { fields: Object.keys(params.input) },
      riskLevel: classifyActionRisk(AUDIT_ACTIONS.EMPLOYEE_UPDATE),
    }).catch(() => {})
  }

  return serializeDetailedEmployee(employee as DashboardEmployeeDetailRow)
}

/**
 * Deletes a digital employee from the dashboard.
 */
export async function deleteDashboardDigitalEmployee(params: {
  id: string
  context: DashboardDigitalEmployeeContext
}): Promise<{ success: true } | ServiceError> {
  const existing = await findDashboardDigitalEmployeeForPermissions(
    params.id,
    params.context.organizationId
  )
  if (!existing) {
    return { status: 404, error: "Not found" }
  }

  if (
    params.context.role &&
    !hasPermission(params.context.role, "employee.delete")
  ) {
    return { status: 403, error: "Insufficient permissions" }
  }

  await deleteDashboardDigitalEmployeeById(params.id)

  if (params.context.organizationId) {
    void logAudit({
      organizationId: params.context.organizationId,
      employeeId: params.id,
      userId: params.context.userId,
      action: AUDIT_ACTIONS.EMPLOYEE_DELETE,
      resource: `employee:${params.id}`,
      detail: { name: existing.name },
      riskLevel: classifyActionRisk(AUDIT_ACTIONS.EMPLOYEE_DELETE),
    }).catch(() => {})
  }

  return { success: true }
}

/**
 * Lists employees with pending approvals by organization scope.
 */
export async function listPendingDigitalEmployeeApprovals(params: {
  organizationId: string | null
}): Promise<{
  total: number
  byEmployee: Array<{ employeeId: string; name: string; count: number }>
}> {
  const approvals = await findDashboardPendingApprovals(params.organizationId)
  const byEmployee: Record<string, { employeeId: string; name: string; count: number }> = {}

  for (const approval of approvals) {
    if (!byEmployee[approval.digitalEmployeeId]) {
      byEmployee[approval.digitalEmployeeId] = {
        employeeId: approval.digitalEmployeeId,
        name: approval.digitalEmployee.name,
        count: 0,
      }
    }
    byEmployee[approval.digitalEmployeeId].count++
  }

  return {
    total: approvals.length,
    byEmployee: Object.values(byEmployee),
  }
}

/**
 * Builds the dashboard activity feed for one employee.
 */
export async function listDashboardDigitalEmployeeActivity(params: {
  id: string
  organizationId: string | null
  input: DashboardDigitalEmployeeActivityQueryInput
}): Promise<
  | {
      events: DashboardDigitalEmployeeActivityEvent[]
      dailySummary: {
        totalRuns: number
        completed: number
        failed: number
        totalTokens: number
      }
    }
  | ServiceError
> {
  const employee = await findDashboardDigitalEmployeeForPermissions(params.id, params.organizationId)
  if (!employee) {
    return { status: 404, error: "Not found" }
  }

  const limit = Math.min(params.input.limit ?? 50, 100)
  const before = params.input.before ? new Date(params.input.before) : null
  const [runs, approvals] = await Promise.all([
    findDashboardDigitalEmployeeRuns({
      digitalEmployeeId: params.id,
      before,
      take: limit,
    }),
    findDashboardDigitalEmployeeApprovals({
      digitalEmployeeId: params.id,
      status: null,
      take: limit,
    }),
  ])

  type ActivityEvent = DashboardDigitalEmployeeActivityEvent
  const events: ActivityEvent[] = []

  for (const run of runs) {
    events.push({
      id: `run-${run.id}`,
      type:
        run.status === "RUNNING"
          ? "run_started"
          : run.status === "COMPLETED"
            ? "run_completed"
            : "run_failed",
      timestamp: (run.completedAt || run.startedAt).toISOString(),
      data: {
        runId: run.id,
        trigger: run.trigger,
        status: run.status,
        promptTokens: run.promptTokens,
        completionTokens: run.completionTokens,
        executionTimeMs: run.executionTimeMs,
        error: run.error,
        output: run.output,
      },
    })
  }

  for (const approval of approvals) {
    events.push({
      id: `approval-${approval.id}`,
      type: approval.status === "PENDING" ? "approval_requested" : "approval_responded",
      timestamp: (approval.respondedAt || approval.createdAt).toISOString(),
      data: {
        approvalId: approval.id,
        title: approval.title,
        description: approval.description,
        requestType: approval.requestType,
        status: approval.status,
        respondedBy: approval.respondedBy,
        response: approval.response,
      },
    })
  }

  events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const todayRuns = runs.filter((run) => new Date(run.startedAt) >= todayStart)
  return {
    events: events.slice(0, limit),
    dailySummary: {
      totalRuns: todayRuns.length,
      completed: todayRuns.filter((run) => run.status === "COMPLETED").length,
      failed: todayRuns.filter((run) => run.status === "FAILED").length,
      totalTokens: todayRuns.reduce(
        (sum, run) => sum + run.promptTokens + run.completionTokens,
        0
      ),
    },
  }
}

/**
 * Lists approvals for one digital employee.
 */
export async function listDashboardDigitalEmployeeApprovals(params: {
  id: string
  organizationId: string | null
  input: DashboardDigitalEmployeeApprovalsQueryInput
}): Promise<Array<Record<string, unknown>> | ServiceError> {
  const employee = await findDashboardDigitalEmployeeForPermissions(params.id, params.organizationId)
  if (!employee) {
    return { status: 404, error: "Not found" }
  }

  return findDashboardDigitalEmployeeApprovals({
    digitalEmployeeId: params.id,
    status: params.input.status ?? null,
  }) as Promise<Array<Record<string, unknown>>>
}

/**
 * Lists memory entries for one digital employee.
 */
export async function listDashboardDigitalEmployeeMemoryEntries(params: {
  id: string
  organizationId: string | null
  input: DashboardDigitalEmployeeMemoryQueryInput
}): Promise<Array<Record<string, unknown>> | ServiceError> {
  const employee = await findDashboardDigitalEmployeeForPermissions(params.id, params.organizationId)
  if (!employee) {
    return { status: 404, error: "Not found" }
  }

  return findDashboardDigitalEmployeeMemory({
    digitalEmployeeId: params.id,
    type: params.input.type ?? null,
  }) as Promise<Array<Record<string, unknown>>>
}

/**
 * Prepares an export payload for one digital employee.
 */
export async function exportDashboardDigitalEmployeeData(params: {
  id: string
  context: DashboardDigitalEmployeeContext
}): Promise<{ data: Record<string, unknown>; filename: string } | ServiceError> {
  if (!params.context.organizationId) {
    return { status: 400, error: "Organization required" }
  }

  if (!params.context.role || !hasPermission(params.context.role, "employee.delete")) {
    return { status: 403, error: "Insufficient permissions" }
  }

  const employee = await findDashboardDigitalEmployeeForPermissions(
    params.id,
    params.context.organizationId
  )
  if (!employee) {
    return { status: 404, error: "Employee not found" }
  }

  const data = (await exportEmployeeData(params.id)) as Record<string, unknown>
  const safeName = employee.name.replace(/[^a-z0-9]/gi, "-")

  return {
    data,
    filename: `employee-${safeName}-export.json`,
  }
}

/**
 * Builds the generated package for one digital employee.
 */
export async function generateDashboardDigitalEmployeePackage(params: {
  id: string
  organizationId: string | null
}): Promise<Record<string, unknown> | ServiceError> {
  const employee = await findDashboardDigitalEmployeeForPermissions(params.id, params.organizationId)
  if (!employee) {
    return { status: 404, error: "Not found" }
  }

  return (await generateEmployeePackage(params.id)) as unknown as Record<string, unknown>
}

/**
 * Returns the VNC launch URL for one digital employee.
 */
export async function getDashboardDigitalEmployeeVncUrl(params: {
  id: string
  organizationId: string | null
}): Promise<{ url: string } | ServiceError> {
  const employee = await findDashboardDigitalEmployeeVncContext(params.id, params.organizationId)
  if (!employee) {
    return { status: 404, error: "Not found" }
  }

  const noVncPort = employee.group?.noVncPort
  if (!noVncPort) {
    return { status: 503, error: "Container not running" }
  }

  return {
    url: `http://localhost:${noVncPort}/vnc.html?autoconnect=true&resize=scale`,
  }
}

/**
 * Purges all employee data after confirming identity.
 */
export async function purgeDashboardDigitalEmployeeData(params: {
  id: string
  context: DashboardDigitalEmployeeContext
  input: DashboardDigitalEmployeePurgeInput
}): Promise<{ success: true } | ServiceError> {
  if (!params.context.organizationId) {
    return { status: 400, error: "Organization required" }
  }

  if (params.context.role !== "owner") {
    return {
      status: 403,
      error: "Only organization owner can purge employee data",
    }
  }

  const employee = await findDashboardDigitalEmployeeForPermissions(
    params.id,
    params.context.organizationId
  )
  if (!employee) {
    return { status: 404, error: "Employee not found" }
  }

  if (params.input.confirmName !== employee.name) {
    return { status: 400, error: "Name confirmation does not match" }
  }

  await logAudit({
    organizationId: params.context.organizationId,
    employeeId: params.id,
    userId: params.context.userId,
    action: AUDIT_ACTIONS.EMPLOYEE_DELETE,
    resource: `employee:${employee.name}`,
    detail: { purge: true, confirmedBy: params.context.userId },
    riskLevel: classifyActionRisk(AUDIT_ACTIONS.EMPLOYEE_DELETE),
  })

  await purgeEmployeeData(params.id)
  return { success: true }
}
