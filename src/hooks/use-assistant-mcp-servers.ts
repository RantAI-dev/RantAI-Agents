"use client"

import { useState, useCallback, useEffect, useMemo } from "react"

interface AssistantMcpServerBinding {
  id: string
  name: string
  description: string | null
  transport: string
  enabled: boolean
  toolCount: number
}

export function useAssistantMcpServers(assistantId: string | null) {
  const [bindings, setBindings] = useState<AssistantMcpServerBinding[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const fetchBindings = useCallback(async () => {
    if (!assistantId) {
      setBindings([])
      return
    }
    try {
      setIsLoading(true)
      const res = await fetch(`/api/assistants/${assistantId}/mcp-servers`)
      if (!res.ok) throw new Error("Failed to fetch")
      const data = await res.json()
      setBindings(data)
    } catch {
      setBindings([])
    } finally {
      setIsLoading(false)
    }
  }, [assistantId])

  const updateAssistantMcpServers = useCallback(
    async (mcpServerIds: string[]) => {
      if (!assistantId) return
      const res = await fetch(`/api/assistants/${assistantId}/mcp-servers`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mcpServerIds }),
      })
      if (!res.ok) throw new Error("Failed to update")
      const data = await res.json()
      setBindings(data)
    },
    [assistantId]
  )

  useEffect(() => {
    fetchBindings()
  }, [fetchBindings])

  const enabledMcpServerIds = useMemo(
    () => bindings.map((b) => b.id),
    [bindings]
  )

  return {
    bindings,
    enabledMcpServerIds,
    isLoading,
    fetchBindings,
    updateAssistantMcpServers,
  }
}
