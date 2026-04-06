import { DashboardPageHeader } from "@/app/dashboard/_components/dashboard-page-header"
import FeaturesSettingsPage from "@/features/platform-features/components/features-settings-page"
import AboutSettingsPage from "@/features/platform-features/components/about-settings-page"
import { SettingsTabs } from "./settings-tabs"

interface Props {
  searchParams: Promise<{ tab?: string }>
}

export default async function GeneralUnified({ searchParams }: Props) {
  const { tab = "features" } = await searchParams

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-5xl mx-auto px-6 py-6">
        <DashboardPageHeader
          title="General"
          subtitle="Features and system information"
          inline
        />
        <div className="mt-6">
          <SettingsTabs
            basePath="/dashboard/settings/general"
            activeTab={tab}
            tabs={[
              { value: "features", label: "Features" },
              { value: "about", label: "About" },
            ]}
          />
          <div className="mt-4">
            {tab === "features" && <FeaturesSettingsPage />}
            {tab === "about" && <AboutSettingsPage />}
          </div>
        </div>
      </div>
    </div>
  )
}
