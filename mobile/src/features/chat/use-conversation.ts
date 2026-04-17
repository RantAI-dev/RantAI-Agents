import { useQuery, useQueryClient } from "@tanstack/react-query"
import { conversationsApi, type Conversation } from "@/api/conversations"

/**
 * Returns the cached conversation metadata (from the list query) plus its
 * message history. Avoids relying on a single conversation-detail endpoint —
 * the backend exposes title/status via the list and messages via a subroute.
 */
export function useConversation(id: string | null) {
  const qc = useQueryClient()
  const cachedList = qc.getQueryData<{ conversations: Conversation[] }>([
    "conversations",
  ])
  const meta = cachedList?.conversations.find((c) => c.id === id) ?? null

  const messages = useQuery({
    queryKey: ["conversation-messages", id],
    queryFn: () => conversationsApi.messages(id!),
    enabled: !!id,
  })

  return {
    data: id
      ? {
          ...(meta ?? { id, sessionId: id, title: null, status: "AI_ACTIVE", channel: "PORTAL", createdAt: "", updatedAt: "" }),
          messages: messages.data?.messages ?? [],
        }
      : undefined,
    isLoading: messages.isLoading,
    error: messages.error,
  }
}
