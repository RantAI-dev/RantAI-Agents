"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { AVAILABLE_MODELS, type LLMModel } from "@/lib/models"

/** Shape returned by /api/dashboard/models */
export interface DashboardModel {
  id: string
  name: string
  provider: string
  providerSlug: string
  description: string
  contextWindow: number
  pricingInput: number
  pricingOutput: number
  hasVision: boolean
  hasToolCalling: boolean
  hasStreaming: boolean
  isFree: boolean
  isTrackedLab: boolean
}

/** Convert a DashboardModel to the LLMModel shape used by existing UI components. */
function toLLMModel(m: DashboardModel): LLMModel {
  return {
    id: m.id,
    name: m.name,
    provider: m.provider,
    description: m.description,
    contextWindow: m.contextWindow,
    pricing: { input: m.pricingInput, output: m.pricingOutput },
    capabilities: {
      vision: m.hasVision,
      functionCalling: m.hasToolCalling,
      streaming: m.hasStreaming,
    },
  }
}

export function useModels() {
  const [models, setModels] = useState<LLMModel[]>(AVAILABLE_MODELS)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchModels = useCallback(async () => {
    try {
      setError(null)
      const response = await fetch("/api/dashboard/models")
      if (!response.ok) {
        throw new Error("Failed to fetch models")
      }
      const data: DashboardModel[] = await response.json()
      if (data.length > 0) {
        setModels(data.map(toLLMModel))
      }
      // If empty, keep the static AVAILABLE_MODELS fallback
    } catch (err) {
      console.error("Failed to fetch models:", err)
      setError("Failed to load models")
      // Keep static fallback on error
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchModels()
  }, [fetchModels])

  const getModelById = useCallback(
    (id: string): LLMModel | undefined => {
      return models.find((m) => m.id === id)
    },
    [models]
  )

  const getModelName = useCallback(
    (id: string): string => {
      const model = models.find((m) => m.id === id)
      return model ? model.name : id.split("/").pop() || id
    },
    [models]
  )

  const grouped = useMemo(() => {
    const groups: Record<string, LLMModel[]> = {}
    for (const model of models) {
      if (!groups[model.provider]) groups[model.provider] = []
      groups[model.provider].push(model)
    }
    return groups
  }, [models])

  return {
    models,
    grouped,
    isLoading,
    error,
    fetchModels,
    getModelById,
    getModelName,
  }
}
