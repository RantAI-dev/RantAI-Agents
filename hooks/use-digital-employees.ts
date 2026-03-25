"use client"

import { useState, useCallback, useEffect } from "react"

export interface DigitalEmployeeItem {
  id: string
  name: string
  description: string | null
  avatar: string | null
  status: "DRAFT" | "ONBOARDING" | "ACTIVE" | "PAUSED" | "SUSPENDED" | "ARCHIVED"
  assistantId: string
  assistant: {
    id: string
    name: string
    emoji: string
    model: string
  }
  group?: { id: string; name: string } | null
  autonomyLevel: string
  deploymentConfig: Record<string, unknown> | null
  totalRuns: number
  successfulRuns: number
  failedRuns: number
  totalTokensUsed: string
  lastActiveAt: string | null
  createdAt: string
  updatedAt: string
  latestRunStatus: string | null
  latestOutputPreview: string | null
  pendingApprovalCount: number
  _count: {
    runs: number
    approvals: number
    files: number
    customTools: number
    installedSkills: number
  }
}

export function useDigitalEmployees(options?: { initialEmployees?: DigitalEmployeeItem[] }) {
  const initialEmployees = options?.initialEmployees
  const [employees, setEmployees] = useState<DigitalEmployeeItem[]>(initialEmployees ?? [])
  const [isLoading, setIsLoading] = useState(initialEmployees ? false : true)
  const [error, setError] = useState<string | null>(null)

  const fetchEmployees = useCallback(async () => {
    try {
      setIsLoading(true)
      const res = await fetch("/api/dashboard/digital-employees")
      if (!res.ok) throw new Error("Failed to fetch")
      const data = await res.json()
      setEmployees(data)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch")
    } finally {
      setIsLoading(false)
    }
  }, [])

  const createEmployee = useCallback(
    async (input: {
      name: string
      description?: string
      avatar?: string
      assistantId: string
      autonomyLevel?: string
    }) => {
      const res = await fetch("/api/dashboard/digital-employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Failed to create")
      }
      const employee = await res.json()
      setEmployees((prev) => [employee, ...prev])
      return employee
    },
    []
  )

  const updateEmployee = useCallback(
    async (id: string, input: Partial<DigitalEmployeeItem>) => {
      const res = await fetch(`/api/dashboard/digital-employees/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      })
      if (!res.ok) throw new Error("Failed to update")
      const updated = await res.json()
      setEmployees((prev) => prev.map((e) => (e.id === id ? updated : e)))
      return updated
    },
    []
  )

  const deleteEmployee = useCallback(async (id: string) => {
    const res = await fetch(`/api/dashboard/digital-employees/${id}`, {
      method: "DELETE",
    })
    if (!res.ok) throw new Error("Failed to delete")
    setEmployees((prev) => prev.filter((e) => e.id !== id))
  }, [])

  useEffect(() => {
    if (initialEmployees) {
      return
    }
    fetchEmployees()
  }, [fetchEmployees, initialEmployees])

  return {
    employees,
    isLoading,
    error,
    fetchEmployees,
    createEmployee,
    updateEmployee,
    deleteEmployee,
  }
}
