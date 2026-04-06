"use client"

import { useState, useEffect, useCallback } from "react"

export interface AuditLogItem {
  id: string
  action: string
  resource: string
  detail: Record<string, unknown>
  riskLevel: string
  employeeId: string | null
  userId: string | null
  ipAddress: string | null
  createdAt: string
}

interface UseAuditLogsFilters {
  employeeId?: string
  action?: string
  riskLevel?: string
}

export function useAuditLogs(filters?: UseAuditLogsFilters) {
  const [logs, setLogs] = useState<AuditLogItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [hasMore, setHasMore] = useState(false)
  const [cursor, setCursor] = useState<string | null>(null)

  const fetchLogs = useCallback(
    async (nextCursor?: string | null) => {
      try {
        setIsLoading(true)
        const params = new URLSearchParams()
        if (filters?.employeeId) params.set("employeeId", filters.employeeId)
        if (filters?.action) params.set("action", filters.action)
        if (filters?.riskLevel) params.set("riskLevel", filters.riskLevel)
        if (nextCursor) params.set("cursor", nextCursor)
        params.set("limit", "50")

        const res = await fetch(`/api/dashboard/audit?${params.toString()}`)
        if (!res.ok) throw new Error("Failed to fetch audit logs")

        const data = await res.json()

        if (nextCursor) {
          setLogs((prev) => [...prev, ...data.items])
        } else {
          setLogs(data.items)
        }
        setHasMore(data.hasMore)
        setCursor(data.nextCursor)
      } catch (err) {
        console.error("Failed to fetch audit logs:", err)
      } finally {
        setIsLoading(false)
      }
    },
    [filters?.employeeId, filters?.action, filters?.riskLevel]
  )

  const loadMore = useCallback(() => {
    if (hasMore && cursor) {
      fetchLogs(cursor)
    }
  }, [hasMore, cursor, fetchLogs])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  return { logs, isLoading, hasMore, loadMore }
}
