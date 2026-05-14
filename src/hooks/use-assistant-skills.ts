"use client"

import { useState, useCallback, useEffect, useMemo } from "react"
import { useOrgFetch } from "@/hooks/use-organization"

interface AssistantSkillBinding {
  id: string
  skillId: string
  enabled: boolean
  priority: number
}

export function useAssistantSkills(assistantId: string | null) {
  const orgFetch = useOrgFetch()
  const [bindings, setBindings] = useState<AssistantSkillBinding[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const fetchBindings = useCallback(async () => {
    if (!assistantId) {
      setBindings([])
      return
    }
    try {
      setIsLoading(true)
      const res = await orgFetch(`/api/assistants/${assistantId}/skills`)
      if (!res.ok) throw new Error("Failed to fetch")
      const data = await res.json()
      setBindings(data)
    } catch {
      setBindings([])
    } finally {
      setIsLoading(false)
    }
  }, [orgFetch, assistantId])

  const updateAssistantSkills = useCallback(
    async (skillIds: string[]) => {
      if (!assistantId) return
      const res = await orgFetch(`/api/assistants/${assistantId}/skills`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skillIds }),
      })
      if (!res.ok) throw new Error("Failed to update")
      const data = await res.json()
      setBindings(data)
    },
    [orgFetch, assistantId]
  )

  useEffect(() => {
    fetchBindings()
  }, [fetchBindings])

  const enabledSkillIds = useMemo(
    () => bindings.filter((b) => b.enabled).map((b) => b.skillId),
    [bindings]
  )

  return {
    bindings,
    enabledSkillIds,
    isLoading,
    fetchBindings,
    updateAssistantSkills,
  }
}
