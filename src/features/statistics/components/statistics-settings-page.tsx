import { auth } from "@/lib/auth"
import { getDashboardStatistics } from "@/features/statistics/service"
import StatisticsSettingsClient from "./statistics-settings-client"
import {
  createDefaultStatisticsFilters,
  type StatisticsFilters,
} from "@/features/statistics/filters"

function toQuery(filters: StatisticsFilters) {
  return {
    from: filters.from,
    to: filters.to,
    groupBy: filters.groupBy,
  }
}

export default async function StatisticsSettingsPage() {
  const session = await auth()
  const defaultFilters = createDefaultStatisticsFilters()

  if (!session?.user?.id) {
    return (
      <StatisticsSettingsClient
        initialData={null}
        initialFilters={defaultFilters}
      />
    )
  }

  const initialData = await getDashboardStatistics({
    organizationId: null,
    query: toQuery(defaultFilters),
  })

  return (
    <StatisticsSettingsClient
      initialData={initialData}
      initialFilters={defaultFilters}
    />
  )
}
