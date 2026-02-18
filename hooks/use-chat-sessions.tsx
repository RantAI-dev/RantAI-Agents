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
  metadata?: { artifactIds?: string[] } | null
}

export interface PersistedArtifactData {
  id: string
  title: string
  content: string
  artifactType: string
  metadata?: {
    artifactLanguage?: string
    versions?: Array<{ content: string; title: string; timestamp: number }>
  } | null
}

export interface ChatSession {
  id: string
  title: string
  assistantId: string
  createdAt: Date
  messages: ChatMessage[]
  artifacts?: PersistedArtifactData[]
}

const STORAGE_KEY = "rantai-agents-chat-sessions"

// Parse session metadata from list API (no messages)
function parseSessionMetadata(data: any[]): ChatSession[] {
  return data.map((s) => ({
    id: s.id,
    title: s.title,
    assistantId: s.assistantId || "",
    createdAt: new Date(s.createdAt),
    messages: [], // Messages loaded on demand
  }))
}

// Parse full session from detail API (with messages)
function parseFullSession(data: any): ChatSession {
  return {
    id: data.id,
    title: data.title,
    assistantId: data.assistantId || "",
    createdAt: new Date(data.createdAt),
    messages: (data.messages || []).map((m: any) => ({
      ...m,
      createdAt: new Date(m.createdAt),
      editHistory: m.editHistory?.map((h: any) => ({
        ...h,
        editedAt: new Date(h.editedAt),
      })),
    })),
    artifacts: data.artifacts || undefined,
  }
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
  const loadedSessionsRef = useRef<Set<string>>(new Set())

  // Load session list (metadata only) from API
  useEffect(() => {
    const loadSessions = async () => {
      // Restore active session ID from localStorage
      const lastActive = localStorage.getItem(`${STORAGE_KEY}-active`)
      if (lastActive) {
        setActiveSessionId(lastActive)
      }
      setIsLoaded(true)

      try {
        const response = await fetch("/api/dashboard/chat/sessions")
        if (response.ok) {
          const data = await response.json()
          const apiSessions = parseSessionMetadata(data)
          setSessions(apiSessions)
        }
      } catch (error) {
        console.error("[ChatSessions] Failed to fetch from API:", error)
      }
    }

    loadSessions()
  }, [])

  // Save active session ID
  useEffect(() => {
    if (isLoaded && activeSessionId) {
      localStorage.setItem(`${STORAGE_KEY}-active`, activeSessionId)
    }
  }, [activeSessionId, isLoaded])

  // Lazy-load messages when active session changes
  useEffect(() => {
    if (!activeSessionId) return

    const session = sessions.find((s) => s.id === activeSessionId)
    if (!session) return

    // Skip if already loaded (has messages or was loaded before)
    if (session.messages.length > 0 || loadedSessionsRef.current.has(activeSessionId)) return

    const loadMessages = async () => {
      try {
        const response = await fetch(`/api/dashboard/chat/sessions/${activeSessionId}`)
        if (response.ok) {
          const data = await response.json()
          const fullSession = parseFullSession(data)
          loadedSessionsRef.current.add(activeSessionId)
          setSessions((prev) =>
            prev.map((s) =>
              s.id === activeSessionId
                ? { ...s, messages: fullSession.messages, artifacts: fullSession.artifacts }
                : s
            )
          )
        }
      } catch (error) {
        console.error("[ChatSessions] Failed to load session messages:", error)
      }
    }

    loadMessages()
  }, [activeSessionId, sessions])

  const activeSession = sessions.find((s) => s.id === activeSessionId)

  // Create a new session
  const createSession = useCallback(async (assistantId: string): Promise<ChatSession> => {
    const tempId = crypto.randomUUID()
    const newSession: ChatSession = {
      id: tempId,
      title: "New Chat",
      assistantId,
      createdAt: new Date(),
      messages: [],
    }

    setSessions((prev) => [newSession, ...prev])
    setActiveSessionId(tempId)
    loadedSessionsRef.current.add(tempId) // Mark as loaded (empty is valid)

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

        loadedSessionsRef.current.delete(tempId)
        loadedSessionsRef.current.add(dbSession.id)
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
    setSessions((prev) =>
      prev.map((s) => (s.id === sessionId ? { ...s, messages } : s))
    )

    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current)
    }

    setIsSyncing(true)
    syncTimeoutRef.current = setTimeout(async () => {
      try {
        const response = await fetch(`/api/dashboard/chat/sessions/${sessionId}`)
        if (!response.ok) {
          setIsSyncing(false)
          return
        }

        const data = await response.json()
        const existingMessageIds = new Set(data.messages.map((m: any) => m.id))

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
                metadata: m.metadata,
              })),
            }),
          })
        }

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
    }, 1000)
  }, [])

  // Delete a session — uses functional state to avoid stale closures (#23)
  const deleteSession = useCallback((sessionId: string) => {
    setSessions((prev) => {
      const filtered = prev.filter((s) => s.id !== sessionId)
      // Derive next active session from the filtered list
      setActiveSessionId((current) =>
        current === sessionId ? (filtered[0]?.id ?? null) : current
      )
      return filtered
    })

    loadedSessionsRef.current.delete(sessionId)

    fetch(`/api/dashboard/chat/sessions/${sessionId}`, {
      method: "DELETE",
    }).catch((error) => {
      console.error("[ChatSessions] Failed to delete session:", error)
    })
  }, [])

  // Cleanup debounce timeout on unmount
  useEffect(() => {
    return () => {
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current)
      }
    }
  }, [])

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
