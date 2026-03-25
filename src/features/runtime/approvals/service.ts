import { createRuntimeApproval, pauseRuntimeRun } from "./repository"
import type { RuntimeApprovalInput } from "./schema"

export interface ServiceError {
  status: number
  error: string
}

/**
 * Creates a runtime approval request and pauses the active run.
 */
export async function requestRuntimeApproval(params: {
  employeeId: string
  runId: string
  input: RuntimeApprovalInput
}) {
  const { requestType, title, description, content, options, workflowStepId, expiresInMs, timeoutAction } =
    params.input

  if (!requestType || !title || !content || !options) {
    return { status: 400, error: "Missing required fields" } as ServiceError
  }

  const approval = await createRuntimeApproval({
    digitalEmployeeId: params.employeeId,
    employeeRunId: params.runId,
    workflowStepId: workflowStepId || null,
    requestType: String(requestType),
    title: String(title),
    description: description ? String(description) : null,
    content,
    options,
    timeoutAction: timeoutAction || null,
    expiresAt: expiresInMs ? new Date(Date.now() + expiresInMs) : null,
  })

  await pauseRuntimeRun(params.runId)

  return approval
}
