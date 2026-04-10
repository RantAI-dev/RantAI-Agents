"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useIsMobile } from "@/hooks/use-mobile"
import { useAssistants, type DbAssistant } from "@/hooks/use-assistants"
import { useChatSessions, type ChatSession, type ChatMessage } from "@/hooks/use-chat-sessions"
import { ChatWorkspace } from "@/features/conversations/components/chat/chat-workspace"
import type { InitialChatSettings } from "@/features/conversations/components/chat/chat-home"
import type {
  AssistantSkillInfo,
  AssistantToolInfo,
  KBGroup,
} from "../chat-input-toolbar"
import type { SerializedChatSession } from "./chat-session-data"

export default function ChatSessionPageClient({
  id,
  initialAssistants,
  initialSessions,
  initialAssistantTools,
  initialAssistantSkills,
  initialKnowledgeBaseGroups,
}: {
  id: string
  initialAssistants?: DbAssistant[]
  initialSessions?: SerializedChatSession[]
  initialAssistantTools?: AssistantToolInfo[]
  initialAssistantSkills?: AssistantSkillInfo[]
  initialKnowledgeBaseGroups?: KBGroup[]
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const isMobile = useIsMobile()

  const {
    assistants,
    selectedAssistant,
    getAssistantById,
    refetch: refetchAssistants,
    isLoading: assistantsLoading,
  } = useAssistants({
    initialAssistants,
  })

  const {
    sessions,
    activeSession,
    setActiveSessionId,
    updateSession,
    syncMessages,
    createSession,
    hydrateSessions,
  } = useChatSessions()

  const [pendingMessage, setPendingMessage] = useState<string | null>(null)
  const [pendingSettings, setPendingSettings] = useState<InitialChatSettings | null>(null)
  const [pendingStorageKey, setPendingStorageKey] = useState<string | null>(null)
  const [pendingRead, setPendingRead] = useState(false)

  useEffect(() => {
    if (initialSessions !== undefined) {
      hydrateSessions(initialSessions)
    }
  }, [hydrateSessions, initialSessions])

  useEffect(() => {
    const initToken = searchParams.get("initToken")
    const tokenStorageKey = initToken ? `rantai-pending-chat-init:${initToken}` : null

    const pendingInitRaw = tokenStorageKey
      ? sessionStorage.getItem(tokenStorageKey)
      : sessionStorage.getItem("rantai-pending-chat-init")

    if (pendingInitRaw) {
      try {
        const pendingInit = JSON.parse(pendingInitRaw) as {
          message?: string
          settings?: InitialChatSettings | null
          sessionId?: string | null
          sessionDbId?: string | null
        }
        const matchesSession =
          (pendingInit.sessionDbId && pendingInit.sessionDbId === id) ||
          (pendingInit.sessionId && pendingInit.sessionId === id)

        if (matchesSession && pendingInit.message) {
          setPendingMessage(pendingInit.message)
          setPendingSettings(pendingInit.settings ?? null)
          setPendingStorageKey(tokenStorageKey ?? "rantai-pending-chat-init")
        }
      } catch {
        // Ignore invalid pending payload
      }
    }
    setPendingRead(true)
  }, [id, searchParams])

  useEffect(() => {
    if (!id || sessions.length === 0) return
    const session = sessions.find((s) => s.dbId === id || s.id === id)
    if (session) {
      setActiveSessionId(session.id)
    }
  }, [id, sessions, setActiveSessionId])

  // Once dbId resolves, update the URL so it persists across refreshes
  useEffect(() => {
    if (!activeSession?.dbId) return
    if (id === activeSession.dbId) return
    // URL still uses tempId — replace with real dbId
    if (activeSession.id === id || id !== activeSession.dbId) {
      router.replace(`/dashboard/chat/${activeSession.dbId}`)
    }
  }, [activeSession?.dbId, activeSession?.id, id, router])

  useEffect(() => {
    if (!activeSession?.assistantId) return
    if (getAssistantById(activeSession.assistantId)) return
    void refetchAssistants()
  }, [activeSession?.assistantId, getAssistantById, refetchAssistants])

  const activeSessionAssistant = activeSession
    ? getAssistantById(activeSession.assistantId)
    : selectedAssistant

  const handleUpdateSession = useCallback((sessionId: string, updates: Partial<ChatSession>) => {
    if (updates.messages) {
      syncMessages(sessionId, updates.messages as ChatMessage[])
    }
    if (updates.title) {
      updateSession(sessionId, { title: updates.title })
    }
  }, [updateSession, syncMessages])

  const handleNewChat = useCallback(() => {
    if (selectedAssistant) {
      const newSession = createSession(selectedAssistant.id)
      router.push(`/dashboard/chat/${newSession.id}`)
    }
  }, [selectedAssistant, createSession, router])

  if (assistantsLoading || !pendingRead) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </div>
    )
  }

  if (!activeSession || !activeSessionAssistant) {
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
      <ChatWorkspace
        key={`${activeSession.id}-${activeSessionAssistant.id}`}
        session={activeSession}
        assistant={activeSessionAssistant}
        initialMessage={pendingMessage ?? undefined}
        initialSettings={pendingSettings ?? undefined}
        onInitialMessageConsumed={() => {
          setPendingMessage(null)
          setPendingSettings(null)
          if (pendingStorageKey) {
            sessionStorage.removeItem(pendingStorageKey)
          }
          // Always clear legacy key too.
          sessionStorage.removeItem("rantai-pending-chat-init")
          const initToken = searchParams.get("initToken")
          if (initToken) {
            const currentPath = `/dashboard/chat/${id}`
            router.replace(currentPath)
          }
        }}
        initialAssistantTools={initialAssistantTools}
        initialAssistantSkills={initialAssistantSkills}
        initialKnowledgeBaseGroups={initialKnowledgeBaseGroups}
        onBack={isMobile ? () => router.push("/dashboard/chat") : undefined}
        onUpdateSession={handleUpdateSession}
        onNewChat={handleNewChat}
      />
    </div>
  )
}
