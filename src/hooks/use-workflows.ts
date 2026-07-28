"use client"

import { useState, useCallback, useEffect } from "react"
import { useOrgFetch, useActiveOrgChange } from "@/hooks/use-organization"

export interface WorkflowItem {
  id: string
  name: string
  description: string | null
  nodes: unknown[]
  edges: unknown[]
  trigger: { type: string }
  variables: { inputs: unknown[]; outputs: unknown[] }
  mode: "STANDARD" | "CHATFLOW"
  category: "TASK" | "CHATFLOW" | "AUTOMATION"
  chatflowConfig: { welcomeMessage?: string; starterPrompts?: string[]; enableFollowUps?: boolean }
  apiEnabled: boolean
  apiKey: string | null
  status: "DRAFT" | "ACTIVE" | "PAUSED" | "ARCHIVED"
  version: number
  tags: string[]
  assistantId: string | null
  createdBy: string
  _count: { runs: number }
  createdAt: string
  updatedAt: string
}

export function useWorkflows(
  assistantId?: string | null,
  options?: { initialWorkflows?: WorkflowItem[] }
) {
  const initialWorkflows = options?.initialWorkflows
  const orgFetch = useOrgFetch()
  const [workflows, setWorkflows] = useState<WorkflowItem[]>(initialWorkflows || [])
  const [isLoading, setIsLoading] = useState(initialWorkflows ? false : true)
  const [error, setError] = useState<string | null>(null)

  const fetchWorkflows = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)
      const params = assistantId ? `?assistantId=${assistantId}` : ""
      const res = await orgFetch(`/api/dashboard/workflows${params}`)
      if (!res.ok) throw new Error("Failed to fetch workflows")
      const data = await res.json()
      setWorkflows(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error")
    } finally {
      setIsLoading(false)
    }
  }, [orgFetch, assistantId])

  const createWorkflow = useCallback(
    async (data: { name: string; description?: string; assistantId?: string; category?: string }) => {
      const res = await orgFetch("/api/dashboard/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error("Failed to create workflow")
      const workflow = await res.json()
      await fetchWorkflows()
      return workflow as WorkflowItem
    },
    [orgFetch, fetchWorkflows]
  )

  const updateWorkflow = useCallback(
    async (id: string, data: Partial<WorkflowItem>) => {
      const res = await orgFetch(`/api/dashboard/workflows/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || "Failed to update workflow")
      }
      const workflow = await res.json()
      setWorkflows((prev) => prev.map((w) => (w.id === id ? workflow : w)))
      return workflow as WorkflowItem
    },
    [orgFetch]
  )

  const deleteWorkflow = useCallback(
    async (id: string) => {
      const res = await orgFetch(`/api/dashboard/workflows/${id}`, {
        method: "DELETE",
      })
      if (!res.ok) throw new Error("Failed to delete workflow")
      setWorkflows((prev) => prev.filter((w) => w.id !== id))
    },
    [orgFetch]
  )

  useEffect(() => {
    if (initialWorkflows) {
      return
    }
    fetchWorkflows()
  }, [fetchWorkflows, initialWorkflows])

  // Refetch on active-org switch.
  useActiveOrgChange(useCallback(() => {
    void fetchWorkflows()
  }, [fetchWorkflows]))

  const getWorkflowById = useCallback(async (id: string) => {
    const existing = workflows.find((workflow) => workflow.id === id)
    if (existing) return existing

    const res = await orgFetch(`/api/dashboard/workflows/${id}`)
    if (!res.ok) {
      throw new Error("Failed to fetch workflow")
    }

    const workflow = (await res.json()) as WorkflowItem
    setWorkflows((prev) => {
      if (prev.some((item) => item.id === workflow.id)) return prev
      return [workflow, ...prev]
    })
    return workflow
  }, [orgFetch, workflows])

  return {
    workflows,
    isLoading,
    error,
    fetchWorkflows,
    createWorkflow,
    updateWorkflow,
    deleteWorkflow,
    getWorkflowById,
  }
}
