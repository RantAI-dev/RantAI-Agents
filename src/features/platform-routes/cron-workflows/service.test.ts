import { beforeEach, describe, expect, it, vi } from "vitest"
import * as repository from "./repository"
import { matchesCron, runWorkflowCron } from "./service"

vi.mock("./repository", () => ({
  deleteExpiredUserMemories: vi.fn(),
  findActiveWorkflows: vi.fn(),
}))

describe("cron workflows service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns unauthorized in production when CRON_SECRET is missing", async () => {
    const result = await runWorkflowCron({ nodeEnv: "production" }, {})
    expect(result).toEqual({ status: 401, error: "CRON_SECRET not configured" })
  })

  it("returns no scheduled workflow message when none are due", async () => {
    vi.mocked(repository.deleteExpiredUserMemories).mockResolvedValue({ count: 2 } as never)
    vi.mocked(repository.findActiveWorkflows).mockResolvedValue([
      { id: "wf_1", name: "No schedule", trigger: { type: "manual" } },
    ] as never)

    const result = await runWorkflowCron({
      authorizationHeader: "Bearer s",
      cronSecret: "s",
      now: new Date("2026-03-23T12:30:00.000Z"),
    })

    expect(result).toEqual({
      executed: 0,
      expiredMemoryCount: 2,
      message: "No scheduled workflows",
    })
  })

  it("executes matching scheduled workflows", async () => {
    vi.mocked(repository.deleteExpiredUserMemories).mockResolvedValue({ count: 0 } as never)
    vi.mocked(repository.findActiveWorkflows).mockResolvedValue([
      {
        id: "wf_1",
        name: "Minute",
        trigger: { type: "schedule", schedule: "30 12 * * *" },
      },
      {
        id: "wf_2",
        name: "Skip",
        trigger: { type: "schedule", schedule: "0 0 * * *" },
      },
    ] as never)

    const executeWorkflow = vi.fn(async () => "run_1")
    const now = new Date("2026-03-23T12:30:00.000Z")

    const result = await runWorkflowCron(
      {
        authorizationHeader: "Bearer s",
        cronSecret: "s",
        now,
      },
      { executeWorkflow }
    )

    expect(executeWorkflow).toHaveBeenCalledTimes(1)
    expect(result).toEqual({
      executed: 1,
      expiredMemoryCount: 0,
      results: [{ workflowId: "wf_1", name: "Minute", runId: "run_1" }],
      checkedAt: now.toISOString(),
    })
  })
})

describe("matchesCron", () => {
  it("supports wildcard and exact values", () => {
    const date = new Date("2026-03-23T12:30:00.000Z")
    expect(matchesCron("30 12 * * *", date)).toBe(true)
    expect(matchesCron("0 12 * * *", date)).toBe(false)
  })

  it("supports step, list, and range", () => {
    const date = new Date("2026-03-23T12:30:00.000Z")
    expect(matchesCron("*/15 12 * * *", date)).toBe(true)
    expect(matchesCron("0,30 12 * * *", date)).toBe(true)
    expect(matchesCron("25-35 12 * * *", date)).toBe(true)
  })
})
