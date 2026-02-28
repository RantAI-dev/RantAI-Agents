"use client"

import { useCallback, useState } from "react"
import { useRouter } from "next/navigation"
import { useAssistants } from "@/hooks/use-assistants"
import { useChatSessions } from "@/hooks/use-chat-sessions"
import { ChatHome, type InitialChatSettings } from "../_components/chat/chat-home"

export default function ChatPage() {
  const router = useRouter()

  const {
    assistants,
    getAssistantById,
    isLoading: assistantsLoading,
  } = useAssistants()

  const { sessions, createSession } = useChatSessions()

  // Loading state
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
        getAssistantById={getAssistantById}
        onSelectSession={(id) => {
          // Find session to get dbId for URL
          const session = sessions.find((s) => s.id === id)
          const urlId = session?.dbId || id
          router.push(`/dashboard/chat/${urlId}`)
        }}
        onCreateSession={async (assistantId, initialMessage, settings) => {
          // Store pending message/settings in sessionStorage for the [id] page to pick up
          if (initialMessage) {
            sessionStorage.setItem("rantai-pending-message", initialMessage)
          }
          if (settings) {
            sessionStorage.setItem("rantai-pending-settings", JSON.stringify(settings))
          }
          const newSession = await createSession(assistantId)
          const urlId = newSession.dbId || newSession.id
          router.push(`/dashboard/chat/${urlId}`)
        }}
      />
    </div>
  )
}
