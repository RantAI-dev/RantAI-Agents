import { redirect } from "next/navigation"
export default function CredentialsRedirect() {
  redirect("/dashboard/settings/agent-config?tab=credentials")
}
