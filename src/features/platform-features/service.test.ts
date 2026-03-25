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

  it("defaults AGENT to enabled when config is missing", async () => {
    vi.mocked(repository.findDashboardFeatureConfigs).mockResolvedValue([])

    await expect(getDashboardFeatures()).resolves.toEqual({ AGENT: true })
  })
})
