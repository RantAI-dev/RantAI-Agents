"use client"

import { useState, useCallback, useEffect, useMemo } from "react"

interface AssistantToolItem {
  id: string
  name: string
  displayName: string
  description: string
  category: string
  isBuiltIn: boolean
  enabled: boolean
}

export function useAssistantTools(assistantId: string | null) {
  const [enabledTools, setEnabledTools] = useState<AssistantToolItem[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const fetchAssistantTools = useCallback(async () => {
    if (!assistantId) {
      setEnabledTools([])
      return
    }
    try {
      setIsLoading(true)
      const res = await fetch(`/api/assistants/${assistantId}/tools`)
      if (!res.ok) throw new Error("Failed to fetch")
      const data = await res.json()
      setEnabledTools(data)
    } catch {
      setEnabledTools([])
    } finally {
      setIsLoading(false)
    }
  }, [assistantId])

  const updateAssistantTools = useCallback(
    async (toolIds: string[]) => {
      if (!assistantId) return
      const res = await fetch(`/api/assistants/${assistantId}/tools`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toolIds }),
      })
      if (!res.ok) throw new Error("Failed to update")
      const data = await res.json()
      setEnabledTools(data)
    },
    [assistantId]
  )

  const toggleTool = useCallback(
    async (toolId: string) => {
      const currentIds = enabledTools.map((t) => t.id)
      const isEnabled = currentIds.includes(toolId)
      const newIds = isEnabled
        ? currentIds.filter((id) => id !== toolId)
        : [...currentIds, toolId]
      await updateAssistantTools(newIds)
    },
    [enabledTools, updateAssistantTools]
  )

  useEffect(() => {
    fetchAssistantTools()
  }, [fetchAssistantTools])

  const enabledToolIds = useMemo(
    () => enabledTools.map((t) => t.id),
    [enabledTools]
  )

  return {
    enabledTools,
    enabledToolIds,
    isLoading,
    fetchAssistantTools,
    updateAssistantTools,
    toggleTool,
  }
}
