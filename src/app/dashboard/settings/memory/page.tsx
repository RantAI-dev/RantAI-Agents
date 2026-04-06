import { redirect } from "next/navigation"
export default function MemoryRedirect() {
  redirect("/dashboard/settings/analytics?tab=memory")
}
