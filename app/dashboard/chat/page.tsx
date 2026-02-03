"use client"

import { useState, useEffect, useCallback } from "react"
import { SessionPanel } from "./_components/session-panel"
import { ChatWorkspace } from "./_components/chat-workspace"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import { useIsMobile } from "@/hooks/use-mobile"
import { useAssistants } from "@/hooks/use-assistants"
import { getDefaultAssistant } from "@/lib/assistants/defaults"

export interface ChatSession {
  id: string
  title: string
  assistantId: string
  createdAt: Date
  messages: Array<{
    id: string
    role: "user" | "assistant"
    content: string
    createdAt: Date
  }>
}

const STORAGE_KEY = "rantai-agents-chat-sessions"

// Helper to safely parse dates from JSON
function parseSessions(json: string): ChatSession[] {
  try {
    const data = JSON.parse(json)
    return data.map((s: any) => ({
      ...s,
      // Migrate old sessions without assistantId
      assistantId: s.assistantId || getDefaultAssistant().id,
      createdAt: new Date(s.createdAt),
      messages: s.messages.map((m: any) => ({
        ...m,
        createdAt: new Date(m.createdAt),
      })),
    }))
  } catch {
    return []
  }
}

export default function ChatPage() {
  const isMobile = useIsMobile()
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [isLoaded, setIsLoaded] = useState(false)

  // Assistant management
  const {
    selectedAssistant,
    getAssistantById,
  } = useAssistants()

  // Load sessions from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = parseSessions(stored)
      setSessions(parsed)
      // Restore last active session
      const lastActive = localStorage.getItem(`${STORAGE_KEY}-active`)
      if (lastActive && parsed.some((s) => s.id === lastActive)) {
        setActiveSessionId(lastActive)
      }
    }
    setIsLoaded(true)
  }, [])

  // Save sessions to localStorage whenever they change
  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions))
    }
  }, [sessions, isLoaded])

  // Save active session ID
  useEffect(() => {
    if (isLoaded && activeSessionId) {
      localStorage.setItem(`${STORAGE_KEY}-active`, activeSessionId)
    }
  }, [activeSessionId, isLoaded])

  const activeSession = sessions.find((s) => s.id === activeSessionId)

  // Get the assistant for the active session
  const activeSessionAssistant = activeSession
    ? getAssistantById(activeSession.assistantId) || selectedAssistant
    : selectedAssistant

  const handleNewChat = useCallback(() => {
    const newSession: ChatSession = {
      id: crypto.randomUUID(),
      title: "New Chat",
      assistantId: selectedAssistant.id,
      createdAt: new Date(),
      messages: [],
    }
    setSessions((prev) => [newSession, ...prev])
    setActiveSessionId(newSession.id)
  }, [selectedAssistant.id])

  const handleSelectSession = useCallback((sessionId: string) => {
    setActiveSessionId(sessionId)
  }, [])

  const handleUpdateSession = useCallback((sessionId: string, updates: Partial<ChatSession>) => {
    setSessions((prev) =>
      prev.map((s) => (s.id === sessionId ? { ...s, ...updates } : s))
    )
  }, [])

  const handleDeleteSession = useCallback((sessionId: string) => {
    setSessions((prev) => {
      const filtered = prev.filter((s) => s.id !== sessionId)
      return filtered
    })
    if (activeSessionId === sessionId) {
      const remaining = sessions.filter((s) => s.id !== sessionId)
      setActiveSessionId(remaining[0]?.id || null)
    }
  }, [activeSessionId, sessions])

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="flex h-14 shrink-0 items-center gap-2 border-b pl-14 pr-4 bg-background">
        <h1 className="text-lg font-semibold">Chat</h1>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {isMobile ? (
          // Mobile: Show either sessions or workspace
          activeSessionId ? (
            <ChatWorkspace
              key={`${activeSessionId}-${activeSessionAssistant.id}`}
              session={activeSession}
              assistant={activeSessionAssistant}
              onBack={() => setActiveSessionId(null)}
              onUpdateSession={handleUpdateSession}
            />
          ) : (
            <SessionPanel
              sessions={sessions}
              activeSessionId={activeSessionId}
              onSelectSession={handleSelectSession}
              onNewChat={handleNewChat}
              onDeleteSession={handleDeleteSession}
              getAssistantById={getAssistantById}
            />
          )
        ) : (
          // Desktop: Resizable panels
          <ResizablePanelGroup id="chat-panel-group" direction="horizontal" className="h-full">
            <ResizablePanel id="session-panel" defaultSize={25} minSize={18} maxSize={35}>
              <SessionPanel
                sessions={sessions}
                activeSessionId={activeSessionId}
                onSelectSession={handleSelectSession}
                onNewChat={handleNewChat}
                onDeleteSession={handleDeleteSession}
                getAssistantById={getAssistantById}
              />
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel id="workspace-panel" defaultSize={75}>
              <ChatWorkspace
                key={`${activeSession?.id || 'none'}-${activeSessionAssistant.id}`}
                session={activeSession}
                assistant={activeSessionAssistant}
                onUpdateSession={handleUpdateSession}
              />
            </ResizablePanel>
          </ResizablePanelGroup>
        )}
      </div>
    </div>
  )
}
