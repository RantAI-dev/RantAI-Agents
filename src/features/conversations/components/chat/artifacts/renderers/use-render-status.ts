import { useEffect, useState } from "react"
import {
  fetchArtifactRenderStatus,
  type ArtifactRenderStatus,
} from "@/lib/chat/artifact-render-status"

export type RenderStatus = ArtifactRenderStatus

export interface UseRenderStatusOptions {
  sessionId: string
  artifactId: string
  contentKey: string
  isStreaming: boolean
  retryCount: number
}

export interface UseRenderStatusResult {
  status: RenderStatus | null
  error: string | null
}

export function useRenderStatus({
  sessionId,
  artifactId,
  contentKey,
  isStreaming,
  retryCount,
}: UseRenderStatusOptions): UseRenderStatusResult {
  const [status, setStatus] = useState<RenderStatus | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isStreaming) return
    setStatus(null)
    setError(null)
    let cancelled = false
    fetchArtifactRenderStatus(sessionId, artifactId)
      .then((s) => {
        if (cancelled) return
        setStatus(s)
      })
      .catch((e) => {
        if (!cancelled) setError((e as Error).message)
      })
    return () => {
      cancelled = true
    }
  }, [sessionId, artifactId, contentKey, isStreaming, retryCount])

  return { status, error }
}
