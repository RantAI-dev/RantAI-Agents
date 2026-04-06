"use client"

import { useState, useEffect, useCallback } from "react"

interface SharedTemplate {
  id: string
  organizationId: string
  name: string
  description: string | null
  category: string
  templateData: Record<string, unknown>
  version: number
  isPublic: boolean
  createdBy: string
  createdAt: string
  updatedAt: string
}

export function useSharedTemplates() {
  const [templates, setTemplates] = useState<SharedTemplate[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const fetchTemplates = useCallback(async () => {
    try {
      setIsLoading(true)
      const res = await fetch("/api/dashboard/templates")
      if (!res.ok) throw new Error("Failed to fetch templates")
      const data = await res.json()
      setTemplates(data)
    } catch (error) {
      console.error("Failed to fetch templates:", error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchTemplates()
  }, [fetchTemplates])

  const createTemplate = useCallback(async (data: {
    name: string
    description?: string
    category: string
    templateData: Record<string, unknown>
    isPublic?: boolean
  }) => {
    const res = await fetch("/api/dashboard/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
    if (!res.ok) throw new Error("Failed to create template")
    const template = await res.json()
    setTemplates((prev) => [template, ...prev])
    return template
  }, [])

  const updateTemplate = useCallback(async (id: string, data: Partial<{
    name: string
    description: string
    category: string
    templateData: Record<string, unknown>
    isPublic: boolean
  }>) => {
    const res = await fetch(`/api/dashboard/templates/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
    if (!res.ok) throw new Error("Failed to update template")
    const updated = await res.json()
    setTemplates((prev) => prev.map((t) => (t.id === id ? updated : t)))
    return updated
  }, [])

  const deleteTemplate = useCallback(async (id: string) => {
    const res = await fetch(`/api/dashboard/templates/${id}`, { method: "DELETE" })
    if (!res.ok) throw new Error("Failed to delete template")
    setTemplates((prev) => prev.filter((t) => t.id !== id))
  }, [])

  return { templates, isLoading, createTemplate, updateTemplate, deleteTemplate, refresh: fetchTemplates }
}
