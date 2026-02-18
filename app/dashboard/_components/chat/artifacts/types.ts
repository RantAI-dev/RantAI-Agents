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
  } | null
}
