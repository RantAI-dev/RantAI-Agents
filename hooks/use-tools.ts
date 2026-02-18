"use client"

import { useState, useCallback, useEffect } from "react"

export interface ToolItem {
  id: string
  name: string
  displayName: string
  description: string
  category: "builtin" | "custom" | "mcp"
  parameters: object
  executionConfig?: {
    url?: string
    method?: string
    headers?: Record<string, string>
    authType?: "none" | "api_key" | "bearer"
    authHeaderName?: string
    authValue?: string
    timeoutMs?: number
  } | null
  isBuiltIn: boolean
  enabled: boolean
  mcpServer?: { id: string; name: string } | null
  assistantCount: number
  createdAt: string
}

export function useTools() {
  const [tools, setTools] = useState<ToolItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchTools = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)
      const res = await fetch("/api/dashboard/tools")
      if (!res.ok) throw new Error("Failed to fetch tools")
      const data = await res.json()
      setTools(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error")
    } finally {
      setIsLoading(false)
    }
  }, [])

  const createTool = useCallback(
    async (data: {
      name: string
      displayName: string
      description: string
      parameters?: object
      executionConfig?: object
    }) => {
      const res = await fetch("/api/dashboard/tools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || "Failed to create tool")
      }
      await fetchTools()
      return res.json()
    },
    [fetchTools]
  )

  const updateTool = useCallback(
    async (
      id: string,
      data: Partial<{
        displayName: string
        description: string
        parameters: object
        executionConfig: object
        enabled: boolean
      }>
    ) => {
      const res = await fetch(`/api/dashboard/tools/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error("Failed to update tool")
      await fetchTools()
    },
    [fetchTools]
  )

  const deleteTool = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/dashboard/tools/${id}`, {
        method: "DELETE",
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || "Failed to delete tool")
      }
      await fetchTools()
    },
    [fetchTools]
  )

  useEffect(() => {
    fetchTools()
  }, [fetchTools])

  return {
    tools,
    isLoading,
    error,
    fetchTools,
    createTool,
    updateTool,
    deleteTool,
  }
}
