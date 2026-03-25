import { computeGoalProgress, resetGoalsForNewPeriod } from "@/lib/digital-employee/goals"
import {
  createDigitalEmployeeGoal,
  deleteDigitalEmployeeGoalById,
  findDigitalEmployeeGoalsById,
  findDigitalEmployeeGoalsContextById,
  resetDigitalEmployeeGoalsById,
  updateDigitalEmployeeGoalById,
} from "./repository"

export interface ServiceError {
  status: number
  error: string
}

export interface CreateDigitalEmployeeGoalInput {
  name?: string
  type?: string
  target?: unknown
  unit?: string
  period?: string
  source?: string
  autoTrackConfig?: unknown
}

export interface UpdateDigitalEmployeeGoalInput {
  name?: string
  target?: unknown
  unit?: string
  period?: string
  currentValue?: unknown
  status?: string
}

function hasRequiredCreateFields(input: CreateDigitalEmployeeGoalInput): boolean {
  return !!input.name && !!input.type && input.target != null && !!input.unit && !!input.period
}

/**
 * Lists active goals for a digital employee and applies any period resets.
 */
export async function listDigitalEmployeeGoals(params: {
  digitalEmployeeId: string
  organizationId: string | null
}): Promise<unknown[] | ServiceError> {
  const employee = await findDigitalEmployeeGoalsContextById({
    digitalEmployeeId: params.digitalEmployeeId,
    organizationId: params.organizationId,
  })

  if (!employee) {
    return { status: 404, error: "Not found" }
  }

  const goals = await findDigitalEmployeeGoalsById(params.digitalEmployeeId)
  const resetIds = resetGoalsForNewPeriod(goals)

  if (resetIds.length > 0) {
    await resetDigitalEmployeeGoalsById(resetIds)
  }

  return goals.map((goal) => {
    const currentValue = resetIds.includes(goal.id) ? 0 : goal.currentValue
    return {
      ...goal,
      currentValue,
      ...computeGoalProgress({
        type: goal.type,
        currentValue,
        target: goal.target,
      }),
    }
  })
}

/**
 * Creates a new active goal for the employee.
 */
export async function createDigitalEmployeeGoalForEmployee(params: {
  digitalEmployeeId: string
  organizationId: string | null
  input: CreateDigitalEmployeeGoalInput
}): Promise<unknown | ServiceError> {
  const employee = await findDigitalEmployeeGoalsContextById({
    digitalEmployeeId: params.digitalEmployeeId,
    organizationId: params.organizationId,
  })

  if (!employee) {
    return { status: 404, error: "Not found" }
  }

  if (!hasRequiredCreateFields(params.input)) {
    return { status: 400, error: "Missing required fields" }
  }

  return createDigitalEmployeeGoal({
    digitalEmployeeId: params.digitalEmployeeId,
    name: params.input.name!,
    type: params.input.type!,
    target: Number(params.input.target),
    unit: params.input.unit!,
    period: params.input.period!,
    source: params.input.source || "manual",
    autoTrackConfig: params.input.autoTrackConfig || undefined,
  })
}

/**
 * Updates an existing goal by id after verifying the employee exists in scope.
 */
export async function updateDigitalEmployeeGoalForEmployee(params: {
  digitalEmployeeId: string
  organizationId: string | null
  goalId: string
  input: UpdateDigitalEmployeeGoalInput
}): Promise<unknown | ServiceError> {
  const employee = await findDigitalEmployeeGoalsContextById({
    digitalEmployeeId: params.digitalEmployeeId,
    organizationId: params.organizationId,
  })

  if (!employee) {
    return { status: 404, error: "Not found" }
  }

  return updateDigitalEmployeeGoalById(params.goalId, {
    ...(params.input.name !== undefined && { name: params.input.name }),
    ...(params.input.target !== undefined && { target: Number(params.input.target) }),
    ...(params.input.unit !== undefined && { unit: params.input.unit }),
    ...(params.input.period !== undefined && { period: params.input.period }),
    ...(params.input.currentValue !== undefined && {
      currentValue: Number(params.input.currentValue),
    }),
    ...(params.input.status !== undefined && { status: params.input.status }),
  })
}

/**
 * Deletes a goal by id after verifying the employee exists in scope.
 */
export async function deleteDigitalEmployeeGoalForEmployee(params: {
  digitalEmployeeId: string
  organizationId: string | null
  goalId: string
}): Promise<{ success: true } | ServiceError> {
  const employee = await findDigitalEmployeeGoalsContextById({
    digitalEmployeeId: params.digitalEmployeeId,
    organizationId: params.organizationId,
  })

  if (!employee) {
    return { status: 404, error: "Not found" }
  }

  await deleteDigitalEmployeeGoalById(params.goalId)
  return { success: true }
}
