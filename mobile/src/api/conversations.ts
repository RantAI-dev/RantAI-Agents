import { apiFetch } from "./client"

export interface Conversation {
  id: string
  sessionId: string
  title?: string | null
  status: string
  channel: string
  createdAt: string
  updatedAt: string
  lastMessagePreview?: string | null
}

export interface ChatMessage {
  id: string
  role: "user" | "assistant" | "system" | "tool"
  content: string
  createdAt: string
  attachments?: { id: string; url: string; mimeType: string; name: string }[]
}

export const conversationsApi = {
  list: () => apiFetch<{ conversations: Conversation[] }>("/api/conversations"),
  /** Fetches the message history for a conversation. */
  messages: (id: string) =>
    apiFetch<{ messages: ChatMessage[] }>(`/api/conversations/${id}/messages`),
  create: (sessionId: string) =>
    apiFetch<Conversation>("/api/conversations", {
      method: "POST",
      json: { sessionId },
    }),
  delete: (id: string) =>
    apiFetch<void>(`/api/conversations/${id}`, { method: "DELETE" }),
}
