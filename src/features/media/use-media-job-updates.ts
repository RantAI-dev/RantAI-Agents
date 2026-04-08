"use client"

import { useEffect } from "react"
import { getClientSocket, useSocketEvent } from "@/hooks/use-socket"
import { useMediaStudioStore } from "@/features/media/store"

/**
 * Subscribes to `media:job:update` Socket.io events for the given org room.
 * On each event, refetches the affected job from the API and upserts it into
 * the media studio store. No data is fetched at mount time.
 */
export function useMediaJobUpdates(organizationId: string) {
  // Join / leave the org room so we receive org-scoped events
  useEffect(() => {
    if (!organizationId) return
    const socket = getClientSocket()

    const joinRoom = () => {
      socket.emit("org:join", { organizationId })
    }

    // Join immediately if already connected, otherwise wait for connect
    if (socket.connected) {
      joinRoom()
    } else {
      socket.once("connect", joinRoom)
    }

    return () => {
      socket.off("connect", joinRoom)
      socket.emit("org:leave", { organizationId })
    }
  }, [organizationId])

  // Subscribe to job update events — no mount-time fetch, only on event
  useSocketEvent("media:job:update", (payload) => {
    const event = payload as { jobId: string; status: string }
    fetch(`/api/dashboard/media/jobs/${event.jobId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((job) => {
        if (job) useMediaStudioStore.getState().upsertJob(job)
      })
      .catch(() => {})
  })
}
