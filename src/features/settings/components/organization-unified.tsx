import { DashboardPageHeader } from "@/app/dashboard/_components/dashboard-page-header"
import { auth } from "@/lib/auth"
import { listOrganizationsForUser } from "@/features/organizations/core/service"
import OrganizationSettingsPage from "@/features/organizations/components/settings/organization-settings-page"
import MembersSettingsPage from "@/features/organizations/components/settings/members-settings-page"
import { SettingsTabs } from "./settings-tabs"

interface Props {
  searchParams: Promise<{ tab?: string }>
}

export default async function OrganizationUnified({ searchParams }: Props) {
  const { tab = "overview" } = await searchParams

  const session = await auth()
  const organizations = session?.user?.id
    ? await listOrganizationsForUser(session.user.id)
    : []

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-5xl mx-auto px-6 py-6">
        <DashboardPageHeader
          title="Organization"
          subtitle="Manage your organization, team members, and invitations"
          inline
        />
        <div className="mt-6">
          <SettingsTabs
            basePath="/dashboard/settings/organization"
            activeTab={tab}
            tabs={[
              { value: "overview", label: "Overview" },
              { value: "members", label: "Members" },
            ]}
          />
          <div className="mt-4">
            {tab === "overview" && <OrganizationSettingsPage initialOrganizations={organizations as never} />}
            {tab === "members" && <MembersSettingsPage />}
          </div>
        </div>
      </div>
    </div>
  )
}
