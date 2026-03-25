import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  createDigitalEmployeeGoalForEmployee,
  deleteDigitalEmployeeGoalForEmployee,
  listDigitalEmployeeGoals,
  updateDigitalEmployeeGoalForEmployee,
} from "./service"
import * as repository from "./repository"

vi.mock("./repository", () => ({
  createDigitalEmployeeGoal: vi.fn(),
  deleteDigitalEmployeeGoalById: vi.fn(),
  findDigitalEmployeeGoalsById: vi.fn(),
  findDigitalEmployeeGoalsContextById: vi.fn(),
  resetDigitalEmployeeGoalsById: vi.fn(),
  updateDigitalEmployeeGoalById: vi.fn(),
}))

describe("digital-employee-goals service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-01-31T00:00:00.000Z"))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("returns 404 when the employee is outside org scope", async () => {
    vi.mocked(repository.findDigitalEmployeeGoalsContextById).mockResolvedValue(null)

    const result = await listDigitalEmployeeGoals({
      digitalEmployeeId: "emp_1",
      organizationId: "org_1",
    })

    expect(result).toEqual({ status: 404, error: "Not found" })
  })

  it("resets goals for a new period before returning progress", async () => {
    vi.mocked(repository.findDigitalEmployeeGoalsContextById).mockResolvedValue({
      id: "emp_1",
    })
    vi.mocked(repository.findDigitalEmployeeGoalsById).mockResolvedValue([
      {
        id: "goal_1",
        digitalEmployeeId: "emp_1",
        name: "Daily goal",
        type: "counter",
        target: 10,
        unit: "tickets",
        period: "daily",
        currentValue: 4,
        source: "manual",
        autoTrackConfig: null,
        status: "active",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    ] as never)

    const result = await listDigitalEmployeeGoals({
      digitalEmployeeId: "emp_1",
      organizationId: "org_1",
    })

    expect(repository.resetDigitalEmployeeGoalsById).toHaveBeenCalledWith(["goal_1"])
    expect(result).toEqual([
      expect.objectContaining({
        id: "goal_1",
        currentValue: 0,
      }),
    ])
  })

  it("returns 400 when creating a goal without required fields", async () => {
    vi.mocked(repository.findDigitalEmployeeGoalsContextById).mockResolvedValue({
      id: "emp_1",
    })

    const result = await createDigitalEmployeeGoalForEmployee({
      digitalEmployeeId: "emp_1",
      organizationId: "org_1",
      input: {
        name: "Missing fields",
      },
    })

    expect(result).toEqual({ status: 400, error: "Missing required fields" })
  })

  it("returns success when deleting a scoped goal", async () => {
    vi.mocked(repository.findDigitalEmployeeGoalsContextById).mockResolvedValue({
      id: "emp_1",
    })

    const result = await deleteDigitalEmployeeGoalForEmployee({
      digitalEmployeeId: "emp_1",
      organizationId: "org_1",
      goalId: "goal_1",
    })

    expect(result).toEqual({ success: true })
  })
})
