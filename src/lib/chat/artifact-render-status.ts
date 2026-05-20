export interface ArtifactRenderStatus {
  hash: string
  pageCount: number
  cached: boolean
}

export async function fetchArtifactRenderStatus(
  sessionId: string,
  artifactId: string,
): Promise<ArtifactRenderStatus> {
  const r = await fetch(
    `/api/dashboard/chat/sessions/${sessionId}/artifacts/${artifactId}/render-status`,
    { method: "GET" },
  )
  if (!r.ok) {
    const j = (await r.json().catch(() => ({}))) as { error?: string }
    throw new Error(j.error ?? `HTTP ${r.status}`)
  }
  return (await r.json()) as ArtifactRenderStatus
}
