"use client"

import { useState, useCallback, useEffect } from "react"

export interface EmployeeGroupMember {
  id: string
  name: string
  status: string
  avatar: string | null
}

export interface EmployeeGroupItem {
  id: string
  name: string
  description: string | null
  status: string
  isImplicit: boolean
  containerPort: number | null
  noVncPort: number | null
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

  const createGroup = useCallback(
    async (data: { name: string; description?: string }): Promise<EmployeeGroupItem> => {
      const res = await fetch("/api/dashboard/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || "Failed to create team")
      }
      const result = await res.json()
      await fetchGroups()
      return result
    },
    [fetchGroups]
  )

  const updateGroup = useCallback(
    async (groupId: string, data: { name?: string; description?: string; isImplicit?: boolean }): Promise<void> => {
      const res = await fetch(`/api/dashboard/groups/${groupId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || "Failed to update team")
      }
      await fetchGroups()
    },
    [fetchGroups]
  )

  const addMembers = useCallback(
    async (groupId: string, employeeIds: string[]): Promise<void> => {
      const res = await fetch(`/api/dashboard/groups/${groupId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeIds }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || "Failed to add members")
      }
      await fetchGroups()
    },
    [fetchGroups]
  )

  const removeMembers = useCallback(
    async (groupId: string, employeeIds: string[]): Promise<void> => {
      const res = await fetch(`/api/dashboard/groups/${groupId}/members`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeIds }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || "Failed to remove members")
      }
      await fetchGroups()
    },
    [fetchGroups]
  )

  const startGroup = useCallback(
    async (groupId: string): Promise<void> => {
      try {
        const res = await fetch(`/api/dashboard/groups/${groupId}/start`, { method: "POST" })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.error || "Failed to start team")
        }
      } finally {
        await fetchGroups()
      }
    },
    [fetchGroups]
  )

  const stopGroup = useCallback(
    async (groupId: string): Promise<void> => {
      try {
        const res = await fetch(`/api/dashboard/groups/${groupId}/stop`, { method: "POST" })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.error || "Failed to stop team")
        }
      } finally {
        await fetchGroups()
      }
    },
    [fetchGroups]
  )

  const deleteGroup = useCallback(
    async (groupId: string): Promise<void> => {
      const res = await fetch(`/api/dashboard/groups/${groupId}`, { method: "DELETE" })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || "Failed to delete team")
      }
      await fetchGroups()
    },
    [fetchGroups]
  )

  return {
    groups,
    isLoading,
    error,
    refresh: fetchGroups,
    createGroup,
    updateGroup,
    deleteGroup,
    addMembers,
    removeMembers,
    startGroup,
    stopGroup,
  }
}
