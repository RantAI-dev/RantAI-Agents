"use client"

import { useState, useCallback, useEffect } from "react"

export interface EmployeeGroupMember {
  id: string
  name: string
  avatar: string | null
  containerPort: number | null
}

export interface EmployeeGroupItem {
  id: string
  name: string
  description: string | null
  status: string
  members: EmployeeGroupMember[]
  createdAt: string
  updatedAt: string
}

export function useEmployeeGroups() {
  const [groups, setGroups] = useState<EmployeeGroupItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchGroups = useCallback(async () => {
    try {
      setIsLoading(true)
      const res = await fetch("/api/dashboard/groups")
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error || "Failed to fetch groups")
        return
      }
      const data = await res.json()
      setGroups(Array.isArray(data) ? data : data.groups ?? [])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch groups")
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchGroups()
  }, [fetchGroups])

  return {
    groups,
    isLoading,
    error,
    refresh: fetchGroups,
  }
}
