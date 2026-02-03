"use client"

import { useState, useEffect, useCallback } from "react"
import type { EmbedApiKeyResponse, EmbedApiKeyInput } from "@/lib/embed/types"

export function useEmbedKeys() {
  const [keys, setKeys] = useState<EmbedApiKeyResponse[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchKeys = useCallback(async () => {
    try {
      setError(null)
      const response = await fetch("/api/dashboard/embed-keys")
      if (!response.ok) {
        throw new Error("Failed to fetch embed keys")
      }
      const data = await response.json()
      setKeys(data)
    } catch (err) {
      console.error("Failed to fetch embed keys:", err)
      setError("Failed to load embed keys")
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchKeys()
  }, [fetchKeys])

  const createKey = useCallback(
    async (input: EmbedApiKeyInput): Promise<EmbedApiKeyResponse | null> => {
      try {
        const response = await fetch("/api/dashboard/embed-keys", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        })

        if (!response.ok) {
          const data = await response.json()
          throw new Error(data.error || "Failed to create embed key")
        }

        const newKey = await response.json()
        setKeys((prev) => [newKey, ...prev])
        return newKey
      } catch (err) {
        console.error("Failed to create embed key:", err)
        setError("Failed to create embed key")
        return null
      }
    },
    []
  )

  const updateKey = useCallback(
    async (
      id: string,
      updates: Partial<EmbedApiKeyInput> & { enabled?: boolean }
    ): Promise<boolean> => {
      try {
        const response = await fetch(`/api/dashboard/embed-keys/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updates),
        })

        if (!response.ok) {
          throw new Error("Failed to update embed key")
        }

        const updatedKey = await response.json()
        setKeys((prev) => prev.map((k) => (k.id === id ? updatedKey : k)))
        return true
      } catch (err) {
        console.error("Failed to update embed key:", err)
        setError("Failed to update embed key")
        return false
      }
    },
    []
  )

  const deleteKey = useCallback(async (id: string): Promise<boolean> => {
    try {
      const response = await fetch(`/api/dashboard/embed-keys/${id}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        throw new Error("Failed to delete embed key")
      }

      setKeys((prev) => prev.filter((k) => k.id !== id))
      return true
    } catch (err) {
      console.error("Failed to delete embed key:", err)
      setError("Failed to delete embed key")
      return false
    }
  }, [])

  const getKeyById = useCallback(
    (id: string): EmbedApiKeyResponse | undefined => {
      return keys.find((k) => k.id === id)
    },
    [keys]
  )

  return {
    keys,
    isLoading,
    error,
    fetchKeys,
    createKey,
    updateKey,
    deleteKey,
    getKeyById,
  }
}
