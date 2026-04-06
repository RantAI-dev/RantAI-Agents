import { redirect } from "next/navigation"
export default function MembersRedirect() {
  redirect("/dashboard/settings/organization?tab=members")
}
