"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import type {
  Task,
  TaskDetail,
  TaskComment,
  TaskEvent,
  UpdateTaskInput,
  ReviewInput,
  AddCommentInput,
  CreateTaskInput,
} from "@/lib/digital-employee/task-types"

interface UseTaskDetailOptions {
  pollInterval?: number // ms, default 15000
}

export function useTaskDetail(
  taskId: string | null,
  options: UseTaskDetailOptions = {}
) {
  const { pollInterval = 15000 } = options

  const [task, setTask] = useState<Task | null>(null)
  const [subtasks, setSubtasks] = useState<Task[]>([])
  const [comments, setComments] = useState<TaskComment[]>([])
  const [events, setEvents] = useState<TaskEvent[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchDetail = useCallback(async () => {
    if (!taskId) return
    try {
      setIsLoading(true)
      const res = await fetch(`/api/dashboard/tasks/${taskId}`)
      if (!res.ok) {
        const data = await res.json()
        setError(data.error || "Failed to fetch task")
        return
      }
      const detail: TaskDetail = await res.json()
      setTask(detail.task)
      setSubtasks(detail.subtasks)
      setComments(detail.comments)
      setEvents(detail.events)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch task")
    } finally {
      setIsLoading(false)
    }
  }, [taskId])

  const updateTask = useCallback(
    async (input: UpdateTaskInput): Promise<Task> => {
      if (!taskId) throw new Error("No task selected")
      const res = await fetch(`/api/dashboard/tasks/${taskId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Failed to update task")
      }
      const result = await res.json()
      await fetchDetail()
      return result
    },
    [taskId, fetchDetail]
  )

  const submitReview = useCallback(
    async (input: ReviewInput): Promise<void> => {
      if (!taskId) throw new Error("No task selected")
      const res = await fetch(`/api/dashboard/tasks/${taskId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Failed to submit review")
      }
      await fetchDetail()
    },
    [taskId, fetchDetail]
  )

  const addComment = useCallback(
    async (input: AddCommentInput): Promise<TaskComment> => {
      if (!taskId) throw new Error("No task selected")
      const res = await fetch(`/api/dashboard/tasks/${taskId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Failed to add comment")
      }
      const result = await res.json()
      await fetchDetail()
      return result
    },
    [taskId, fetchDetail]
  )

  const addSubtask = useCallback(
    async (input: CreateTaskInput): Promise<Task> => {
      if (!taskId) throw new Error("No task selected")
      const res = await fetch("/api/dashboard/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...input, parent_task_id: taskId }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Failed to create subtask")
      }
      const result = await res.json()
      await fetchDetail()
      return result
    },
    [taskId, fetchDetail]
  )

  const submitSubtaskReview = useCallback(
    async (subtaskId: string, input: ReviewInput): Promise<void> => {
      const res = await fetch(`/api/dashboard/tasks/${subtaskId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Failed to submit subtask review")
      }
      await fetchDetail()
    },
    [fetchDetail]
  )

  // Fetch on mount / taskId change; reset on null
  useEffect(() => {
    if (taskId) {
      fetchDetail()
    } else {
      setTask(null)
      setSubtasks([])
      setComments([])
      setEvents([])
      setError(null)
    }
  }, [taskId, fetchDetail])

  // Polling
  useEffect(() => {
    if (!taskId || pollInterval <= 0) return
    const interval = setInterval(fetchDetail, pollInterval)
    return () => clearInterval(interval)
  }, [taskId, fetchDetail, pollInterval])

  return {
    task,
    subtasks,
    comments,
    events,
    isLoading,
    error,
    refresh: fetchDetail,
    updateTask,
    submitReview,
    addComment,
    addSubtask,
    submitSubtaskReview,
  }
}
