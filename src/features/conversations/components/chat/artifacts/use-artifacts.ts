"use client"

import { useState, useCallback, useEffect } from "react"
import type { Artifact, ArtifactType, PersistedArtifact } from "./types"

type ArtifactInput = Omit<Artifact, "version" | "previousVersions"> & {
  version?: number
  previousVersions?: Artifact["previousVersions"]
}

/**
 * Key prefix for the per-session "currently open artifact" pointer. We use
 * sessionStorage so it survives a page refresh inside the same tab but not
 * a fresh browser session — matching how the chat-toolbar canvas mode is
 * persisted.
 */
const ACTIVE_ARTIFACT_KEY_PREFIX = "rantai.artifact.active."

export function useArtifacts(sessionKey?: string | null) {
  const [artifacts, setArtifacts] = useState<Map<string, Artifact>>(new Map())
  const [activeArtifactId, setActiveArtifactId] = useState<string | null>(null)

  // Restore the previously open artifact when the underlying session key
  // changes (e.g. user opens a different chat or refreshes the page).
  useEffect(() => {
    if (!sessionKey || typeof window === "undefined") return
    try {
      const stored = window.sessionStorage.getItem(
        ACTIVE_ARTIFACT_KEY_PREFIX + sessionKey,
      )
      if (stored) setActiveArtifactId(stored)
    } catch {
      // sessionStorage may be unavailable in privacy modes — ignore.
    }
  }, [sessionKey])

  // Persist the active artifact id whenever it changes.
  useEffect(() => {
    if (!sessionKey || typeof window === "undefined") return
    try {
      const key = ACTIVE_ARTIFACT_KEY_PREFIX + sessionKey
      if (activeArtifactId) {
        window.sessionStorage.setItem(key, activeArtifactId)
      } else {
        window.sessionStorage.removeItem(key)
      }
    } catch {
      // ignore
    }
  }, [activeArtifactId, sessionKey])

  const addOrUpdateArtifact = useCallback((artifact: ArtifactInput) => {
    setArtifacts((prev) => {
      const next = new Map(prev)
      const existing = next.get(artifact.id)

      if (existing) {
        // Push old version to history before overwriting
        const previousVersions = [
          ...existing.previousVersions,
          {
            content: existing.content,
            title: existing.title,
            timestamp: Date.now(),
          },
        ]
        next.set(artifact.id, {
          ...existing,
          ...artifact,
          version: existing.version + 1,
          previousVersions,
        })
      } else {
        next.set(artifact.id, {
          ...artifact,
          version: artifact.version ?? 1,
          previousVersions: artifact.previousVersions ?? [],
        })
      }
      return next
    })
    // D-73: don't auto-activate streaming placeholders. The chat-workspace
    // creates a `streaming-${toolCallId}` artifact on tool-input-available
    // and only commits the real id on tool-output-available. Activating the
    // placeholder briefly during streaming caused panel flicker for rapid
    // multi-artifact streams; the user's selection (if any) is preserved.
    if (!artifact.id.startsWith("streaming-")) {
      setActiveArtifactId(artifact.id)
    }
  }, [])

  const removeArtifact = useCallback((id: string) => {
    setArtifacts((prev) => {
      const next = new Map(prev)
      next.delete(id)
      return next
    })
    setActiveArtifactId((prev) => (prev === id ? null : prev))
  }, [])

  const closeArtifact = useCallback(() => {
    setActiveArtifactId(null)
  }, [])

  const openArtifact = useCallback((id: string) => {
    setActiveArtifactId(id)
  }, [])

  const loadFromPersisted = useCallback((persisted: PersistedArtifact[]) => {
    const next = new Map(
      persisted.map((a) => [
        a.id,
        {
          id: a.id,
          title: a.title,
          type: a.artifactType as ArtifactType,
          content: a.content,
          language: a.metadata?.artifactLanguage,
          version: (a.metadata?.versions?.length || 0) + 1,
          previousVersions: (a.metadata?.versions || []).map((v) => ({
            content: v.content,
            title: v.title,
            timestamp: v.timestamp,
          })),
          evictedVersionCount: a.metadata?.evictedVersionCount,
          ragIndexed: a.metadata?.ragIndexed,
        },
      ])
    )
    setArtifacts(next)
    // If sessionStorage points to an artifact that still exists in this
    // session, keep it open across the refresh; otherwise close the panel.
    setActiveArtifactId((current) => (current && next.has(current) ? current : null))
  }, [])

  const retryPersist = useCallback(
    async (
      id: string,
      sessionId: string | null | undefined,
    ): Promise<{ ok: boolean; error?: string }> => {
      // Need a real session id to call the endpoint — ephemeral artifacts on
      // orphan/unauthenticated sessions can't be retried because there's
      // nothing to scope ownership against.
      if (!sessionId) {
        return {
          ok: false,
          error:
            "Cannot retry: artifact is not bound to a saved chat session.",
        }
      }
      const artifact = artifacts.get(id)
      if (!artifact) {
        return { ok: false, error: "Artifact not found in current session." }
      }
      try {
        const res = await fetch(
          `/api/dashboard/chat/sessions/${encodeURIComponent(sessionId)}/artifacts/${encodeURIComponent(id)}/persist`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: artifact.title,
              type: artifact.type,
              content: artifact.content,
              ...(artifact.language ? { language: artifact.language } : {}),
            }),
          },
        )
        if (!res.ok) {
          let errText = ""
          try {
            const j = (await res.json()) as { error?: string }
            errText = j.error ?? ""
          } catch {
            // Body wasn't JSON — fall back to status text.
          }
          return {
            ok: false,
            error: errText || `Retry failed: ${res.status}`,
          }
        }
        setArtifacts((prev) => {
          const next = new Map(prev)
          const cur = next.get(id)
          if (cur) {
            next.set(id, {
              ...cur,
              ephemeral: false,
              persistenceError: undefined,
            })
          }
          return next
        })
        return { ok: true }
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : "Network error during retry.",
        }
      }
    },
    [artifacts],
  )

  const activeArtifact = activeArtifactId
    ? artifacts.get(activeArtifactId) ?? null
    : null

  return {
    artifacts,
    activeArtifact,
    activeArtifactId,
    addOrUpdateArtifact,
    removeArtifact,
    retryPersist,
    loadFromPersisted,
    openArtifact,
    closeArtifact,
  }
}
