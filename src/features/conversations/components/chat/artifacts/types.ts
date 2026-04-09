export const VALID_ARTIFACT_TYPES = new Set([
  "text/html",
  "text/markdown",
  "image/svg+xml",
  "application/react",
  "application/mermaid",
  "application/code",
  "application/sheet",
  "text/latex",
  "application/slides",
  "application/python",
  "application/3d",
] as const)

export type ArtifactType =
  | "text/html"
  | "text/markdown"
  | "image/svg+xml"
  | "application/react"
  | "application/mermaid"
  | "application/code"
  | "application/sheet"
  | "text/latex"
  | "application/slides"
  | "application/python"
  | "application/3d"

export function isValidArtifactType(value: unknown): value is ArtifactType {
  return typeof value === "string" && VALID_ARTIFACT_TYPES.has(value as ArtifactType)
}

export interface ArtifactVersion {
  content: string
  title: string
  timestamp: number
}

export interface Artifact {
  id: string
  title: string
  type: ArtifactType
  content: string
  language?: string
  version: number
  previousVersions: ArtifactVersion[]
  /**
   * Number of historical versions that were evicted by the FIFO version
   * cap (currently 20). Used by the UI to show "+N earlier versions
   * evicted" so users aren't surprised when older history disappears.
   */
  evictedVersionCount?: number
  /**
   * Whether this artifact has been successfully indexed into RAG. `false`
   * surfaces a "not searchable" badge in the panel header so users know
   * the indexing pipeline missed (or is still pending) for this artifact.
   */
  ragIndexed?: boolean
}

/** Shape returned from the session API for persisted artifacts */
export interface PersistedArtifact {
  id: string
  title: string
  content: string
  artifactType: string
  metadata?: {
    artifactLanguage?: string
    versions?: Array<{ content: string; title: string; timestamp: number }>
    evictedVersionCount?: number
    ragIndexed?: boolean
  } | null
}
