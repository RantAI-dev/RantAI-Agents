import { apiFetch } from "./client"

export interface AuditEntry {
  id: string
  action: string
  resource: string
  resourceId?: string | null
  userId?: string | null
  status: string
  createdAt: string
  metadata?: Record<string, unknown>
}

export const auditApi = {
  list: () =>
    apiFetch<{ entries: AuditEntry[]; nextCursor?: string | null }>(
      "/api/dashboard/audit",
    ),
}
