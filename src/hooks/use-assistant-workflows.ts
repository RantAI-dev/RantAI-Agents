"use client"

import { useState, useCallback, useEffect, useMemo } from "react"
import { useOrgFetch } from "@/hooks/use-organization"

interface AssistantWorkflowItem {
  id: string
  name: string
  description: string | null
  status: string
  mode: string
  category: string
}

export function useAssistantWorkflows(assistantId: string | null) {
  const orgFetch = useOrgFetch()
  const [enabledWorkflows, setEnabledWorkflows] = useState<AssistantWorkflowItem[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const fetchAssistantWorkflows = useCallback(async () => {
    if (!assistantId) {
      setEnabledWorkflows([])
      return
    }
    try {
      setIsLoading(true)
      const res = await orgFetch(`/api/assistants/${assistantId}/workflows`)
      if (!res.ok) throw new Error("Failed to fetch")
      const data = await res.json()
      setEnabledWorkflows(data)
    } catch {
      setEnabledWorkflows([])
    } finally {
      setIsLoading(false)
    }
  }, [orgFetch, assistantId])

  const updateAssistantWorkflows = useCallback(
    async (workflowIds: string[]) => {
      if (!assistantId) return
      const res = await orgFetch(`/api/assistants/${assistantId}/workflows`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workflowIds }),
      })
      if (!res.ok) throw new Error("Failed to update")
      const data = await res.json()
      setEnabledWorkflows(data)
    },
    [orgFetch, assistantId]
  )

  useEffect(() => {
    fetchAssistantWorkflows()
  }, [fetchAssistantWorkflows])

  const enabledWorkflowIds = useMemo(
    () => enabledWorkflows.map((w) => w.id),
    [enabledWorkflows]
  )

  return {
    enabledWorkflows,
    enabledWorkflowIds,
    isLoading,
    fetchAssistantWorkflows,
    updateAssistantWorkflows,
  }
}
