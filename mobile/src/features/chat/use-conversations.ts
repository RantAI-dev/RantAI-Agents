import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { conversationsApi, type Conversation } from "@/api/conversations"

export function useConversations() {
  return useQuery({
    queryKey: ["conversations"],
    queryFn: conversationsApi.list,
    select: (data) => data.conversations,
  })
}

export function useCreateConversation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (sessionId: string) => conversationsApi.create(sessionId),
    onSuccess: (created) => {
      qc.setQueryData<{ conversations: Conversation[] }>(
        ["conversations"],
        (prev) => ({ conversations: [created, ...(prev?.conversations ?? [])] }),
      )
    },
  })
}

export function useDeleteConversation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => conversationsApi.delete(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ["conversations"] })
      const prev = qc.getQueryData<{ conversations: Conversation[] }>(["conversations"])
      qc.setQueryData(["conversations"], {
        conversations: prev?.conversations.filter((c) => c.id !== id) ?? [],
      })
      return { prev }
    },
    onError: (_e, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(["conversations"], ctx.prev)
    },
  })
}
