import { useQuery } from "@tanstack/react-query"
import { assistantsApi } from "@/api/assistants"

export function useAssistants() {
  return useQuery({
    queryKey: ["assistants"],
    queryFn: assistantsApi.list,
    select: (d) => d.assistants,
  })
}

export function useAssistant(id: string | null) {
  return useQuery({
    queryKey: ["assistants", id],
    queryFn: () => assistantsApi.get(id!),
    enabled: !!id,
  })
}
