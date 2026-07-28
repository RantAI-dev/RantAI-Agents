"use client"

import { useEffect, useRef } from "react"
import { getClientSocket, useSocketEvent } from "@/hooks/use-socket"

export interface IngestJobUpdate {
  jobId: string
  documentId: string | null
  status: "processing" | "ready" | "failed"
  step: string | null
  progress: number
  stepCurrent: number | null
  stepTotal: number | null
  etaSeconds: number | null
  error?: string | null
}

/**
 * Subscribes to `ingest:job:update` Socket.io events for the given org room and
 * invokes `onUpdate` for each. Mirrors useMediaJobUpdates, but the event payload
 * already carries the full progress snapshot, so there's no per-event refetch —
 * the page patches its document state directly (and refetches only on terminal
 * status to pull the final chunk count).
 */
export function useIngestJobUpdates(
  organizationId: string | null,
  onUpdate: (event: IngestJobUpdate) => void
) {
  const handlerRef = useRef(onUpdate)
  handlerRef.current = onUpdate

  useEffect(() => {
    if (!organizationId) return
    const socket = getClientSocket()

    const joinRoom = () => socket.emit("org:join", { organizationId })
    if (socket.connected) joinRoom()
    else socket.once("connect", joinRoom)

    return () => {
      socket.off("connect", joinRoom)
      socket.emit("org:leave", { organizationId })
    }
  }, [organizationId])

  useSocketEvent("ingest:job:update", (payload) => {
    handlerRef.current(payload as IngestJobUpdate)
  })
}
