import { DashboardPageHeader } from "@/app/dashboard/_components/dashboard-page-header"
import GeneralSettingsPage from "@/src/features/user/components/settings/general-settings-page"
import AboutSettingsPage from "@/src/features/platform-features/components/about-settings-page"
import { SettingsTabs } from "./settings-tabs"

interface Props {
  searchParams: Promise<{ tab?: string }>
}

export default async function GeneralUnified({ searchParams }: Props) {
  const { tab = "preferences" } = await searchParams

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-5xl mx-auto px-6 py-6">
        <DashboardPageHeader
          title="General"
          subtitle="Preferences and system information"
        />
        <div className="mt-6">
          <SettingsTabs
            basePath="/dashboard/settings/general"
            activeTab={tab}
            tabs={[
              { value: "preferences", label: "Preferences" },
              { value: "about", label: "About" },
            ]}
          />
          <div className="mt-4">
            {tab === "preferences" && <GeneralSettingsPage />}
            {tab === "about" && <AboutSettingsPage />}
          </div>
        </div>
      </div>
    </div>
  )
}
