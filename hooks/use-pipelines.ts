"use client"

import { useState, useEffect, useCallback } from "react"
import type { PipelineStep } from "@/lib/digital-employee/pipelines"

interface Pipeline {
  id: string
  organizationId: string
  name: string
  description: string | null
  steps: PipelineStep[]
  status: string
  createdBy: string
  createdAt: string
  updatedAt: string
}

export function usePipelines() {
  const [pipelines, setPipelines] = useState<Pipeline[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const fetchPipelines = useCallback(async () => {
    try {
      setIsLoading(true)
      const res = await fetch("/api/dashboard/pipelines")
      if (!res.ok) throw new Error("Failed to fetch pipelines")
      const data = await res.json()
      setPipelines(data)
    } catch (error) {
      console.error("Failed to fetch pipelines:", error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchPipelines()
  }, [fetchPipelines])

  const createPipeline = useCallback(async (data: {
    name: string
    description?: string
    steps?: PipelineStep[]
  }) => {
    const res = await fetch("/api/dashboard/pipelines", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
    if (!res.ok) throw new Error("Failed to create pipeline")
    const pipeline = await res.json()
    setPipelines((prev) => [pipeline, ...prev])
    return pipeline
  }, [])

  const updatePipeline = useCallback(async (id: string, data: Partial<{
    name: string
    description: string
    steps: PipelineStep[]
    status: string
  }>) => {
    const res = await fetch(`/api/dashboard/pipelines/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
    if (!res.ok) throw new Error("Failed to update pipeline")
    const updated = await res.json()
    setPipelines((prev) => prev.map((p) => (p.id === id ? updated : p)))
    return updated
  }, [])

  const deletePipeline = useCallback(async (id: string) => {
    const res = await fetch(`/api/dashboard/pipelines/${id}`, { method: "DELETE" })
    if (!res.ok) throw new Error("Failed to delete pipeline")
    setPipelines((prev) => prev.filter((p) => p.id !== id))
  }, [])

  const runPipeline = useCallback(async (id: string) => {
    const res = await fetch(`/api/dashboard/pipelines/${id}/run`, { method: "POST" })
    if (!res.ok) throw new Error("Failed to run pipeline")
    return await res.json()
  }, [])

  return { pipelines, isLoading, createPipeline, updatePipeline, deletePipeline, runPipeline, refresh: fetchPipelines }
}
