import { OrgAdminNav } from "@/features/org-admin/components/org-admin-nav"

/** The organisation admin shell: one tab bar for people, teams and sign-in. The settings layout
 *  above already provides the page header and the width. */
export default function OrganizationLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <OrgAdminNav />
      <div className="mt-6">{children}</div>
    </div>
  )
}
