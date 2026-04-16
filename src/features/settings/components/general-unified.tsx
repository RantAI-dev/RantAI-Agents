import { DashboardPageHeader } from "@/app/dashboard/_components/dashboard-page-header"
import { auth } from "@/lib/auth"
import { listOrganizationsForUser } from "@/features/organizations/core/service"
import FeaturesSettingsPage from "@/features/platform-features/components/features-settings-page"
import AboutSettingsPage from "@/features/platform-features/components/about-settings-page"
import OrganizationSettingsPage from "@/features/organizations/components/settings/organization-settings-page"
import { SettingsTabs } from "./settings-tabs"

interface Props {
  searchParams: Promise<{ tab?: string }>
}

export default async function GeneralUnified({ searchParams }: Props) {
  const { tab = "organization" } = await searchParams

  const session = await auth()
  const organizations = session?.user?.id
    ? await listOrganizationsForUser(session.user.id)
    : []

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-5xl mx-auto px-6 py-6">
        <DashboardPageHeader
          title="General"
          subtitle="Organization, beta features and system information"
          inline
        />
        <div className="mt-6">
          <SettingsTabs
            basePath="/dashboard/settings/general"
            activeTab={tab}
            tabs={[
              { value: "organization", label: "Organization" },
              { value: "features", label: "Beta Features" },
              { value: "about", label: "About" },
            ]}
          />
          <div className="mt-4">
            {tab === "organization" && <OrganizationSettingsPage initialOrganizations={organizations as never} />}
            {tab === "features" && <FeaturesSettingsPage />}
            {tab === "about" && <AboutSettingsPage />}
          </div>
        </div>
      </div>
    </div>
  )
}
