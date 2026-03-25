import AgentBuilderPageClient from "./agent-builder-page-client"
import { loadInitialAssistantsForBuilder } from "./assistant-page-hydration"

export default async function AgentBuilderPage() {
  const initialAssistants = await loadInitialAssistantsForBuilder()
  return <AgentBuilderPageClient initialAssistants={initialAssistants} />
}
