import { DashboardPageHeader } from "@/app/dashboard/_components/dashboard-page-header"
import MemorySettingsPage from "@/src/features/memory/components/memory-settings-page"
import StatisticsSettingsPage from "@/src/features/statistics/components/statistics-settings-page"
import { SettingsTabs } from "./settings-tabs"

interface Props {
  searchParams: Promise<{ tab?: string }>
}

export default async function AnalyticsUnified({ searchParams }: Props) {
  const { tab = "memory" } = await searchParams

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-5xl mx-auto px-6 py-6">
        <DashboardPageHeader
          title="Analytics"
          subtitle="AI memory management and usage statistics"
        />
        <div className="mt-6">
          <SettingsTabs
            basePath="/dashboard/settings/analytics"
            activeTab={tab}
            tabs={[
              { value: "memory", label: "Memory" },
              { value: "statistics", label: "Statistics" },
            ]}
          />
          <div className="mt-4">
            {tab === "memory" && <MemorySettingsPage />}
            {tab === "statistics" && <StatisticsSettingsPage />}
          </div>
        </div>
      </div>
    </div>
  )
}
