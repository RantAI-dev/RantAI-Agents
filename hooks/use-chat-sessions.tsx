"use client"

import { useState, useEffect, useCallback, createContext, useContext, ReactNode, useRef } from "react"

// Edit history entry for versioning
interface EditHistoryEntry {
  content: string
  assistantResponse?: string
  editedAt: Date
}

export interface ChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
  createdAt: Date
  replyTo?: string
  editHistory?: EditHistoryEntry[]
  sources?: Array<{
    title: string
    content: string
    similarity?: number
  }>
}

export interface ChatSession {
  id: string
  title: string
  assistantId: string
  createdAt: Date
  messages: ChatMessage[]
}

const STORAGE_KEY = "rantai-agents-chat-sessions"

// Helper to safely parse dates from JSON (for localStorage cache)
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
        editHistory: m.editHistory?.map((h: any) => ({
          ...h,
          editedAt: new Date(h.editedAt),
        })),
      })),
    }))
  } catch {
    return []
  }
}

// Helper to parse API response
function parseApiSessions(data: any[]): ChatSession[] {
  return data.map((s) => ({
    ...s,
    createdAt: new Date(s.createdAt),
    messages: s.messages.map((m: any) => ({
      ...m,
      createdAt: new Date(m.createdAt),
      editHistory: m.editHistory?.map((h: any) => ({
        ...h,
        editedAt: new Date(h.editedAt),
      })),
    })),
  }))
}

interface ChatSessionsContextType {
  sessions: ChatSession[]
  activeSessionId: string | null
  activeSession: ChatSession | undefined
  setActiveSessionId: (id: string | null) => void
  createSession: (assistantId: string) => Promise<ChatSession>
  updateSession: (sessionId: string, updates: Partial<ChatSession>) => void
  deleteSession: (sessionId: string) => void
  syncMessages: (sessionId: string, messages: ChatMessage[]) => void
  isLoaded: boolean
  isSyncing: boolean
}

const ChatSessionsContext = createContext<ChatSessionsContextType | null>(null)

export function ChatSessionsProvider({ children }: { children: ReactNode }) {
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [isLoaded, setIsLoaded] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Load sessions from localStorage first (fast), then fetch from API
  useEffect(() => {
    const loadSessions = async () => {
      // Load from localStorage immediately for fast initial render
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = parseSessions(stored)
        setSessions(parsed)
        const lastActive = localStorage.getItem(`${STORAGE_KEY}-active`)
        if (lastActive && parsed.some((s) => s.id === lastActive)) {
          setActiveSessionId(lastActive)
        }
      }
      setIsLoaded(true)

      // Then fetch from API to get latest data
      try {
        const response = await fetch("/api/dashboard/chat/sessions")
        if (response.ok) {
          const data = await response.json()
          const apiSessions = parseApiSessions(data)
          setSessions(apiSessions)
          // Update localStorage with API data
          localStorage.setItem(STORAGE_KEY, JSON.stringify(apiSessions))
        }
      } catch (error) {
        console.error("[ChatSessions] Failed to fetch from API:", error)
        // Keep using localStorage data as fallback
      }
    }

    loadSessions()
  }, [])

  // Save to localStorage whenever sessions change (for offline cache)
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

  // Create a new session
  const createSession = useCallback(async (assistantId: string): Promise<ChatSession> => {
    // Create optimistically with a temporary ID
    const tempId = crypto.randomUUID()
    const newSession: ChatSession = {
      id: tempId,
      title: "New Chat",
      assistantId,
      createdAt: new Date(),
      messages: [],
    }

    // Update UI immediately
    setSessions((prev) => [newSession, ...prev])
    setActiveSessionId(tempId)

    // Create in database
    try {
      const response = await fetch("/api/dashboard/chat/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assistantId }),
      })

      if (response.ok) {
        const data = await response.json()
        const dbSession: ChatSession = {
          id: data.id,
          title: data.title,
          assistantId: data.assistantId,
          createdAt: new Date(data.createdAt),
          messages: [],
        }

        // Replace temp session with real one
        setSessions((prev) =>
          prev.map((s) => (s.id === tempId ? dbSession : s))
        )
        setActiveSessionId(dbSession.id)
        return dbSession
      }
    } catch (error) {
      console.error("[ChatSessions] Failed to create session in database:", error)
    }

    return newSession
  }, [])

  // Update a session (title, messages, etc.)
  const updateSession = useCallback((sessionId: string, updates: Partial<ChatSession>) => {
    setSessions((prev) =>
      prev.map((s) => (s.id === sessionId ? { ...s, ...updates } : s))
    )

    // Sync title changes to database
    if (updates.title) {
      fetch(`/api/dashboard/chat/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: updates.title }),
      }).catch((error) => {
        console.error("[ChatSessions] Failed to update session title:", error)
      })
    }
  }, [])

  // Sync messages to database (debounced)
  const syncMessages = useCallback((sessionId: string, messages: ChatMessage[]) => {
    // Update local state immediately
    setSessions((prev) =>
      prev.map((s) => (s.id === sessionId ? { ...s, messages } : s))
    )

    // Debounce database sync
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current)
    }

    setIsSyncing(true)
    syncTimeoutRef.current = setTimeout(async () => {
      try {
        // Get current session messages from database
        const response = await fetch(`/api/dashboard/chat/sessions/${sessionId}`)
        if (!response.ok) {
          setIsSyncing(false)
          return
        }

        const data = await response.json()
        const existingMessageIds = new Set(data.messages.map((m: any) => m.id))

        // Find new messages to add
        const newMessages = messages.filter((m) => !existingMessageIds.has(m.id))

        if (newMessages.length > 0) {
          await fetch(`/api/dashboard/chat/sessions/${sessionId}/messages`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              messages: newMessages.map((m) => ({
                id: m.id,
                role: m.role,
                content: m.content,
                replyTo: m.replyTo,
                editHistory: m.editHistory?.map((h) => ({
                  ...h,
                  editedAt: h.editedAt.toISOString(),
                })),
                sources: m.sources,
              })),
            }),
          })
        }

        // Update existing messages that have changes (like editHistory)
        const existingMessages = messages.filter((m) => existingMessageIds.has(m.id))
        for (const msg of existingMessages) {
          const dbMsg = data.messages.find((dm: any) => dm.id === msg.id)
          if (dbMsg && (
            msg.content !== dbMsg.content ||
            JSON.stringify(msg.editHistory) !== JSON.stringify(dbMsg.editHistory)
          )) {
            await fetch(`/api/dashboard/chat/sessions/${sessionId}/messages`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                messageId: msg.id,
                content: msg.content,
                editHistory: msg.editHistory?.map((h) => ({
                  ...h,
                  editedAt: h.editedAt.toISOString(),
                })),
              }),
            })
          }
        }
      } catch (error) {
        console.error("[ChatSessions] Failed to sync messages:", error)
      } finally {
        setIsSyncing(false)
      }
    }, 1000) // Debounce by 1 second
  }, [])

  // Delete a session
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

    // Delete from database
    fetch(`/api/dashboard/chat/sessions/${sessionId}`, {
      method: "DELETE",
    }).catch((error) => {
      console.error("[ChatSessions] Failed to delete session:", error)
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
        syncMessages,
        isLoaded,
        isSyncing,
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
