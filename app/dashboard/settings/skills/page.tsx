import { redirect } from "next/navigation"
export default function SkillsRedirect() {
  redirect("/dashboard/settings/agent-config?tab=skills")
}
