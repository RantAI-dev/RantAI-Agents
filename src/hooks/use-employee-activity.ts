"use client"

import { useState, useCallback, useEffect, useRef } from "react"

export interface ActivityEvent {
  id: string
  type: "run_started" | "run_completed" | "run_failed" | "approval_requested" | "approval_responded"
  timestamp: string
  data: Record<string, unknown>
}

export interface DailySummary {
  totalRuns: number
  completed: number
  failed: number
  totalTokens: number
}

export function useEmployeeActivity(employeeId: string | null) {
  const [events, setEvents] = useState<ActivityEvent[]>([])
  const [dailySummary, setDailySummary] = useState<DailySummary>({
    totalRuns: 0, completed: 0, failed: 0, totalTokens: 0,
  })
  const [isLoading, setIsLoading] = useState(true)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const refresh = useCallback(async () => {
    if (!employeeId) return
    try {
      const res = await fetch(`/api/dashboard/digital-employees/${employeeId}/activity`)
      if (res.ok) {
        const data = await res.json()
        setEvents(data.events || [])
        setDailySummary(data.dailySummary || { totalRuns: 0, completed: 0, failed: 0, totalTokens: 0 })
      }
    } catch {
      // silent
    } finally {
      setIsLoading(false)
    }
  }, [employeeId])

  useEffect(() => {
    if (!employeeId) return
    setIsLoading(true)
    refresh()

    // Poll every 30s
    intervalRef.current = setInterval(refresh, 30_000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [employeeId, refresh])

  return { events, dailySummary, isLoading, refresh }
}
