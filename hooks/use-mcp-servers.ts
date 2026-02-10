"use client"

import { useState, useCallback, useEffect } from "react"

export interface McpServerItem {
  id: string
  name: string
  description: string | null
  transport: "stdio" | "sse" | "streamable-http"
  url: string | null
  command: string | null
  args: string[]
  enabled: boolean
  lastConnectedAt: string | null
  lastError: string | null
  toolCount: number
  createdAt: string
}

export interface McpServerDetail extends McpServerItem {
  env: Record<string, string> | null
  headers: Record<string, string> | null
  tools: Array<{
    id: string
    name: string
    displayName: string
    description: string
    enabled: boolean
  }>
}

export function useMcpServers() {
  const [servers, setServers] = useState<McpServerItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchServers = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)
      const res = await fetch("/api/dashboard/mcp-servers")
      if (!res.ok) throw new Error("Failed to fetch MCP servers")
      const data = await res.json()
      setServers(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error")
    } finally {
      setIsLoading(false)
    }
  }, [])

  const createServer = useCallback(
    async (data: {
      name: string
      description?: string
      transport: string
      url?: string
      command?: string
      args?: string[]
      env?: Record<string, string>
      headers?: Record<string, string>
    }) => {
      const res = await fetch("/api/dashboard/mcp-servers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || "Failed to create MCP server")
      }
      await fetchServers()
      return res.json()
    },
    [fetchServers]
  )

  const updateServer = useCallback(
    async (
      id: string,
      data: Partial<{
        name: string
        description: string
        transport: string
        url: string
        command: string
        args: string[]
        env: Record<string, string>
        headers: Record<string, string>
        enabled: boolean
      }>
    ) => {
      const res = await fetch(`/api/dashboard/mcp-servers/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error("Failed to update MCP server")
      await fetchServers()
    },
    [fetchServers]
  )

  const deleteServer = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/dashboard/mcp-servers/${id}`, {
        method: "DELETE",
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || "Failed to delete MCP server")
      }
      await fetchServers()
    },
    [fetchServers]
  )

  const discoverTools = useCallback(
    async (id: string) => {
      const res = await fetch(
        `/api/dashboard/mcp-servers/${id}/discover`,
        { method: "POST" }
      )
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || "Failed to discover tools")
      }
      await fetchServers()
      return res.json()
    },
    [fetchServers]
  )

  useEffect(() => {
    fetchServers()
  }, [fetchServers])

  return {
    servers,
    isLoading,
    error,
    fetchServers,
    createServer,
    updateServer,
    deleteServer,
    discoverTools,
  }
}
