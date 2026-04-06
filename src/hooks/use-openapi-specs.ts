"use client"

import { useState, useCallback, useEffect } from "react"

export interface OpenApiSpecItem {
  id: string
  name: string
  specUrl?: string
  version?: string
  serverUrl: string
  toolCount: number
  createdAt: string
}

export function useOpenApiSpecs() {
  const [specs, setSpecs] = useState<OpenApiSpecItem[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const fetchSpecs = useCallback(async () => {
    try {
      setIsLoading(true)
      const res = await fetch("/api/dashboard/openapi-specs")
      if (!res.ok) throw new Error("Failed to fetch")
      const data = await res.json()
      setSpecs(data)
    } catch {
      setSpecs([])
    } finally {
      setIsLoading(false)
    }
  }, [])

  const importSpec = useCallback(
    async (input: {
      specContent?: string
      specUrl?: string
      name?: string
      authConfig?: object
      selectedOperationIds?: string[]
    }) => {
      const res = await fetch("/api/dashboard/openapi-specs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Failed to import")
      }
      const result = await res.json()
      if (!result.preview) {
        await fetchSpecs()
      }
      return result
    },
    [fetchSpecs]
  )

  const deleteSpec = useCallback(async (id: string) => {
    const res = await fetch(`/api/dashboard/openapi-specs/${id}`, {
      method: "DELETE",
    })
    if (!res.ok) throw new Error("Failed to delete")
    setSpecs((prev) => prev.filter((s) => s.id !== id))
  }, [])

  useEffect(() => {
    fetchSpecs()
  }, [fetchSpecs])

  return { specs, isLoading, fetchSpecs, importSpec, deleteSpec }
}
