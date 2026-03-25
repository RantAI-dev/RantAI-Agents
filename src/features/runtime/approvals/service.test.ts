import { beforeEach, describe, expect, it, vi } from "vitest"
import { requestRuntimeApproval } from "./service"
import * as repository from "./repository"

vi.mock("./repository", () => ({
  createRuntimeApproval: vi.fn(),
  pauseRuntimeRun: vi.fn(),
}))

describe("runtime-approvals service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("creates an approval and pauses the run", async () => {
    vi.mocked(repository.createRuntimeApproval).mockResolvedValue({
      id: "approval_1",
      digitalEmployeeId: "employee_1",
      employeeRunId: "run_1",
    } as never)

    const result = await requestRuntimeApproval({
      employeeId: "employee_1",
      runId: "run_1",
      input: {
        requestType: "message_send",
        title: "Approve",
        description: "Desc",
        content: { foo: "bar" },
        options: [{ label: "Approve", value: "approved" }],
        workflowStepId: "step_1",
        expiresInMs: 60000,
        timeoutAction: "reject",
      },
    })

    expect(result).toEqual({
      id: "approval_1",
      digitalEmployeeId: "employee_1",
      employeeRunId: "run_1",
    })
    expect(repository.pauseRuntimeRun).toHaveBeenCalledWith("run_1")
  })

  it("returns a 400 when required fields are missing", async () => {
    const result = await requestRuntimeApproval({
      employeeId: "employee_1",
      runId: "run_1",
      input: {
        requestType: "",
        title: "",
        content: null,
        options: null,
      },
    })

    expect(result).toEqual({
      status: 400,
      error: "Missing required fields",
    })
  })
})
