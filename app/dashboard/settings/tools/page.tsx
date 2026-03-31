import { redirect } from "next/navigation"
export default function ToolsRedirect() {
  redirect("/dashboard/settings/agent-config?tab=tools")
}
