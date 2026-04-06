"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { toast } from "sonner"

interface EmployeeApprovalSummary {
  employeeId: string
  name: string
  count: number
}

interface PendingApprovalsData {
  total: number
  byEmployee: EmployeeApprovalSummary[]
}

export function usePendingApprovals() {
  const [data, setData] = useState<PendingApprovalsData>({ total: 0, byEmployee: [] })
  const [isLoading, setIsLoading] = useState(true)
  const prevTotalRef = useRef<number | null>(null)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard/digital-employees/pending-approvals")
      if (!res.ok) return
      const json: PendingApprovalsData = await res.json()

      // Toast when new approvals appear (skip initial load)
      if (prevTotalRef.current !== null && json.total > prevTotalRef.current) {
        const diff = json.total - prevTotalRef.current
        toast.warning(
          `${diff} new approval${diff > 1 ? "s" : ""} pending`,
          { description: json.byEmployee.map((e) => e.name).join(", ") }
        )
      }
      prevTotalRef.current = json.total

      setData(json)
    } catch {
      // silently fail
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
    const interval = setInterval(refresh, 60_000)
    return () => clearInterval(interval)
  }, [refresh])

  return {
    totalPending: data.total,
    byEmployee: data.byEmployee,
    isLoading,
    refresh,
  }
}
