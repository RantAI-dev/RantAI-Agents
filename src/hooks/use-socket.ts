"use client"

import { useEffect, useRef } from "react"
import { io, type Socket } from "socket.io-client"

let singleton: Socket | null = null

export function getClientSocket(): Socket {
  if (!singleton) {
    singleton = io({ path: "/api/socket", addTrailingSlash: false })
  }
  return singleton
}

/**
 * Subscribe to a Socket.io event for as long as the component is mounted.
 * Uses a stable ref for the handler so callers can pass inline functions
 * without causing resubscription on every render.
 */
export function useSocketEvent(
  event: string,
  handler: (payload: unknown) => void,
) {
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  useEffect(() => {
    const socket = getClientSocket()
    const cb = (p: unknown) => handlerRef.current(p)
    socket.on(event, cb)
    return () => {
      socket.off(event, cb)
    }
  }, [event])
}
