import { auth } from "@/lib/auth"
import AgentPageClient from "./agent-page-client"

export default async function AgentPage() {
  const session = await auth()

  return <AgentPageClient agentId={session?.user?.id ?? ""} />
}
