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
    aggregateMock.mockResolvedValue({ _sum: { costCents: 0 } })

    await expect(
      enforceMediaLimit({ userId: "u1", estimatedCostCents: 9999 })
    ).resolves.toEqual({ allowed: true })
  })

  it("allows when usage + estimate is at limit exactly", async () => {
    findUniqueMock.mockResolvedValue({ mediaLimitCentsPerDay: 1000 })
    aggregateMock.mockResolvedValue({ _sum: { costCents: 700 } })

    await expect(
      enforceMediaLimit({ userId: "u1", estimatedCostCents: 300 })
    ).resolves.toEqual({ allowed: true })
  })

  it("rejects when usage + estimate exceeds limit", async () => {
    findUniqueMock.mockResolvedValue({ mediaLimitCentsPerDay: 1000 })
    aggregateMock.mockResolvedValue({ _sum: { costCents: 700 } })

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
    aggregateMock.mockResolvedValue({ _sum: { costCents: 250 } })
    expect(await getUsageTodayCents("u1")).toBe(250)

    aggregateMock.mockResolvedValue({ _sum: { costCents: null } })
    expect(await getUsageTodayCents("u1")).toBe(0)
  })
})
