"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import { useSession } from "next-auth/react"
import { QueuePanel } from "./_components/queue-panel"
import { AgentWorkspace } from "./_components/agent-workspace"
import { EmptyState } from "./_components/empty-state"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import { useIsMobile } from "@/hooks/use-mobile"
import { useAgentSocket } from "@/components/agent/hooks/use-agent-socket"
import { DashboardPageHeader } from "../_components/dashboard-page-header"
import type { QueueConversation } from "@/types/socket"
import { Badge } from "@/components/ui/badge"

interface Message {
  id: string
  role: string
  content: string
  createdAt: string
}

// SessionStorage keys for persisting state across refreshes
const ACTIVE_CONV_KEY = "rantai-agent-active-conversation"
const ACCEPTED_CONV_KEY = "rantai-agent-accepted-conversation"

function loadStoredConversation(): { id: string; data: QueueConversation | null } | null {
  try {
    const id = sessionStorage.getItem(ACTIVE_CONV_KEY)
    if (!id) return null
    const raw = sessionStorage.getItem(ACCEPTED_CONV_KEY)
    const data = raw ? JSON.parse(raw) as QueueConversation : null
    return { id, data }
  } catch {
    return null
  }
}

function saveConversationState(id: string | null, data: QueueConversation | null) {
  try {
    if (id) {
      sessionStorage.setItem(ACTIVE_CONV_KEY, id)
      if (data) {
        sessionStorage.setItem(ACCEPTED_CONV_KEY, JSON.stringify(data))
      }
    } else {
      sessionStorage.removeItem(ACTIVE_CONV_KEY)
      sessionStorage.removeItem(ACCEPTED_CONV_KEY)
    }
  } catch {
    // Ignore storage errors
  }
}

export default function AgentPage() {
  const { data: session } = useSession()
  const isMobile = useIsMobile()
  const [queue, setQueue] = useState<QueueConversation[]>([])
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [acceptedConversation, setAcceptedConversation] = useState<QueueConversation | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [customerTyping, setCustomerTyping] = useState(false)
  const [restored, setRestored] = useState(false)

  const agentId = session?.user?.id || ""

  // Restore active conversation from sessionStorage on mount.
  // Validates the conversation is still AGENT_CONNECTED before restoring.
  useEffect(() => {
    const stored = loadStoredConversation()
    if (stored) {
      // Verify the conversation is still active before restoring
      fetch(`/api/conversations/${stored.id}/status`)
        .then((res) => res.ok ? res.json() : null)
        .then((data) => {
          if (data?.status === "AGENT_CONNECTED") {
            setActiveConversationId(stored.id)
            setAcceptedConversation(stored.data)
            // Fetch messages for this conversation
            return fetch(`/api/conversations/${stored.id}/messages`)
          } else {
            // Conversation is no longer active, clear storage
            saveConversationState(null, null)
            return null
          }
        })
        .then((res) => res?.ok ? res.json() : null)
        .then((data) => {
          if (data?.messages) {
            setMessages(data.messages)
          }
        })
        .catch(() => {
          saveConversationState(null, null)
        })
        .finally(() => setRestored(true))
    } else {
      setRestored(true)
    }
  }, [])

  // Persist active conversation state to sessionStorage whenever it changes
  useEffect(() => {
    if (!restored) return
    saveConversationState(activeConversationId, acceptedConversation)
  }, [activeConversationId, acceptedConversation, restored])

  const handleQueueUpdate = useCallback((conversations: QueueConversation[]) => {
    setQueue(conversations)
  }, [])

  const handleNewConversation = useCallback((conversation: QueueConversation) => {
    setQueue((prev) => {
      if (prev.some((c) => c.id === conversation.id)) return prev
      return [...prev, conversation]
    })
  }, [])

  const handleMessage = useCallback(
    (data: Message & { conversationId: string }) => {
      if (data.conversationId === activeConversationId) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === data.id)) return prev

          // If this is a DB-confirmed agent message, replace the first pending
          // optimistic message with matching content instead of appending
          if (data.role === "AGENT") {
            const pendingIdx = prev.findIndex(
              (m) => m.id.startsWith("pending-") && m.content === data.content
            )
            if (pendingIdx !== -1) {
              const updated = [...prev]
              updated[pendingIdx] = data
              return updated
            }
          }

          return [...prev, data]
        })
      }
    },
    [activeConversationId]
  )

  const handleCustomerTyping = useCallback(
    (conversationId: string) => {
      if (conversationId === activeConversationId) {
        setCustomerTyping(true)
        setTimeout(() => setCustomerTyping(false), 3000)
      }
    },
    [activeConversationId]
  )

  const handleConversationEnded = useCallback(
    (conversationId: string) => {
      if (conversationId === activeConversationId) {
        setActiveConversationId(null)
        setAcceptedConversation(null)
        setMessages([])
      }
      setQueue((prev) => prev.filter((c) => c.id !== conversationId))
    },
    [activeConversationId]
  )

  const {
    isConnected,
    isOnline,
    goOnline,
    goOffline,
    acceptConversation,
    sendMessage,
    resolveConversation,
    leaveConversation,
    rejoinConversation,
  } = useAgentSocket({
    agentId,
    onQueueUpdate: handleQueueUpdate,
    onNewConversation: handleNewConversation,
    onMessage: handleMessage,
    onCustomerTyping: handleCustomerTyping,
    onConversationEnded: handleConversationEnded,
  })

  // When socket reconnects and there's a restored conversation, rejoin the room
  const hasRejoinedRef = useRef(false)
  useEffect(() => {
    if (isConnected && restored && activeConversationId && !hasRejoinedRef.current) {
      rejoinConversation(activeConversationId)
      hasRejoinedRef.current = true
    }
    if (!activeConversationId) {
      hasRejoinedRef.current = false
    }
  }, [isConnected, restored, activeConversationId, rejoinConversation])

  // Poll for messages from DB when there's an active conversation.
  // Uses AbortController to cancel in-flight requests when conversation changes,
  // preventing stale responses from overwriting messages for a different conversation.
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    // Abort any in-flight poll from a previous conversation
    abortRef.current?.abort()
    abortRef.current = null

    if (!activeConversationId) return

    const controller = new AbortController()
    abortRef.current = controller
    const convId = activeConversationId // capture for closure

    const poll = async () => {
      try {
        const res = await fetch(`/api/conversations/${convId}/messages`, {
          signal: controller.signal,
        })
        if (!res.ok) return
        const data = await res.json()
        const dbMessages: Message[] = data.messages || []
        if (dbMessages.length === 0) return

        // Replace the full message list with DB data.
        // This ensures no duplicates (optimistic IDs vs DB IDs).
        setMessages((prev) => {
          const lastDbId = dbMessages[dbMessages.length - 1].id
          const lastPrevId = prev.length > 0 ? prev[prev.length - 1].id : null
          if (lastDbId === lastPrevId && dbMessages.length === prev.length) return prev
          return dbMessages
        })
      } catch {
        // Ignore abort and network errors
      }
    }

    const intervalId = setInterval(poll, 3000)

    return () => {
      controller.abort()
      clearInterval(intervalId)
    }
  }, [activeConversationId])

  const handleAcceptConversation = async (conversationId: string) => {
    // Save conversation data before removing from queue
    const conversationData = queue.find((c) => c.id === conversationId) || null

    // Clear old conversation state first to prevent message bleed
    setMessages([])
    hasRejoinedRef.current = false

    if (conversationData) {
      setAcceptedConversation(conversationData)
    }

    acceptConversation(conversationId)
    setActiveConversationId(conversationId)

    // Fetch this conversation's messages
    try {
      const res = await fetch(`/api/conversations/${conversationId}/messages`)
      if (res.ok) {
        const data = await res.json()
        setMessages(data.messages || [])
      }
    } catch (error) {
      console.error("Failed to fetch messages:", error)
    }

    // Remove from queue
    setQueue((prev) => prev.filter((c) => c.id !== conversationId))
  }

  const handleSendMessage = (content: string) => {
    if (!activeConversationId) return
    sendMessage(activeConversationId, content)

    // Optimistic update - use a temp prefix so we can identify it.
    // The next poll cycle will replace the full list with DB data.
    const newMessage: Message = {
      id: `pending-${crypto.randomUUID()}`,
      role: "AGENT",
      content,
      createdAt: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, newMessage])
  }

  const handleResolve = () => {
    if (!activeConversationId) return
    resolveConversation(activeConversationId)
    setActiveConversationId(null)
    setAcceptedConversation(null)
    setMessages([])
  }

  const handleBack = () => {
    if (activeConversationId) {
      leaveConversation(activeConversationId)
    }
    setActiveConversationId(null)
    setAcceptedConversation(null)
    setMessages([])
  }

  const activeConversation = queue.find((c) => c.id === activeConversationId) ||
    (activeConversationId && acceptedConversation?.id === activeConversationId ? acceptedConversation : null) ||
    (activeConversationId ? { id: activeConversationId } : null)

  return (
    <div className="flex flex-col h-full">
      <DashboardPageHeader
        title="Live Chat"
        actions={
          <>
            {queue.length > 0 && (
              <Badge variant="secondary">{queue.length} waiting</Badge>
            )}
            <Badge variant={isOnline ? "default" : "outline"}>
              {isOnline ? "Online" : "Offline"}
            </Badge>
          </>
        }
      />

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {!restored ? null : isMobile ? (
          // Mobile: Show either queue or workspace
          activeConversationId ? (
            <AgentWorkspace
              conversation={activeConversation}
              messages={messages}
              customerTyping={customerTyping}
              onSendMessage={handleSendMessage}
              onResolve={handleResolve}
              onBack={handleBack}
            />
          ) : (
            <QueuePanel
              queue={queue}
              isOnline={isOnline}
              isConnected={isConnected}
              onGoOnline={goOnline}
              onGoOffline={goOffline}
              onAcceptConversation={handleAcceptConversation}
              activeConversation={activeConversation}
            />
          )
        ) : (
          // Desktop: Resizable panels
          <ResizablePanelGroup direction="horizontal" className="h-full" autoSaveId="agent-panels">
            <ResizablePanel defaultSize={25} minSize={18} maxSize={35}>
              <QueuePanel
                queue={queue}
                isOnline={isOnline}
                isConnected={isConnected}
                onGoOnline={goOnline}
                onGoOffline={goOffline}
                onAcceptConversation={handleAcceptConversation}
                activeConversation={activeConversation}
              />
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={75}>
              {activeConversationId ? (
                <AgentWorkspace
                  conversation={activeConversation}
                  messages={messages}
                  customerTyping={customerTyping}
                  onSendMessage={handleSendMessage}
                  onResolve={handleResolve}
                  onBack={handleBack}
                />
              ) : (
                <EmptyState isOnline={isOnline} queueCount={queue.length} />
              )}
            </ResizablePanel>
          </ResizablePanelGroup>
        )}
      </div>
    </div>
  )
}
