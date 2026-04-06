import type { Server as HTTPServer } from "http"
import type { Socket as NetSocket } from "net"
import type { Server as IOServer } from "socket.io"

export interface SocketServer extends HTTPServer {
  io?: IOServer
}

export interface SocketWithIO extends NetSocket {
  server: SocketServer
}

// Customer events
export interface CustomerToServerEvents {
  "chat:join": (data: { sessionId: string }) => void
  "chat:message": (data: { content: string; sessionId: string }) => void
  "chat:typing": (data: { sessionId: string }) => void
  "chat:request-agent": (data: {
    sessionId: string
    customerName: string
    customerEmail: string
    productInterest?: string
  }) => void
  "chat:leave": (data: { sessionId: string }) => void
}

export interface ServerToCustomerEvents {
  "chat:message": (data: {
    id: string
    role: string
    content: string
    createdAt: string
  }) => void
  "chat:agent-joined": (data: { agentName: string }) => void
  "chat:agent-typing": () => void
  "chat:agent-left": () => void
  "chat:queue-position": (data: { position: number }) => void
  "chat:error": (data: { message: string }) => void
  "chat:status-update": (data: { status: string }) => void
  "chat:new-session": (data: { sessionId: string }) => void
  "chat:channel-response": (data: {
    channel: string
    message: string
    externalId?: string
    metadata?: {
      widgetMode?: boolean
      orgId?: string
      deploymentName?: string
      siteUrl?: string
      scrt2Url?: string
      prechatData?: Record<string, string>
    }
  }) => void
}

// Agent events
export interface AgentToServerEvents {
  "agent:online": (data: { agentId: string }) => void
  "agent:offline": (data: { agentId: string }) => void
  "agent:status-change": (data: { agentId: string; status: string }) => void
  "agent:accept": (data: { agentId: string; conversationId: string }) => void
  "agent:message": (data: {
    agentId: string
    conversationId: string
    content: string
  }) => void
  "agent:typing": (data: { conversationId: string }) => void
  "agent:resolve": (data: { agentId: string; conversationId: string }) => void
  "agent:leave-conversation": (data: { conversationId: string }) => void
  "agent:rejoin-conversation": (data: { agentId: string; conversationId: string }) => void
}

export interface ServerToAgentEvents {
  "queue:update": (data: { conversations: QueueConversation[] }) => void
  "conversation:new": (data: QueueConversation) => void
  "conversation:message": (data: {
    conversationId: string
    id: string
    role: string
    content: string
    createdAt: string
  }) => void
  "conversation:typing": (data: { conversationId: string }) => void
  "conversation:ended": (data: { conversationId: string }) => void
}

export interface QueueConversation {
  id: string
  sessionId: string
  customerName: string | null
  customerEmail: string | null
  customerPhone: string | null
  productInterest: string | null
  channel: string
  createdAt: string
  handoffAt: string | null
  messagePreview: string | null
}

// Conversation status constants
export const ConversationStatus = {
  AI_ACTIVE: "AI_ACTIVE",
  HANDOFF_REQUESTED: "HANDOFF_REQUESTED",
  WAITING_FOR_AGENT: "WAITING_FOR_AGENT",
  AGENT_CONNECTED: "AGENT_CONNECTED",
  RESOLVED: "RESOLVED",
} as const

export type ConversationStatusType =
  (typeof ConversationStatus)[keyof typeof ConversationStatus]

// Message role constants
export const MessageRole = {
  USER: "USER",
  ASSISTANT: "ASSISTANT",
  AGENT: "AGENT",
  SYSTEM: "SYSTEM",
} as const

export type MessageRoleType = (typeof MessageRole)[keyof typeof MessageRole]

// Agent status constants
export const AgentStatus = {
  ONLINE: "ONLINE",
  BUSY: "BUSY",
  AWAY: "AWAY",
  OFFLINE: "OFFLINE",
} as const

export type AgentStatusType = (typeof AgentStatus)[keyof typeof AgentStatus]

// Workflow execution events
export interface WorkflowExecutionEvents {
  "workflow:step:start": (data: {
    runId: string
    nodeId: string
    nodeType: string
    label: string
  }) => void
  "workflow:step:success": (data: {
    runId: string
    nodeId: string
    nodeType: string
    durationMs: number
    outputPreview?: string
  }) => void
  "workflow:step:error": (data: {
    runId: string
    nodeId: string
    nodeType: string
    error: string
    durationMs: number
  }) => void
  "workflow:step:suspend": (data: {
    runId: string
    nodeId: string
    nodeType: string
    prompt?: string
  }) => void
  "workflow:step:stream-chunk": (data: {
    runId: string
    nodeId: string
    chunk: string
    accumulated: string
  }) => void
  "workflow:run:complete": (data: {
    runId: string
    status: "COMPLETED" | "FAILED" | "PAUSED"
    durationMs: number
    error?: string
  }) => void
}

export interface WorkflowClientToServerEvents {
  "workflow:join": (data: { runId: string }) => void
  "workflow:leave": (data: { runId: string }) => void
}
