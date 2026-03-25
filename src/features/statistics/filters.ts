export interface StatisticsFilters {
  from: string
  to: string
  groupBy: "day" | "week" | "month"
}

export function createDefaultStatisticsFilters(): StatisticsFilters {
  const now = new Date()
  const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  return {
    from: from.toISOString().split("T")[0],
    to: now.toISOString().split("T")[0],
    groupBy: "day",
  }
}
