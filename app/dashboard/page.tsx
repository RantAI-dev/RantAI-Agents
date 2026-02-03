"use client"

import { useCallback } from "react"
import { useIsMobile } from "@/hooks/use-mobile"
import { useAssistants } from "@/hooks/use-assistants"
import { useChatSessions, type ChatSession } from "@/hooks/use-chat-sessions"
import { ChatWorkspace } from "./_components/chat/chat-workspace"
import { EmptyState } from "./_components/chat/empty-state"

export default function DashboardPage() {
  const isMobile = useIsMobile()
  
  const {
    selectedAssistant,
    getAssistantById,
    isLoading: assistantsLoading,
  } = useAssistants()

  const {
    activeSession,
    activeSessionId,
    setActiveSessionId,
    updateSession,
  } = useChatSessions()

  // Get the assistant for the active session
  const activeSessionAssistant = activeSession
    ? getAssistantById(activeSession.assistantId) || selectedAssistant
    : selectedAssistant

  const handleUpdateSession = useCallback((sessionId: string, updates: Partial<ChatSession>) => {
    updateSession(sessionId, updates)
  }, [updateSession])

  // Show loading state while assistants are loading
  if (assistantsLoading) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </div>
    )
  }

  // No assistant selected
  if (!activeSessionAssistant) {
    return (
      <div className="flex flex-col h-full">
        <EmptyState />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <ChatWorkspace
        key={`${activeSession?.id || 'none'}-${activeSessionAssistant?.id}`}
        session={activeSession}
        assistant={activeSessionAssistant}
        onBack={isMobile ? () => setActiveSessionId(null) : undefined}
        onUpdateSession={handleUpdateSession}
      />
    </div>
  )
}
