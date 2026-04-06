"use client"

import { useState, useCallback, useEffect } from "react"
import { useOrgFetch } from "@/hooks/use-organization"
import type {
  EnrichedTask,
  TaskFilter,
  CreateTaskInput,
  UpdateTaskInput,
  TaskStatus,
} from "@/lib/digital-employee/task-types"

interface UseTasksOptions {
  filter?: TaskFilter
  pollInterval?: number // ms, default 30000
  initialTasks?: EnrichedTask[]
}

export function useTasks(options: UseTasksOptions = {}) {
  const { filter, pollInterval = 30000, initialTasks } = options
  const orgFetch = useOrgFetch()

  const [tasks, setTasks] = useState<EnrichedTask[]>(initialTasks ?? [])
  const [isLoading, setIsLoading] = useState(initialTasks ? false : true)
  const [error, setError] = useState<string | null>(null)

  const fetchTasks = useCallback(async () => {
    try {
      setIsLoading(true)
      const params = new URLSearchParams()
      if (filter?.status) params.set("status", filter.status)
      if (filter?.assigneeId) params.set("assigneeId", filter.assigneeId)
      if (filter?.groupId) params.set("groupId", filter.groupId)
      if (filter?.priority) params.set("priority", filter.priority)
      if (filter?.topLevelOnly) params.set("topLevelOnly", "true")

      const res = await orgFetch(`/api/dashboard/tasks?${params}`)
      if (!res.ok) {
        const text = await res.text()
        try {
          const data = JSON.parse(text)
          setError(data.error || `Failed to fetch tasks (${res.status})`)
        } catch {
          setError(`Failed to fetch tasks (${res.status})`)
        }
        return
      }
      const data = await res.json()
      setTasks(data)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch tasks")
    } finally {
      setIsLoading(false)
    }
  }, [
    orgFetch,
    filter?.status,
    filter?.assigneeId,
    filter?.groupId,
    filter?.priority,
    filter?.topLevelOnly,
  ])

  const createTask = useCallback(
    async (input: CreateTaskInput): Promise<EnrichedTask> => {
      const res = await orgFetch("/api/dashboard/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      })
      if (!res.ok) {
        const text = await res.text()
        try {
          const data = JSON.parse(text)
          throw new Error(data.error || `Failed to create task (${res.status})`)
        } catch (e) {
          if (e instanceof Error && e.message !== text) throw e
          throw new Error(`Failed to create task (${res.status})`)
        }
      }
      const result = await res.json()
      await fetchTasks()
      return result
    },
    [fetchTasks, orgFetch]
  )

  const updateTask = useCallback(
    async (taskId: string, input: UpdateTaskInput): Promise<EnrichedTask> => {
      const res = await orgFetch(`/api/dashboard/tasks/${taskId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Failed to update task")
      }
      const result = await res.json()
      await fetchTasks()
      return result
    },
    [fetchTasks, orgFetch]
  )

  const deleteTask = useCallback(
    async (taskId: string): Promise<void> => {
      const res = await orgFetch(`/api/dashboard/tasks/${taskId}`, {
        method: "DELETE",
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Failed to delete task")
      }
      await fetchTasks()
    },
    [fetchTasks, orgFetch]
  )

  // Fetch on mount and when filter changes
  useEffect(() => {
    if (initialTasks) {
      return
    }
    fetchTasks()
  }, [fetchTasks, initialTasks])

  // Polling
  useEffect(() => {
    if (pollInterval <= 0) return
    const interval = setInterval(fetchTasks, pollInterval)
    return () => clearInterval(interval)
  }, [fetchTasks, pollInterval])

  // Computed helpers
  const tasksByStatus = useCallback(
    (status: TaskStatus): EnrichedTask[] => {
      return tasks.filter(
        (t) => t.status === status && !t.parent_task_id
      )
    },
    [tasks]
  )

  const topLevelTasks = tasks.filter((t) => !t.parent_task_id)

  const taskCounts = (() => {
    const counts: Record<TaskStatus, number> = {
      TODO: 0,
      IN_PROGRESS: 0,
      IN_REVIEW: 0,
      DONE: 0,
      CANCELLED: 0,
    }
    for (const t of topLevelTasks) {
      counts[t.status] = (counts[t.status] || 0) + 1
    }
    return counts
  })()

  const openCount =
    taskCounts.TODO + taskCounts.IN_PROGRESS + taskCounts.IN_REVIEW

  return {
    tasks,
    topLevelTasks,
    isLoading,
    error,
    refresh: fetchTasks,
    createTask,
    updateTask,
    deleteTask,
    tasksByStatus,
    taskCounts,
    openCount,
  }
}
