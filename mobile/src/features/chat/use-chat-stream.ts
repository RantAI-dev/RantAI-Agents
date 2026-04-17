import { useChat } from "@ai-sdk/react"
import { fetch as expoFetch } from "expo/fetch"
import { env } from "@/lib/env"
import { useAuthStore } from "@/auth/use-auth-store"

export interface UseChatStreamOptions {
  sessionId: string
  assistantId?: string
  initialMessages?: Array<{
    id: string
    role: "user" | "assistant"
    content: string
  }>
}

export function useChatStream({
  sessionId,
  assistantId,
  initialMessages,
}: UseChatStreamOptions) {
  return useChat({
    api: `${env.apiBaseUrl}/api/chat`,
    id: sessionId,
    initialMessages,
    fetch: expoFetch as unknown as typeof fetch,
    headers: () => {
      const { accessToken } = useAuthStore.getState()
      const h: Record<string, string> = { "Content-Type": "application/json" }
      if (accessToken) h["Authorization"] = `Bearer ${accessToken}`
      if (assistantId) h["X-Assistant-Id"] = assistantId
      return h
    },
    body: { sessionId },
  })
}
