import { apiFetch } from "./client"

export interface DigitalEmployee {
  id: string
  name: string
  status: string
  assistantId?: string | null
  containerId?: string | null
  createdAt: string
  updatedAt: string
  lastActivityAt?: string | null
}

export const digitalEmployeesApi = {
  list: () =>
    apiFetch<{ digitalEmployees: DigitalEmployee[] }>(
      "/api/dashboard/digital-employees",
    ),
  get: (id: string) =>
    apiFetch<DigitalEmployee>(`/api/dashboard/digital-employees/${id}`),
}
