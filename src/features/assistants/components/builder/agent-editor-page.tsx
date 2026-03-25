import AgentEditorPageClient from "./agent-editor-page-client"
import {
  loadInitialAssistantsForBuilder,
  loadInitialKnowledgeGroupsForBuilder,
} from "./assistant-page-hydration"

export default async function AgentEditorPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const [initialAssistants, initialKnowledgeGroups] = await Promise.all([
    loadInitialAssistantsForBuilder(),
    loadInitialKnowledgeGroupsForBuilder(),
  ])
  return (
    <AgentEditorPageClient
      params={params}
      initialAssistants={initialAssistants}
      initialKnowledgeGroups={initialKnowledgeGroups}
    />
  )
}
