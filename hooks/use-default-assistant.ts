"use client"

import { useState, useEffect, useCallback } from "react"
import type { Assistant } from "@/lib/types/assistant"

interface DbAssistant {
  id: string
  name: string
  description: string | null
  emoji: string
  systemPrompt: string
  useKnowledgeBase: boolean
  knowledgeBaseGroupIds: string[]
  isSystemDefault: boolean
  isBuiltIn: boolean
  createdAt: string
}

interface DefaultAssistantResponse {
  assistant: DbAssistant | null
  source: "user" | "system" | "fallback" | "none"
}

function mapDbAssistant(dbAssistant: DbAssistant): Assistant {
  return {
    id: dbAssistant.id,
    name: dbAssistant.name,
    description: dbAssistant.description || "",
    emoji: dbAssistant.emoji,
    systemPrompt: dbAssistant.systemPrompt,
    useKnowledgeBase: dbAssistant.useKnowledgeBase,
    knowledgeBaseGroupIds: dbAssistant.knowledgeBaseGroupIds,
    isDefault: dbAssistant.isSystemDefault,
    isEditable: true,
    createdAt: new Date(dbAssistant.createdAt),
  }
}

export function useDefaultAssistant() {
  const [assistant, setAssistant] = useState<Assistant | null>(null)
  const [source, setSource] = useState<"user" | "system" | "fallback" | "none">("none")
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchDefaultAssistant = useCallback(async () => {
    try {
      setError(null)
      const response = await fetch("/api/user/default-assistant")
      if (!response.ok) {
        throw new Error("Failed to fetch default assistant")
      }
      const data: DefaultAssistantResponse = await response.json()

      if (data.assistant) {
        setAssistant(mapDbAssistant(data.assistant))
      } else {
        setAssistant(null)
      }
      setSource(data.source)
    } catch (err) {
      console.error("Failed to fetch default assistant:", err)
      setError("Failed to load default assistant")
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchDefaultAssistant()
  }, [fetchDefaultAssistant])

  // Set the current user's default assistant
  const setUserDefault = useCallback(async (assistantId: string): Promise<boolean> => {
    try {
      const response = await fetch("/api/user/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defaultAssistantId: assistantId }),
      })

      if (!response.ok) {
        throw new Error("Failed to set default assistant")
      }

      // Refetch to update state
      await fetchDefaultAssistant()
      return true
    } catch (err) {
      console.error("Failed to set default assistant:", err)
      setError("Failed to set default assistant")
      return false
    }
  }, [fetchDefaultAssistant])

  // Clear the user's custom default (revert to system default)
  const clearUserDefault = useCallback(async (): Promise<boolean> => {
    try {
      const response = await fetch("/api/user/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defaultAssistantId: null }),
      })

      if (!response.ok) {
        throw new Error("Failed to clear default assistant")
      }

      // Refetch to update state
      await fetchDefaultAssistant()
      return true
    } catch (err) {
      console.error("Failed to clear default assistant:", err)
      setError("Failed to clear default assistant")
      return false
    }
  }, [fetchDefaultAssistant])

  const refetch = useCallback(() => {
    setIsLoading(true)
    fetchDefaultAssistant()
  }, [fetchDefaultAssistant])

  return {
    assistant,
    source,
    isLoading,
    error,
    setUserDefault,
    clearUserDefault,
    refetch,
  }
}
