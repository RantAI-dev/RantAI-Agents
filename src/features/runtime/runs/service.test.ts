import { beforeEach, describe, expect, it, vi } from "vitest"
import { reportRuntimeRunStatus, submitRuntimeRunOutput } from "./service"
import * as repository from "./repository"

vi.mock("./repository", () => ({
  findRuntimeRun: vi.fn(),
  updateRuntimeEmployeeStats: vi.fn(),
  updateRuntimeRun: vi.fn(),
}))

describe("runtime-runs service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("updates run status and mirrors employee stats on completion", async () => {
    vi.mocked(repository.findRuntimeRun).mockResolvedValue({
      digitalEmployeeId: "employee_1",
    } as never)

    const result = await reportRuntimeRunStatus({
      runId: "run_1",
      input: {
        status: "COMPLETED",
        error: "none",
        executionTimeMs: 1200,
        promptTokens: 10,
        completionTokens: 20,
      },
    })

    expect(result).toEqual({ success: true })
    expect(repository.updateRuntimeRun).toHaveBeenCalledWith(
      "run_1",
      expect.objectContaining({
        status: "COMPLETED",
        error: "none",
        executionTimeMs: 1200,
        promptTokens: 10,
        completionTokens: 20,
        completedAt: expect.any(Date),
      })
    )
    expect(repository.updateRuntimeEmployeeStats).toHaveBeenCalledWith({
      employeeId: "employee_1",
      status: "COMPLETED",
      promptTokens: 10,
      completionTokens: 20,
    })
  })

  it("stores body.output when present, otherwise stores the whole body", async () => {
    const result = await submitRuntimeRunOutput({
      runId: "run_1",
      body: { output: "" },
    })

    expect(result).toEqual({ success: true })
    expect(repository.updateRuntimeRun).toHaveBeenCalledWith("run_1", {
      output: { output: "" },
    })
  })
})
