import { auth } from "@/lib/auth"
import { listOrganizationsForUser } from "@/src/features/organizations/core/service"
import OrganizationSettingsPage from "./organization-settings-page"

export default async function OrganizationSettingsPageServer() {
  const session = await auth()

  if (!session?.user?.id) {
    return <OrganizationSettingsPage initialOrganizations={[]} />
  }

  const organizations = await listOrganizationsForUser(session.user.id)
  return <OrganizationSettingsPage initialOrganizations={organizations} />
}
