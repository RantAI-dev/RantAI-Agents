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
    setActiveArtifactId(artifact.id)
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
          // Hydrate documentFormat so reloaded script artifacts route to the
          // DocumentScriptRenderer instead of the legacy AST path. Repo +
          // service expose this column (T1, T12); without copying it here
          // the field would silently drop on every page refresh.
          documentFormat:
            a.documentFormat === "script" || a.documentFormat === "ast"
              ? a.documentFormat
              : undefined,
        },
      ])
    )
    setArtifacts(next)
    // If sessionStorage points to an artifact that still exists in this
    // session, keep it open across the refresh; otherwise close the panel.
    setActiveArtifactId((current) => (current && next.has(current) ? current : null))
  }, [])

  const activeArtifact = activeArtifactId
    ? artifacts.get(activeArtifactId) ?? null
    : null

  return {
    artifacts,
    activeArtifact,
    activeArtifactId,
    addOrUpdateArtifact,
    removeArtifact,
    loadFromPersisted,
    openArtifact,
    closeArtifact,
  }
}
