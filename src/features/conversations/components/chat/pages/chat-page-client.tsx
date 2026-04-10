"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useAssistants, type DbAssistant } from "@/hooks/use-assistants"
import { useChatSessions } from "@/hooks/use-chat-sessions"
import type { ChatSession } from "@/hooks/use-chat-sessions"
import { ChatHome } from "@/features/conversations/components/chat/chat-home"
import type { ChatToolbarHydrationData } from "./chat-hydration-data"
import { normalizeSerializedChatSession, type SerializedChatSession } from "./chat-session-data"

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

  // Track whether provider has been hydrated with server data yet.
  // Until then, use initialSessions directly to avoid hydration mismatch:
  // The provider (mounted in layout.tsx) can't read the hydration <script>
  // during its initial render because the script is a sibling rendered by
  // this page component — so provider starts with [] while the server
  // rendered actual session cards.
  const hydrated = useRef(false)
  const [isHydrated, setIsHydrated] = useState(false)

  useEffect(() => {
    if (initialSessions !== undefined && !hydrated.current) {
      hydrated.current = true
      hydrateSessions(initialSessions)
      setIsHydrated(true)
    }
  }, [hydrateSessions, initialSessions])

  // For the first render (before useEffect fires), use initialSessions
  // directly so server and client agree on the same session list.
  const displaySessions: ChatSession[] =
    !isHydrated && initialSessions
      ? (initialSessions.map((s) => normalizeSerializedChatSession(s)) as ChatSession[])
      : sessions

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
        sessions={displaySessions}
        assistants={assistants}
        selectedAssistantId={selectedAssistantId}
        getAssistantById={getAssistantById}
        initialToolbarData={initialToolbarData}
        onSelectSession={(id) => {
          const session = displaySessions.find((s) => s.id === id)
          const urlId = session?.dbId || id
          router.push(`/dashboard/chat/${urlId}`)
        }}
        onCreateSession={(assistantId, initialMessage, settings) => {
          const targetAssistantId = initialMessage
            ? (selectedAssistantId ?? assistantId)
            : assistantId

          const newSession = createSession(targetAssistantId)
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
          }
          let initToken: string | null = null
          if (initialMessage) {
            initToken = crypto.randomUUID()
            const pendingPayload = {
              message: initialMessage,
              settings: settings ?? null,
              sessionId: newSession.id,
              sessionDbId: null,
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
          router.push(
            initToken
              ? `/dashboard/chat/${newSession.id}?initToken=${encodeURIComponent(initToken)}`
              : `/dashboard/chat/${newSession.id}`
          )
        }}
      />
    </div>
  )
}
