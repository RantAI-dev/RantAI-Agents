import { describe, it, expect, vi, beforeEach } from "vitest"

const { findUniqueMock, aggregateMock } = vi.hoisted(() => ({
  findUniqueMock: vi.fn(),
  aggregateMock: vi.fn(),
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: findUniqueMock },
    mediaJob: { aggregate: aggregateMock },
  },
}))

import { enforceMediaLimit, getUsageTodayCents } from "@/features/media/limits"

describe("enforceMediaLimit", () => {
  beforeEach(() => {
    findUniqueMock.mockReset()
    aggregateMock.mockReset()
  })

  it("allows the job when user has no limit set (null)", async () => {
    findUniqueMock.mockResolvedValue({ mediaLimitCentsPerDay: null })
    // No aggregate calls expected when limit is null, but reset is safe

    await expect(
      enforceMediaLimit({ userId: "u1", estimatedCostCents: 9999 })
    ).resolves.toEqual({ allowed: true })
  })

  it("allows when usage + estimate is at limit exactly", async () => {
    findUniqueMock.mockResolvedValue({ mediaLimitCentsPerDay: 1000 })
    aggregateMock.mockResolvedValueOnce({ _sum: { costCents: 700 } })
    aggregateMock.mockResolvedValueOnce({ _sum: { estimatedCostCents: 0 } })

    await expect(
      enforceMediaLimit({ userId: "u1", estimatedCostCents: 300 })
    ).resolves.toEqual({ allowed: true })
  })

  it("rejects when usage + estimate exceeds limit", async () => {
    findUniqueMock.mockResolvedValue({ mediaLimitCentsPerDay: 1000 })
    aggregateMock.mockResolvedValueOnce({ _sum: { costCents: 700 } })
    aggregateMock.mockResolvedValueOnce({ _sum: { estimatedCostCents: 0 } })

    const result = await enforceMediaLimit({
      userId: "u1",
      estimatedCostCents: 400,
    })
    expect(result.allowed).toBe(false)
    if (!result.allowed) {
      expect(result.limitCents).toBe(1000)
      expect(result.usedCents).toBe(700)
      expect(result.requestedCents).toBe(400)
    }
  })

  it("rejects when user does not exist", async () => {
    findUniqueMock.mockResolvedValue(null)

    const result = await enforceMediaLimit({
      userId: "missing",
      estimatedCostCents: 1,
    })
    expect(result.allowed).toBe(false)
  })

  it("getUsageTodayCents returns the aggregated sum or 0", async () => {
    aggregateMock.mockResolvedValueOnce({ _sum: { costCents: 200 } })
    aggregateMock.mockResolvedValueOnce({ _sum: { estimatedCostCents: 50 } })
    expect(await getUsageTodayCents("u1")).toBe(250)

    aggregateMock.mockResolvedValueOnce({ _sum: { costCents: null } })
    aggregateMock.mockResolvedValueOnce({ _sum: { estimatedCostCents: null } })
    expect(await getUsageTodayCents("u1")).toBe(0)
  })

  it("counts RUNNING jobs by their estimated cost (not null costCents)", async () => {
    findUniqueMock.mockResolvedValue({ mediaLimitCentsPerDay: 1000 })
    // First aggregate call (SUCCEEDED) returns 200
    aggregateMock.mockResolvedValueOnce({ _sum: { costCents: 200 } })
    // Second aggregate call (RUNNING) returns 750 in estimatedCostCents
    aggregateMock.mockResolvedValueOnce({ _sum: { estimatedCostCents: 750 } })

    const result = await enforceMediaLimit({
      userId: "u1",
      estimatedCostCents: 100,
    })
    // 200 + 750 + 100 = 1050 > 1000 → reject
    expect(result.allowed).toBe(false)
    if (!result.allowed) {
      expect(result.usedCents).toBe(950) // 200 + 750
    }
  })
})
