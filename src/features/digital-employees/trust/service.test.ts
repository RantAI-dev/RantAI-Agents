import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  demoteDigitalEmployeeTrustLevel,
  getDigitalEmployeeTrustSummary,
  promoteDigitalEmployeeTrustLevel,
} from "./service"
import * as repository from "./repository"

vi.mock("./repository", () => ({
  createDigitalEmployeeAuditLog: vi.fn(),
  createDigitalEmployeeTrustEvent: vi.fn(),
  findDigitalEmployeeTrustContextById: vi.fn(),
  findDigitalEmployeeTrustEventsById: vi.fn(),
  updateDigitalEmployeeAutonomyLevelById: vi.fn(),
}))

describe("digital-employee-trust service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-01-31T00:00:00.000Z"))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("returns 404 when the employee is outside org scope", async () => {
    vi.mocked(repository.findDigitalEmployeeTrustContextById).mockResolvedValue(null)

    const result = await getDigitalEmployeeTrustSummary({
      digitalEmployeeId: "emp_1",
      organizationId: "org_1",
    })

    expect(result).toEqual({ status: 404, error: "Not found" })
  })

  it("computes trust summary from recent events", async () => {
    vi.mocked(repository.findDigitalEmployeeTrustContextById).mockResolvedValue({
      id: "emp_1",
      organizationId: "org_1",
      autonomyLevel: "L2",
    })
    vi.mocked(repository.findDigitalEmployeeTrustEventsById).mockResolvedValue([
      {
        id: "event_1",
        eventType: "run_success",
        weight: 1,
        metadata: null,
        createdAt: new Date("2026-01-30T00:00:00.000Z"),
      },
    ] as never)

    const result = await getDigitalEmployeeTrustSummary({
      digitalEmployeeId: "emp_1",
      organizationId: "org_1",
    })

    expect(result).toMatchObject({
      currentLevel: "L2",
      recentEvents: [
        {
          id: "event_1",
          eventType: "run_success",
        },
      ],
    })
  })

  it("returns 400 when promoting the top level", async () => {
    vi.mocked(repository.findDigitalEmployeeTrustContextById).mockResolvedValue({
      id: "emp_1",
      organizationId: "org_1",
      autonomyLevel: "L4",
    })

    const result = await promoteDigitalEmployeeTrustLevel({
      digitalEmployeeId: "emp_1",
      organizationId: "org_1",
      actorUserId: "user_1",
    })

    expect(result).toEqual({ status: 400, error: "Already at maximum level" })
  })

  it("returns 400 when demoting the bottom level", async () => {
    vi.mocked(repository.findDigitalEmployeeTrustContextById).mockResolvedValue({
      id: "emp_1",
      organizationId: "org_1",
      autonomyLevel: "L1",
    })

    const result = await demoteDigitalEmployeeTrustLevel({
      digitalEmployeeId: "emp_1",
      organizationId: "org_1",
      actorUserId: "user_1",
    })

    expect(result).toEqual({ status: 400, error: "Already at minimum level" })
  })
})
