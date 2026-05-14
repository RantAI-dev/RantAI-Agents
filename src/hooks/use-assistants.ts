"use client"

import { useState, useEffect, useCallback } from "react"
import { useOrgFetch, useActiveOrgChange } from "@/hooks/use-organization"
import type { Assistant, AssistantInput, MemoryConfig, ModelConfig, ChatConfig, GuardRailsConfig } from "@/lib/types/assistant"

const SELECTED_KEY = "rantai-selected-assistant"
const ASSISTANT_CHANGE_EVENT = "rantai-assistant-change"
const ASSISTANTS_MUTATED_EVENT = "rantai-assistants-mutated"

function resolveSelectedAssistantId(
  assistants: Assistant[],
  currentSelectedId: string | null,
  storedSelectedId: string | null
): string | null {
  if (assistants.length === 0) {
    return null
  }

  if (currentSelectedId && assistants.some((a) => a.id === currentSelectedId)) {
    return currentSelectedId
  }

  if (storedSelectedId && assistants.some((a) => a.id === storedSelectedId)) {
    return storedSelectedId
  }

  return assistants.find((a) => a.isDefault)?.id ?? assistants[0].id
}

// Database assistant type from API
export interface DbAssistant {
  id: string
  name: string
  description: string | null
  emoji: string
  systemPrompt: string
  model: string | null
  useKnowledgeBase: boolean
  knowledgeBaseGroupIds: string[]
  memoryConfig?: object | null
  modelConfig?: object | null
  chatConfig?: object | null
  guardRails?: object | null
  avatarS3Key?: string | null
  openingMessage?: string | null
  openingQuestions?: string[]
  isSystemDefault: boolean
  isBuiltIn: boolean
  tags?: string[]
  liveChatEnabled?: boolean
  createdAt: string
  toolCount?: number
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
    modelConfig: (dbAssistant.modelConfig as ModelConfig) || undefined,
    chatConfig: (dbAssistant.chatConfig as ChatConfig) || undefined,
    guardRails: (dbAssistant.guardRails as GuardRailsConfig) || undefined,
    avatarS3Key: dbAssistant.avatarS3Key || undefined,
    openingMessage: dbAssistant.openingMessage || undefined,
    openingQuestions: dbAssistant.openingQuestions || undefined,
    tags: dbAssistant.tags || [],
    isDefault: dbAssistant.isSystemDefault,
    isEditable: true, // All assistants are editable
    liveChatEnabled: dbAssistant.liveChatEnabled ?? false,
    toolCount: dbAssistant.toolCount ?? dbAssistant._count?.tools ?? 0,
    createdAt: new Date(dbAssistant.createdAt),
  }
}

export function useAssistants(options?: { initialAssistants?: DbAssistant[] }) {
  const initialAssistants = options?.initialAssistants
  const orgFetch = useOrgFetch()
  const [assistants, setAssistants] = useState<Assistant[]>(
    initialAssistants ? initialAssistants.map(mapDbAssistant) : []
  )
  const [selectedAssistantId, setSelectedAssistantId] = useState<string | null>(() => {
    if (typeof window === "undefined") {
      return null
    }
    return localStorage.getItem(SELECTED_KEY)
  })
  const [isLoading, setIsLoading] = useState(initialAssistants ? false : true)
  const [error, setError] = useState<string | null>(null)

  // Fetch assistants from API
  const fetchAssistants = useCallback(async () => {
    try {
      setError(null)
      const response = await orgFetch("/api/assistants")
      if (!response.ok) {
        throw new Error("Failed to fetch assistants")
      }
      const data = await response.json()
      const mapped = data.map(mapDbAssistant)
      setAssistants(mapped)

      // Recover stale/invalid selected assistant IDs and always keep a valid selection.
      const storedSelected = localStorage.getItem(SELECTED_KEY)
      const nextSelectedId = resolveSelectedAssistantId(
        mapped,
        selectedAssistantId,
        storedSelected
      )
      if (nextSelectedId !== selectedAssistantId) {
        setSelectedAssistantId(nextSelectedId)
      }
    } catch (err) {
      console.error("Failed to fetch assistants:", err)
      setError("Failed to load assistants")
    } finally {
      setIsLoading(false)
    }
  }, [orgFetch, selectedAssistantId])

  // Initial fetch (unless server hydrated)
  useEffect(() => {
    if (initialAssistants) {
      return
    }
    fetchAssistants()
  }, [fetchAssistants, initialAssistants])

  // Refetch on active-org change (user switched orgs via the sidebar).
  // Replaces the stale list without a page reload; respects server-side
  // hydration on the very first paint by routing through fetchAssistants
  // which always hits /api/assistants for the new org context.
  useActiveOrgChange(useCallback(() => {
    void fetchAssistants()
  }, [fetchAssistants]))

  // Initialize selected assistant from stored/default when assistants are already hydrated
  useEffect(() => {
    if (assistants.length === 0) {
      return
    }

    const storedSelected = localStorage.getItem(SELECTED_KEY)
    const nextSelectedId = resolveSelectedAssistantId(
      assistants,
      selectedAssistantId,
      storedSelected
    )
    if (nextSelectedId !== selectedAssistantId) {
      setSelectedAssistantId(nextSelectedId)
    }
  }, [assistants, selectedAssistantId])

  // Listen for assistant changes from other components
  useEffect(() => {
    const handleAssistantChange = (event: CustomEvent<string>) => {
      const nextAssistantId = event.detail
      setSelectedAssistantId(nextAssistantId)

      // Another hook instance (sidebar/editor) may have created a new assistant.
      // Refetch when this instance doesn't have that assistant yet.
      if (!assistants.some((assistant) => assistant.id === nextAssistantId)) {
        void fetchAssistants()
      }
    }

    const handleMutated = () => {
      void fetchAssistants()
    }

    window.addEventListener(
      ASSISTANT_CHANGE_EVENT,
      handleAssistantChange as EventListener
    )
    window.addEventListener(ASSISTANTS_MUTATED_EVENT, handleMutated)

    return () => {
      window.removeEventListener(
        ASSISTANT_CHANGE_EVENT,
        handleAssistantChange as EventListener
      )
      window.removeEventListener(ASSISTANTS_MUTATED_EVENT, handleMutated)
    }
  }, [assistants, fetchAssistants])

  // Save selected assistant ID to localStorage
  useEffect(() => {
    if (selectedAssistantId) {
      localStorage.setItem(SELECTED_KEY, selectedAssistantId)
    }
  }, [selectedAssistantId])

  // Always expose a valid selected assistant to avoid UI dead-ends in sidebar/chat.
  const selectedAssistant = selectedAssistantId
    ? assistants.find((a) => a.id === selectedAssistantId) ?? assistants[0]
    : assistants[0]

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
        const response = await orgFetch("/api/assistants", {
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
        window.dispatchEvent(new CustomEvent(ASSISTANTS_MUTATED_EVENT))
        return newAssistant
      } catch (err) {
        console.error("Failed to create assistant:", err)
        setError("Failed to create assistant")
        return null
      }
    },
    [orgFetch]
  )

  const updateAssistant = useCallback(
    async (id: string, updates: Partial<AssistantInput>): Promise<boolean> => {
      try {
        const response = await orgFetch(`/api/assistants/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updates),
        })

        if (!response.ok) {
          const data = await response.json().catch(() => ({}))
          const message = typeof data?.error === "string" ? data.error : "Failed to update assistant"
          throw new Error(message)
        }

        const data = await response.json()
        const updatedAssistant = mapDbAssistant(data)
        setAssistants((prev) =>
          prev.map((a) => (a.id === id ? updatedAssistant : a))
        )
        window.dispatchEvent(new CustomEvent(ASSISTANTS_MUTATED_EVENT))
        return true
      } catch (err) {
        console.error("Failed to update assistant:", err)
        setError("Failed to update assistant")
        return false
      }
    },
    [orgFetch]
  )

  const deleteAssistant = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        const response = await orgFetch(`/api/assistants/${id}`, {
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

        window.dispatchEvent(new CustomEvent(ASSISTANTS_MUTATED_EVENT))
        return true
      } catch (err) {
        console.error("Failed to delete assistant:", err)
        setError("Failed to delete assistant")
        return false
      }
    },
    [orgFetch, assistants, selectedAssistantId]
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
