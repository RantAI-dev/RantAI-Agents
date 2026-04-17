import { apiFetch } from "./client"

export interface Organization {
  id: string
  name: string
  slug?: string | null
  memberCount?: number
  plan?: string | null
  createdAt: string
}

export const organizationsApi = {
  list: () =>
    apiFetch<{ organizations: Organization[] }>("/api/organizations"),
  get: (id: string) => apiFetch<Organization>(`/api/organizations/${id}`),
}
