import { beforeEach, describe, expect, it, vi } from "vitest"
import { reportRuntimeOnboardingStatus } from "./service"
import * as repository from "./repository"

vi.mock("./repository", () => ({
  findRuntimeOnboardingStatusFile: vi.fn(),
  upsertRuntimeOnboardingStatusFile: vi.fn(),
}))

describe("runtime-onboarding-report service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("writes and counts onboarding progress", async () => {
    vi.mocked(repository.findRuntimeOnboardingStatusFile).mockResolvedValue({
      content: JSON.stringify({
        steps: {
          intro: { status: "completed" },
        },
        startedAt: "2026-01-01T00:00:00.000Z",
      }),
    } as never)

    const result = await reportRuntimeOnboardingStatus({
      employeeId: "employee_1",
      step: "setup",
      status: "completed",
      details: { note: "done" },
    })

    expect(result).toMatchObject({
      completedCount: 2,
      totalSteps: 2,
    })
    expect(repository.upsertRuntimeOnboardingStatusFile).toHaveBeenCalled()
  })

  it("returns 400 for missing required fields", async () => {
    const result = await reportRuntimeOnboardingStatus({
      employeeId: "",
      step: "",
      status: "",
    })

    expect(result).toEqual({ status: 400, error: "Missing required fields" })
  })
})
