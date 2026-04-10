"use client"

import { useState, useEffect, useCallback, createContext, useContext, ReactNode, useRef } from "react"
import {
  normalizeSerializedChatSession,
  type SerializedChatSession,
} from "@/features/conversations/components/chat/pages/chat-session-data"

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
  metadata?: {
    artifactIds?: string[]
    toolCalls?: Array<{
      toolCallId: string
      toolName: string
      state: string
      input?: Record<string, unknown>
      output?: unknown
      errorText?: string
    }>
    artifacts?: Array<{
      id: string
      title: string
      content: string
      artifactType: string
      metadata?: {
        artifactLanguage?: string
        versions?: Array<{ content: string; title: string; timestamp: number }>
      }
    }>
    attachments?: Array<{
      fileName: string
      mimeType: string
      type: string
      text?: string
      pageCount?: number
      chunkCount?: number
      fileId?: string
    }>
  } | null
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
  /** Real database ID — set after createSession persists to DB. Use for API calls. */
  dbId?: string
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
  hydrateSessions: (sessions: SerializedChatSession[]) => void
  createSession: (assistantId: string) => ChatSession
  updateSession: (sessionId: string, updates: Partial<ChatSession>) => void
  deleteSession: (sessionId: string) => void
  syncMessages: (sessionId: string, messages: ChatMessage[]) => void
  isLoaded: boolean
  isSyncing: boolean
}

const ChatSessionsContext = createContext<ChatSessionsContextType | null>(null)
const CHAT_SESSIONS_HYDRATION_SCRIPT_ID = "rantai-chat-sessions-hydration"

function readHydratedSessionsFromDocument(): SerializedChatSession[] | null {
  if (typeof document === "undefined") {
    return null
  }

  const script = document.getElementById(CHAT_SESSIONS_HYDRATION_SCRIPT_ID)
  if (!script?.textContent) {
    return null
  }

  try {
    const sessions = JSON.parse(script.textContent) as SerializedChatSession[]
    return sessions
  } catch (error) {
    console.error("[ChatSessions] Failed to parse hydrated sessions:", error)
    return null
  }
}

function mergeHydratedSessions(
  previousSessions: ChatSession[],
  incomingSessions: SerializedChatSession[]
): ChatSession[] {
  const remaining = [...previousSessions]
  const merged: ChatSession[] = []

  for (const rawSession of incomingSessions) {
    const normalized = normalizeSerializedChatSession(rawSession)

    const exactMatchIndex = remaining.findIndex((session) => session.id === normalized.id)
    if (exactMatchIndex >= 0) {
      const existing = remaining.splice(exactMatchIndex, 1)[0]
      merged.push({
        ...existing,
        ...normalized,
        id: existing.id,
        dbId: existing.dbId ?? normalized.dbId,
        messages: normalized.messages.length > 0 ? normalized.messages : existing.messages,
        artifacts: normalized.artifacts ?? existing.artifacts,
      })
      continue
    }

    const dbMatchIndex = remaining.findIndex((session) => session.dbId === normalized.id)
    if (dbMatchIndex >= 0) {
      const existing = remaining.splice(dbMatchIndex, 1)[0]
      merged.push({
        ...existing,
        title: normalized.title,
        assistantId: normalized.assistantId,
        createdAt: normalized.createdAt,
        messages: normalized.messages.length > 0 ? normalized.messages : existing.messages,
        artifacts: normalized.artifacts ?? existing.artifacts,
        dbId: normalized.id,
      })
      continue
    }

    merged.push(normalized as ChatSession)
  }

  return [...merged, ...remaining]
}

export function ChatSessionsProvider({
  children,
  initialSessions,
}: {
  children: ReactNode
  initialSessions?: SerializedChatSession[]
}) {
  const [seededSessions] = useState<SerializedChatSession[] | null>(() => {
    if (initialSessions) {
      return initialSessions
    }
    return readHydratedSessionsFromDocument()
  })
  const [sessions, setSessions] = useState<ChatSession[]>(() =>
    seededSessions ? (seededSessions.map((session) => normalizeSerializedChatSession(session)) as ChatSession[]) : []
  )
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [isLoaded, setIsLoaded] = useState(Boolean(seededSessions))
  const [isSyncing, setIsSyncing] = useState(false)
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const loadedSessionsRef = useRef<Set<string>>(new Set())
  const hasSeededSessionsRef = useRef(Boolean(seededSessions))
  const sessionsRef = useRef(sessions)
  sessionsRef.current = sessions

  // Load session list (metadata only) from API
  useEffect(() => {
    if (hasSeededSessionsRef.current) {
      setIsLoaded(true)
      return
    }

    const hydratedSessions = readHydratedSessionsFromDocument()
    if (hydratedSessions) {
      hasSeededSessionsRef.current = true
      setSessions(hydratedSessions.map((session) => normalizeSerializedChatSession(session)) as ChatSession[])
      setIsLoaded(true)
      return
    }

    const loadSessions = async () => {
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

  // Lazy-load messages when active session changes
  useEffect(() => {
    if (!activeSessionId) return

    const session = sessions.find((s) => s.id === activeSessionId)
    if (!session) return

    // Skip if already loaded (has messages or was loaded before)
    if (session.messages.length > 0 || loadedSessionsRef.current.has(activeSessionId)) return

    // Use dbId for API call if available (handles tempId → dbId mapping)
    const apiId = session.dbId || activeSessionId

    const loadMessages = async () => {
      try {
        const response = await fetch(`/api/dashboard/chat/sessions/${apiId}`)
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

  const hydrateSessions = useCallback((nextSessions: SerializedChatSession[]) => {
    hasSeededSessionsRef.current = true
    setSessions((prev) => {
      if (nextSessions.length === 0) {
        return []
      }

      return mergeHydratedSessions(prev, nextSessions)
    })
    setIsLoaded(true)
  }, [])

  // Create a new session — returns immediately with a temp session.
  // DB persistence happens in the background; `dbId` is set once resolved.
  const createSession = useCallback((assistantId: string): ChatSession => {
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

    // Persist to DB in background
    fetch("/api/dashboard/chat/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assistantId }),
    })
      .then(async (response) => {
        if (response.ok) {
          const data = await response.json()
          loadedSessionsRef.current.add(data.id)
          setSessions((prev) =>
            prev.map((s) =>
              s.id === tempId ? { ...s, dbId: data.id, title: data.title } : s
            )
          )
        }
      })
      .catch((error) => {
        console.error("[ChatSessions] Failed to create session in database:", error)
      })

    return newSession
  }, [])

  // Resolve the DB-persisted ID for a session (handles tempId → dbId mapping)
  // Uses sessionsRef to always get the latest state (important for debounced callbacks)
  const resolveDbId = useCallback((sessionId: string): string => {
    return sessionsRef.current.find((s) => s.id === sessionId)?.dbId || sessionId
  }, [])

  // Update a session (title, messages, etc.)
  const updateSession = useCallback((sessionId: string, updates: Partial<ChatSession>) => {
    setSessions((prev) =>
      prev.map((s) => (s.id === sessionId ? { ...s, ...updates } : s))
    )

    if (updates.title) {
      const apiId = resolveDbId(sessionId)
      if (apiId) {
        fetch(`/api/dashboard/chat/sessions/${apiId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: updates.title }),
        }).catch((error) => {
          console.error("[ChatSessions] Failed to update session title:", error)
        })
      }
    }
  }, [resolveDbId])

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
      // Resolve DB ID lazily (after debounce) so createSession has time to set dbId
      const apiId = resolveDbId(sessionId)
      try {
        const response = await fetch(`/api/dashboard/chat/sessions/${apiId}`)
        if (!response.ok) {
          setIsSyncing(false)
          return
        }

        const data = await response.json()
        const existingMessageIds = new Set(data.messages.map((m: any) => m.id))

        const newMessages = messages.filter((m) => !existingMessageIds.has(m.id))

        if (newMessages.length > 0) {
          await fetch(`/api/dashboard/chat/sessions/${apiId}/messages`, {
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
          const nextEditHistory = msg.editHistory?.map((h) => ({
            ...h,
            editedAt: h.editedAt.toISOString(),
          }))
          const hasContentDiff = msg.content !== dbMsg?.content
          const hasEditHistoryDiff =
            JSON.stringify(nextEditHistory) !== JSON.stringify(dbMsg?.editHistory)
          const hasSourcesDiff =
            JSON.stringify(msg.sources ?? null) !== JSON.stringify(dbMsg?.sources ?? null)
          const hasMetadataDiff =
            JSON.stringify(msg.metadata ?? null) !== JSON.stringify(dbMsg?.metadata ?? null)

          if (dbMsg && (
            hasContentDiff ||
            hasEditHistoryDiff ||
            hasSourcesDiff ||
            hasMetadataDiff
          )) {
            await fetch(`/api/dashboard/chat/sessions/${apiId}/messages`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                messageId: msg.id,
                content: msg.content,
                editHistory: nextEditHistory,
                sources: msg.sources,
                metadata: msg.metadata,
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
  }, [resolveDbId])

  // Delete a session — caller is responsible for navigation after deletion
  const deleteSession = useCallback((sessionId: string) => {
    const apiId = resolveDbId(sessionId)

    setSessions((prev) => prev.filter((s) => s.id !== sessionId))

    // Clear active session if it was the deleted one
    setActiveSessionId((current) =>
      current === sessionId ? null : current
    )

    loadedSessionsRef.current.delete(sessionId)

    fetch(`/api/dashboard/chat/sessions/${apiId}`, {
      method: "DELETE",
    }).catch((error) => {
      console.error("[ChatSessions] Failed to delete session:", error)
    })
  }, [resolveDbId])

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
        hydrateSessions,
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
