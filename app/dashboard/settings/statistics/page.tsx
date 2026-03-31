import { redirect } from "next/navigation"
export default function StatisticsRedirect() {
  redirect("/dashboard/settings/analytics?tab=statistics")
}
