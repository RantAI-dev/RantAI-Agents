import { apiFetch } from "./client"

export interface Assistant {
  id: string
  name: string
  description?: string | null
  systemPrompt?: string | null
  modelId?: string | null
  temperature?: number | null
  isPublic: boolean
  createdAt: string
  updatedAt: string
}

export const assistantsApi = {
  list: () => apiFetch<{ assistants: Assistant[] }>("/api/assistants"),
  get: (id: string) => apiFetch<Assistant>(`/api/assistants/${id}`),
}
