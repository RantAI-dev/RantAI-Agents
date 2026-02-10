"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import type { StepLogEntry } from "@/lib/workflow/types"

export interface WorkflowRunItem {
  id: string
  workflowId: string
  status: "PENDING" | "RUNNING" | "PAUSED" | "COMPLETED" | "FAILED"
  input: unknown
  output: unknown
  error: string | null
  steps: StepLogEntry[]
  suspendedAt: string | null
  resumeData: unknown
  startedAt: string
  completedAt: string | null
}

export function useWorkflowRuns(workflowId: string | null) {
  const [runs, setRuns] = useState<WorkflowRunItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [activeRun, setActiveRun] = useState<WorkflowRunItem | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchRuns = useCallback(async () => {
    if (!workflowId) return
    try {
      setIsLoading(true)
      const res = await fetch(`/api/dashboard/workflows/${workflowId}/runs`)
      if (!res.ok) throw new Error("Failed to fetch runs")
      const data = await res.json()
      setRuns(data)
    } catch {
      // ignore
    } finally {
      setIsLoading(false)
    }
  }, [workflowId])

  const fetchRunDetail = useCallback(
    async (runId: string) => {
      if (!workflowId) return
      try {
        const res = await fetch(`/api/dashboard/workflows/${workflowId}/runs/${runId}`)
        if (!res.ok) throw new Error("Failed to fetch run")
        const data = await res.json()
        setActiveRun(data)
        return data as WorkflowRunItem
      } catch {
        return null
      }
    },
    [workflowId]
  )

  const executeWorkflow = useCallback(
    async (input: unknown = {}) => {
      if (!workflowId) return null
      const res = await fetch(`/api/dashboard/workflows/${workflowId}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input }),
      })
      if (!res.ok) throw new Error("Failed to execute workflow")
      const run = await res.json()
      await fetchRuns()
      setActiveRun(run)
      return run as WorkflowRunItem
    },
    [workflowId, fetchRuns]
  )

  const resumeRun = useCallback(
    async (runId: string, stepId: string, data: unknown) => {
      if (!workflowId) return null
      const res = await fetch(
        `/api/dashboard/workflows/${workflowId}/runs/${runId}/resume`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stepId, data }),
        }
      )
      if (!res.ok) throw new Error("Failed to resume run")
      const run = await res.json()
      await fetchRuns()
      setActiveRun(run)
      return run as WorkflowRunItem
    },
    [workflowId, fetchRuns]
  )

  useEffect(() => {
    if (workflowId) fetchRuns()
  }, [workflowId, fetchRuns])

  // Poll for active runs
  useEffect(() => {
    if (activeRun && (activeRun.status === "RUNNING" || activeRun.status === "PENDING")) {
      pollRef.current = setInterval(async () => {
        const updated = await fetchRunDetail(activeRun.id)
        if (
          updated &&
          updated.status !== "RUNNING" &&
          updated.status !== "PENDING"
        ) {
          if (pollRef.current) clearInterval(pollRef.current)
          fetchRuns()
        }
      }, 2000)
    }

    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [activeRun?.id, activeRun?.status, fetchRunDetail, fetchRuns])

  return {
    runs,
    isLoading,
    activeRun,
    setActiveRun,
    fetchRuns,
    fetchRunDetail,
    executeWorkflow,
    resumeRun,
  }
}
