"use client"

import { useState, useEffect, useCallback } from "react"
import type { AgentApiKeyResponse } from "@/src/features/agent-api-keys/service"

export interface AgentApiKeyInput {
  name: string
  assistantId: string
  scopes?: string[]
  ipWhitelist?: string[]
  expiresAt?: string
}

export function useAgentApiKeys(assistantId: string | null) {
  const [keys, setKeys] = useState<AgentApiKeyResponse[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchKeys = useCallback(async () => {
    if (!assistantId) {
      setIsLoading(false)
      return
    }
    try {
      setError(null)
      const response = await fetch(
        `/api/dashboard/agent-api-keys?assistantId=${assistantId}`
      )
      if (!response.ok) throw new Error("Failed to fetch API keys")
      const data = await response.json()
      setKeys(data)
    } catch (err) {
      console.error("Failed to fetch agent API keys:", err)
      setError("Failed to load API keys")
    } finally {
      setIsLoading(false)
    }
  }, [assistantId])

  useEffect(() => {
    fetchKeys()
  }, [fetchKeys])

  const createKey = useCallback(
    async (input: AgentApiKeyInput): Promise<AgentApiKeyResponse | null> => {
      try {
        const response = await fetch("/api/dashboard/agent-api-keys", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        })
        if (!response.ok) {
          const data = await response.json()
          throw new Error(data.error || "Failed to create API key")
        }
        const newKey = await response.json()
        setKeys((prev) => [newKey, ...prev])
        return newKey
      } catch (err) {
        console.error("Failed to create agent API key:", err)
        setError("Failed to create API key")
        return null
      }
    },
    []
  )

  const updateKey = useCallback(
    async (
      id: string,
      updates: Partial<Omit<AgentApiKeyInput, "assistantId">> & { enabled?: boolean }
    ): Promise<boolean> => {
      try {
        const response = await fetch(`/api/dashboard/agent-api-keys/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updates),
        })
        if (!response.ok) throw new Error("Failed to update API key")
        const updatedKey = await response.json()
        setKeys((prev) => prev.map((k) => (k.id === id ? updatedKey : k)))
        return true
      } catch (err) {
        console.error("Failed to update agent API key:", err)
        setError("Failed to update API key")
        return false
      }
    },
    []
  )

  const deleteKey = useCallback(async (id: string): Promise<boolean> => {
    try {
      const response = await fetch(`/api/dashboard/agent-api-keys/${id}`, {
        method: "DELETE",
      })
      if (!response.ok) throw new Error("Failed to delete API key")
      setKeys((prev) => prev.filter((k) => k.id !== id))
      return true
    } catch (err) {
      console.error("Failed to delete agent API key:", err)
      setError("Failed to delete API key")
      return false
    }
  }, [])

  return { keys, isLoading, error, fetchKeys, createKey, updateKey, deleteKey }
}
