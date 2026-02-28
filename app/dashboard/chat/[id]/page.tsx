"use client"

import { use, useCallback, useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useIsMobile } from "@/hooks/use-mobile"
import { useAssistants } from "@/hooks/use-assistants"
import { useChatSessions, type ChatSession, type ChatMessage } from "@/hooks/use-chat-sessions"
import { ChatWorkspace } from "../../_components/chat/chat-workspace"
import type { InitialChatSettings } from "../../_components/chat/chat-home"

export default function ChatSessionPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()
  const isMobile = useIsMobile()

  const {
    assistants,
    selectedAssistant,
    getAssistantById,
    isLoading: assistantsLoading,
  } = useAssistants()

  const {
    sessions,
    activeSession,
    setActiveSessionId,
    updateSession,
    syncMessages,
    createSession,
  } = useChatSessions()

  // Read pending message/settings from sessionStorage (set by chat home)
  const [pendingMessage, setPendingMessage] = useState<string | null>(null)
  const [pendingSettings, setPendingSettings] = useState<InitialChatSettings | null>(null)
  const [pendingRead, setPendingRead] = useState(false)

  useEffect(() => {
    const msg = sessionStorage.getItem("rantai-pending-message")
    const settings = sessionStorage.getItem("rantai-pending-settings")
    if (msg) {
      setPendingMessage(msg)
      sessionStorage.removeItem("rantai-pending-message")
    }
    if (settings) {
      try {
        setPendingSettings(JSON.parse(settings))
      } catch {}
      sessionStorage.removeItem("rantai-pending-settings")
    }
    setPendingRead(true)
  }, [])

  // Sync URL id → activeSessionId in context
  useEffect(() => {
    if (!id || sessions.length === 0) return
    // Find session by dbId or id
    const session = sessions.find((s) => s.dbId === id || s.id === id)
    if (session) {
      setActiveSessionId(session.id)
    }
  }, [id, sessions, setActiveSessionId])

  // Clear pending message once ChatWorkspace has received it
  useEffect(() => {
    if (pendingMessage && activeSession) {
      // Small delay to ensure ChatWorkspace picks up the props
      const timer = setTimeout(() => {
        setPendingMessage(null)
        setPendingSettings(null)
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [pendingMessage, activeSession])

  // Get the assistant for the active session
  const activeSessionAssistant = activeSession
    ? getAssistantById(activeSession.assistantId) || selectedAssistant
    : selectedAssistant

  const handleUpdateSession = useCallback((sessionId: string, updates: Partial<ChatSession>) => {
    if (updates.messages) {
      syncMessages(sessionId, updates.messages as ChatMessage[])
    }
    if (updates.title) {
      updateSession(sessionId, { title: updates.title })
    }
  }, [updateSession, syncMessages])

  const handleNewChat = useCallback(async () => {
    if (selectedAssistant) {
      const newSession = await createSession(selectedAssistant.id)
      const urlId = newSession.dbId || newSession.id
      router.push(`/dashboard/chat/${urlId}`)
    }
  }, [selectedAssistant, createSession, router])

  // Loading state
  if (assistantsLoading || !pendingRead) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </div>
    )
  }

  // Session not found — redirect to chat home after a brief wait
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
        onBack={isMobile ? () => router.push("/dashboard/chat") : undefined}
        onUpdateSession={handleUpdateSession}
        onNewChat={handleNewChat}
      />
    </div>
  )
}
