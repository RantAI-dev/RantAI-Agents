import { redirect } from "next/navigation"

export default function OrgBillingRedirect() {
  redirect("/dashboard/settings/billing")
}
