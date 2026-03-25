import { findRuntimeOnboardingStatusFile, upsertRuntimeOnboardingStatusFile } from "./repository"
import type { RuntimeOnboardingReportInput } from "./schema"

export interface ServiceError {
  status: number
  error: string
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0
}

/**
 * Writes the runtime onboarding status snapshot into the employee file store.
 */
export async function reportRuntimeOnboardingStatus(
  input: RuntimeOnboardingReportInput
): Promise<Record<string, unknown> | ServiceError> {
  if (!isNonEmptyString(input.employeeId) || !isNonEmptyString(input.step) || !isNonEmptyString(input.status)) {
    return { status: 400, error: "Missing required fields" }
  }

  const existing = await findRuntimeOnboardingStatusFile(input.employeeId)
  const current = existing ? JSON.parse(existing.content) : { steps: {}, startedAt: new Date().toISOString() }

  current.steps[input.step] = {
    status: input.status,
    details: input.details || null,
    updatedAt: new Date().toISOString(),
  }

  const stepValues = Object.values(current.steps) as Array<{ status: string }>
  current.completedCount = stepValues.filter((step) => step.status === "completed").length
  current.totalSteps = stepValues.length

  await upsertRuntimeOnboardingStatusFile({
    employeeId: input.employeeId,
    content: JSON.stringify(current, null, 2),
  })

  return current
}
