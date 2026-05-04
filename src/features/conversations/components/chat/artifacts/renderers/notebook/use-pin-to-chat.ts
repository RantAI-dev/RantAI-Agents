"use client"

import { useCallback, useEffect, useState } from "react"
import type { PinnedRef } from "@/lib/notebook/chat-attachment"

const KEY_PREFIX = "notebook-pins:"

export function usePinToChat(artifactId: string) {
  const key = `${KEY_PREFIX}${artifactId}`
  const [pinned, setPinned] = useState<PinnedRef[]>([])

  useEffect(() => {
    if (typeof window === "undefined") return
    try {
      const raw = window.sessionStorage.getItem(key)
      setPinned(raw ? (JSON.parse(raw) as PinnedRef[]) : [])
    } catch {
      setPinned([])
    }
  }, [key])

  const persist = useCallback(
    (next: PinnedRef[]) => {
      setPinned(next)
      if (typeof window === "undefined") return
      try {
        window.sessionStorage.setItem(key, JSON.stringify(next))
      } catch {
        // sessionStorage quota or unavailable — pins stay in-memory only
      }
    },
    [key],
  )

  const togglePin = useCallback(
    (cellId: string, outputIdx: number) => {
      const exists = pinned.some((p) => p.cellId === cellId && p.outputIdx === outputIdx)
      const next = exists
        ? pinned.filter((p) => !(p.cellId === cellId && p.outputIdx === outputIdx))
        : [...pinned, { artifactId, cellId, outputIdx }]
      persist(next)
    },
    [artifactId, pinned, persist],
  )

  const isPinned = useCallback(
    (cellId: string, outputIdx: number) => {
      return pinned.some((p) => p.cellId === cellId && p.outputIdx === outputIdx)
    },
    [pinned],
  )

  const clear = useCallback(() => persist([]), [persist])

  /**
   * Drop any pins whose cellId is no longer in the notebook. Pins live
   * in sessionStorage but cell outputs are recomputed every time the
   * kernel restarts, so stale ids would otherwise dangle until the user
   * notices the empty pinned-outputs bar.
   */
  const sweepStale = useCallback(
    (validCellIds: ReadonlySet<string>) => {
      const next = pinned.filter((p) => validCellIds.has(p.cellId))
      if (next.length !== pinned.length) persist(next)
    },
    [pinned, persist],
  )

  return { pinned, togglePin, isPinned, clear, sweepStale }
}
