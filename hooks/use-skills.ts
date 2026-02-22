"use client"

import { useState, useCallback, useEffect } from "react"

export interface SkillItem {
  id: string
  name: string
  displayName: string
  description: string
  content: string
  source: string
  sourceUrl?: string
  version?: string
  category: string
  tags: string[]
  enabled: boolean
  assistantCount: number
  createdAt: string
}

export function useSkills() {
  const [skills, setSkills] = useState<SkillItem[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const fetchSkills = useCallback(async () => {
    try {
      setIsLoading(true)
      const res = await fetch("/api/dashboard/skills")
      if (!res.ok) throw new Error("Failed to fetch skills")
      const data = await res.json()
      setSkills(data)
    } catch {
      setSkills([])
    } finally {
      setIsLoading(false)
    }
  }, [])

  const createSkill = useCallback(
    async (input: {
      name: string
      displayName: string
      description: string
      content: string
      category?: string
      tags?: string[]
    }) => {
      const res = await fetch("/api/dashboard/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      })
      if (!res.ok) throw new Error("Failed to create skill")
      const skill = await res.json()
      setSkills((prev) => [...prev, skill])
      return skill
    },
    []
  )

  const updateSkill = useCallback(
    async (id: string, updates: Partial<SkillItem>) => {
      const res = await fetch(`/api/dashboard/skills/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      })
      if (!res.ok) throw new Error("Failed to update skill")
      const updated = await res.json()
      setSkills((prev) => prev.map((s) => (s.id === id ? { ...s, ...updated } : s)))
      return updated
    },
    []
  )

  const deleteSkill = useCallback(async (id: string) => {
    const res = await fetch(`/api/dashboard/skills/${id}`, { method: "DELETE" })
    if (!res.ok) throw new Error("Failed to delete skill")
    setSkills((prev) => prev.filter((s) => s.id !== id))
  }, [])

  useEffect(() => {
    fetchSkills()
  }, [fetchSkills])

  return {
    skills,
    isLoading,
    fetchSkills,
    createSkill,
    updateSkill,
    deleteSkill,
  }
}
