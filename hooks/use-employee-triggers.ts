"use client"

import { useState, useEffect, useCallback } from "react"

export interface TriggerItem {
  id: string
  type: string
  name: string
  token?: string
  config: Record<string, unknown>
  filterRules?: unknown[]
  enabled: boolean
  triggerCount: number
  lastTriggeredAt: string | null
  createdAt: string | null
}

export function useEmployeeTriggers(employeeId: string) {
  const [triggers, setTriggers] = useState<TriggerItem[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const fetchTriggers = useCallback(async () => {
    try {
      const res = await fetch(`/api/dashboard/digital-employees/${employeeId}/triggers`)
      if (!res.ok) throw new Error("Failed")
      setTriggers(await res.json())
    } catch {
      setTriggers([])
    } finally {
      setIsLoading(false)
    }
  }, [employeeId])

  useEffect(() => { fetchTriggers() }, [fetchTriggers])

  const createTrigger = useCallback(async (input: { type: string; name: string; config?: Record<string, unknown>; filterRules?: unknown[] }) => {
    const res = await fetch(`/api/dashboard/digital-employees/${employeeId}/triggers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    })
    if (!res.ok) throw new Error("Failed")
    await fetchTriggers()
    return res.json()
  }, [employeeId, fetchTriggers])

  const updateTrigger = useCallback(async (triggerId: string, input: Partial<TriggerItem>) => {
    const res = await fetch(`/api/dashboard/digital-employees/${employeeId}/triggers/${triggerId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    })
    if (!res.ok) throw new Error("Failed")
    await fetchTriggers()
  }, [employeeId, fetchTriggers])

  const deleteTrigger = useCallback(async (triggerId: string) => {
    const res = await fetch(`/api/dashboard/digital-employees/${employeeId}/triggers/${triggerId}`, {
      method: "DELETE",
    })
    if (!res.ok) throw new Error("Failed")
    await fetchTriggers()
  }, [employeeId, fetchTriggers])

  const regenerateToken = useCallback(async (triggerId: string) => {
    // regenerate is done via PUT with a new token request
    const res = await fetch(`/api/dashboard/digital-employees/${employeeId}/triggers/${triggerId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ regenerateToken: true }),
    })
    if (!res.ok) throw new Error("Failed")
    await fetchTriggers()
  }, [employeeId, fetchTriggers])

  return { triggers, isLoading, fetchTriggers, createTrigger, updateTrigger, deleteTrigger, regenerateToken }
}
