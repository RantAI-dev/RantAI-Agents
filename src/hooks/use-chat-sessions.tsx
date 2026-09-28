"use client"

import { useOrgFetch } from "@/hooks/use-organization"

import { useState, useEffect, useCallback, createContext, useContext, ReactNode, useRef } from "react"
import {
  normalizeSerializedChatSession,
  type SerializedChatSession,
} from "@/features/conversations/components/chat/pages/chat-session-data"
import { toast } from "@/hooks/use-toast"
import {
  accumulatePendingDeletes,
  filterDeletedSessions,
  hasNewMessageIds,
  moveSessionToTop,
  selectMessageIdsToDelete,
} from "@/features/conversations/sessions/session-sync"

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
  /** Last activity (server `updatedAt`, bumped client-side on send). Drives
   *  sidebar order and the "last active" timestamp. */
  updatedAt?: Date
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
    ...(s.updatedAt && { updatedAt: new Date(s.updatedAt) }),
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
  createPersistedSession: (assistantId: string, signal?: AbortSignal) => Promise<ChatSession>
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

// A stale hydration payload must not move a session's last-activity back in
// time (the client bumps it optimistically on send).
function latestDate(a: Date | undefined, b: Date | undefined): Date | undefined {
  if (!a) return b
  if (!b) return a
  return a.getTime() >= b.getTime() ? a : b
}

function mergeHydratedSessions(
  previousSessions: ChatSession[],
  incomingSessions: SerializedChatSession[]
): ChatSession[] {
  const remaining = [...previousSessions]
  const merged: ChatSession[] = []

  for (const rawSession of incomingSessions) {
    const normalized = normalizeSerializedChatSession(rawSession)

    // The list-summary endpoint returns sessions with messages: [] and
    // artifacts: []. Falling back to the existing values when the
    // hydration payload looks like a summary keeps in-memory message
    // history and artifact references from being wiped on every merge.
    const exactMatchIndex = remaining.findIndex((session) => session.id === normalized.id)
    if (exactMatchIndex >= 0) {
      const existing = remaining.splice(exactMatchIndex, 1)[0]
      merged.push({
        ...existing,
        ...normalized,
        id: existing.id,
        dbId: existing.dbId ?? normalized.dbId,
        updatedAt: latestDate(existing.updatedAt, normalized.updatedAt),
        messages: normalized.messages.length > 0 ? normalized.messages : existing.messages,
        artifacts:
          normalized.artifacts && normalized.artifacts.length > 0
            ? normalized.artifacts
            : existing.artifacts,
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
        updatedAt: latestDate(existing.updatedAt, normalized.updatedAt),
        messages: normalized.messages.length > 0 ? normalized.messages : existing.messages,
        artifacts:
          normalized.artifacts && normalized.artifacts.length > 0
            ? normalized.artifacts
            : existing.artifacts,
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
  const orgFetch = useOrgFetch()
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
  // Debounce timers and pending sync functions are keyed per session. A
  // single shared timer meant a sync for chat B cancelled the not-yet-flushed
  // sync for chat A (switching chats inside the 1s window dropped A's writes).
  const syncTimeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  // Holds the latest pending sync function per session so unmount (e.g. Fast
  // Refresh) can flush it instead of dropping in-flight writes. Without this,
  // the 1s debounce window could swallow the user's last message on hot reload.
  const pendingSyncFnsRef = useRef<Map<string, () => Promise<void>>>(new Map())
  // Message ids the UI removed (delete / edit / regenerate truncation, error
  // rollback, clear) that still need a server DELETE. Accumulated across
  // debounced calls; see session-sync.ts for the known-and-removed rule.
  const pendingDeletesRef = useRef<Map<string, Set<string>>>(new Map())
  // The last message-id list each session's workspace reported through
  // syncMessages. Used as the "previously known" list so that a lazy load
  // which swaps in server history the workspace never displayed cannot be
  // mistaken for the user removing that history.
  const lastSyncedIdsRef = useRef<Map<string, string[]>>(new Map())
  // Sessions deleted in this tab. Hydration payloads can be stale (router
  // cache, or a page render that raced the DELETE); filtering them keeps a
  // deleted chat from reappearing in the sidebar.
  const deletedSessionIdsRef = useRef<Set<string>>(new Set())
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
        const response = await orgFetch("/api/dashboard/chat/sessions")
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
        const response = await orgFetch(`/api/dashboard/chat/sessions/${apiId}`)
        if (response.ok) {
          const data = await response.json()
          const fullSession = parseFullSession(data)
          loadedSessionsRef.current.add(activeSessionId)
          setSessions((prev) =>
            prev.map((s) => {
              if (s.id !== activeSessionId) return s
              // If the user already sent something while this request was in
              // flight, keep their local messages and put the loaded history
              // in front of them instead of replacing the list wholesale.
              const localIds = new Set(s.messages.map((m) => m.id))
              const messages =
                s.messages.length === 0
                  ? fullSession.messages
                  : [
                      ...fullSession.messages.filter((m) => !localIds.has(m.id)),
                      ...s.messages,
                    ]
              return { ...s, messages, artifacts: fullSession.artifacts }
            })
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
    const liveSessions = filterDeletedSessions(nextSessions, deletedSessionIdsRef.current)
    setSessions((prev) => {
      if (liveSessions.length === 0) {
        return []
      }

      return mergeHydratedSessions(prev, liveSessions)
    })
    setIsLoaded(true)
  }, [])

  // Persisted variant — awaits the DB POST before resolving so callers
  // can navigate straight to /dashboard/chat/[realDbId]. This avoids the
  // mid-typing URL swap that the older tempId-then-replace flow caused
  // (router.replace would fire when dbId resolved, kicking the user
  // out of focus while they were composing their first message).
  //
  // Accepts an optional AbortSignal so callers can cancel the in-flight
  // POST if the user navigates away before it resolves — without a
  // cancel path the server ends up with an orphan empty session that
  // the user never sees.
  const createPersistedSession = useCallback(
    async (assistantId: string, signal?: AbortSignal): Promise<ChatSession> => {
      const response = await orgFetch("/api/dashboard/chat/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assistantId }),
        signal,
      })
      if (!response.ok) {
        throw new Error(`Failed to create chat session: ${response.status}`)
      }
      const data = await response.json()
      const session: ChatSession = {
        id: data.id,
        dbId: data.id,
        title: data.title ?? "New Chat",
        assistantId,
        createdAt: new Date(data.createdAt ?? Date.now()),
        updatedAt: new Date(data.createdAt ?? Date.now()),
        messages: [],
      }
      loadedSessionsRef.current.add(session.id)
      setSessions((prev) => [session, ...prev])
      setActiveSessionId(session.id)
      return session
    },
    [],
  )

  // Resolve the DB-persisted ID for a session (handles tempId → dbId mapping)
  // Uses sessionsRef to always get the latest state (important for debounced callbacks)
  const resolveDbId = useCallback((sessionId: string): string => {
    return sessionsRef.current.find((s) => s.id === sessionId)?.dbId || sessionId
  }, [])

  // Update a session (title, messages, etc.)
  const updateSession = useCallback((sessionId: string, updates: Partial<ChatSession>) => {
    // Capture the previous title so we can roll back the optimistic update
    // if the PATCH fails — without rollback, the sidebar shows the new
    // title while the server keeps the old one and silently restores it
    // on next refresh, confusing the user.
    const previousTitle = sessionsRef.current.find((s) => s.id === sessionId)?.title

    setSessions((prev) =>
      prev.map((s) => (s.id === sessionId ? { ...s, ...updates } : s))
    )

    if (updates.title) {
      const apiId = resolveDbId(sessionId)
      if (apiId) {
        orgFetch(`/api/dashboard/chat/sessions/${apiId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: updates.title }),
        })
          .then((response) => {
            if (!response.ok) {
              throw new Error(`PATCH failed with ${response.status}`)
            }
          })
          .catch((error) => {
            console.error("[ChatSessions] Failed to update session title:", error)
            if (previousTitle !== undefined) {
              setSessions((prev) =>
                prev.map((s) => (s.id === sessionId ? { ...s, title: previousTitle } : s))
              )
            }
            toast({
              title: "Couldn't rename chat",
              description: "We couldn't save the new title. The previous title has been restored.",
              variant: "destructive",
            })
          })
      }
    }
  }, [resolveDbId])

  // Sync messages to database (debounced)
  const syncMessages = useCallback((sessionId: string, messages: ChatMessage[]) => {
    const nextIds = messages.map((m) => m.id)
    const previousIds =
      lastSyncedIdsRef.current.get(sessionId) ??
      sessionsRef.current.find((s) => s.id === sessionId)?.messages.map((m) => m.id) ??
      []
    lastSyncedIdsRef.current.set(sessionId, nextIds)
    pendingDeletesRef.current.set(
      sessionId,
      accumulatePendingDeletes(
        pendingDeletesRef.current.get(sessionId) ?? new Set(),
        previousIds,
        nextIds,
      ),
    )
    // A new message id means the user just sent (or edited/regenerated) —
    // bump last activity and move the chat to the top of the sidebar now,
    // not only after the next navigation re-fetches the server order.
    const isNewActivity = hasNewMessageIds(previousIds, nextIds)

    setSessions((prev) => {
      const updated = prev.map((s) => (s.id === sessionId ? { ...s, messages } : s))
      return isNewActivity ? moveSessionToTop(updated, sessionId, new Date()) : updated
    })

    const existingTimeout = syncTimeoutsRef.current.get(sessionId)
    if (existingTimeout) {
      clearTimeout(existingTimeout)
    }

    setIsSyncing(true)
    const performSync = async () => {
      syncTimeoutsRef.current.delete(sessionId)
      pendingSyncFnsRef.current.delete(sessionId)
      // Resolve DB ID lazily (after debounce) so createSession has time to set dbId
      const apiId = resolveDbId(sessionId)
      try {
        const response = await orgFetch(`/api/dashboard/chat/sessions/${apiId}`)
        if (!response.ok) {
          setIsSyncing(false)
          return
        }

        const data = await response.json()
        const existingMessageIds = new Set<string>(data.messages.map((m: any) => m.id))

        // Persist removals (delete / edit / regenerate truncation). Only ids
        // this tab previously held and then dropped are eligible — never
        // "whatever the server has that we don't", which would wipe history
        // whenever the local list is partial.
        const pendingDeletes = pendingDeletesRef.current.get(sessionId)
        if (pendingDeletes && pendingDeletes.size > 0) {
          const idsToDelete = selectMessageIdsToDelete(pendingDeletes, existingMessageIds, nextIds)
          if (idsToDelete.length > 0) {
            const deleteResponse = await orgFetch(`/api/dashboard/chat/sessions/${apiId}/messages`, {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ messageIds: idsToDelete }),
            })
            if (deleteResponse.ok) {
              for (const id of idsToDelete) pendingDeletes.delete(id)
            } else {
              console.error("[ChatSessions] Failed to delete messages:", deleteResponse.status)
            }
          }
          // Ids not on the server yet stay pending on purpose: the chat
          // route upserts the turn at stream end, so a message removed
          // mid-stream can land after this sync — the next sync removes it.
        }

        const newMessages = messages.filter((m) => !existingMessageIds.has(m.id))

        if (newMessages.length > 0) {
          await orgFetch(`/api/dashboard/chat/sessions/${apiId}/messages`, {
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
            await orgFetch(`/api/dashboard/chat/sessions/${apiId}/messages`, {
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
    }
    pendingSyncFnsRef.current.set(sessionId, performSync)
    syncTimeoutsRef.current.set(
      sessionId,
      setTimeout(() => {
        void performSync()
      }, 1000),
    )
  }, [resolveDbId])

  // Delete a session — caller is responsible for navigation after deletion
  const deleteSession = useCallback((sessionId: string) => {
    const apiId = resolveDbId(sessionId)
    // Snapshot the previous state so we can resurrect the session if the
    // DELETE call fails. Without rollback, a server-side error leaves the
    // sidebar empty while the row stays in the DB; the session reappears
    // as a "ghost" on next refresh, which reads as a serious bug.
    const previousSession = sessionsRef.current.find((s) => s.id === sessionId)
    let previousActiveId: string | null = null

    deletedSessionIdsRef.current.add(sessionId)
    deletedSessionIdsRef.current.add(apiId)
    setSessions((prev) => prev.filter((s) => s.id !== sessionId))

    // Drop any debounced sync for the deleted chat — it would only 404.
    const pendingTimeout = syncTimeoutsRef.current.get(sessionId)
    if (pendingTimeout) clearTimeout(pendingTimeout)
    syncTimeoutsRef.current.delete(sessionId)
    pendingSyncFnsRef.current.delete(sessionId)
    pendingDeletesRef.current.delete(sessionId)
    lastSyncedIdsRef.current.delete(sessionId)

    // Clear active session if it was the deleted one
    setActiveSessionId((current) => {
      previousActiveId = current
      return current === sessionId ? null : current
    })

    loadedSessionsRef.current.delete(sessionId)

    // Drop the per-session toolbar snapshot from sessionStorage. Without
    // this, ChatHome's toolbar state piles up under chat-toolbar-state:*
    // keys forever and eventually trips the 5MB sessionStorage quota.
    if (typeof window !== "undefined") {
      try {
        window.sessionStorage.removeItem(`chat-toolbar-state:${sessionId}`)
        if (apiId !== sessionId) {
          window.sessionStorage.removeItem(`chat-toolbar-state:${apiId}`)
        }
      } catch {
        // sessionStorage unavailable — best-effort cleanup, ignore
      }
    }

    orgFetch(`/api/dashboard/chat/sessions/${apiId}`, {
      method: "DELETE",
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`DELETE failed with ${response.status}`)
        }
      })
      .catch((error) => {
        console.error("[ChatSessions] Failed to delete session:", error)
        deletedSessionIdsRef.current.delete(sessionId)
        deletedSessionIdsRef.current.delete(apiId)
        if (previousSession) {
          setSessions((prev) => {
            if (prev.some((s) => s.id === sessionId)) return prev
            return [previousSession, ...prev]
          })
          if (previousActiveId === sessionId) {
            setActiveSessionId(sessionId)
          }
        }
        toast({
          title: "Couldn't delete chat",
          description: "We couldn't remove this chat from the server. It has been restored.",
          variant: "destructive",
        })
      })
  }, [resolveDbId])

  // Flush pending sync on unmount. Previously this just cleared the
  // timeout, which dropped any messages still inside the 1s debounce
  // window — on Next.js Fast Refresh that's the user's most recent turn,
  // and they reported it disappearing on reload as Q,A,Q (last A missing)
  // or just the assistant message vanishing. We now fire the pending
  // sync immediately. The server-side upsert is keyed on message `id`,
  // so a duplicate post from the remounted tree is a no-op.
  useEffect(() => {
    const timeouts = syncTimeoutsRef.current
    const pendingFns = pendingSyncFnsRef.current
    return () => {
      for (const timeout of timeouts.values()) clearTimeout(timeout)
      timeouts.clear()
      const flushes = Array.from(pendingFns.values())
      pendingFns.clear()
      for (const flush of flushes) void flush()
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
        createPersistedSession,
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

  const orgFetch = useOrgFetch()
  const context = useContext(ChatSessionsContext)
  if (!context) {
    throw new Error("useChatSessions must be used within a ChatSessionsProvider")
  }
  return context
}
