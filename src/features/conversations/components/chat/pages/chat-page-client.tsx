"use client"

import { useCallback, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAssistants, type DbAssistant } from "@/hooks/use-assistants"
import { useChatSessions } from "@/hooks/use-chat-sessions"
import { ChatHome } from "@/features/conversations/components/chat/chat-home"
import type { ChatToolbarHydrationData } from "./chat-hydration-data"
import type { SerializedChatSession } from "./chat-session-data"

export default function ChatPageClient({
  initialAssistants,
  initialSessions,
  initialToolbarData,
}: {
  initialAssistants?: DbAssistant[]
  initialSessions?: SerializedChatSession[]
  initialToolbarData?: ChatToolbarHydrationData | null
}) {
  const router = useRouter()

  const {
    assistants,
    selectedAssistantId,
    getAssistantById,
    isLoading: assistantsLoading,
  } = useAssistants({
    initialAssistants,
  })

  const { sessions, createSession, hydrateSessions } = useChatSessions()

  useEffect(() => {
    if (initialSessions !== undefined) {
      hydrateSessions(initialSessions)
    }
  }, [hydrateSessions, initialSessions])

  if (assistantsLoading) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <ChatHome
        sessions={sessions}
        assistants={assistants}
        selectedAssistantId={selectedAssistantId}
        getAssistantById={getAssistantById}
        initialToolbarData={initialToolbarData}
        onSelectSession={(id) => {
          const session = sessions.find((s) => s.id === id)
          const urlId = session?.dbId || id
          router.push(`/dashboard/chat/${urlId}`)
        }}
        onCreateSession={async (assistantId, initialMessage, settings) => {
          const targetAssistantId = initialMessage
            ? (selectedAssistantId ?? assistantId)
            : assistantId

          const newSession = await createSession(targetAssistantId)
          if (settings) {
            const toolbarSnapshot = {
              selectedKBGroupIds: settings.knowledgeBaseGroupIds ?? null,
              toolMode: settings.toolMode ?? "off",
              selectedToolNames: settings.selectedToolNames ?? [],
              skillMode: settings.skillMode ?? "off",
              selectedSkillIds: settings.selectedSkillIds ?? [],
              webSearchOverride:
                typeof settings.webSearchEnabled === "boolean"
                  ? settings.webSearchEnabled
                  : null,
              codeInterpreterOverride:
                typeof settings.codeInterpreterEnabled === "boolean"
                  ? settings.codeInterpreterEnabled
                  : null,
            }
            const serializedSnapshot = JSON.stringify(toolbarSnapshot)
            sessionStorage.setItem(
              `chat-toolbar-state:${newSession.id}`,
              serializedSnapshot
            )
            if (newSession.dbId) {
              sessionStorage.setItem(
                `chat-toolbar-state:${newSession.dbId}`,
                serializedSnapshot
              )
            }
          }
          let initToken: string | null = null
          if (initialMessage) {
            initToken = crypto.randomUUID()
            const pendingPayload = {
              message: initialMessage,
              settings: settings ?? null,
              sessionId: newSession.id,
              sessionDbId: newSession.dbId ?? null,
              assistantId: targetAssistantId,
              createdAt: Date.now(),
            }

            // New deterministic key (token in URL) + legacy key fallback.
            sessionStorage.setItem(
              `rantai-pending-chat-init:${initToken}`,
              JSON.stringify(pendingPayload)
            )
            sessionStorage.setItem("rantai-pending-chat-init", JSON.stringify(pendingPayload))
          }
          const urlId = newSession.dbId || newSession.id
          router.push(
            initToken
              ? `/dashboard/chat/${urlId}?initToken=${encodeURIComponent(initToken)}`
              : `/dashboard/chat/${urlId}`
          )
        }}
      />
    </div>
  )
}
