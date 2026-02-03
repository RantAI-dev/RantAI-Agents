"use client"

import { useState, useEffect, useCallback, createContext, useContext, ReactNode } from "react"

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
      assistantId: s.assistantId || "",
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

interface ChatSessionsContextType {
  sessions: ChatSession[]
  activeSessionId: string | null
  activeSession: ChatSession | undefined
  setActiveSessionId: (id: string | null) => void
  createSession: (assistantId: string) => ChatSession
  updateSession: (sessionId: string, updates: Partial<ChatSession>) => void
  deleteSession: (sessionId: string) => void
  isLoaded: boolean
}

const ChatSessionsContext = createContext<ChatSessionsContextType | null>(null)

export function ChatSessionsProvider({ children }: { children: ReactNode }) {
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [isLoaded, setIsLoaded] = useState(false)

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

  const createSession = useCallback((assistantId: string): ChatSession => {
    const newSession: ChatSession = {
      id: crypto.randomUUID(),
      title: "New Chat",
      assistantId,
      createdAt: new Date(),
      messages: [],
    }
    setSessions((prev) => [newSession, ...prev])
    setActiveSessionId(newSession.id)
    return newSession
  }, [])

  const updateSession = useCallback((sessionId: string, updates: Partial<ChatSession>) => {
    setSessions((prev) =>
      prev.map((s) => (s.id === sessionId ? { ...s, ...updates } : s))
    )
  }, [])

  const deleteSession = useCallback((sessionId: string) => {
    setSessions((prev) => {
      const filtered = prev.filter((s) => s.id !== sessionId)
      return filtered
    })
    setActiveSessionId((current) => {
      if (current === sessionId) {
        const remaining = sessions.filter((s) => s.id !== sessionId)
        return remaining[0]?.id || null
      }
      return current
    })
  }, [sessions])

  return (
    <ChatSessionsContext.Provider
      value={{
        sessions,
        activeSessionId,
        activeSession,
        setActiveSessionId,
        createSession,
        updateSession,
        deleteSession,
        isLoaded,
      }}
    >
      {children}
    </ChatSessionsContext.Provider>
  )
}

export function useChatSessions() {
  const context = useContext(ChatSessionsContext)
  if (!context) {
    throw new Error("useChatSessions must be used within a ChatSessionsProvider")
  }
  return context
}
