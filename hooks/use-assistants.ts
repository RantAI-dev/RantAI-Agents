"use client"

import { useState, useEffect, useCallback } from "react"
import type { Assistant, AssistantInput } from "@/lib/types/assistant"
import { DEFAULT_ASSISTANTS, getDefaultAssistant } from "@/lib/assistants/defaults"

const STORAGE_KEY = "horizonlife-assistants"
const SELECTED_KEY = "horizonlife-selected-assistant"
const DEFAULT_OVERRIDES_KEY = "horizonlife-assistant-overrides"
const ASSISTANT_CHANGE_EVENT = "horizonlife-assistant-change"

// Overrides for default assistants (only stores modified fields)
type DefaultAssistantOverrides = Record<string, Partial<AssistantInput>>

function parseAssistants(json: string): Assistant[] {
  try {
    const data = JSON.parse(json)
    return data.map((a: Assistant) => ({
      ...a,
      createdAt: new Date(a.createdAt),
    }))
  } catch {
    return []
  }
}

function parseOverrides(json: string): DefaultAssistantOverrides {
  try {
    return JSON.parse(json)
  } catch {
    return {}
  }
}

export function useAssistants() {
  const [customAssistants, setCustomAssistants] = useState<Assistant[]>([])
  const [defaultOverrides, setDefaultOverrides] = useState<DefaultAssistantOverrides>({})
  const [selectedAssistantId, setSelectedAssistantId] = useState<string>(
    getDefaultAssistant().id
  )
  const [isLoaded, setIsLoaded] = useState(false)

  // All assistants = defaults (with overrides applied) + custom
  const assistants = [
    ...DEFAULT_ASSISTANTS.map((a) => ({
      ...a,
      ...defaultOverrides[a.id],
    })),
    ...customAssistants,
  ]

  // Currently selected assistant
  const selectedAssistant =
    assistants.find((a) => a.id === selectedAssistantId) || getDefaultAssistant()

  // Load from localStorage on mount
  useEffect(() => {
    const storedAssistants = localStorage.getItem(STORAGE_KEY)
    if (storedAssistants) {
      setCustomAssistants(parseAssistants(storedAssistants))
    }

    const storedOverrides = localStorage.getItem(DEFAULT_OVERRIDES_KEY)
    if (storedOverrides) {
      setDefaultOverrides(parseOverrides(storedOverrides))
    }

    const storedSelected = localStorage.getItem(SELECTED_KEY)
    if (storedSelected) {
      setSelectedAssistantId(storedSelected)
    }

    setIsLoaded(true)
  }, [])

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

  // Save custom assistants to localStorage
  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(customAssistants))
    }
  }, [customAssistants, isLoaded])

  // Save default overrides to localStorage
  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem(DEFAULT_OVERRIDES_KEY, JSON.stringify(defaultOverrides))
    }
  }, [defaultOverrides, isLoaded])

  // Save selected assistant ID
  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem(SELECTED_KEY, selectedAssistantId)
    }
  }, [selectedAssistantId, isLoaded])

  const selectAssistant = useCallback((id: string) => {
    setSelectedAssistantId(id)
    // Dispatch custom event to sync with other components
    window.dispatchEvent(
      new CustomEvent(ASSISTANT_CHANGE_EVENT, { detail: id })
    )
  }, [])

  const addAssistant = useCallback((input: AssistantInput): Assistant => {
    const newAssistant: Assistant = {
      id: crypto.randomUUID(),
      ...input,
      isDefault: false,
      isEditable: true,
      createdAt: new Date(),
    }
    setCustomAssistants((prev) => [...prev, newAssistant])
    return newAssistant
  }, [])

  const updateAssistant = useCallback(
    (id: string, updates: Partial<AssistantInput>) => {
      // Check if this is a default assistant
      const isDefaultAssistant = DEFAULT_ASSISTANTS.some((a) => a.id === id)

      if (isDefaultAssistant) {
        // Store overrides for default assistants
        setDefaultOverrides((prev) => ({
          ...prev,
          [id]: { ...prev[id], ...updates },
        }))
      } else {
        // Update custom assistants
        setCustomAssistants((prev) =>
          prev.map((a) => (a.id === id ? { ...a, ...updates } : a))
        )
      }
    },
    []
  )

  const deleteAssistant = useCallback(
    (id: string) => {
      // Can only delete custom assistants
      const assistant = customAssistants.find((a) => a.id === id)
      if (!assistant || !assistant.isEditable) return

      setCustomAssistants((prev) => prev.filter((a) => a.id !== id))

      // If deleted assistant was selected, switch to default
      if (selectedAssistantId === id) {
        setSelectedAssistantId(getDefaultAssistant().id)
      }
    },
    [customAssistants, selectedAssistantId]
  )

  const getAssistantById = useCallback(
    (id: string): Assistant | undefined => {
      return assistants.find((a) => a.id === id)
    },
    [assistants]
  )

  return {
    assistants,
    customAssistants,
    selectedAssistant,
    selectedAssistantId,
    isLoaded,
    selectAssistant,
    addAssistant,
    updateAssistant,
    deleteAssistant,
    getAssistantById,
  }
}
