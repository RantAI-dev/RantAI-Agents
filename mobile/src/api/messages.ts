import { apiFetch } from "./client"
import type { ChatMessage } from "./conversations"

export const messagesApi = {
  list: (sessionId: string) =>
    apiFetch<{ messages: ChatMessage[] }>(
      `/api/dashboard/chat/sessions/${sessionId}/messages`,
    ),
  append: (sessionId: string, messages: { role: string; content: string }[]) =>
    apiFetch<{ messages: ChatMessage[] }>(
      `/api/dashboard/chat/sessions/${sessionId}/messages`,
      { method: "POST", json: { messages } },
    ),
}
