"use client"

import { useState, useCallback, useEffect } from "react"

export interface McpApiKeyItem {
  id: string
  name: string
  key: string
  exposedTools: string[]
  requestCount: number
  lastUsedAt: string | null
  enabled: boolean
  createdAt: string
}

export function useMcpApiKeys() {
  const [keys, setKeys] = useState<McpApiKeyItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchKeys = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)
      const res = await fetch("/api/dashboard/mcp-api-keys")
      if (!res.ok) throw new Error("Failed to fetch MCP API keys")
      const data = await res.json()
      setKeys(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error")
    } finally {
      setIsLoading(false)
    }
  }, [])

  const createKey = useCallback(
    async (data: { name: string; exposedTools?: string[] }) => {
      const res = await fetch("/api/dashboard/mcp-api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || "Failed to create MCP API key")
      }
      const newKey = await res.json()
      await fetchKeys()
      return newKey
    },
    [fetchKeys]
  )

  const updateKey = useCallback(
    async (
      id: string,
      data: Partial<{
        name: string
        exposedTools: string[]
        enabled: boolean
      }>
    ) => {
      const res = await fetch(`/api/dashboard/mcp-api-keys/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error("Failed to update MCP API key")
      await fetchKeys()
    },
    [fetchKeys]
  )

  const deleteKey = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/dashboard/mcp-api-keys/${id}`, {
        method: "DELETE",
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || "Failed to delete MCP API key")
      }
      await fetchKeys()
    },
    [fetchKeys]
  )

  useEffect(() => {
    fetchKeys()
  }, [fetchKeys])

  return {
    keys,
    isLoading,
    error,
    fetchKeys,
    createKey,
    updateKey,
    deleteKey,
  }
}
