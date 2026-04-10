import { DashboardPageHeader } from "@/app/dashboard/_components/dashboard-page-header"
import MemorySettingsPage from "@/features/memory/components/memory-settings-page"

export default async function AnalyticsUnified() {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-5xl mx-auto px-6 py-6">
        <DashboardPageHeader
          title="Analytics"
          subtitle="AI memory management"
          inline
        />
        <div className="mt-6">
          <MemorySettingsPage />
        </div>
      </div>
    </div>
  )
}
