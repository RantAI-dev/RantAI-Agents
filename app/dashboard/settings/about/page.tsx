import { redirect } from "next/navigation"
export default function AboutRedirect() {
  redirect("/dashboard/settings/general?tab=about")
}
