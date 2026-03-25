import WorkflowEditorPageClient from "./workflow-editor-page-client"
import { loadWorkflowEditorPageHydration } from "./workflow-editor-page-loader"

export default async function WorkflowEditorPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const hydration = await loadWorkflowEditorPageHydration(id)

  return <WorkflowEditorPageClient workflowId={id} {...hydration} />
}
