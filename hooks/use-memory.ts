"use client"

import { useState, useCallback, useEffect } from "react"

export interface MemoryItem {
  id: string
  type: "WORKING" | "SEMANTIC" | "LONG_TERM"
  key: string
  value: unknown
  confidence: number | null
  source: string | null
  createdAt: string
  updatedAt: string
  expiresAt: string | null
}

export interface MemoryStats {
  working: number
  semantic: number
  longTerm: number
  total: number
}

export function useMemory() {
  const [memories, setMemories] = useState<MemoryItem[]>([])
  const [stats, setStats] = useState<MemoryStats>({
    working: 0,
    semantic: 0,
    longTerm: 0,
    total: 0,
  })
  const [filter, setFilter] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchMemories = useCallback(async (type?: string | null) => {
    try {
      setIsLoading(true)
      setError(null)
      const params = type ? `?type=${type}` : ""
      const res = await fetch(`/api/dashboard/memory${params}`)
      if (!res.ok) throw new Error("Failed to fetch memories")
      const data = await res.json()
      setMemories(data.memories)
      setStats(data.stats)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error")
    } finally {
      setIsLoading(false)
    }
  }, [])

  const deleteMemory = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/dashboard/memory/${id}`, {
        method: "DELETE",
      })
      if (!res.ok) throw new Error("Failed to delete memory")
      await fetchMemories(filter)
    },
    [fetchMemories, filter]
  )

  const clearByType = useCallback(
    async (type: "WORKING" | "SEMANTIC" | "LONG_TERM") => {
      const res = await fetch("/api/dashboard/memory", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      })
      if (!res.ok) throw new Error("Failed to clear memories")
      await fetchMemories(filter)
    },
    [fetchMemories, filter]
  )

  useEffect(() => {
    fetchMemories(filter)
  }, [filter, fetchMemories])

  return {
    memories,
    stats,
    filter,
    setFilter,
    isLoading,
    error,
    fetchMemories: () => fetchMemories(filter),
    deleteMemory,
    clearByType,
  }
}
