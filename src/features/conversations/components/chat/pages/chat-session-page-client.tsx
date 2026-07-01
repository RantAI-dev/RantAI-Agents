"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useIsMobile } from "@/hooks/use-mobile"
import { useAssistants, type DbAssistant } from "@/hooks/use-assistants"
import { useChatSessions, type ChatSession, type ChatMessage } from "@/hooks/use-chat-sessions"
import { useToast } from "@/hooks/use-toast"
import { ChatWorkspace } from "@/features/conversations/components/chat/chat-workspace"
import type { InitialChatSettings } from "@/features/conversations/components/chat/chat-home"
import { takePendingChatFiles } from "./pending-chat-files"
import type {
  AssistantSkillInfo,
  AssistantToolInfo,
  KBGroup,
} from "../chat-input-toolbar"
import type { SerializedChatSession } from "./chat-session-data"

export default function ChatSessionPageClient({
  id,
  initialAssistants,
  initialSessions,
  initialAssistantTools,
  initialAssistantSkills,
  initialKnowledgeBaseGroups,
}: {
  id: string
  initialAssistants?: DbAssistant[]
  initialSessions?: SerializedChatSession[]
  initialAssistantTools?: AssistantToolInfo[]
  initialAssistantSkills?: AssistantSkillInfo[]
  initialKnowledgeBaseGroups?: KBGroup[]
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const isMobile = useIsMobile()

  const {
    assistants,
    selectedAssistant,
    getAssistantById,
    refetch: refetchAssistants,
    isLoading: assistantsLoading,
  } = useAssistants({
    initialAssistants,
  })

  const {
    sessions,
    activeSession,
    setActiveSessionId,
    updateSession,
    syncMessages,
    createPersistedSession,
    hydrateSessions,
    isLoaded: sessionsLoaded,
  } = useChatSessions()

  const [pendingMessage, setPendingMessage] = useState<string | null>(null)
  const [pendingSettings, setPendingSettings] = useState<InitialChatSettings | null>(null)
  const [pendingStorageKey, setPendingStorageKey] = useState<string | null>(null)
  const [pendingRead, setPendingRead] = useState(false)

  useEffect(() => {
    if (initialSessions !== undefined) {
      hydrateSessions(initialSessions)
    }
  }, [hydrateSessions, initialSessions])

  useEffect(() => {
    const initToken = searchParams.get("initToken")
    const tokenStorageKey = initToken ? `rantai-pending-chat-init:${initToken}` : null

    const pendingInitRaw = tokenStorageKey
      ? sessionStorage.getItem(tokenStorageKey)
      : sessionStorage.getItem("rantai-pending-chat-init")

    if (pendingInitRaw) {
      try {
        const pendingInit = JSON.parse(pendingInitRaw) as {
          message?: string
          settings?: InitialChatSettings | null
          sessionId?: string | null
          sessionDbId?: string | null
        }
        const matchesSession =
          (pendingInit.sessionDbId && pendingInit.sessionDbId === id) ||
          (pendingInit.sessionId && pendingInit.sessionId === id)

        if (matchesSession && pendingInit.message) {
          setPendingMessage(pendingInit.message)
          // Files were handed off in memory (they can't survive JSON) — restore
          // them onto the settings so the initial send re-attaches the image.
          const handedOffFiles = takePendingChatFiles(initToken)
          const settings = pendingInit.settings ?? null
          setPendingSettings(
            handedOffFiles.length > 0
              ? { ...(settings ?? {}), files: handedOffFiles }
              : settings,
          )
          setPendingStorageKey(tokenStorageKey ?? "rantai-pending-chat-init")
        }
      } catch {
        // Ignore invalid pending payload
      }
    }
    setPendingRead(true)
  }, [id, searchParams])

  useEffect(() => {
    if (!id || sessions.length === 0) return
    const session = sessions.find((s) => s.dbId === id || s.id === id)
    if (session) {
      setActiveSessionId(session.id)
    }
  }, [id, sessions, setActiveSessionId])

  useEffect(() => {
    if (!activeSession?.assistantId) return
    if (getAssistantById(activeSession.assistantId)) return
    void refetchAssistants()
  }, [activeSession?.assistantId, getAssistantById, refetchAssistants])

  const activeSessionAssistant = activeSession
    ? getAssistantById(activeSession.assistantId)
    : selectedAssistant

  const handleUpdateSession = useCallback((sessionId: string, updates: Partial<ChatSession>) => {
    if (updates.messages) {
      syncMessages(sessionId, updates.messages as ChatMessage[])
    }
    if (updates.title) {
      updateSession(sessionId, { title: updates.title })
    }
  }, [updateSession, syncMessages])

  const { toast } = useToast()
  const newChatAbortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    return () => {
      newChatAbortRef.current?.abort()
    }
  }, [])

  const handleNewChat = useCallback(async () => {
    if (!selectedAssistant) return
    newChatAbortRef.current?.abort()
    const controller = new AbortController()
    newChatAbortRef.current = controller
    try {
      const newSession = await createPersistedSession(selectedAssistant.id, controller.signal)
      router.push(`/dashboard/chat/${newSession.id}`)
    } catch (error) {
      if ((error as { name?: string })?.name === "AbortError") return
      console.error("[ChatSession] Failed to create new chat:", error)
      toast({
        title: "Couldn't start chat",
        description:
          error instanceof Error ? error.message : "Network error — try again in a moment.",
        variant: "destructive",
      })
    } finally {
      if (newChatAbortRef.current === controller) {
        newChatAbortRef.current = null
      }
    }
  }, [selectedAssistant, createPersistedSession, router, toast])

  // Session not found (possibly deleted) - redirect to chat home.
  // MUST run before any early return so hook order stays stable across
  // renders (React Rules of Hooks: all hooks run unconditionally in the
  // same order). Only redirect if sessions have loaded AND no entry in
  // the list matches the URL id. Reading the array directly avoids the
  // race where `activeSession` is one render behind `activeSessionId`
  // — the previous predicate `!activeSession` fired the redirect on
  // every refresh because L99-105's setActiveSessionId hadn't applied
  // yet when this effect ran in the same pass.
  useEffect(() => {
    // Wait until the sessions provider has finished its initial load
    // before deciding the URL is invalid. The early-return on empty
    // sessions is split: if the provider says "still loading", do
    // nothing; if it's loaded but the list is genuinely empty, redirect
    // immediately so users with zero sessions on a stale URL don't get
    // stuck on the spinner waiting for sessions.length to grow.
    if (!sessionsLoaded) return
    if (sessions.length === 0) {
      router.replace("/dashboard/chat")
      return
    }
    const exists = sessions.some((s) => s.dbId === id || s.id === id)
    if (!exists) {
      router.replace("/dashboard/chat")
    }
  }, [sessions, id, router, sessionsLoaded])

  // If the loading guards stay true past LOAD_TIMEOUT_MS, surface an
  // error instead of an infinite spinner. Without this, an upstream
  // failure (slow assistants endpoint, broken session detail) leaves
  // the user staring at a spinner with no recovery path.
  const LOAD_TIMEOUT_MS = 10_000
  const [loadTimedOut, setLoadTimedOut] = useState(false)
  const stillLoading =
    assistantsLoading || !pendingRead || !activeSession || !activeSessionAssistant
  useEffect(() => {
    if (!stillLoading) {
      setLoadTimedOut(false)
      return
    }
    const handle = window.setTimeout(() => setLoadTimedOut(true), LOAD_TIMEOUT_MS)
    return () => window.clearTimeout(handle)
  }, [stillLoading])

  if (stillLoading && loadTimedOut) {
    return (
      <div className="flex flex-col h-full bg-background">
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center">
          <p className="text-sm font-medium text-foreground">Couldn&apos;t load this conversation</p>
          <p className="max-w-md text-xs text-muted-foreground">
            We waited 10 seconds and the chat data didn&apos;t arrive. Reload to try again, or go back to your chat list.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted"
            >
              Reload
            </button>
            <button
              type="button"
              onClick={() => router.push("/dashboard/chat")}
              className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted"
            >
              Back to chats
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (assistantsLoading || !pendingRead) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </div>
    )
  }

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
        onInitialMessageConsumed={() => {
          setPendingMessage(null)
          setPendingSettings(null)
          if (pendingStorageKey) {
            sessionStorage.removeItem(pendingStorageKey)
          }
          // Always clear legacy key too.
          sessionStorage.removeItem("rantai-pending-chat-init")
          const initToken = searchParams.get("initToken")
          if (initToken) {
            const currentPath = `/dashboard/chat/${id}`
            router.replace(currentPath)
          }
        }}
        initialAssistantTools={initialAssistantTools}
        initialAssistantSkills={initialAssistantSkills}
        initialKnowledgeBaseGroups={initialKnowledgeBaseGroups}
        onBack={isMobile ? () => router.push("/dashboard/chat") : undefined}
        onUpdateSession={handleUpdateSession}
        onNewChat={handleNewChat}
      />
    </div>
  )
}
