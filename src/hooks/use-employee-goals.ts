"use client"

import { useState, useEffect, useCallback } from "react"

export interface GoalItem {
  id: string
  name: string
  type: string
  target: number
  unit: string
  period: string
  currentValue: number
  source: string
  status: string
  progress: number
  createdAt: string
  updatedAt: string
}

export function useEmployeeGoals(employeeId: string) {
  const [goals, setGoals] = useState<GoalItem[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const fetchGoals = useCallback(async () => {
    try {
      const res = await fetch(`/api/dashboard/digital-employees/${employeeId}/goals`)
      if (!res.ok) throw new Error("Failed")
      setGoals(await res.json())
    } catch {
      setGoals([])
    } finally {
      setIsLoading(false)
    }
  }, [employeeId])

  useEffect(() => { fetchGoals() }, [fetchGoals])

  const createGoal = useCallback(async (input: {
    name: string; type: string; target: number; unit: string; period: string
  }) => {
    const res = await fetch(`/api/dashboard/digital-employees/${employeeId}/goals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    })
    if (!res.ok) throw new Error("Failed")
    await fetchGoals()
  }, [employeeId, fetchGoals])

  const updateGoal = useCallback(async (goalId: string, input: Partial<GoalItem>) => {
    const res = await fetch(`/api/dashboard/digital-employees/${employeeId}/goals/${goalId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    })
    if (!res.ok) throw new Error("Failed")
    await fetchGoals()
  }, [employeeId, fetchGoals])

  const deleteGoal = useCallback(async (goalId: string) => {
    const res = await fetch(`/api/dashboard/digital-employees/${employeeId}/goals/${goalId}`, {
      method: "DELETE",
    })
    if (!res.ok) throw new Error("Failed")
    await fetchGoals()
  }, [employeeId, fetchGoals])

  return { goals, isLoading, fetchGoals, createGoal, updateGoal, deleteGoal }
}
