import { findRuntimeRun, updateRuntimeEmployeeStats, updateRuntimeRun } from "./repository"
import type { RuntimeRunOutputInput, RuntimeRunStatusInput } from "./schema"

export interface ServiceError {
  status: number
  error: string
}

function resolveRuntimeOutput(body: RuntimeRunOutputInput): unknown {
  if (body && typeof body === "object") {
    const candidate = body as { output?: unknown }
    if ("output" in candidate) {
      return candidate.output || body
    }
  }

  return body
}

/**
 * Persists the latest execution state for a runtime run and mirrors employee stats.
 */
export async function reportRuntimeRunStatus(params: {
  runId: string
  input: RuntimeRunStatusInput
}): Promise<{ success: true } | ServiceError> {
  const updateData: Record<string, unknown> = {}
  if (params.input.status) updateData.status = params.input.status
  if (params.input.error) updateData.error = params.input.error
  if (params.input.executionTimeMs) updateData.executionTimeMs = params.input.executionTimeMs
  if (params.input.promptTokens) updateData.promptTokens = params.input.promptTokens
  if (params.input.completionTokens) updateData.completionTokens = params.input.completionTokens
  if (params.input.status === "COMPLETED" || params.input.status === "FAILED") {
    updateData.completedAt = new Date()
  }

  await updateRuntimeRun(params.runId, updateData)

  const run = await findRuntimeRun(params.runId)
  if (run && (params.input.status === "COMPLETED" || params.input.status === "FAILED")) {
    await updateRuntimeEmployeeStats({
      employeeId: run.digitalEmployeeId,
      status: params.input.status,
      promptTokens: params.input.promptTokens,
      completionTokens: params.input.completionTokens,
    })
  }

  return { success: true }
}

/**
 * Stores runtime run output using the legacy `output || body` behavior.
 */
export async function submitRuntimeRunOutput(params: {
  runId: string
  body: RuntimeRunOutputInput
}): Promise<{ success: true } | ServiceError> {
  await updateRuntimeRun(params.runId, {
    output: resolveRuntimeOutput(params.body),
  })

  return { success: true }
}
