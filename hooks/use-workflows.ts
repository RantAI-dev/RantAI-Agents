"use client"

import { useState, useCallback, useEffect } from "react"

export interface WorkflowItem {
  id: string
  name: string
  description: string | null
  nodes: unknown[]
  edges: unknown[]
  trigger: { type: string }
  variables: { inputs: unknown[]; outputs: unknown[] }
  status: "DRAFT" | "ACTIVE" | "PAUSED" | "ARCHIVED"
  version: number
  assistantId: string | null
  createdBy: string
  _count: { runs: number }
  createdAt: string
  updatedAt: string
}

export function useWorkflows(assistantId?: string | null) {
  const [workflows, setWorkflows] = useState<WorkflowItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchWorkflows = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)
      const params = assistantId ? `?assistantId=${assistantId}` : ""
      const res = await fetch(`/api/dashboard/workflows${params}`)
      if (!res.ok) throw new Error("Failed to fetch workflows")
      const data = await res.json()
      setWorkflows(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error")
    } finally {
      setIsLoading(false)
    }
  }, [assistantId])

  const createWorkflow = useCallback(
    async (data: { name: string; description?: string; assistantId?: string }) => {
      const res = await fetch("/api/dashboard/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error("Failed to create workflow")
      const workflow = await res.json()
      await fetchWorkflows()
      return workflow as WorkflowItem
    },
    [fetchWorkflows]
  )

  const updateWorkflow = useCallback(
    async (id: string, data: Partial<WorkflowItem>) => {
      const res = await fetch(`/api/dashboard/workflows/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error("Failed to update workflow")
      const workflow = await res.json()
      setWorkflows((prev) => prev.map((w) => (w.id === id ? workflow : w)))
      return workflow as WorkflowItem
    },
    []
  )

  const deleteWorkflow = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/dashboard/workflows/${id}`, {
        method: "DELETE",
      })
      if (!res.ok) throw new Error("Failed to delete workflow")
      setWorkflows((prev) => prev.filter((w) => w.id !== id))
    },
    []
  )

  useEffect(() => {
    fetchWorkflows()
  }, [fetchWorkflows])

  return {
    workflows,
    isLoading,
    error,
    fetchWorkflows,
    createWorkflow,
    updateWorkflow,
    deleteWorkflow,
  }
}
