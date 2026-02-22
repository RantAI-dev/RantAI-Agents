"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import type { SkillReadiness } from "@/lib/skills/requirement-resolver"

const cache = new Map<string, { data: SkillReadiness; ts: number }>()
const CACHE_TTL = 60_000 // 1 minute

export function useSkillReadiness(
  skillId: string | null,
  assistantId: string | null
) {
  const [readiness, setReadiness] = useState<SkillReadiness | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const fetchReadiness = useCallback(async () => {
    if (!skillId || !assistantId) {
      setReadiness(null)
      return
    }

    const cacheKey = `${skillId}:${assistantId}`
    const cached = cache.get(cacheKey)
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      setReadiness(cached.data)
      return
    }

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    try {
      setIsLoading(true)
      const res = await fetch(
        `/api/dashboard/skills/${skillId}/readiness?assistantId=${assistantId}`,
        { signal: controller.signal }
      )
      if (!res.ok) throw new Error("Failed to fetch readiness")
      const data: SkillReadiness = await res.json()
      cache.set(cacheKey, { data, ts: Date.now() })
      setReadiness(data)
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setReadiness(null)
      }
    } finally {
      setIsLoading(false)
    }
  }, [skillId, assistantId])

  useEffect(() => {
    fetchReadiness()
    return () => abortRef.current?.abort()
  }, [fetchReadiness])

  const invalidate = useCallback(() => {
    if (skillId && assistantId) {
      cache.delete(`${skillId}:${assistantId}`)
      fetchReadiness()
    }
  }, [skillId, assistantId, fetchReadiness])

  return { readiness, isLoading, invalidate }
}

/** Batch hook: fetch readiness for multiple skills at once */
export function useSkillsReadiness(
  skillIds: string[],
  assistantId: string | null
) {
  const [readinessMap, setReadinessMap] = useState<
    Record<string, SkillReadiness>
  >({})
  const [isLoading, setIsLoading] = useState(false)

  const fetchAll = useCallback(async () => {
    if (!assistantId || skillIds.length === 0) {
      setReadinessMap({})
      return
    }

    setIsLoading(true)
    const results: Record<string, SkillReadiness> = {}

    await Promise.all(
      skillIds.map(async (skillId) => {
        const cacheKey = `${skillId}:${assistantId}`
        const cached = cache.get(cacheKey)
        if (cached && Date.now() - cached.ts < CACHE_TTL) {
          results[skillId] = cached.data
          return
        }

        try {
          const res = await fetch(
            `/api/dashboard/skills/${skillId}/readiness?assistantId=${assistantId}`
          )
          if (res.ok) {
            const data: SkillReadiness = await res.json()
            cache.set(cacheKey, { data, ts: Date.now() })
            results[skillId] = data
          }
        } catch {
          // Skip failed fetches
        }
      })
    )

    setReadinessMap(results)
    setIsLoading(false)
  }, [skillIds.join(","), assistantId])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  return { readinessMap, isLoading, refetch: fetchAll }
}
