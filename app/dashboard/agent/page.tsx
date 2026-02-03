"use client"

import { useState, useCallback } from "react"
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
import type { QueueConversation } from "@/types/socket"
import { Badge } from "@/components/ui/badge"

interface Message {
  id: string
  role: string
  content: string
  createdAt: string
}

export default function AgentPage() {
  const { data: session } = useSession()
  const isMobile = useIsMobile()
  const [queue, setQueue] = useState<QueueConversation[]>([])
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [customerTyping, setCustomerTyping] = useState(false)

  const agentId = session?.user?.id || ""

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
  } = useAgentSocket({
    agentId,
    onQueueUpdate: handleQueueUpdate,
    onNewConversation: handleNewConversation,
    onMessage: handleMessage,
    onCustomerTyping: handleCustomerTyping,
    onConversationEnded: handleConversationEnded,
  })

  const handleAcceptConversation = async (conversationId: string) => {
    acceptConversation(conversationId)
    setActiveConversationId(conversationId)

    // Fetch conversation messages
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

    // Optimistically add the message
    const newMessage: Message = {
      id: crypto.randomUUID(),
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
    setMessages([])
  }

  const handleBack = () => {
    if (activeConversationId) {
      leaveConversation(activeConversationId)
    }
    setActiveConversationId(null)
    setMessages([])
  }

  const activeConversation = queue.find((c) => c.id === activeConversationId) ||
    (activeConversationId ? { id: activeConversationId } : null)

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="flex h-14 shrink-0 items-center gap-2 border-b pl-14 pr-4">
        <h1 className="text-lg font-semibold">Agent</h1>
        <div className="ml-auto flex items-center gap-2">
          {queue.length > 0 && (
            <Badge variant="secondary">
              {queue.length} waiting
            </Badge>
          )}
          <Badge variant={isOnline ? "default" : "outline"}>
            {isOnline ? "Online" : "Offline"}
          </Badge>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {isMobile ? (
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
            />
          )
        ) : (
          // Desktop: Resizable panels
          <ResizablePanelGroup direction="horizontal" className="h-full">
            <ResizablePanel defaultSize={30} minSize={20} maxSize={40}>
              <QueuePanel
                queue={queue}
                isOnline={isOnline}
                isConnected={isConnected}
                onGoOnline={goOnline}
                onGoOffline={goOffline}
                onAcceptConversation={handleAcceptConversation}
              />
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={70}>
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
