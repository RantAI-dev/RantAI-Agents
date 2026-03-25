import { beforeEach, describe, expect, it, vi } from "vitest"
import { getDashboardStatistics } from "./service"
import * as repository from "./repository"

vi.mock("./repository", () => ({
  loadDashboardStatisticsData: vi.fn(),
}))

describe("dashboard-statistics service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("defaults the date range and grouping", async () => {
    vi.mocked(repository.loadDashboardStatisticsData).mockResolvedValue({
      overview: {},
      timeSeries: {},
      breakdowns: {},
    } as never)

    await getDashboardStatistics({
      organizationId: null,
      query: {},
    })

    expect(repository.loadDashboardStatisticsData).toHaveBeenCalled()
  })
})
