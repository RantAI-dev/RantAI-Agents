"use client"

import { useState, useCallback, useEffect } from "react"

export interface StatisticsFilters {
  from: string
  to: string
  groupBy: "day" | "week" | "month"
}

export interface StatisticsData {
  overview: {
    totalSessions: number
    totalConversations: number
    totalTokensInput: number
    totalTokensOutput: number
    totalCost: number
    totalUsageRecords: number
    totalToolExecutions: number
    totalToolErrors: number
    totalAssistants: number
  }
  timeSeries: {
    conversations: Array<{ date: string; count: number }>
    tokenUsage: Array<{ date: string; input: number; output: number }>
    toolExecutions: Array<{ date: string; count: number }>
    sessions: Array<{ date: string; count: number }>
  }
  breakdowns: {
    byChannel: Array<{ channel: string; count: number }>
    byTool: Array<{
      name: string
      count: number
      avgDurationMs: number
      errorCount: number
    }>
    byAssistant: Array<{
      id: string
      name: string
      emoji: string
      count: number
    }>
  }
}

function defaultFilters(): StatisticsFilters {
  const now = new Date()
  const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  return {
    from: from.toISOString().split("T")[0],
    to: now.toISOString().split("T")[0],
    groupBy: "day",
  }
}

export function useStatistics() {
  const [data, setData] = useState<StatisticsData | null>(null)
  const [filters, setFilters] = useState<StatisticsFilters>(defaultFilters)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchStatistics = useCallback(async (f: StatisticsFilters) => {
    try {
      setIsLoading(true)
      setError(null)
      const params = new URLSearchParams({
        from: f.from,
        to: f.to,
        groupBy: f.groupBy,
      })
      const res = await fetch(`/api/dashboard/statistics?${params}`)
      if (!res.ok) throw new Error("Failed to fetch statistics")
      const json = await res.json()
      setData(json)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error")
    } finally {
      setIsLoading(false)
    }
  }, [])

  const updateFilters = useCallback(
    (update: Partial<StatisticsFilters>) => {
      setFilters((prev) => ({ ...prev, ...update }))
    },
    []
  )

  useEffect(() => {
    fetchStatistics(filters)
  }, [filters, fetchStatistics])

  return {
    data,
    filters,
    isLoading,
    error,
    updateFilters,
    refresh: () => fetchStatistics(filters),
  }
}
