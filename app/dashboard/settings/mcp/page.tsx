import { redirect } from "next/navigation"
export default function McpRedirect() {
  redirect("/dashboard/settings/agent-config?tab=mcp")
}
