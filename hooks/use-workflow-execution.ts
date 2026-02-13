"use client"

import { useEffect, useRef, useCallback } from "react"
import { io, type Socket } from "socket.io-client"
import { useWorkflowEditor } from "./use-workflow-editor"

type ExecutionStatus = "pending" | "running" | "success" | "failed" | "suspended"

interface StepStartEvent {
  runId: string
  nodeId: string
  nodeType: string
  label: string
}

interface StepSuccessEvent {
  runId: string
  nodeId: string
  nodeType: string
  durationMs: number
  outputPreview?: string
}

interface StepErrorEvent {
  runId: string
  nodeId: string
  nodeType: string
  error: string
  durationMs: number
}

interface StepSuspendEvent {
  runId: string
  nodeId: string
  nodeType: string
  prompt?: string
}

interface RunCompleteEvent {
  runId: string
  status: "COMPLETED" | "FAILED" | "PAUSED"
  durationMs: number
  error?: string
}

/**
 * Hook that subscribes to real-time workflow execution events via Socket.io
 * and updates the workflow editor's nodeExecutionStatus map.
 *
 * Usage:
 *   const { isConnected } = useWorkflowExecution(runId)
 */
export function useWorkflowExecution(runId: string | null) {
  const socketRef = useRef<Socket | null>(null)
  const currentRunId = useRef<string | null>(null)
  const setNodeExecutionStatus = useWorkflowEditor((s) => s.setNodeExecutionStatus)
  const clearNodeExecutionStatus = useWorkflowEditor((s) => s.clearNodeExecutionStatus)
  const statusRef = useRef<Record<string, ExecutionStatus>>({})

  const updateStatus = useCallback(
    (nodeId: string, status: ExecutionStatus) => {
      statusRef.current = { ...statusRef.current, [nodeId]: status }
      setNodeExecutionStatus({ ...statusRef.current })
    },
    [setNodeExecutionStatus]
  )

  useEffect(() => {
    // Clean up if runId is cleared
    if (!runId) {
      if (socketRef.current && currentRunId.current) {
        socketRef.current.emit("workflow:leave", { runId: currentRunId.current })
      }
      currentRunId.current = null
      statusRef.current = {}
      return
    }

    // If same runId, skip re-connection
    if (runId === currentRunId.current && socketRef.current?.connected) return

    // Leave previous run room
    if (socketRef.current && currentRunId.current) {
      socketRef.current.emit("workflow:leave", { runId: currentRunId.current })
    }

    // Reset status
    statusRef.current = {}
    clearNodeExecutionStatus()
    currentRunId.current = runId

    // Create socket if needed
    if (!socketRef.current) {
      socketRef.current = io({
        path: "/api/socket",
        addTrailingSlash: false,
      })
    }

    const socket = socketRef.current

    const onConnect = () => {
      socket.emit("workflow:join", { runId })
    }

    const onStepStart = (data: StepStartEvent) => {
      if (data.runId !== runId) return
      updateStatus(data.nodeId, "running")
    }

    const onStepSuccess = (data: StepSuccessEvent) => {
      if (data.runId !== runId) return
      updateStatus(data.nodeId, "success")
    }

    const onStepError = (data: StepErrorEvent) => {
      if (data.runId !== runId) return
      updateStatus(data.nodeId, "failed")
    }

    const onStepSuspend = (data: StepSuspendEvent) => {
      if (data.runId !== runId) return
      updateStatus(data.nodeId, "suspended")
    }

    const onRunComplete = (_data: RunCompleteEvent) => {
      // Run finished — keep statuses visible for a few seconds, then clear
    }

    socket.on("connect", onConnect)
    socket.on("workflow:step:start", onStepStart)
    socket.on("workflow:step:success", onStepSuccess)
    socket.on("workflow:step:error", onStepError)
    socket.on("workflow:step:suspend", onStepSuspend)
    socket.on("workflow:run:complete", onRunComplete)

    // If already connected, join immediately
    if (socket.connected) {
      socket.emit("workflow:join", { runId })
    }

    return () => {
      socket.off("connect", onConnect)
      socket.off("workflow:step:start", onStepStart)
      socket.off("workflow:step:success", onStepSuccess)
      socket.off("workflow:step:error", onStepError)
      socket.off("workflow:step:suspend", onStepSuspend)
      socket.off("workflow:run:complete", onRunComplete)

      socket.emit("workflow:leave", { runId })
    }
  }, [runId, updateStatus, clearNodeExecutionStatus])

  // Disconnect socket on unmount
  useEffect(() => {
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect()
        socketRef.current = null
      }
      currentRunId.current = null
    }
  }, [])
}
