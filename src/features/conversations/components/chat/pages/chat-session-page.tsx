import ChatSessionPageClient from "./chat-session-page-client"
import { loadChatSessionPageHydration } from "./chat-session-page-loader"
import { serializeHydrationPayload } from "./chat-session-data"

export default async function ChatSessionPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const hydration = await loadChatSessionPageHydration(id)

  if (
    hydration.initialAssistants === undefined &&
    hydration.initialSessions === undefined &&
    hydration.initialAssistantTools === undefined &&
    hydration.initialAssistantSkills === undefined &&
    hydration.initialKnowledgeBaseGroups === undefined &&
    hydration.assistantEditorHydrationData === undefined
  ) {
    return <ChatSessionPageClient id={id} />
  }

  return (
    <>
      {hydration.initialSessions !== undefined ? (
        <script
          id="rantai-chat-sessions-hydration"
          type="application/json"
          dangerouslySetInnerHTML={{
            __html: serializeHydrationPayload(hydration.initialSessions),
          }}
        />
      ) : null}
      {hydration.assistantEditorHydrationData !== undefined ? (
        <script
          id="rantai-assistant-editor-hydration"
          type="application/json"
          dangerouslySetInnerHTML={{
            __html: serializeHydrationPayload(hydration.assistantEditorHydrationData),
          }}
        />
      ) : null}
      <ChatSessionPageClient
        id={id}
        initialAssistants={hydration.initialAssistants}
        initialSessions={hydration.initialSessions}
        initialAssistantTools={hydration.initialAssistantTools}
        initialAssistantSkills={hydration.initialAssistantSkills}
        initialKnowledgeBaseGroups={hydration.initialKnowledgeBaseGroups}
      />
    </>
  )
}
