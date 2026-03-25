import { loadDashboardStatisticsData } from "./repository"
import type { DashboardStatisticsQueryInput } from "./schema"

/**
 * Loads dashboard statistics using default date and grouping values.
 */
export async function getDashboardStatistics(params: {
  organizationId: string | null
  query: DashboardStatisticsQueryInput
}) {
  const now = new Date()
  const from = params.query.from
    ? new Date(params.query.from)
    : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const to = params.query.to ? new Date(params.query.to) : now
  const groupBy = params.query.groupBy || "day"

  return loadDashboardStatisticsData({
    organizationId: params.organizationId,
    from,
    to,
    groupBy,
  })
}
