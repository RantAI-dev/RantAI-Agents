import { apiFetch } from "./client"

export interface KnowledgeFile {
  id: string
  name: string
  mimeType: string
  size: number
  category?: string | null
  uploadedAt: string
  status: string
  url?: string | null
}

export const filesApi = {
  list: () => apiFetch<{ files: KnowledgeFile[] }>("/api/dashboard/files"),
  get: (id: string) =>
    apiFetch<KnowledgeFile>(`/api/dashboard/files/${id}`),
}
