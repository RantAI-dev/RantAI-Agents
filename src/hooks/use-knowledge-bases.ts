"use client"

import { useCallback, useEffect, useState } from "react"

/**
 * Single source of truth for the dashboard sidebar's KB list + per-KB document
 * counts. Multiple surfaces (app-sidebar, Agent Builder Knowledge tab, future
 * chat config / file pickers) need the same shape and the same "auto-refresh
 * when something mutates a KB" semantics — keeping the fetch + subscription
 * in one place prevents the Agent Builder kind of bug where one consumer
 * forgot to wire up the event listener.
 */

export interface KnowledgeBase {
  id: string
  name: string
  color: string | null
  documentCount: number
}

interface KnowledgeBasesResponse {
  groups: KnowledgeBase[]
  totalDocumentCount: number
}

/**
 * Custom DOM event broadcast whenever something mutates the KB set or the
 * document count (create / update / delete / restore / bulk delete). Listeners
 * registered via `useKnowledgeBases` re-fetch on this event.
 */
export const KNOWLEDGE_BASES_UPDATED_EVENT = "knowledge-bases-updated"

/**
 * Call from any mutation site (delete, create, update, restore, bulk delete)
 * to notify every `useKnowledgeBases` consumer in the page to re-fetch. Safe
 * to call from server components — no-ops on non-browser environments.
 */
export function dispatchKnowledgeBasesUpdated(): void {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent(KNOWLEDGE_BASES_UPDATED_EVENT))
}

/**
 * Hook that exposes the current KB list + total document count, automatically
 * re-fetching whenever the `knowledge-bases-updated` event fires.
 *
 * @param initial optional server-rendered initial data so the first paint
 *                doesn't flash empty (use it from RSC hydration paths like the
 *                Agent Builder); when omitted the hook fetches on mount.
 */
export function useKnowledgeBases(initial?: {
  groups?: KnowledgeBase[]
  totalDocumentCount?: number
}): {
  knowledgeBases: KnowledgeBase[]
  totalDocumentCount: number
  refetch: () => Promise<void>
} {
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>(
    initial?.groups ?? [],
  )
  const [totalDocumentCount, setTotalDocumentCount] = useState<number>(
    initial?.totalDocumentCount ?? 0,
  )
  // Track whether the caller supplied initial data; if so, skip the on-mount
  // fetch so we don't double-fetch on first render. Event-driven refetches
  // still fire as normal.
  const [hasInitial] = useState<boolean>(initial !== undefined)

  const refetch = useCallback(async () => {
    try {
      const response = await fetch("/api/dashboard/files/groups")
      if (!response.ok) return
      const data = (await response.json()) as KnowledgeBasesResponse
      setKnowledgeBases(data.groups ?? [])
      setTotalDocumentCount(data.totalDocumentCount ?? 0)
    } catch (error) {
      console.error("Failed to fetch knowledge bases:", error)
    }
  }, [])

  useEffect(() => {
    if (!hasInitial) {
      void refetch()
    }
    const handler = () => {
      void refetch()
    }
    window.addEventListener(KNOWLEDGE_BASES_UPDATED_EVENT, handler)
    return () => window.removeEventListener(KNOWLEDGE_BASES_UPDATED_EVENT, handler)
  }, [hasInitial, refetch])

  return { knowledgeBases, totalDocumentCount, refetch }
}
