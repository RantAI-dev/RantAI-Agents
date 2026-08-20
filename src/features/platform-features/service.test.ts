import { beforeEach, describe, expect, it, vi } from "vitest"
import { getDashboardFeatures } from "./service"
import * as repository from "./repository"

vi.mock("./repository", () => ({
  findDashboardFeatureConfigs: vi.fn(),
}))

describe("dashboard-features service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("defaults a feature to enabled when no config row exists", async () => {
    vi.mocked(repository.findDashboardFeatureConfigs).mockResolvedValue([])

    const features = await getDashboardFeatures()

    // Assert the rule, not the current feature list: an exact-equality check
    // here broke every time a feature was added (DIGITAL_EMPLOYEES, MEDIA).
    expect(features.AGENT).toBe(true)
    expect(Object.values(features).every((enabled) => enabled === true)).toBe(true)
  })
})
