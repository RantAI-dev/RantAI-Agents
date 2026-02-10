"use client"

import { useState, useEffect, useCallback } from "react"
import type { Assistant, AssistantInput, MemoryConfig } from "@/lib/types/assistant"

const SELECTED_KEY = "rantai-selected-assistant"
const ASSISTANT_CHANGE_EVENT = "rantai-assistant-change"

// Database assistant type from API
interface DbAssistant {
  id: string
  name: string
  description: string | null
  emoji: string
  systemPrompt: string
  model: string | null
  useKnowledgeBase: boolean
  knowledgeBaseGroupIds: string[]
  memoryConfig?: object | null
  isSystemDefault: boolean
  isBuiltIn: boolean
  createdAt: string
  _count?: { tools: number }
}

// Map database assistant to client-side Assistant type
function mapDbAssistant(dbAssistant: DbAssistant): Assistant {
  return {
    id: dbAssistant.id,
    name: dbAssistant.name,
    description: dbAssistant.description || "",
    emoji: dbAssistant.emoji,
    systemPrompt: dbAssistant.systemPrompt,
    model: dbAssistant.model || undefined,
    useKnowledgeBase: dbAssistant.useKnowledgeBase,
    knowledgeBaseGroupIds: dbAssistant.knowledgeBaseGroupIds,
    memoryConfig: (dbAssistant.memoryConfig as MemoryConfig) || undefined,
    isDefault: dbAssistant.isSystemDefault,
    isEditable: true, // All assistants are editable
    toolCount: dbAssistant._count?.tools ?? 0,
    createdAt: new Date(dbAssistant.createdAt),
  }
}

export function useAssistants() {
  const [assistants, setAssistants] = useState<Assistant[]>([])
  const [selectedAssistantId, setSelectedAssistantId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Fetch assistants from API
  const fetchAssistants = useCallback(async () => {
    try {
      setError(null)
      const response = await fetch("/api/assistants")
      if (!response.ok) {
        throw new Error("Failed to fetch assistants")
      }
      const data = await response.json()
      const mapped = data.map(mapDbAssistant)
      setAssistants(mapped)

      // Set default selected assistant if none selected
      if (!selectedAssistantId && mapped.length > 0) {
        const storedSelected = localStorage.getItem(SELECTED_KEY)
        if (storedSelected && mapped.some((a: Assistant) => a.id === storedSelected)) {
          setSelectedAssistantId(storedSelected)
        } else {
          const defaultAssistant = mapped.find((a: Assistant) => a.isDefault) || mapped[0]
          setSelectedAssistantId(defaultAssistant.id)
        }
      }
    } catch (err) {
      console.error("Failed to fetch assistants:", err)
      setError("Failed to load assistants")
    } finally {
      setIsLoading(false)
    }
  }, [selectedAssistantId])

  // Initial fetch
  useEffect(() => {
    fetchAssistants()
  }, [fetchAssistants])

  // Listen for assistant changes from other components
  useEffect(() => {
    const handleAssistantChange = (event: CustomEvent<string>) => {
      setSelectedAssistantId(event.detail)
    }

    window.addEventListener(
      ASSISTANT_CHANGE_EVENT,
      handleAssistantChange as EventListener
    )

    return () => {
      window.removeEventListener(
        ASSISTANT_CHANGE_EVENT,
        handleAssistantChange as EventListener
      )
    }
  }, [])

  // Save selected assistant ID to localStorage
  useEffect(() => {
    if (selectedAssistantId) {
      localStorage.setItem(SELECTED_KEY, selectedAssistantId)
    }
  }, [selectedAssistantId])

  // Currently selected assistant
  const selectedAssistant = assistants.find((a) => a.id === selectedAssistantId) || assistants[0]

  const selectAssistant = useCallback((id: string) => {
    setSelectedAssistantId(id)
    // Dispatch custom event to sync with other components
    window.dispatchEvent(
      new CustomEvent(ASSISTANT_CHANGE_EVENT, { detail: id })
    )
  }, [])

  const addAssistant = useCallback(
    async (input: AssistantInput): Promise<Assistant | null> => {
      try {
        const response = await fetch("/api/assistants", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        })

        if (!response.ok) {
          throw new Error("Failed to create assistant")
        }

        const data = await response.json()
        const newAssistant = mapDbAssistant(data)
        setAssistants((prev) => [...prev, newAssistant])
        return newAssistant
      } catch (err) {
        console.error("Failed to create assistant:", err)
        setError("Failed to create assistant")
        return null
      }
    },
    []
  )

  const updateAssistant = useCallback(
    async (id: string, updates: Partial<AssistantInput>): Promise<boolean> => {
      try {
        const response = await fetch(`/api/assistants/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updates),
        })

        if (!response.ok) {
          throw new Error("Failed to update assistant")
        }

        const data = await response.json()
        const updatedAssistant = mapDbAssistant(data)
        setAssistants((prev) =>
          prev.map((a) => (a.id === id ? updatedAssistant : a))
        )
        return true
      } catch (err) {
        console.error("Failed to update assistant:", err)
        setError("Failed to update assistant")
        return false
      }
    },
    []
  )

  const deleteAssistant = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        const response = await fetch(`/api/assistants/${id}`, {
          method: "DELETE",
        })

        if (!response.ok) {
          const data = await response.json()
          throw new Error(data.error || "Failed to delete assistant")
        }

        setAssistants((prev) => prev.filter((a) => a.id !== id))

        // If deleted assistant was selected, switch to default
        if (selectedAssistantId === id) {
          const remaining = assistants.filter((a) => a.id !== id)
          const defaultAssistant = remaining.find((a) => a.isDefault) || remaining[0]
          if (defaultAssistant) {
            setSelectedAssistantId(defaultAssistant.id)
          }
        }

        return true
      } catch (err) {
        console.error("Failed to delete assistant:", err)
        setError("Failed to delete assistant")
        return false
      }
    },
    [assistants, selectedAssistantId]
  )

  const getAssistantById = useCallback(
    (id: string): Assistant | undefined => {
      return assistants.find((a) => a.id === id)
    },
    [assistants]
  )

  const refetch = useCallback(() => {
    setIsLoading(true)
    fetchAssistants()
  }, [fetchAssistants])

  return {
    assistants,
    selectedAssistant,
    selectedAssistantId,
    isLoading,
    error,
    selectAssistant,
    addAssistant,
    updateAssistant,
    deleteAssistant,
    getAssistantById,
    refetch,
  }
}
