"use client"

import { useState, useCallback, useEffect } from "react"
import { useOrgFetch } from "@/hooks/use-organization"

export interface EnvKeyDef {
  key: string
  label: string
  placeholder: string
}

export interface McpServerItem {
  id: string
  name: string
  description: string | null
  icon: string | null
  transport: "sse" | "streamable-http"
  url: string | null
  isBuiltIn: boolean
  envKeys: EnvKeyDef[] | null
  docsUrl: string | null
  enabled: boolean
  configured: boolean
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

export function useMcpServers(options?: { initialServers?: McpServerItem[] }) {
  const initialServers = options?.initialServers
  const [servers, setServers] = useState<McpServerItem[]>(initialServers ?? [])
  const [isLoading, setIsLoading] = useState(!initialServers)
  const [error, setError] = useState<string | null>(null)
  const orgFetch = useOrgFetch()

  const fetchServers = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)
      const res = await orgFetch("/api/dashboard/mcp-servers")
      if (!res.ok) throw new Error("Failed to fetch MCP servers")
      const data = await res.json()
      setServers(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error")
    } finally {
      setIsLoading(false)
    }
  }, [orgFetch])

  const createServer = useCallback(
    async (data: {
      name: string
      description?: string
      transport: string
      url?: string
      env?: Record<string, string>
      headers?: Record<string, string>
    }) => {
      const res = await orgFetch("/api/dashboard/mcp-servers", {
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
    [orgFetch, fetchServers]
  )

  const updateServer = useCallback(
    async (
      id: string,
      data: Partial<{
        name: string
        description: string
        transport: string
        url: string
        env: Record<string, string>
        headers: Record<string, string>
        enabled: boolean
        configured: boolean
      }>
    ) => {
      const res = await orgFetch(`/api/dashboard/mcp-servers/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error("Failed to update MCP server")
      await fetchServers()
    },
    [orgFetch, fetchServers]
  )

  const deleteServer = useCallback(
    async (id: string) => {
      const res = await orgFetch(`/api/dashboard/mcp-servers/${id}`, {
        method: "DELETE",
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || "Failed to delete MCP server")
      }
      await fetchServers()
    },
    [orgFetch, fetchServers]
  )

  const discoverTools = useCallback(
    async (id: string) => {
      const res = await orgFetch(
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
    [orgFetch, fetchServers]
  )

  useEffect(() => {
    if (initialServers) {
      return
    }
    fetchServers()
  }, [fetchServers, initialServers])

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
