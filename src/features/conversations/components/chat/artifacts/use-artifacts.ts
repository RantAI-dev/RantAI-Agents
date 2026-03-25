"use client"

import { useState, useCallback } from "react"
import type { Artifact, ArtifactType, PersistedArtifact } from "./types"

type ArtifactInput = Omit<Artifact, "version" | "previousVersions"> & {
  version?: number
  previousVersions?: Artifact["previousVersions"]
}

export function useArtifacts() {
  const [artifacts, setArtifacts] = useState<Map<string, Artifact>>(new Map())
  const [activeArtifactId, setActiveArtifactId] = useState<string | null>(null)

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
    setArtifacts(
      new Map(
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
          },
        ])
      )
    )
    setActiveArtifactId(null)
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
