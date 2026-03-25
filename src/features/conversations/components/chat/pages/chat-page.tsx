import ChatPageClient from "./chat-page-client"
import { loadChatPageHydration } from "./chat-page-loader"
import { serializeHydrationPayload } from "./chat-session-data"

export default async function ChatPage() {
  const hydration = await loadChatPageHydration()

  if (
    hydration.initialAssistants === undefined &&
    hydration.initialSessions === undefined &&
    hydration.initialToolbarData === undefined &&
    hydration.assistantEditorHydrationData === undefined
  ) {
    return <ChatPageClient />
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
      <ChatPageClient
        initialAssistants={hydration.initialAssistants}
        initialSessions={hydration.initialSessions}
        initialToolbarData={hydration.initialToolbarData}
      />
    </>
  )
}
