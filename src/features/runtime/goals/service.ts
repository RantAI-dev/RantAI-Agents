import { findRuntimeGoalForEmployee, updateRuntimeGoalCurrentValue } from "./repository"

export interface ServiceError {
  status: number
  error: string
}

/**
 * Updates a runtime goal's current value using either a set value or an increment.
 */
export async function updateRuntimeGoal(params: {
  employeeId: string
  goalId: string
  increment?: unknown
  setValue?: unknown
}): Promise<{ id: string; currentValue: number; target: number } | ServiceError> {
  if (!params.goalId) {
    return { status: 400, error: "goalId required" }
  }

  const goal = await findRuntimeGoalForEmployee(params.goalId, params.employeeId)
  if (!goal) {
    return { status: 404, error: "Goal not found" }
  }

  const newValue =
    params.setValue !== undefined
      ? Number(params.setValue)
      : goal.currentValue + (params.increment !== undefined ? Number(params.increment) : 1)

  const updated = await updateRuntimeGoalCurrentValue(params.goalId, newValue)

  return {
    id: updated.id,
    currentValue: updated.currentValue,
    target: updated.target,
  }
}
