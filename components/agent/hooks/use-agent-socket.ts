"use client"

import { useEffect, useRef, useCallback, useState } from "react"
import { io, Socket } from "socket.io-client"
import type {
  AgentToServerEvents,
  ServerToAgentEvents,
  QueueConversation,
} from "@/types/socket"

type AgentSocket = Socket<ServerToAgentEvents, AgentToServerEvents>

const ONLINE_STORAGE_KEY = "rantai-agent-online"

interface UseAgentSocketOptions {
  agentId: string
  onQueueUpdate?: (conversations: QueueConversation[]) => void
  onNewConversation?: (conversation: QueueConversation) => void
  onMessage?: (data: {
    conversationId: string
    id: string
    role: string
    content: string
    createdAt: string
  }) => void
  onCustomerTyping?: (conversationId: string) => void
  onConversationEnded?: (conversationId: string) => void
}

export function useAgentSocket({
  agentId,
  onQueueUpdate,
  onNewConversation,
  onMessage,
  onCustomerTyping,
  onConversationEnded,
}: UseAgentSocketOptions) {
  const socketRef = useRef<AgentSocket | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [isOnline, setIsOnline] = useState(false)
  const isOnlineRef = useRef(false)

  // Keep callbacks in refs to avoid reconnection on every render
  const callbacksRef = useRef({
    onQueueUpdate,
    onNewConversation,
    onMessage,
    onCustomerTyping,
    onConversationEnded,
  })

  // Update refs when callbacks change
  useEffect(() => {
    callbacksRef.current = {
      onQueueUpdate,
      onNewConversation,
      onMessage,
      onCustomerTyping,
      onConversationEnded,
    }
  })

  // Keep isOnline ref in sync and persist to sessionStorage
  useEffect(() => {
    isOnlineRef.current = isOnline
    try {
      sessionStorage.setItem(ONLINE_STORAGE_KEY, isOnline ? "1" : "0")
    } catch {
      // Ignore storage errors
    }
  }, [isOnline])

  useEffect(() => {
    if (!agentId) return

    socketRef.current = io({
      path: "/api/socket",
      addTrailingSlash: false,
    }) as AgentSocket

    const socket = socketRef.current

    socket.on("connect", () => {
      setIsConnected(true)

      // Auto-restore online state from sessionStorage after reconnect
      try {
        const wasOnline = sessionStorage.getItem(ONLINE_STORAGE_KEY) === "1"
        if (wasOnline) {
          socket.emit("agent:online", { agentId })
          setIsOnline(true)
        }
      } catch {
        // Ignore storage errors
      }
    })

    socket.on("disconnect", () => {
      setIsConnected(false)
      // Don't reset isOnline state on disconnect - we'll restore on reconnect
    })

    socket.on("queue:update", (data) => {
      callbacksRef.current.onQueueUpdate?.(data.conversations)
    })

    socket.on("conversation:new", (conversation) => {
      callbacksRef.current.onNewConversation?.(conversation)
    })

    socket.on("conversation:message", (data) => {
      callbacksRef.current.onMessage?.(data)
    })

    socket.on("conversation:typing", (data) => {
      callbacksRef.current.onCustomerTyping?.(data.conversationId)
    })

    socket.on("conversation:ended", (data) => {
      callbacksRef.current.onConversationEnded?.(data.conversationId)
    })

    return () => {
      if (isOnlineRef.current) {
        socket.emit("agent:offline", { agentId })
      }
      socket.disconnect()
    }
  }, [agentId]) // Only reconnect when agentId changes

  const goOnline = useCallback(() => {
    socketRef.current?.emit("agent:online", { agentId })
    setIsOnline(true)
  }, [agentId])

  const goOffline = useCallback(() => {
    socketRef.current?.emit("agent:offline", { agentId })
    setIsOnline(false)
  }, [agentId])

  const changeStatus = useCallback(
    (status: string) => {
      socketRef.current?.emit("agent:status-change", { agentId, status })
    },
    [agentId]
  )

  const acceptConversation = useCallback(
    (conversationId: string) => {
      socketRef.current?.emit("agent:accept", { agentId, conversationId })
    },
    [agentId]
  )

  const sendMessage = useCallback(
    (conversationId: string, content: string) => {
      socketRef.current?.emit("agent:message", {
        agentId,
        conversationId,
        content,
      })
    },
    [agentId]
  )

  const sendTyping = useCallback((conversationId: string) => {
    socketRef.current?.emit("agent:typing", { conversationId })
  }, [])

  const resolveConversation = useCallback(
    (conversationId: string) => {
      socketRef.current?.emit("agent:resolve", { agentId, conversationId })
    },
    [agentId]
  )

  const leaveConversation = useCallback((conversationId: string) => {
    socketRef.current?.emit("agent:leave-conversation", { conversationId })
  }, [])

  const rejoinConversation = useCallback(
    (conversationId: string) => {
      socketRef.current?.emit("agent:rejoin-conversation", { agentId, conversationId })
    },
    [agentId]
  )

  return {
    isConnected,
    isOnline,
    goOnline,
    goOffline,
    changeStatus,
    acceptConversation,
    sendMessage,
    sendTyping,
    resolveConversation,
    leaveConversation,
    rejoinConversation,
  }
}
