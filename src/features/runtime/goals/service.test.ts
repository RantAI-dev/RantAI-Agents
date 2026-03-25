import { beforeEach, describe, expect, it, vi } from "vitest"
import { updateRuntimeGoal } from "./service"
import * as repository from "./repository"

vi.mock("./repository", () => ({
  findRuntimeGoalForEmployee: vi.fn(),
  updateRuntimeGoalCurrentValue: vi.fn(),
}))

describe("runtime-goals service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns 400 when goalId is missing", async () => {
    const result = await updateRuntimeGoal({
      employeeId: "emp_1",
      goalId: "",
    })

    expect(result).toEqual({ status: 400, error: "goalId required" })
  })

  it("returns 404 when the goal does not belong to the employee", async () => {
    vi.mocked(repository.findRuntimeGoalForEmployee).mockResolvedValue(null)

    const result = await updateRuntimeGoal({
      employeeId: "emp_1",
      goalId: "goal_1",
    })

    expect(result).toEqual({ status: 404, error: "Goal not found" })
  })

  it("applies the default increment when no value is supplied", async () => {
    vi.mocked(repository.findRuntimeGoalForEmployee).mockResolvedValue({
      id: "goal_1",
      digitalEmployeeId: "emp_1",
      currentValue: 2,
      target: 10,
    } as never)
    vi.mocked(repository.updateRuntimeGoalCurrentValue).mockResolvedValue({
      id: "goal_1",
      currentValue: 3,
      target: 10,
    } as never)

    const result = await updateRuntimeGoal({
      employeeId: "emp_1",
      goalId: "goal_1",
    })

    expect(result).toEqual({ id: "goal_1", currentValue: 3, target: 10 })
  })
})
