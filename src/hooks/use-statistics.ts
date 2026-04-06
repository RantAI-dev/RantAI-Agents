"use client"

import { useState, useCallback, useEffect } from "react"
import {
  createDefaultStatisticsFilters,
  type StatisticsFilters,
} from "@/features/statistics/filters"

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

export function useStatistics(options?: {
  initialData?: StatisticsData | null
  initialFilters?: StatisticsFilters
}) {
  const initialData = options?.initialData ?? null
  const initialFilters = options?.initialFilters ?? createDefaultStatisticsFilters()

  const [data, setData] = useState<StatisticsData | null>(initialData)
  const [filters, setFilters] = useState<StatisticsFilters>(initialFilters)
  const [isLoading, setIsLoading] = useState(options?.initialData == null)
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
    if (initialData && filters.from === initialFilters.from && filters.to === initialFilters.to && filters.groupBy === initialFilters.groupBy) {
      return
    }
    fetchStatistics(filters)
  }, [fetchStatistics, filters, initialData, initialFilters.from, initialFilters.groupBy, initialFilters.to])

  return {
    data,
    filters,
    isLoading,
    error,
    updateFilters,
    refresh: () => fetchStatistics(filters),
  }
}
