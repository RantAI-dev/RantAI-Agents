"use client"

import { useCallback } from "react"
import { useIsMobile } from "@/hooks/use-mobile"
import { useAssistants } from "@/hooks/use-assistants"
import { useChatSessions, type ChatSession, type ChatMessage } from "@/hooks/use-chat-sessions"
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
    syncMessages,
    createSession,
  } = useChatSessions()

  // Get the assistant for the active session
  const activeSessionAssistant = activeSession
    ? getAssistantById(activeSession.assistantId) || selectedAssistant
    : selectedAssistant

  const handleUpdateSession = useCallback((sessionId: string, updates: Partial<ChatSession>) => {
    // Sync messages to database if messages are being updated
    if (updates.messages) {
      syncMessages(sessionId, updates.messages as ChatMessage[])
    }
    // Update title separately if provided
    if (updates.title) {
      updateSession(sessionId, { title: updates.title })
    }
  }, [updateSession, syncMessages])

  const handleNewChat = useCallback(() => {
    if (selectedAssistant) {
      createSession(selectedAssistant.id)
    }
  }, [selectedAssistant, createSession])

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
        onNewChat={handleNewChat}
      />
    </div>
  )
}
